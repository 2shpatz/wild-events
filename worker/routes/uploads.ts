import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../env";
import { type AlbumRow, eventByCode, type EventRow } from "../lib/db";
import { GoogleError, ownerToken, startResumable, uploadChunk, uploadRaw } from "../lib/google";
import { commitMedia, type UploadRow } from "../lib/media";
import { randomId } from "../lib/crypto";
import { rateLimit, readGuestToken } from "../lib/session";
import { CHUNK_SIZE, MAX_SINGLE_UPLOAD } from "../../shared/types";

export const uploads = new Hono<AppEnv>();

const MAX_FILE = 10 * 1024 * 1024 * 1024; // Google Photos limit for videos is 20GB; keep it sane.

interface Meta {
  name?: string;
  mime?: string;
  size?: number;
  takenAt?: number;
  w?: number;
  h?: number;
  source?: string;
}

async function guestAlbum(c: Context<AppEnv>, ev: EventRow) {
  const g = await readGuestToken(c);
  if (!g) throw new HTTPException(401, { message: "guest_required" });
  const album = await c.env.DB.prepare("SELECT * FROM albums WHERE id = ? AND event_id = ? AND hidden = 0")
    .bind(g.albumId, ev.id)
    .first<AlbumRow>();
  if (!album) throw new HTTPException(403, { message: "album_not_found" });
  if (!ev.uploads_open && album.kind === "guest") throw new HTTPException(403, { message: "uploads_closed" });
  return { album, deviceId: g.deviceId };
}

