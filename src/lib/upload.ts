import { api, ApiError, errorMessage } from "./api";
import { prepareFile } from "./compress";
import { CHUNK_SIZE, MAX_SINGLE_UPLOAD, type MediaDTO, type Quality } from "../../shared/types";

export type ItemState = "queued" | "preparing" | "uploading" | "saving" | "done" | "error";

export interface QueueItem {
  key: string;
  file: File;
  preview: string | null;
  state: ItemState;
  progress: number; // 0..1 of current phase
  error?: string;
  uploadId?: string;
  media?: MediaDTO;
  savedBytes?: number;
  source: UploadSource;
}

export type UploadSource = "upload" | "share";

interface Options {
  code: string;
  token: string;
  quality: Quality;
  keepGps: boolean;
}

type Listener = (items: QueueItem[]) => void;

const CONCURRENCY = 3;
const FINALIZE_BATCH = 20;
const MAX_RETRIES = 3;

/**
 * Upload queue: compress → upload (raw or chunked) → finalize in batches.
 * One queue per event lives for the whole visit (see uploadQueue()), so leaving the upload page
 * doesn't lose track of running uploads; pages subscribe to it instead of owning it.
 */
export class UploadQueue {
  items: QueueItem[] = [];
  private listeners = new Set<Listener>();
  private active = 0;
  private toFinalize: QueueItem[] = [];
  private finalizeTimer: ReturnType<typeof setTimeout> | null = null;
  private finalizing = false;

  constructor(private opts: Options) {}

  get code() {
    return this.opts.code;
  }

  configure(opts: Partial<Omit<Options, "code">>) {
    Object.assign(this.opts, opts);
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn([...this.items]);
    return () => {
      this.listeners.delete(fn);
    };
  }

  remove(key: string) {
    this.items = this.items.filter((i) => i.key !== key);
    this.emit();
  }

  add(files: File[], source: UploadSource = "upload") {
    for (const picked of files) {
      // Some Android pickers (file managers, cloud providers) hand over files with an empty type.
      const file = picked.type ? picked : new File([picked], picked.name, { type: guessMime(picked.name), lastModified: picked.lastModified });
      if (!/^(image|video)\//.test(file.type)) continue;
      this.items.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        state: "queued",
        progress: 0,
        source,
      });
    }
    this.emit();
    this.pump();
  }

  retry(key: string) {
    const it = this.items.find((i) => i.key === key);
    if (!it || it.state !== "error") return;
    it.state = it.uploadId ? "saving" : "queued";
    it.error = undefined;
    if (it.state === "saving") this.queueFinalize(it);
    this.emit();
    this.pump();
  }

  get busy() {
    return isBusy(this.items);
  }

  private emit() {
    const snapshot = [...this.items];
    for (const fn of this.listeners) fn(snapshot);
    notifyAll();
  }

  private pump() {
    while (this.active < CONCURRENCY) {
      const next = this.items.find((i) => i.state === "queued");
      if (!next) break;
      this.active++;
      next.state = "preparing";
      this.process(next).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private async process(it: QueueItem) {
    try {
      const prepared = await prepareFile(it.file, this.opts.quality, this.opts.keepGps, (p) => {
        it.progress = p;
        this.emit();
      });
      if (prepared.compressed) it.savedBytes = it.file.size - prepared.blob.size;
      it.state = "uploading";
      it.progress = 0;
      this.emit();
      const meta = {
        name: prepared.name,
        mime: prepared.mime || guessMime(it.file.name),
        size: prepared.blob.size,
        takenAt: prepared.takenAt,
        w: prepared.w,
        h: prepared.h,
        source: it.source,
      };
      it.uploadId =
        prepared.blob.size <= MAX_SINGLE_UPLOAD
          ? await this.uploadSingle(prepared.blob, meta, (p) => this.setProgress(it, p))
          : await this.uploadChunked(prepared.blob, meta, (p) => this.setProgress(it, p));
      it.state = "saving";
      it.progress = 1;
      this.emit();
      this.queueFinalize(it);
    } catch (e) {
      it.state = "error";
      it.error = errorMessage(e);
      this.emit();
    }
  }

  private setProgress(it: QueueItem, p: number) {
    it.progress = p;
    this.emit();
  }

  private uploadSingle(blob: Blob, meta: object, onProgress: (p: number) => void): Promise<string> {
    return withRetry(
      () =>
        new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `/api/e/${this.opts.code}/upload`);
          xhr.setRequestHeader("X-Guest", this.opts.token);
          xhr.setRequestHeader("X-Meta", encodeURIComponent(JSON.stringify(meta)));
          xhr.setRequestHeader("Content-Type", "application/octet-stream");
          xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText).uploadId);
            else reject(toApiError(xhr));
          };
          xhr.onerror = () => reject(new TypeError("network"));
          xhr.send(blob);
        }),
    );
  }

  private async uploadChunked(blob: Blob, meta: object, onProgress: (p: number) => void): Promise<string> {
    const start = await withRetry(() =>
      api<{ uploadId: string; chunkSize: number }>(`/e/${this.opts.code}/upload/start`, {
        method: "POST",
        json: meta,
        guest: this.opts.token,
      }),
    );
    const size = start.chunkSize || CHUNK_SIZE;
    let offset = 0;
    while (offset < blob.size) {
      const chunk = blob.slice(offset, Math.min(offset + size, blob.size));
      const res = await withRetry(
        () =>
          new Promise<{ offset: number }>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", `/api/e/${this.opts.code}/upload/${start.uploadId}?offset=${offset}`);
            xhr.setRequestHeader("X-Guest", this.opts.token);
            xhr.setRequestHeader("Content-Type", "application/octet-stream");
            xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((offset + e.loaded) / blob.size);
            xhr.onload = () => {
              if (xhr.status === 409) resolve(JSON.parse(xhr.responseText)); // server tells us the real offset
              else if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
              else reject(toApiError(xhr));
            };
            xhr.onerror = () => reject(new TypeError("network"));
            xhr.send(chunk);
          }),
      );
      offset = res.offset;
      onProgress(offset / blob.size);
    }
    return start.uploadId;
  }

  private queueFinalize(it: QueueItem) {
    this.toFinalize.push(it);
    if (this.toFinalize.length >= FINALIZE_BATCH) this.flush();
    else {
      if (this.finalizeTimer) clearTimeout(this.finalizeTimer);
      // Small delay groups several uploads into one Google call (saves API quota).
      this.finalizeTimer = setTimeout(() => this.flush(), this.active > 0 ? 2500 : 300);
    }
  }

  private async flush() {
    if (this.finalizing) {
      this.finalizeTimer = setTimeout(() => this.flush(), 500);
      return;
    }
    const batch = this.toFinalize.splice(0, FINALIZE_BATCH);
    if (!batch.length) return;
    this.finalizing = true;
    try {
      const res = await withRetry(() =>
        api<{ results: Record<string, { media?: MediaDTO; error?: string }> }>(`/e/${this.opts.code}/upload/finalize`, {
          method: "POST",
          json: { ids: batch.map((b) => b.uploadId) },
          guest: this.opts.token,
        }),
      );
      for (const it of batch) {
        const r = res.results[it.uploadId!];
        if (r?.media) {
          it.state = "done";
          it.media = r.media;
        } else {
          it.state = "error";
          it.error = "Google לא שמרה את הקובץ. אפשר לנסות שוב.";
          it.uploadId = undefined; // upload again from scratch
        }
      }
      if (batch.some((b) => b.state === "done") && "vibrate" in navigator) navigator.vibrate?.(10);
    } catch (e) {
      for (const it of batch) {
        it.state = "error";
        it.error = errorMessage(e);
      }
    } finally {
      this.finalizing = false;
      this.emit();
      if (this.toFinalize.length) this.flush();
    }
  }
}

