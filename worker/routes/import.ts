import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../env";
import { cleanName, createEventAlbum, eventByCode, type AlbumRow, type EventRow } from "../lib/db";
import { randomId } from "../lib/crypto";
import {
  GoogleError,
  ownerToken,
  pickerCreate,
  pickerDelete,
  pickerDownload,
  pickerGet,
  pickerList,
  uploadRaw,
} from "../lib/google";
import { commitMedia, type CreatedItem } from "../lib/media";
import type { ImportJobDTO } from "../../shared/types";

export const imports = new Hono<AppEnv>();

// Rough size estimates for the "this will use ~X GB" message (picker gives no file sizes).
const EST = { photo: { compressed: 700_000, original: 3_500_000 }, video: 45_000_000 };
const PAGES_PER_CALL = 5;
const PHOTOS_PER_CALL = 6;
const URL_TTL = 50 * 60_000;

interface JobRow {
  id: string;
  event_id: string;
  owner_id: string;
  album_id: string;
  picker_session_id: string;
  picker_uri: string | null;
  status: string;
  total: number;
  done: number;
  skipped: number;
  failed: number;
  est_bytes: number;
  already: number;
  quality: string;
  page_token: string | null;
  listed_at: number;
  relist: number;
  linked: number;
  error: string | null;
}

interface ItemRow {
  job_id: string;
  picked_id: string;
  kind: string;
  mime: string | null;
  filename: string | null;
  width: number | null;
  height: number | null;
  create_time: number | null;
  base_url: string | null;
  status: string;
}

function dto(j: JobRow): ImportJobDTO {
  return {
    id: j.id,
    status: j.status as ImportJobDTO["status"],
    pickerUri: j.picker_uri,
    total: j.total,
    done: j.done,
    skipped: j.skipped,
    failed: j.failed,
    already: j.already,
    estBytes: j.est_bytes,
    albumId: j.album_id,
    linked: !!j.linked,
    error: j.error,
  };
}

const LINK_HOSTS = new Set(["photos.app.goo.gl", "photos.google.com", "goo.gl"]);

/** Optional Google Photos share link (only used for an "open in Google Photos" button, never fetched). */
function albumLink(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new HTTPException(400, { message: "bad_album_link" });
  }
  if (u.protocol !== "https:" || !LINK_HOSTS.has(u.hostname) || v.length > 500) {
    throw new HTTPException(400, { message: "bad_album_link" });
  }
  return u.toString();
}

const markSynced = (c: Context<AppEnv>, job: JobRow) =>
  c.env.DB.prepare("UPDATE albums SET synced_at = ? WHERE id = ? AND linked = 1").bind(Date.now(), job.album_id);

/** Import uses the owner's own Google account (the picker shows *their* library) → Google owner only. */
async function ownerEvent(c: Context<AppEnv>) {
  const ev = await eventByCode(c.env, c.req.param("code")!);
  if (c.get("ownerId") !== ev.owner_id) throw new HTTPException(403, { message: "owner_only" });
  return ev;
}

async function loadJob(c: Context<AppEnv>, ev: EventRow) {
  const job = await c.env.DB.prepare("SELECT * FROM import_jobs WHERE id = ? AND event_id = ?")
    .bind(c.req.param("job"), ev.id)
    .first<JobRow>();
  if (!job) throw new HTTPException(404, { message: "job_not_found" });
  return job;
}

