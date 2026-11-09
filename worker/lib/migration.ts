/**
 * Moving an event to another Google account.
 *
 * Every media row records the account that holds it (media.account_ref), so the gallery keeps working
 * while items are split between two accounts, and also after a cancelled move. The browser drives the
 * copy in small steps (like the Google Photos import) to stay inside the Workers Free limits.
 * New guest uploads pause meanwhile (events.migrating). The site's albums, guests and links never change:
 * only the Google album ids are swapped at the end.
 */
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { EventRow, MediaRow, TrackRow } from "./db";
import { changeStmt } from "./db";
import { randomId } from "./crypto";
import {
  addToAlbum,
  batchCreate,
  batchGet,
  createAlbum,
  driveDelete,
  driveEnsureFolder,
  driveMedia,
  driveUpload,
  GoogleError,
  mediaDownload,
  uploadRaw,
} from "./google";
import { eventRef, MUSIC_FOLDER, musicFolder, SELF, setMusicFolder, tokenForRef, type AccountRef } from "./accounts";
import type { MigrationDTO, MigrationEstimate } from "../../shared/types";

const PHOTOS_PER_STEP = 5;
const ALBUMS_PER_STEP = 8;
/** An item that failed this many times stays in the old account (it still shows on the site). */
export const MAX_MOVE_FAILURES = 3;
const LOCK_MS = 90_000;
/** Uploads newer than this may still finish (into the old account); older ones count as abandoned. */
const INFLIGHT_MS = 20 * 60_000;
const AVG = { photo: 3_000_000, video: 45_000_000 };

interface JobRow {
  id: string;
  event_id: string;
  from_ref: string;
  to_ref: string;
  status: MigrationDTO["status"];
  total: number;
  done: number;
  failed: number;
  master_album_id: string | null;
  master_album_url: string | null;
  old_album_url: string | null;
  error: string | null;
  created_at: number;
  finished_at: number | null;
}

type Ev = Pick<EventRow, "id" | "owner_id" | "title" | "storage_account_id" | "google_album_id" | "google_album_url" | "migrating">;

const toNull = (ref: AccountRef) => (ref === SELF ? null : ref);

async function remainingCounts(env: Env, eventId: string, to: AccountRef) {
  const r = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM media WHERE event_id = ?1 AND hidden = 0 AND account_ref != ?2 AND move_failures < ?3) AS media,
            (SELECT COUNT(*) FROM media WHERE event_id = ?1 AND hidden = 0 AND account_ref != ?2 AND move_failures >= ?3) AS stuck,
            (SELECT COUNT(*) FROM event_tracks WHERE event_id = ?1 AND account_ref != ?2) AS tracks`,
  )
    .bind(eventId, to, MAX_MOVE_FAILURES)
    .first<{ media: number; stuck: number; tracks: number }>();
  return { media: r?.media ?? 0, stuck: r?.stuck ?? 0, tracks: r?.tracks ?? 0 };
}

async function toDTO(env: Env, ownerId: string, j: JobRow): Promise<MigrationDTO> {
  const left = j.status === "running" ? await remainingCounts(env, j.event_id, j.to_ref) : { media: 0, tracks: 0, stuck: j.failed };
  const email =
    j.to_ref === SELF
      ? await env.DB.prepare("SELECT email FROM owners WHERE id = ?").bind(ownerId).first<{ email: string | null }>()
      : await env.DB.prepare("SELECT email FROM storage_accounts WHERE id = ?").bind(j.to_ref).first<{ email: string | null }>();
  return {
    id: j.id,
    status: j.status,
    from: j.from_ref,
    to: j.to_ref,
    toEmail: email?.email ?? null,
    total: j.total,
    done: j.done,
    failed: j.status === "running" ? left.stuck : j.failed,
    remaining: left.media + left.tracks,
    oldAlbumUrl: j.old_album_url,
    error: j.error,
  };
}

async function loadJob(env: Env, eventId: string, jobId: string) {
  const job = await env.DB.prepare("SELECT * FROM storage_migrations WHERE id = ? AND event_id = ?").bind(jobId, eventId).first<JobRow>();
  if (!job) throw new HTTPException(404, { message: "migration_not_found" });
  return job;
}

export async function getMigration(env: Env, ev: Ev, jobId: string) {
  return toDTO(env, ev.owner_id, await loadJob(env, ev.id, jobId));
}

/** The running move, or the last one if it ended in the past 3 days (for the "done" / "stopped" notes). */
export async function latestMigration(env: Env, ev: Ev): Promise<MigrationDTO | null> {
  const job = ev.migrating
    ? await env.DB.prepare("SELECT * FROM storage_migrations WHERE id = ?").bind(ev.migrating).first<JobRow>()
    : await env.DB.prepare("SELECT * FROM storage_migrations WHERE event_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1")
        .bind(ev.id, Date.now() - 3 * 86_400_000)
        .first<JobRow>();
  return job ? toDTO(env, ev.owner_id, job) : null;
}

/** How much would move to `to` (sizes of items without a known size are estimated). */
export async function estimateMove(env: Env, ev: Ev, to: AccountRef): Promise<MigrationEstimate> {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS items,
            SUM(COALESCE(size, CASE kind WHEN 'video' THEN ?3 ELSE ?4 END)) AS bytes,
            (SELECT COALESCE(SUM(size), 0) FROM event_tracks WHERE event_id = ?1 AND account_ref != ?2) AS track_bytes,
            (SELECT COUNT(*) FROM event_tracks WHERE event_id = ?1 AND account_ref != ?2) AS tracks
       FROM media WHERE event_id = ?1 AND hidden = 0 AND account_ref != ?2`,
  )
    .bind(ev.id, to, AVG.video, AVG.photo)
    .first<{ items: number; bytes: number | null; track_bytes: number; tracks: number }>();
  return { items: r?.items ?? 0, bytes: (r?.bytes ?? 0) + (r?.track_bytes ?? 0), tracks: r?.tracks ?? 0 };
}