// ------------------------------------------------------------------ app-wide registry

const queues = new Map<string, UploadQueue>();
const globalListeners = new Set<() => void>();

function notifyAll() {
  for (const fn of globalListeners) fn();
}

/** The event's upload queue for this visit (created on first use, kept across page changes). */
export function uploadQueue(opts: Options): UploadQueue {
  let q = queues.get(opts.code);
  if (!q) {
    q = new UploadQueue(opts);
    queues.set(opts.code, q);
  } else q.configure(opts);
  return q;
}

export function allQueues(): UploadQueue[] {
  return [...queues.values()];
}

/** Called on any change in any queue (progress included). */
export function onAnyUploadChange(fn: () => void) {
  globalListeners.add(fn);
  return () => {
    globalListeners.delete(fn);
  };
}

export function isBusy(items: QueueItem[]) {
  return items.some((i) => i.state !== "done" && i.state !== "error");
}

/** Overall 0..1 progress of a list of uploads. */
export function overallProgress(items: QueueItem[]) {
  if (!items.length) return 0;
  const part = (i: QueueItem) =>
    i.state === "done" ? 1 : i.state === "saving" ? 0.95 : i.state === "uploading" ? 0.1 + i.progress * 0.8 : i.state === "preparing" ? 0.05 : 0;
  return items.reduce((s, i) => s + part(i), 0) / items.length;
}

function toApiError(xhr: XMLHttpRequest) {
  try {
    return new ApiError(xhr.status, JSON.parse(xhr.responseText).error || "server_error");
  } catch {
    return new ApiError(xhr.status, "server_error");
  }
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      // Don't retry errors that won't fix themselves.
      if (e instanceof ApiError && [400, 401, 403, 404, 413, 415, 507].includes(e.status)) throw e;
      if (e instanceof ApiError && e.code === "owner_reauth") throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i + Math.random() * 500));
    }
  }
  throw last;
}

function guessMime(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    heic: "image/heic",
    heif: "image/heif",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    mov: "video/quicktime",
    mp4: "video/mp4",
    m4v: "video/x-m4v",
    "3gp": "video/3gpp",
    webm: "video/webm",
    mkv: "video/x-matroska",
  };
  return (ext && map[ext]) || "application/octet-stream";
}