function checkMime(mime: string) {
  if (!/^(image|video)\//.test(mime)) throw new HTTPException(415, { message: "unsupported_type" });
}

function googleFail(e: unknown): never {
  if (e instanceof GoogleError) {
    if (e.needsReauth) throw new HTTPException(503, { message: "owner_reauth" });
    if (e.storageFull) throw new HTTPException(507, { message: "storage_full" });
    throw new HTTPException(502, { message: `google:${e.message}`.slice(0, 200) });
  }
  throw e;
}

function insertUpload(c: Context<AppEnv>, u: Partial<UploadRow> & { id: string }) {
  return c.env.DB.prepare(
    `INSERT INTO uploads (id, event_id, album_id, device_id, filename, mime, size, taken_at, width, height,
       source, upload_url, offset, upload_token, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      u.id, u.event_id, u.album_id, u.device_id ?? null, u.filename ?? null, u.mime ?? null, u.size ?? 0,
      u.taken_at ?? null, u.width ?? null, u.height ?? null, u.source ?? "upload", u.upload_url ?? null,
      u.offset ?? 0, u.upload_token ?? null, u.status ?? "started", Date.now(),
    )
    .run();
}

function metaFromHeader(c: Context<AppEnv>): Meta {
  try {
    return JSON.parse(decodeURIComponent(c.req.header("X-Meta") || "{}"));
  } catch {
    return {};
  }
}

/** Small files: a single request streams the bytes straight to Google. */
uploads.post("/e/:code/upload", async (c) => {
  const ev = await eventByCode(c.env, c.req.param("code"));
  const { album, deviceId } = await guestAlbum(c, ev);
  await rateLimit(c.env, `up:${ev.id}:${deviceId}`, 1500, 3600_000);
  const meta = metaFromHeader(c);
  const mime = meta.mime || c.req.header("Content-Type") || "";
  checkMime(mime);
  const length = Number(c.req.header("Content-Length") || 0);
  if (!length || length > MAX_SINGLE_UPLOAD + 1024 * 1024) throw new HTTPException(413, { message: "too_large" });
  const body = c.req.raw.body;
  if (!body) throw new HTTPException(400, { message: "empty" });

  let uploadToken: string;
  try {
    const token = await ownerToken(c.env, ev.owner_id);
    const { readable, writable } = new FixedLengthStream(length);
    const pipe = body.pipeTo(writable);
    [uploadToken] = await Promise.all([uploadRaw(token, readable, mime, length), pipe]);
  } catch (e) {
    googleFail(e);
  }
  const id = randomId(12);
  await insertUpload(c, {
    id,
    event_id: ev.id,
    album_id: album.id,
    device_id: deviceId,
    filename: meta.name?.slice(0, 200),
    mime,
    size: length,
    taken_at: meta.takenAt || null,
    width: meta.w || null,
    height: meta.h || null,
    source: meta.source === "share" ? "share" : "upload",
    upload_token: uploadToken,
    status: "uploaded",
    offset: length,
  });
  return c.json({ uploadId: id });
});

/** Large files (videos): start a resumable session; the client then PUTs chunks. */
uploads.post("/e/:code/upload/start", async (c) => {
  const ev = await eventByCode(c.env, c.req.param("code"));
  const { album, deviceId } = await guestAlbum(c, ev);
  const meta = await c.req.json<Meta>();
  const mime = meta.mime || "";
  checkMime(mime);
  if (!meta.size || meta.size > MAX_FILE) throw new HTTPException(413, { message: "too_large" });
  let session;
  try {
    session = await startResumable(await ownerToken(c.env, ev.owner_id), mime, meta.size);
  } catch (e) {
    googleFail(e);
  }
  const id = randomId(12);
  await insertUpload(c, {
    id,
    event_id: ev.id,
    album_id: album.id,
    device_id: deviceId,
    filename: meta.name?.slice(0, 200),
    mime,
    size: meta.size,
    taken_at: meta.takenAt || null,
    width: meta.w || null,
    height: meta.h || null,
    source: meta.source === "share" ? "share" : "upload",
    upload_url: session.url,
  });
  return c.json({ uploadId: id, chunkSize: CHUNK_SIZE });
});

uploads.put("/e/:code/upload/:id", async (c) => {
  const ev = await eventByCode(c.env, c.req.param("code"));
  const { album } = await guestAlbum(c, ev);
  const up = await c.env.DB.prepare("SELECT * FROM uploads WHERE id = ? AND event_id = ? AND album_id = ?")
    .bind(c.req.param("id"), ev.id, album.id)
    .first<UploadRow>();
  if (!up || !up.upload_url || up.status !== "started") throw new HTTPException(404, { message: "upload_not_found" });
  const offset = Number(c.req.query("offset"));
  const length = Number(c.req.header("Content-Length") || 0);
  if (offset !== up.offset) return c.json({ offset: up.offset, mismatch: true }, 409);
  if (!length || length > CHUNK_SIZE || offset + length > up.size) throw new HTTPException(400, { message: "bad_chunk" });
  const finalize = offset + length === up.size;
  const body = c.req.raw.body;
  if (!body) throw new HTTPException(400, { message: "empty" });
  let uploadToken: string | null;
  try {
    const token = await ownerToken(c.env, ev.owner_id);
    const { readable, writable } = new FixedLengthStream(length);
    const pipe = body.pipeTo(writable);
    [uploadToken] = await Promise.all([uploadChunk(token, up.upload_url, readable, length, offset, finalize), pipe]);
  } catch (e) {
    googleFail(e);
  }
  await c.env.DB.prepare("UPDATE uploads SET offset = ?, upload_token = ?, status = ? WHERE id = ?")
    .bind(offset + length, uploadToken, finalize ? "uploaded" : "started", up.id)
    .run();
  return c.json({ offset: offset + length, done: finalize });
});

/** Turn uploaded bytes into media items (batched: up to 50 per Google call). */
uploads.post("/e/:code/upload/finalize", async (c) => {
  const ev = await eventByCode(c.env, c.req.param("code"));
  const { album, deviceId } = await guestAlbum(c, ev);
  const { ids } = await c.req.json<{ ids: string[] }>();
  const list = (ids || []).slice(0, 50);
  if (!list.length) return c.json({ results: {} });
  const rows = await c.env.DB.prepare(
    `SELECT * FROM uploads WHERE event_id = ? AND album_id = ? AND status = 'uploaded'
       AND id IN (${list.map(() => "?").join(",")})`,
  )
    .bind(ev.id, album.id, ...list)
    .all<UploadRow>();
  let results;
  try {
    results = await commitMedia(
      c.env,
      ev,
      album,
      rows.results.map((u) => ({
        uploadToken: u.upload_token!,
        fileName: u.filename,
        mime: u.mime,
        takenAt: u.taken_at,
        width: u.width,
        height: u.height,
        source: u.source,
        deviceId,
        size: u.size,
        ref: u.id,
      })),
    );
  } catch (e) {
    googleFail(e);
  }
  const stmts: D1PreparedStatement[] = [];
  for (const [ref, r] of results) {
    stmts.push(c.env.DB.prepare("UPDATE uploads SET status = ? WHERE id = ?").bind(r.media ? "done" : "failed", ref));
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ results: Object.fromEntries(results) });
});
