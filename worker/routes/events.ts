import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../env";
import {
  type AlbumRow,
  cleanName,
  createEventAlbum,
  ensureUrls,
  eventByCode,
  type EventRow,
  listAlbums,
  type MediaRow,
  normName,
  selectIn,
  toMediaDTO,
  toPublicEvent,
  type TrackRow,
} from "../lib/db";
import { driveMedia, ownerToken } from "../lib/google";
import { canManage, createSession, guestToken, rateLimit, readGuestToken } from "../lib/session";
import { verifyPassword } from "../lib/crypto";
import { hideMedia } from "../lib/media";
import type { FeedResponse, GuestIdentity } from "../../shared/types";

export const events = new Hono<AppEnv>();

/** Guests don't need internal Google ids or the owner's linked-album details. */
const publicAlbums = (list: Awaited<ReturnType<typeof listAlbums>>) => list.map(({ googleAlbumId: _g, link: _l, ...a }) => a);

events.get("/e/:code", async (c) => {
  const ev = await eventByCode(c.env, c.req.param("code"));
  const manage = await canManage(c, ev.id);
  return c.json(await toPublicEvent(c.env, ev, { canManage: manage, isOwner: c.get("ownerId") === ev.owner_id }));
});

/** Background ('bg'), header ('hd'), invitation ('inv'), featured photos ('f0'..'f5') and design images ('i0'..'i9'). */
events.get("/e/:code/asset/:kind", async (c) => {
  const kind = c.req.param("kind");
  if (!/^(bg|hd|inv|f\d|i\d)$/.test(kind)) throw new HTTPException(404, { message: "not_found" });
  const ev = await eventByCode(c.env, c.req.param("code"));
  const r = await c.env.DB.prepare("SELECT mime, data, etag FROM event_assets WHERE event_id = ? AND kind = ?")
    .bind(ev.id, kind)
    .first<{ mime: string; data: ArrayBuffer | number[]; etag: string }>();
  if (!r) throw new HTTPException(404, { message: "not_found" });
  // D1 returns BLOB columns as an array of byte values.
  const bytes = r.data instanceof ArrayBuffer ? new Uint8Array(r.data) : Uint8Array.from(r.data);
  if (c.req.header("If-None-Match") === r.etag) return c.body(null, 304);
  return new Response(bytes, {
    headers: {
      "Content-Type": r.mime,
      ETag: r.etag,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

/**
 * A song the host uploaded, streamed from the owner's Google Drive. Range requests are passed through (iOS needs them).
 * The full file is kept in the Cloudflare cache, so most plays never reach Drive.
 */
events.get("/e/:code/track/:id", async (c) => {
  const ev = await eventByCode(c.env, c.req.param("code"));
  const t = await c.env.DB.prepare("SELECT * FROM event_tracks WHERE id = ? AND event_id = ?")
    .bind(c.req.param("id"), ev.id)
    .first<TrackRow>();
  if (!t) throw new HTTPException(404, { message: "not_found" });
  const range = c.req.header("Range") || null;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheUrl = new URL(`/__track/${t.id}/${encodeURIComponent(t.drive_id)}`, c.req.url).toString();
  if (cache) {
    const hit = await cache.match(new Request(cacheUrl, { headers: range ? { Range: range } : {} }));
    if (hit) return hit;
  }
  const token = await ownerToken(c.env, t.owner_id);
  const headers = (res: Response) => {
    const h = new Headers({
      "Content-Type": t.mime,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
    });
    for (const k of ["Content-Length", "Content-Range"]) {
      const v = res.headers.get(k);
      if (v) h.set(k, v);
    }
    return h;
  };
  const putFull = (res: Response) => cache?.put(cacheUrl, new Response(res.body, { status: 200, headers: headers(res) }));
  if (range) {
    const res = await driveMedia(token, t.drive_id, range);
    if (cache) {
      c.executionCtx.waitUntil(
        driveMedia(token, t.drive_id)
          .then(putFull)
          .catch((e) => console.warn("track cache fill failed", t.id, e)),
      );
    }
    return new Response(res.body, { status: res.status, headers: headers(res) });
  }
  const res = await driveMedia(token, t.drive_id);
  if (!cache || !res.body) return new Response(res.body, { status: res.status, headers: headers(res) });
  const [a, b] = res.body.tee();
  c.executionCtx.waitUntil(Promise.resolve(putFull(new Response(b, { headers: res.headers }))).catch(() => {}));
  return new Response(a, { status: 200, headers: headers(res) });
});

// ------------------------------------------------------------------ guest identity

async function albumById(c: Context<AppEnv>, ev: EventRow, id: string) {
  return c.env.DB.prepare("SELECT * FROM albums WHERE id = ? AND event_id = ? AND hidden = 0")
    .bind(id, ev.id)
    .first<AlbumRow>();
}

async function identity(c: Context<AppEnv>, album: AlbumRow, deviceId: string): Promise<GuestIdentity> {
  return {
    album: { id: album.id, name: album.name, kind: album.kind },
    token: await guestToken(c.env, album.id, deviceId),
  };
}

/**
 * Resolve (or create) the uploader's album.
 *  - device already known → its album
 *  - name matches an existing guest → ask "is this you?" (confirmAlbumId)
 *  - otherwise create a new album
 */
events.post("/e/:code/guest", async (c) => {
  const ev = await eventByCode(c.env, c.req.param("code"));
  const b = await c.req.json<{
    deviceId: string;
    name?: string;
    confirmAlbumId?: string;
    forceNew?: boolean;
    asHost?: boolean;
    albumId?: string; // managers may upload into a specific album (e.g. "photographer")
  }>();
  const deviceId = (b.deviceId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  if (deviceId.length < 12) throw new HTTPException(400, { message: "bad_device" });

  if ((b.asHost || b.albumId) && (await canManage(c, ev.id))) {
    const album = b.albumId
      ? await albumById(c, ev, b.albumId)
      : await c.env.DB.prepare("SELECT * FROM albums WHERE event_id = ? AND kind = 'host' AND hidden = 0 LIMIT 1")
          .bind(ev.id)
          .first<AlbumRow>();
    if (!album) throw new HTTPException(404, { message: "album_not_found" });
    return c.json(await identity(c, album, deviceId));
  }

  const mapped = await c.env.DB.prepare(
    `SELECT a.* FROM album_devices d JOIN albums a ON a.id = d.album_id
      WHERE d.event_id = ? AND d.device_id = ? AND a.hidden = 0`,
  )
    .bind(ev.id, deviceId)
    .first<AlbumRow>();
  if (mapped && !b.forceNew) return c.json(await identity(c, mapped, deviceId));

  if (b.confirmAlbumId) {
    // "Is this you?" hands over the album (upload only - deletes stay with the original phone); limit guessing.
    await rateLimit(c.env, `claim:${ev.id}:${c.req.header("CF-Connecting-IP") || "local"}`, 20, 3600_000);
    const album = await albumById(c, ev, b.confirmAlbumId);
    if (!album || album.kind !== "guest") throw new HTTPException(404, { message: "album_not_found" });
    await c.env.DB.prepare("INSERT OR REPLACE INTO album_devices (album_id, device_id, event_id) VALUES (?,?,?)")
      .bind(album.id, deviceId, ev.id)
      .run();
    return c.json(await identity(c, album, deviceId));
  }

  const name = cleanName(b.name || "", 40);
  if (!name) return c.json({ needName: true });

  if (!b.forceNew) {
    const match = await c.env.DB.prepare(
      `SELECT a.id, a.name, (SELECT COUNT(*) FROM media m WHERE m.album_id = a.id AND m.hidden = 0) AS count
         FROM albums a WHERE a.event_id = ? AND a.kind = 'guest' AND a.hidden = 0 AND a.name_norm = ? LIMIT 1`,
    )
      .bind(ev.id, normName(name))
      .first<{ id: string; name: string; count: number }>();
    if (match) return c.json({ match });
  }

  // Generous: many guests share the venue WiFi (one IP).
  await rateLimit(c.env, `newalbum:${ev.id}:${c.req.header("CF-Connecting-IP") || "local"}`, 200, 3600_000);
  const album = await createEventAlbum(c.env, ev, "guest", name);
  await c.env.DB.prepare("INSERT OR REPLACE INTO album_devices (album_id, device_id, event_id) VALUES (?,?,?)")
    .bind(album.id, deviceId, ev.id)
    .run();
  return c.json(await identity(c, album, deviceId));
});

// ------------------------------------------------------------------ live feed

events.get("/e/:code/feed", async (c) => {
  const ev = await eventByCode(c.env, c.req.param("code"));
  const since = Number(c.req.query("since") || 0);
  const cursorRow = await c.env.DB.prepare("SELECT MAX(seq) AS s FROM changes WHERE event_id = ?")
    .bind(ev.id)
    .first<{ s: number | null }>();
  const cursor = cursorRow?.s ?? 0;

  if (since > 0) {
    if (since >= cursor) return c.json<FeedResponse>({ cursor, full: false, media: [], removed: [] });
    const ch = await c.env.DB.prepare(
      "SELECT op, ref_id FROM changes WHERE event_id = ? AND seq > ? ORDER BY seq LIMIT 1001",
    )
      .bind(ev.id, since)
      .all<{ op: string; ref_id: string | null }>();
    if (ch.results.length > 1000) return c.json<FeedResponse>({ cursor, full: true, media: [], removed: [] });
    const added = [...new Set(ch.results.filter((r) => r.op === "add").map((r) => r.ref_id!))];
    const removed = [...new Set(ch.results.filter((r) => r.op === "remove").map((r) => r.ref_id!))];
    const albumChanged = ch.results.some((r) => r.op === "album" || r.op === "remove" || r.op === "add");
    const eventChanged = ch.results.some((r) => r.op === "event");
    let media: MediaRow[] = [];
    if (added.length) {
      const rows = await selectIn<MediaRow>(
        c.env,
        (ph) => `SELECT * FROM media WHERE event_id = ? AND hidden = 0 AND id IN (${ph})`,
        [ev.id],
        added,
      );
      media = await ensureUrls(c.env, ev.owner_id, rows);
    }
    return c.json<FeedResponse>({
      cursor,
      full: false,
      media: media.map(toMediaDTO),
      removed,
      albums: albumChanged ? publicAlbums(await listAlbums(c.env, ev.id)) : undefined,
      eventChanged,
    });
  }

  const res = await c.env.DB.prepare(
    "SELECT * FROM media WHERE event_id = ? AND hidden = 0 ORDER BY uploaded_at DESC LIMIT 6000",
  )
    .bind(ev.id)
    .all<MediaRow>();
  const rows = await ensureUrls(c.env, ev.owner_id, res.results);
  return c.json<FeedResponse>({
    cursor,
    full: true,
    media: rows.map(toMediaDTO),
    removed: [],
    albums: publicAlbums(await listAlbums(c.env, ev.id)),
  });
});

/** Newest few items for the event page's live strip (light: no full feed, no albums). */
events.get("/e/:code/latest", async (c) => {
  const ev = await eventByCode(c.env, c.req.param("code"));
  const n = Math.min(24, Math.max(1, Number(c.req.query("n")) || 12));
  const res = await c.env.DB.prepare(
    "SELECT * FROM media WHERE event_id = ? AND hidden = 0 AND processing = 0 ORDER BY uploaded_at DESC LIMIT ?",
  )
    .bind(ev.id, n)
    .all<MediaRow>();
  const rows = await ensureUrls(c.env, ev.owner_id, res.results);
  return c.json({ media: rows.map(toMediaDTO) });
});

/** Fresh base URLs for specific items (lazy loading of large galleries / expired URLs). */
events.post("/e/:code/urls", async (c) => {
  const ev = await eventByCode(c.env, c.req.param("code"));
  const { ids } = await c.req.json<{ ids: string[] }>();
  const list = (ids || []).slice(0, 200);
  if (!list.length) return c.json({ media: [] });
  const found = await selectIn<MediaRow>(
    c.env,
    (ph) => `SELECT * FROM media WHERE event_id = ? AND hidden = 0 AND id IN (${ph})`,
    [ev.id],
    list,
  );
  const rows = await ensureUrls(c.env, ev.owner_id, found);
  return c.json({ media: rows.map(toMediaDTO) });
});

// ------------------------------------------------------------------ guest deletes own media

events.post("/e/:code/media/delete", async (c) => {
  const ev = await eventByCode(c.env, c.req.param("code"));
  const g = await readGuestToken(c);
  if (!g) throw new HTTPException(401, { message: "guest_required" });
  const { ids } = await c.req.json<{ ids: string[] }>();
  const count = await hideMedia(c.env, ev, (ids || []).slice(0, 200), g);
  return c.json({ removed: count });
});

// ------------------------------------------------------------------ event admin (password)

events.post("/e/:code/admin/login", async (c) => {
  const ev = await eventByCode(c.env, c.req.param("code"));
  await rateLimit(c.env, `adminlogin:${ev.id}:${c.req.header("CF-Connecting-IP") || "local"}`, 8, 15 * 60_000);
  const { password } = await c.req.json<{ password: string }>();
  if (!ev.admin_password_hash || !password || !(await verifyPassword(password, ev.admin_password_hash))) {
    throw new HTTPException(403, { message: "bad_password" });
  }
  await createSession(c, "event_admin", { eventId: ev.id, days: 14 });
  return c.json({ ok: true });
});
