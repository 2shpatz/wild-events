import type { Env } from "../env";
import { addToAlbum, batchCreate, ownerToken, removeFromAlbum } from "./google";
import { changeStmt, selectIn, type AlbumRow, type EventRow, type MediaRow, toMediaDTO } from "./db";
import { randomId } from "./crypto";
import type { MediaDTO } from "../../shared/types";

export interface UploadRow {
  id: string;
  event_id: string;
  album_id: string;
  device_id: string | null;
  filename: string | null;
  mime: string | null;
  size: number;
  taken_at: number | null;
  width: number | null;
  height: number | null;
  source: string;
  upload_url: string | null;
  offset: number;
  upload_token: string | null;
  status: string;
}

export interface CreatedItem {
  uploadToken: string;
  fileName: string | null;
  mime: string | null;
  takenAt: number | null;
  width: number | null;
  height: number | null;
  source: string;
  pickedId?: string | null;
  deviceId?: string | null;
  size?: number | null;
  ref: string; // upload id / picked id, to map results back
}

/**
 * Turns upload tokens into Google media items in the album (and the event master album),
 * then records them in D1 + the change feed. Returns per-ref results.
 */
export async function commitMedia(
  env: Env,
  ev: EventRow,
  album: AlbumRow,
  items: CreatedItem[],
): Promise<Map<string, { media?: MediaDTO; error?: string }>> {
  const out = new Map<string, { media?: MediaDTO; error?: string }>();
  if (!items.length) return out;
  const token = await ownerToken(env, ev.owner_id);
  const results = await batchCreate(
    token,
    album.google_album_id,
    items.map((i) => ({
      uploadToken: i.uploadToken,
      fileName: i.fileName ?? undefined,
      description: `${album.name} · ${ev.title}`,
    })),
  );
  const byToken = new Map(results.map((r) => [r.uploadToken, r]));
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [];
  const googleIds: string[] = [];
  for (const it of items) {
    const r = byToken.get(it.uploadToken);
    const mi = r?.mediaItem;
    if (!mi) {
      out.set(it.ref, { error: r?.status?.message || "create_failed" });
      continue;
    }
    googleIds.push(mi.id);
    const meta = mi.mediaMetadata || {};
    const kind = (mi.mimeType || it.mime || "").startsWith("video") || meta.video ? "video" : "photo";
    const googleTime = meta.creationTime ? Date.parse(meta.creationTime) : NaN;
    const row: MediaRow = {
      id: randomId(9),
      event_id: ev.id,
      album_id: album.id,
      google_id: mi.id,
      kind,
      width: Number(meta.width) || it.width || null,
      height: Number(meta.height) || it.height || null,
      taken_at: it.takenAt || (Number.isFinite(googleTime) ? googleTime : now),
      uploaded_at: now,
      base_url: mi.baseUrl ?? null,
      base_url_exp: mi.baseUrl ? now + 55 * 60_000 : 0,
      processing: kind === "video" && meta.video?.status !== "READY" ? 1 : 0,
      hidden: 0,
      device_id: it.deviceId ?? null,
    };
    stmts.push(
      env.DB.prepare(
        `INSERT INTO media (id, event_id, album_id, google_id, kind, mime, filename, width, height, taken_at,
           uploaded_at, size, source, picked_id, device_id, base_url, base_url_exp, processing)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        row.id, row.event_id, row.album_id, row.google_id, row.kind, mi.mimeType || it.mime, it.fileName,
        row.width, row.height, row.taken_at, row.uploaded_at, it.size ?? null, it.source, it.pickedId ?? null,
        row.device_id, row.base_url, row.base_url_exp, row.processing,
      ),
      changeStmt(env, ev.id, "add", row.id),
    );
    out.set(it.ref, { media: toMediaDTO(row) });
  }
  if (stmts.length) await env.DB.batch(stmts);
  // Also collect everything in the event's master album (one place in Google Photos with all photos).
  if (ev.google_album_id && googleIds.length && ev.google_album_id !== album.google_album_id) {
    try {
      await addToAlbum(token, ev.google_album_id, googleIds);
    } catch (e) {
      console.warn("master album add failed", e);
    }
  }
  return out;
}

/**
 * "Delete" = remove from the Google albums + hide everywhere on the site.
 * (The Library API cannot permanently delete media items.)
 */
/** Guests pass their signed album + device: they may only remove items uploaded from that device. */
export async function hideMedia(env: Env, ev: EventRow, ids: string[], restrict?: { albumId: string; deviceId: string }) {
  if (!ids.length) return 0;
  const rows = await selectIn<{ id: string; google_id: string; album_id: string; device_id: string | null; google_album_id: string | null }>(
    env,
    (ph) => `SELECT m.id, m.google_id, m.album_id, m.device_id, a.google_album_id
               FROM media m JOIN albums a ON a.id = m.album_id
              WHERE m.event_id = ? AND m.hidden = 0 AND m.id IN (${ph})`,
    [ev.id],
    ids,
  );
  const targets = rows.filter((r) => !restrict || (r.album_id === restrict.albumId && r.device_id === restrict.deviceId));
  if (!targets.length) return 0;
  // If Google is unreachable (or the owner must re-login) we still hide on the site - the user's intent is honoured.
  let token: string | null = null;
  try {
    token = await ownerToken(env, ev.owner_id);
  } catch (e) {
    console.warn("hideMedia: no Google token, hiding on site only", e);
  }
  const byAlbum = new Map<string, string[]>();
  for (const t of targets) {
    if (!t.google_album_id) continue;
    byAlbum.set(t.google_album_id, [...(byAlbum.get(t.google_album_id) || []), t.google_id]);
  }
  for (const [albumId, gids] of token ? byAlbum : new Map<string, string[]>()) {
    try {
      await removeFromAlbum(token!, albumId, gids);
    } catch (e) {
      console.warn("remove from album failed", e);
    }
  }
  if (ev.google_album_id && token) {
    try {
      await removeFromAlbum(token, ev.google_album_id, targets.map((t) => t.google_id));
    } catch (e) {
      console.warn("remove from master failed", e);
    }
  }
  const stmts: D1PreparedStatement[] = [];
  for (const t of targets) {
    stmts.push(env.DB.prepare("UPDATE media SET hidden = 1 WHERE id = ?").bind(t.id));
    stmts.push(changeStmt(env, ev.id, "remove", t.id));
  }
  await env.DB.batch(stmts);
  return targets.length;
}