export async function startMove(env: Env, ev: Ev, to: AccountRef): Promise<MigrationDTO> {
  if (ev.migrating) throw new HTTPException(409, { message: "migrating" });
  const from = eventRef(ev);
  if (from === to) throw new HTTPException(400, { message: "same_account" });
  const token = await tokenForRef(env, ev.owner_id, to);

  // A previous (cancelled / failed) move to the same account: keep using its albums, so the items it
  // already copied stay together with the rest.
  const prev = await env.DB.prepare(
    "SELECT * FROM storage_migrations WHERE event_id = ? AND to_ref = ? AND status IN ('cancelled','error') ORDER BY created_at DESC LIMIT 1",
  )
    .bind(ev.id, to)
    .first<JobRow>();
  let master = prev?.master_album_id ? { id: prev.master_album_id, productUrl: prev.master_album_url || "" } : null;
  if (!master) master = await createAlbum(token, `${ev.title} · כל התמונות`);

  const est = await estimateMove(env, ev, to);
  const id = randomId(10);
  const now = Date.now();
  const lock = await env.DB.prepare("UPDATE events SET migrating = ? WHERE id = ? AND migrating IS NULL").bind(id, ev.id).run();
  if (!lock.meta.changes) throw new HTTPException(409, { message: "migrating" });
  const stmts = [
    env.DB.prepare(
      `INSERT INTO storage_migrations (id, event_id, from_ref, to_ref, status, total, master_album_id, master_album_url, old_album_url, created_at)
       VALUES (?,?,?,?, 'running', ?,?,?,?,?)`,
    ).bind(id, ev.id, from, to, est.items + est.tracks, master.id, master.productUrl || null, ev.google_album_url, now),
    env.DB.prepare("UPDATE media SET move_failures = 0 WHERE event_id = ? AND move_failures > 0").bind(ev.id),
    changeStmt(env, ev.id, "event", null),
  ];
  if (prev) {
    stmts.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO storage_migration_albums (job_id, album_id, google_album_id, album_url)
         SELECT ?, album_id, google_album_id, album_url FROM storage_migration_albums WHERE job_id = ?`,
      ).bind(id, prev.id),
    );
  }
  await env.DB.batch(stmts);
  return getMigration(env, { ...ev, migrating: id }, id);
}

export async function cancelMove(env: Env, ev: Ev, jobId: string): Promise<MigrationDTO> {
  const job = await loadJob(env, ev.id, jobId);
  if (job.status === "running") await endJob(env, ev, job, "cancelled", null);
  return getMigration(env, ev, jobId);
}

async function endJob(env: Env, ev: Ev, job: JobRow, status: "cancelled" | "error", error: string | null) {
  const left = await remainingCounts(env, ev.id, job.to_ref);
  await env.DB.batch([
    env.DB.prepare("UPDATE storage_migrations SET status = ?, error = ?, failed = ?, finished_at = ?, lock_until = 0 WHERE id = ?").bind(
      status,
      error,
      left.stuck,
      Date.now(),
      job.id,
    ),
    env.DB.prepare("UPDATE events SET migrating = NULL WHERE id = ? AND migrating = ?").bind(ev.id, job.id),
    changeStmt(env, ev.id, "event", null),
  ]);
}

/** Google album in the target account for an event album (created on first use). */
async function targetAlbum(env: Env, ev: Ev, job: JobRow, token: string, albumId: string, cache: Map<string, string>) {
  const hit = cache.get(albumId);
  if (hit) return hit;
  const saved = await env.DB.prepare("SELECT google_album_id FROM storage_migration_albums WHERE job_id = ? AND album_id = ?")
    .bind(job.id, albumId)
    .first<{ google_album_id: string }>();
  if (saved) {
    cache.set(albumId, saved.google_album_id);
    return saved.google_album_id;
  }
  const album = await env.DB.prepare("SELECT name FROM albums WHERE id = ?").bind(albumId).first<{ name: string }>();
  const g = await createAlbum(token, `${ev.title} · ${album?.name ?? "אלבום"}`);
  await env.DB.prepare("INSERT OR IGNORE INTO storage_migration_albums (job_id, album_id, google_album_id, album_url) VALUES (?,?,?,?)")
    .bind(job.id, albumId, g.id, g.productUrl || null)
    .run();
  cache.set(albumId, g.id);
  return g.id;
}

/** Copies a few items; switches the event over when nothing is left. Safe to call repeatedly. */
export async function stepMove(env: Env, ev: Ev, jobId: string): Promise<MigrationDTO & { waiting?: boolean }> {
  let job = await loadJob(env, ev.id, jobId);
  if (job.status !== "running") return getMigration(env, ev, jobId);
  const now = Date.now();
  const got = await env.DB.prepare("UPDATE storage_migrations SET lock_until = ? WHERE id = ? AND lock_until < ?")
    .bind(now + LOCK_MS, job.id, now)
    .run();
  if (!got.meta.changes) return { ...(await getMigration(env, ev, jobId)), waiting: true };

  let waiting = false;
  try {
    const target = await tokenForRef(env, ev.owner_id, job.to_ref);
    const moved = await copyMedia(env, ev, job, target);
    if (!moved) {
      const track = await copyTrack(env, ev, job, target);
      if (!track) waiting = (await finish(env, ev, job, target)) === "wait";
    }
  } catch (e) {
    if (e instanceof GoogleError && (e.storageFull || e.status === 507)) {
      await endJob(env, ev, job, "error", "storage_full");
    } else if (e instanceof GoogleError && e.needsReauth) {
      await endJob(env, ev, job, "error", "reauth");
    } else {
      // Transient (network, rate limit): release the lock, the browser simply tries again.
      await env.DB.prepare("UPDATE storage_migrations SET lock_until = 0 WHERE id = ?").bind(job.id).run();
      throw e;
    }
  }
  await env.DB.prepare("UPDATE storage_migrations SET lock_until = 0 WHERE id = ?").bind(job.id).run();
  job = await loadJob(env, ev.id, jobId);
  return { ...(await toDTO(env, ev.owner_id, job)), waiting };
}

/** Returns how many items it tried (0 = no media left to copy). */
async function copyMedia(env: Env, ev: Ev, job: JobRow, target: string): Promise<number> {
  let batch = (
    await env.DB.prepare(
      `SELECT * FROM media WHERE event_id = ? AND hidden = 0 AND account_ref != ? AND move_failures < ?
        ORDER BY kind = 'video', uploaded_at LIMIT ?`,
    )
      .bind(ev.id, job.to_ref, MAX_MOVE_FAILURES, PHOTOS_PER_STEP)
      .all<MediaRow & { mime: string | null; filename: string | null; size: number | null }>()
  ).results;
  if (!batch.length) return 0;
  // One video per step (large stream), otherwise a handful of photos.
  batch = batch[0].kind === "video" ? batch.slice(0, 1) : batch.filter((b) => b.kind === "photo");

  // Fresh download URLs from the account(s) that hold the items now.
  const fresh = new Map<string, { baseUrl?: string; status?: string }>();
  const bySource = new Map<string, typeof batch>();
  for (const m of batch) bySource.set(m.account_ref || SELF, [...(bySource.get(m.account_ref || SELF) || []), m]);
  const sourceTokens = new Map<string, string>();
  for (const [ref, group] of bySource) {
    const token = await tokenForRef(env, ev.owner_id, ref);
    sourceTokens.set(ref, token);
    for (const g of await batchGet(token, group.map((m) => m.google_id))) fresh.set(g.id, { baseUrl: g.baseUrl, status: g.mediaMetadata?.video?.status });
  }

  const failures: string[] = [];
  const uploaded: { row: (typeof batch)[number]; uploadToken: string }[] = [];
  for (const m of batch) {
    const f = fresh.get(m.google_id);
    if (!f?.baseUrl || (m.kind === "video" && f.status && f.status !== "READY")) {
      failures.push(m.id);
      continue;
    }
    try {
      const res = await mediaDownload(sourceTokens.get(m.account_ref || SELF)!, f.baseUrl, m.kind === "video" ? "=dv" : "=d");
      const mime = m.mime || res.headers.get("Content-Type") || "application/octet-stream";
      const len = Number(res.headers.get("Content-Length") || 0);
      let uploadToken: string;
      if (len && res.body) {
        const { readable, writable } = new FixedLengthStream(len);
        const pipe = res.body.pipeTo(writable);
        [uploadToken] = await Promise.all([uploadRaw(target, readable, mime, len), pipe]);
      } else {
        const buf = await res.arrayBuffer();
        uploadToken = await uploadRaw(target, buf, mime, buf.byteLength);
      }
      uploaded.push({ row: m, uploadToken });
    } catch (e) {
      if (e instanceof GoogleError && (e.storageFull || e.needsReauth)) throw e;
      console.warn("move: copy failed", m.id, e);
      failures.push(m.id);
    }
  }

  // Create the items in the matching albums of the target account.
  const albums = new Map<string, string>();
  const byAlbum = new Map<string, typeof uploaded>();
  for (const u of uploaded) byAlbum.set(u.row.album_id, [...(byAlbum.get(u.row.album_id) || []), u]);
  const names = new Map(
    (
      await env.DB.prepare(`SELECT id, name FROM albums WHERE event_id = ?`).bind(ev.id).all<{ id: string; name: string }>()
    ).results.map((a) => [a.id, a.name]),
  );
  const stmts: D1PreparedStatement[] = [];
  const newIds: string[] = [];
  const now = Date.now();
  for (const [albumId, items] of byAlbum) {
    const gAlbum = await targetAlbum(env, ev, job, target, albumId, albums);
    const results = await batchCreate(
      target,
      gAlbum,
      items.map((i) => ({ uploadToken: i.uploadToken, fileName: i.row.filename ?? undefined, description: `${names.get(albumId) ?? ""} · ${ev.title}` })),
    );
    const byToken = new Map(results.map((r) => [r.uploadToken, r]));
    for (const it of items) {
      const mi = byToken.get(it.uploadToken)?.mediaItem;
      if (!mi) {
        const msg = byToken.get(it.uploadToken)?.status?.message || "";
        if (/quota|storage|insufficient/i.test(msg)) throw new GoogleError(507, "storage_full", msg);
        failures.push(it.row.id);
        continue;
      }
      newIds.push(mi.id);
      const vs = mi.mediaMetadata?.video?.status;
      stmts.push(
        env.DB.prepare(
          "UPDATE media SET google_id = ?, account_ref = ?, base_url = ?, base_url_exp = ?, processing = ?, move_failures = 0 WHERE id = ?",
        ).bind(mi.id, job.to_ref, mi.baseUrl ?? null, mi.baseUrl ? now + 55 * 60_000 : 0, it.row.kind === "video" && vs && vs !== "READY" ? 1 : 0, it.row.id),
      );
    }
  }
  for (const id of failures) stmts.push(env.DB.prepare("UPDATE media SET move_failures = move_failures + 1 WHERE id = ?").bind(id));
  stmts.push(env.DB.prepare("UPDATE storage_migrations SET done = done + ? WHERE id = ?").bind(newIds.length, job.id));
  await env.DB.batch(stmts);
  if (job.master_album_id && newIds.length) {
    try {
      await addToAlbum(target, job.master_album_id, newIds);
    } catch (e) {
      console.warn("move: master album add failed", e);
    }
  }
  return batch.length;
}

/** Moves one uploaded song to the target account's Drive. Returns false when none is left. */
async function copyTrack(env: Env, ev: Ev, job: JobRow, target: string): Promise<boolean> {
  const t = await env.DB.prepare("SELECT * FROM event_tracks WHERE event_id = ? AND account_ref != ? LIMIT 1")
    .bind(ev.id, job.to_ref)
    .first<TrackRow>();
  if (!t) return false;
  const source = await tokenForRef(env, ev.owner_id, t.account_ref);
  const saved = await musicFolder(env, ev.owner_id, job.to_ref);
  const folderId = await driveEnsureFolder(target, saved, MUSIC_FOLDER);
  if (folderId !== saved) await setMusicFolder(env, ev.owner_id, job.to_ref, folderId);
  const res = await driveMedia(source, t.drive_id);
  if (!res.body) throw new Error("empty track download");
  const { readable, writable } = new FixedLengthStream(t.size);
  const pipe = res.body.pipeTo(writable);
  const [driveId] = await Promise.all([
    driveUpload(target, { name: `${ev.title} - ${t.title}`.slice(0, 200), mime: t.mime, size: t.size, folderId, body: readable }),
    pipe,
  ]);
  await env.DB.batch([
    env.DB.prepare("UPDATE event_tracks SET drive_id = ?, account_ref = ? WHERE id = ?").bind(driveId, job.to_ref, t.id),
    env.DB.prepare("UPDATE storage_migrations SET done = done + 1 WHERE id = ?").bind(job.id),
    changeStmt(env, ev.id, "event", null),
  ]);
  // Songs (unlike photos) can be deleted through the API: free the space in the old account.
  try {
    await driveDelete(source, t.drive_id);
  } catch (e) {
    console.warn("move: old song not deleted", t.drive_id, e);
  }
  return true;
}

/**
 * Everything is copied: give every remaining album its own album in the target account, then switch
 * the event over in one batch. "wait" = a guest upload is still finishing, "more" = call again.
 */
async function finish(env: Env, ev: Ev, job: JobRow, target: string): Promise<"wait" | "more" | "done"> {
  // An upload that began before the pause still finishes into the old account; wait for it, then copy it.
  const inflight = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM uploads WHERE event_id = ? AND status IN ('started','uploaded') AND created_at > ?",
  )
    .bind(ev.id, Date.now() - INFLIGHT_MS)
    .first<{ n: number }>();
  if (inflight?.n) return "wait";

  const missing = await env.DB.prepare(
    `SELECT id FROM albums a WHERE a.event_id = ? AND a.hidden = 0
        AND NOT EXISTS (SELECT 1 FROM storage_migration_albums s WHERE s.job_id = ? AND s.album_id = a.id) LIMIT ?`,
  )
    .bind(ev.id, job.id, ALBUMS_PER_STEP + 1)
    .all<{ id: string }>();
  const cache = new Map<string, string>();
  for (const a of missing.results.slice(0, ALBUMS_PER_STEP)) await targetAlbum(env, ev, job, target, a.id, cache);
  if (missing.results.length > ALBUMS_PER_STEP) return "more";

  const left = await remainingCounts(env, ev.id, job.to_ref);
  if (left.media || left.tracks) return "more"; // new items appeared (a late upload): the next step copies them
  const map = await env.DB.prepare("SELECT album_id, google_album_id FROM storage_migration_albums WHERE job_id = ?")
    .bind(job.id)
    .all<{ album_id: string; google_album_id: string }>();
  const stmts: D1PreparedStatement[] = map.results.map((r) =>
    env.DB.prepare("UPDATE albums SET google_album_id = ? WHERE id = ? AND event_id = ?").bind(r.google_album_id, r.album_id, ev.id),
  );
  stmts.push(
    env.DB.prepare(
      "UPDATE events SET storage_account_id = ?, google_album_id = ?, google_album_url = ?, migrating = NULL WHERE id = ?",
    ).bind(toNull(job.to_ref), job.master_album_id, job.master_album_url, ev.id),
    env.DB.prepare("UPDATE storage_migrations SET status = 'done', failed = ?, finished_at = ? WHERE id = ?").bind(left.stuck, Date.now(), job.id),
    // Uploads that never finished belonged to the old account and can't complete any more.
    env.DB.prepare("UPDATE uploads SET status = 'failed' WHERE event_id = ? AND status IN ('started','uploaded')").bind(ev.id),
    changeStmt(env, ev.id, "event", null),
    changeStmt(env, ev.id, "album", null),
  );
  await env.DB.batch(stmts);
  return "done";
}