imports.post("/e/:code/import", async (c) => {
  const ev = await ownerEvent(c);
  const b = await c.req.json<{ albumId?: string; newAlbumName?: string; link?: { sourceUrl?: string | null } }>();
  let album: AlbumRow | null = null;
  if (b.newAlbumName) {
    // Validate before creating anything in Google.
    const sourceUrl = b.link ? albumLink(b.link.sourceUrl) : null;
    album = await createEventAlbum(c.env, ev, "custom", cleanName(b.newAlbumName, 40) || "ייבוא");
    if (b.link) {
      await c.env.DB.prepare("UPDATE albums SET linked = 1, source_url = ? WHERE id = ?").bind(sourceUrl, album.id).run();
      album.linked = 1;
      album.source_url = sourceUrl;
    }
  } else {
    album = b.albumId
      ? await c.env.DB.prepare("SELECT * FROM albums WHERE id = ? AND event_id = ? AND hidden = 0").bind(b.albumId, ev.id).first<AlbumRow>()
      : await c.env.DB.prepare("SELECT * FROM albums WHERE event_id = ? AND kind = 'host' AND hidden = 0 LIMIT 1").bind(ev.id).first<AlbumRow>();
  }
  if (!album) throw new HTTPException(404, { message: "album_not_found" });
  const token = await ownerToken(c.env, ev.owner_id);
  const session = await pickerCreate(token);
  const job: JobRow = {
    id: randomId(10),
    event_id: ev.id,
    owner_id: ev.owner_id,
    album_id: album.id,
    picker_session_id: session.id,
    picker_uri: session.pickerUri,
    status: "picking",
    total: 0,
    done: 0,
    skipped: 0,
    failed: 0,
    est_bytes: 0,
    already: 0,
    quality: ev.quality,
    page_token: null,
    listed_at: 0,
    relist: 0,
    // Syncing a linked album: the picker instructions say "pick the whole album".
    linked: album.linked ? 1 : 0,
    error: null,
  };
  await c.env.DB.prepare(
    `INSERT INTO import_jobs (id, event_id, owner_id, album_id, picker_session_id, picker_uri, status, quality, linked, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(job.id, job.event_id, job.owner_id, job.album_id, job.picker_session_id, job.picker_uri, job.status, job.quality, job.linked, Date.now())
    .run();
  return c.json(dto(job));
});

/** Lists picked items into D1 a few pages at a time. Returns true when the listing is complete. */
async function listStep(c: Context<AppEnv>, job: JobRow, token: string, refreshOnly: boolean) {
  let pageToken = job.page_token || undefined;
  for (let i = 0; i < PAGES_PER_CALL; i++) {
    const page = await pickerList(token, job.picker_session_id, pageToken);
    const stmts: D1PreparedStatement[] = [];
    for (const it of page.mediaItems || []) {
      if (!it.mediaFile?.baseUrl) continue;
      const kind = it.type === "VIDEO" || it.mediaFile.mimeType?.startsWith("video") ? "video" : "photo";
      if (refreshOnly) {
        stmts.push(
          c.env.DB.prepare("UPDATE import_items SET base_url = ? WHERE job_id = ? AND picked_id = ?").bind(
            it.mediaFile.baseUrl,
            job.id,
            it.id,
          ),
        );
      } else {
        stmts.push(
          c.env.DB.prepare(
            `INSERT OR IGNORE INTO import_items (job_id, picked_id, kind, mime, filename, width, height, create_time, base_url)
             VALUES (?,?,?,?,?,?,?,?,?)`,
          ).bind(
            job.id,
            it.id,
            kind,
            it.mediaFile.mimeType ?? null,
            it.mediaFile.filename ?? null,
            it.mediaFile.mediaFileMetadata?.width ?? null,
            it.mediaFile.mediaFileMetadata?.height ?? null,
            it.createTime ? Date.parse(it.createTime) : null,
            it.mediaFile.baseUrl,
          ),
        );
      }
    }
    if (stmts.length) await c.env.DB.batch(stmts);
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }
  await c.env.DB.prepare("UPDATE import_jobs SET page_token = ? WHERE id = ?").bind(pageToken ?? null, job.id).run();
  job.page_token = pageToken ?? null;
  return !pageToken;
}

async function finishListing(c: Context<AppEnv>, job: JobRow) {
  // Mark items that were already imported into this event (dedupe by picked id).
  await c.env.DB.prepare(
    `UPDATE import_items SET status = 'skipped'
      WHERE job_id = ? AND status = 'pending'
        AND picked_id IN (SELECT picked_id FROM media WHERE event_id = ? AND picked_id IS NOT NULL AND hidden = 0)`,
  )
    .bind(job.id, job.event_id)
    .run();
  const s = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS already,
            SUM(CASE WHEN status = 'pending' AND kind = 'photo' THEN 1 ELSE 0 END) AS photos,
            SUM(CASE WHEN status = 'pending' AND kind = 'video' THEN 1 ELSE 0 END) AS videos
       FROM import_items WHERE job_id = ?`,
  )
    .bind(job.id)
    .first<{ total: number; already: number; photos: number; videos: number }>();
  const q = job.quality === "original" ? "original" : "compressed";
  const est = (s?.photos ?? 0) * EST.photo[q] + (s?.videos ?? 0) * EST.video;
  // Nothing new (typical when re-syncing an album that didn't change): the sync is already complete.
  const nothingNew = !(s?.photos || s?.videos);
  const stmts = [
    c.env.DB.prepare(
      "UPDATE import_jobs SET status = ?, total = ?, already = ?, skipped = ?, est_bytes = ?, listed_at = ? WHERE id = ?",
    ).bind(nothingNew ? "done" : "listed", s?.total ?? 0, s?.already ?? 0, s?.already ?? 0, est, Date.now(), job.id),
  ];
  if (nothingNew) stmts.push(markSynced(c, job));
  await c.env.DB.batch(stmts);
}

/** Poll while the user is picking; lists the selection once Google says it's ready. */
imports.get("/e/:code/import/:job", async (c) => {
  const ev = await ownerEvent(c);
  let job = await loadJob(c, ev);
  if (job.status === "picking") {
    const token = await ownerToken(c.env, ev.owner_id);
    const session = await pickerGet(token, job.picker_session_id);
    if (session.mediaItemsSet) {
      const complete = await listStep(c, job, token, false);
      if (complete) await finishListing(c, job);
      job = await loadJob(c, ev);
    }
  }
  return c.json(dto(job));
});

imports.post("/e/:code/import/:job/start", async (c) => {
  const ev = await ownerEvent(c);
  const job = await loadJob(c, ev);
  if (job.status !== "listed" && job.status !== "running") throw new HTTPException(409, { message: "not_ready" });
  await c.env.DB.prepare("UPDATE import_jobs SET status = 'running' WHERE id = ?").bind(job.id).run();
  return c.json(dto({ ...job, status: "running" }));
});

/**
 * Processes the next few items: download from the picker → upload to the Library API → add to the album.
 * The browser calls this in a loop (keeps each request small enough for Workers Free).
 */
imports.post("/e/:code/import/:job/next", async (c) => {
  const ev = await ownerEvent(c);
  const job = await loadJob(c, ev);
  if (job.status !== "running") return c.json(dto(job));
  const token = await ownerToken(c.env, ev.owner_id);

  // Picker base URLs expire after ~60 minutes: re-list to refresh them.
  if (job.relist || Date.now() - job.listed_at > URL_TTL) {
    if (!job.relist) {
      await c.env.DB.prepare("UPDATE import_jobs SET relist = 1, page_token = NULL WHERE id = ?").bind(job.id).run();
      job.page_token = null;
    }
    try {
      const complete = await listStep(c, job, token, true);
      if (complete) {
        await c.env.DB.prepare("UPDATE import_jobs SET relist = 0, listed_at = ? WHERE id = ?").bind(Date.now(), job.id).run();
      }
    } catch (e) {
      const msg = e instanceof GoogleError ? e.message : String(e);
      await c.env.DB.prepare("UPDATE import_jobs SET status = 'error', error = ? WHERE id = ?").bind(`session_expired: ${msg}`.slice(0, 300), job.id).run();
    }
    return c.json(dto(await loadJob(c, ev)));
  }

  const album = await c.env.DB.prepare("SELECT * FROM albums WHERE id = ?").bind(job.album_id).first<AlbumRow>();
  if (!album || album.hidden) {
    await c.env.DB.prepare("UPDATE import_jobs SET status = 'error', error = 'album_removed' WHERE id = ?").bind(job.id).run();
    return c.json(dto(await loadJob(c, ev)));
  }

  // One video per call (large stream), otherwise a handful of photos.
  let batch = (
    await c.env.DB.prepare("SELECT * FROM import_items WHERE job_id = ? AND status = 'pending' ORDER BY kind = 'video', create_time LIMIT ?")
      .bind(job.id, PHOTOS_PER_CALL)
      .all<ItemRow>()
  ).results;
  if (batch[0]?.kind === "video") batch = batch.slice(0, 1);
  else batch = batch.filter((b) => b.kind === "photo");

  if (!batch.length) {
    await c.env.DB.batch([c.env.DB.prepare("UPDATE import_jobs SET status = 'done' WHERE id = ?").bind(job.id), markSynced(c, job)]);
    await pickerDelete(token, job.picker_session_id);
    return c.json(dto(await loadJob(c, ev)));
  }

  const created: CreatedItem[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const it of batch) {
    try {
      const suffix = it.kind === "video" ? "=dv" : job.quality === "original" ? "=d" : "=w2560-h2560";
      const res = await pickerDownload(token, it.base_url!, suffix);
      const mime = it.kind === "photo" && job.quality !== "original" ? res.headers.get("Content-Type") || "image/jpeg" : it.mime || res.headers.get("Content-Type") || "application/octet-stream";
      const len = Number(res.headers.get("Content-Length") || 0);
      let uploadToken: string;
      if (len && res.body) {
        const { readable, writable } = new FixedLengthStream(len);
        const pipe = res.body.pipeTo(writable);
        [uploadToken] = await Promise.all([uploadRaw(token, readable, mime, len), pipe]);
      } else {
        const buf = await res.arrayBuffer();
        uploadToken = await uploadRaw(token, buf, mime, buf.byteLength);
      }
      created.push({
        uploadToken,
        fileName: it.filename,
        mime,
        takenAt: it.create_time,
        width: it.width,
        height: it.height,
        source: "import",
        pickedId: it.picked_id,
        size: len || null,
        ref: it.picked_id,
      });
    } catch (e) {
      failed.push({ id: it.picked_id, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
    }
  }

  const results = await commitMedia(c.env, ev, album, created);
  const stmts: D1PreparedStatement[] = [];
  let ok = 0;
  for (const it of created) {
    const r = results.get(it.ref);
    if (r?.media) ok++;
    else failed.push({ id: it.ref, error: r?.error || "create_failed" });
  }
  for (const it of created) {
    if (results.get(it.ref)?.media) {
      stmts.push(c.env.DB.prepare("UPDATE import_items SET status = 'done' WHERE job_id = ? AND picked_id = ?").bind(job.id, it.ref));
    }
  }
  for (const f of failed) {
    stmts.push(
      c.env.DB.prepare("UPDATE import_items SET status = 'failed', error = ? WHERE job_id = ? AND picked_id = ?").bind(f.error, job.id, f.id),
    );
  }
  stmts.push(
    c.env.DB.prepare("UPDATE import_jobs SET done = done + ?, failed = failed + ? WHERE id = ?").bind(ok, failed.length, job.id),
  );
  await c.env.DB.batch(stmts);
  return c.json(dto(await loadJob(c, ev)));
});

imports.delete("/e/:code/import/:job", async (c) => {
  const ev = await ownerEvent(c);
  const job = await loadJob(c, ev);
  await c.env.DB.prepare("UPDATE import_jobs SET status = 'cancelled' WHERE id = ?").bind(job.id).run();
  try {
    await pickerDelete(await ownerToken(c.env, ev.owner_id), job.picker_session_id);
  } catch {
    /* ignore */
  }
  return c.json({ ok: true });
});
