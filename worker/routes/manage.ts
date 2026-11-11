import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../env";
import { changeStmt, cleanName, cleanTime, createEventAlbum, eventByCode, eventTracks, listAlbums, normName, toPublicEvent, type AlbumRow, type EventRow, type TrackRow } from "../lib/db";
import { canManage, rateLimit } from "../lib/session";
import { hashPassword, sha256 } from "../lib/crypto";
import { hideMedia } from "../lib/media";
import { driveDelete, driveEnsureFolder, driveUpload, GoogleError, renameAlbum } from "../lib/google";
import { slugTaken } from "./owner";
import { accountInfo, accountStorage, assertNotMigrating, eventRef, eventToken, MUSIC_FOLDER, musicFolder, setMusicFolder, tokenForRef } from "../lib/accounts";
import { latestMigration } from "../lib/migration";
import { isValidSlug } from "../../shared/slug";
import { MAX_FEATURED, type EventType, type ManageEvent } from "../../shared/types";
import { MAX_IMAGES, sanitizeDesign, usedImageSlots } from "../../shared/design";
import { AUDIO_MIME_RE, MAX_TRACK_BYTES, MAX_UPLOADED_TRACKS, parseMusic, sanitizeMusic } from "../../shared/music";

export const manage = new Hono<AppEnv>();

const TYPES = ["wedding", "birthday", "family", "party", "trip", "general"];
const VIEWS = ["masonry", "floating", "carousel", "slideshow", "mosaic"];
const ORDERS = ["mixed", "timeline", "albums"];

async function managedEvent(c: Context<AppEnv>) {
  const ev = await eventByCode(c.env, c.req.param("code")!);
  if (!(await canManage(c, ev.id))) throw new HTTPException(403, { message: "not_allowed" });
  return ev;
}

manage.get("/e/:code/manage", async (c) => {
  const ev = await managedEvent(c);
  const isOwner = c.get("ownerId") === ev.owner_id;
  const pub = await toPublicEvent(c.env, ev, { canManage: true, isOwner });
  const body: ManageEvent = {
    ...pub,
    hasPassword: !!ev.admin_password_hash,
    shareText: ev.share_text,
    albums: await listAlbums(c.env, ev.id, true),
    musicConfig: parseMusic(ev.music, ev.type as EventType),
    uploadedTracks: await eventTracks(c.env, ev.id),
    storageAccount: await eventAccount(c, ev, isOwner),
    migration: isOwner ? await latestMigration(c.env, ev) : null,
  };
  return c.json(body);
});

/** Which Google account holds the event. Password admins (not the owner) don't see the address. */
async function eventAccount(c: Context<AppEnv>, ev: EventRow, isOwner: boolean) {
  const info = await accountInfo(c.env, ev.owner_id, eventRef(ev));
  return isOwner ? info : { ...info, email: null };
}

manage.get("/e/:code/manage/storage", async (c) => {
  const ev = await managedEvent(c);
  const info = await accountStorage(c.env, ev.owner_id, eventRef(ev), c.req.query("fresh") === "1");
  if (c.get("ownerId") !== ev.owner_id && info.account) info.account = { ...info.account, email: null };
  return c.json(info);
});

manage.patch("/e/:code/manage", async (c) => {
  const ev = await managedEvent(c);
  const b = await c.req.json<Record<string, any>>();
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  if (typeof b.title === "string" && cleanName(b.title, 80)) set("title", cleanName(b.title, 80));
  if (typeof b.subtitle === "string") set("subtitle", cleanName(b.subtitle, 120) || null);
  if (typeof b.welcome === "string") set("welcome", b.welcome.normalize("NFKC").trim().slice(0, 600) || null);
  if (typeof b.date === "string") set("event_date", b.date || null);
  if (typeof b.time === "string") set("event_time", cleanTime(b.time));
  if (typeof b.venueName === "string") set("venue_name", cleanName(b.venueName, 80) || null);
  if (typeof b.venueAddress === "string") set("venue_address", cleanName(b.venueAddress, 160) || null);
  if (TYPES.includes(b.type)) set("type", b.type);
  if (TYPES.includes(b.theme)) set("theme", b.theme);
  if (typeof b.background === "string" || b.background === null) set("background", b.background);
  if (typeof b.shareText === "string" || b.shareText === null)
    set("share_text", (b.shareText ?? "").normalize("NFKC").replace(/\r\n?/g, "\n").trim().slice(0, 500) || null);
  if (typeof b.bgReveal === "boolean") set("bg_reveal", b.bgReveal ? 1 : 0);
  if (b.quality === "compressed" || b.quality === "original") set("quality", b.quality);
  if (typeof b.keepGps === "boolean") set("keep_gps", b.keepGps ? 1 : 0);
  if (VIEWS.includes(b.defaultView)) set("default_view", b.defaultView);
  if (ORDERS.includes(b.defaultOrder)) set("default_order", b.defaultOrder);
  if (typeof b.uploadsOpen === "boolean") set("uploads_open", b.uploadsOpen ? 1 : 0);
  if (b.adminPassword === null) set("admin_password_hash", null);
  else if (typeof b.adminPassword === "string") {
    if (b.adminPassword.length < 4) throw new HTTPException(400, { message: "password_too_short" });
    set("admin_password_hash", await hashPassword(b.adminPassword));
  }
  if (typeof b.code === "string" && b.code.toLowerCase() !== ev.code) {
    const code = b.code.toLowerCase().trim();
    if (!isValidSlug(code)) throw new HTTPException(400, { message: "bad_code" });
    if (await slugTaken(c.env, code)) throw new HTTPException(409, { message: "code_taken" });
    set("code", code);
  }
  const extra: D1PreparedStatement[] = [];
  if (b.design !== undefined) {
    if (JSON.stringify(b.design ?? null).length > 32 * 1024) throw new HTTPException(413, { message: "too_large" });
    const design = sanitizeDesign(b.design);
    set("design", JSON.stringify(design));
    // Pictures of image blocks that are no longer in the design are deleted with it.
    const keep = usedImageSlots(design).map((n) => `'i${n}'`);
    extra.push(
      c.env.DB.prepare(
        `DELETE FROM event_assets WHERE event_id = ? AND kind GLOB 'i[0-9]'${keep.length ? ` AND kind NOT IN (${keep.join(",")})` : ""}`,
      ).bind(ev.id),
    );
  }
  if (b.music !== undefined) {
    if (JSON.stringify(b.music ?? null).length > 8 * 1024) throw new HTTPException(413, { message: "too_large" });
    const music = sanitizeMusic(b.music, ev.type as EventType);
    // Uploaded songs must belong to this event.
    const own = new Set((await eventTracks(c.env, ev.id)).map((t) => t.id));
    music.tracks = music.tracks.filter((t) => t.src === "lib" || own.has(t.id));
    set("music", JSON.stringify(music));
  }
  if (!sets.length) return c.json({ ok: true });
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE events SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, ev.id),
    ...extra,
    changeStmt(c.env, ev.id, "event", null),
  ]);
  return c.json({ ok: true, code: typeof b.code === "string" ? b.code.toLowerCase().trim() : ev.code });
});

async function readImage(c: Context<AppEnv>) {
  const mime = c.req.header("Content-Type") || "";
  if (!/^image\/(jpeg|webp|png)$/.test(mime)) throw new HTTPException(415, { message: "unsupported_type" });
  const data = await c.req.arrayBuffer();
  if (data.byteLength > 900 * 1024) throw new HTTPException(413, { message: "too_large" });
  return { mime, data, etag: `"${await sha256(data)}"` };
}

manage.put("/e/:code/manage/background", async (c) => {
  const ev = await managedEvent(c);
  const mime = c.req.header("Content-Type") || "";
  if (!/^image\/(jpeg|webp|png)$/.test(mime)) throw new HTTPException(415, { message: "unsupported_type" });
  const data = await c.req.arrayBuffer();
  if (data.byteLength > 900 * 1024) throw new HTTPException(413, { message: "too_large" });
  const etag = `"${await sha256(data)}"`;
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR REPLACE INTO event_assets (event_id, kind, mime, data, etag) VALUES (?, 'bg', ?, ?, ?)").bind(
      ev.id,
      mime,
      data,
      etag,
    ),
    c.env.DB.prepare("UPDATE events SET background = 'custom' WHERE id = ?").bind(ev.id),
    changeStmt(c.env, ev.id, "event", null),
  ]);
  return c.json({ ok: true, bgVersion: etag });
});

/** Featured ("representative") photos for the invitation page - up to MAX_FEATURED slots. */
manage.put("/e/:code/manage/featured/:slot", async (c) => {
  const ev = await managedEvent(c);
  const slot = Number(c.req.param("slot"));
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_FEATURED) throw new HTTPException(400, { message: "bad_slot" });
  const img = await readImage(c);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR REPLACE INTO event_assets (event_id, kind, mime, data, etag) VALUES (?, ?, ?, ?, ?)").bind(
      ev.id,
      `f${slot}`,
      img.mime,
      img.data,
      img.etag,
    ),
    changeStmt(c.env, ev.id, "event", null),
  ]);
  return c.json({ ok: true, v: img.etag });
});

manage.delete("/e/:code/manage/featured/:slot", async (c) => {
  const ev = await managedEvent(c);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM event_assets WHERE event_id = ? AND kind = ?").bind(ev.id, `f${Number(c.req.param("slot"))}`),
    changeStmt(c.env, ev.id, "event", null),
  ]);
  return c.json({ ok: true });
});

/** Pictures of the flexible-design image blocks ('i0'..'i9'); unreferenced ones are removed when the design is saved. */
manage.put("/e/:code/manage/image/:slot", async (c) => {
  const ev = await managedEvent(c);
  const slot = Number(c.req.param("slot"));
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_IMAGES) throw new HTTPException(400, { message: "bad_slot" });
  const img = await readImage(c);
  await c.env.DB.prepare("INSERT OR REPLACE INTO event_assets (event_id, kind, mime, data, etag) VALUES (?, ?, ?, ?, ?)")
    .bind(ev.id, `i${slot}`, img.mime, img.data, img.etag)
    .run();
  return c.json({ ok: true, v: img.etag });
});

/** Header image shown at the top of every guest page. */
manage.put("/e/:code/manage/header", async (c) => {
  const ev = await managedEvent(c);
  const img = await readImage(c);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR REPLACE INTO event_assets (event_id, kind, mime, data, etag) VALUES (?, 'hd', ?, ?, ?)").bind(ev.id, img.mime, img.data, img.etag),
    changeStmt(c.env, ev.id, "event", null),
  ]);
  return c.json({ ok: true, v: img.etag });
});

manage.delete("/e/:code/manage/header", async (c) => {
  const ev = await managedEvent(c);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM event_assets WHERE event_id = ? AND kind = 'hd'").bind(ev.id),
    changeStmt(c.env, ev.id, "event", null),
  ]);
  return c.json({ ok: true });
});

/** Image of the printed / digital invitation, shown above the event details. */
manage.put("/e/:code/manage/invitation", async (c) => {
  const ev = await managedEvent(c);
  const img = await readImage(c);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR REPLACE INTO event_assets (event_id, kind, mime, data, etag) VALUES (?, 'inv', ?, ?, ?)").bind(ev.id, img.mime, img.data, img.etag),
    changeStmt(c.env, ev.id, "event", null),
  ]);
  return c.json({ ok: true, v: img.etag });
});

manage.delete("/e/:code/manage/invitation", async (c) => {
  const ev = await managedEvent(c);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM event_assets WHERE event_id = ? AND kind = 'inv'").bind(ev.id),
    changeStmt(c.env, ev.id, "event", null),
  ]);
  return c.json({ ok: true });
});

manage.delete("/e/:code/manage/background", async (c) => {
  const ev = await managedEvent(c);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM event_assets WHERE event_id = ? AND kind = 'bg'").bind(ev.id),
    c.env.DB.prepare("UPDATE events SET background = NULL WHERE id = ?").bind(ev.id),
    changeStmt(c.env, ev.id, "event", null),
  ]);
  return c.json({ ok: true });
});

manage.post("/e/:code/manage/media/hide", async (c) => {
  const ev = await managedEvent(c);
  const { ids } = await c.req.json<{ ids: string[] }>();
  return c.json({ removed: await hideMedia(c.env, ev, (ids || []).slice(0, 500)) });
});

manage.post("/e/:code/manage/albums", async (c) => {
  const ev = await managedEvent(c);
  const { name } = await c.req.json<{ name: string }>();
  const clean = cleanName(name || "", 40);
  if (!clean) throw new HTTPException(400, { message: "name_required" });
  const album = await createEventAlbum(c.env, ev, "custom", clean);
  return c.json({ id: album.id, name: album.name });
});

manage.patch("/e/:code/manage/albums/:id", async (c) => {
  const ev = await managedEvent(c);
  const album = await c.env.DB.prepare("SELECT * FROM albums WHERE id = ? AND event_id = ? AND hidden = 0")
    .bind(c.req.param("id"), ev.id)
    .first<AlbumRow>();
  if (!album) throw new HTTPException(404, { message: "album_not_found" });
  const { name } = await c.req.json<{ name: string }>();
  const clean = cleanName(name || "", 40);
  if (!clean) throw new HTTPException(400, { message: "name_required" });
  // The copy in the new account would keep the old name.
  assertNotMigrating(ev);
  if (album.google_album_id) {
    try {
      await renameAlbum(await eventToken(c.env, ev), album.google_album_id, `${ev.title} · ${clean}`);
    } catch (e) {
      console.warn("rename google album failed", e);
    }
  }
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE albums SET name = ?, name_norm = ? WHERE id = ?").bind(clean, normName(clean), album.id),
    changeStmt(c.env, ev.id, "album", album.id),
  ]);
  return c.json({ ok: true });
});

/** Removes every item of the album from the site (+ from its Google albums) and hides the album. */
manage.delete("/e/:code/manage/albums/:id", async (c) => {
  const ev = await managedEvent(c);
  const album = await c.env.DB.prepare("SELECT * FROM albums WHERE id = ? AND event_id = ? AND hidden = 0")
    .bind(c.req.param("id"), ev.id)
    .first<AlbumRow>();
  if (!album) throw new HTTPException(404, { message: "album_not_found" });
  if (album.kind === "host") throw new HTTPException(400, { message: "cannot_delete_host_album" });
  const ids = await c.env.DB.prepare("SELECT id FROM media WHERE album_id = ? AND hidden = 0 LIMIT 500")
    .bind(album.id)
    .all<{ id: string }>();
  const removed = await hideMedia(c.env, ev, ids.results.map((r) => r.id));
  const remaining = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM media WHERE album_id = ? AND hidden = 0")
    .bind(album.id)
    .first<{ n: number }>();
  if (!remaining?.n) {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE albums SET hidden = 1 WHERE id = ?").bind(album.id),
      c.env.DB.prepare("DELETE FROM album_devices WHERE album_id = ?").bind(album.id),
      changeStmt(c.env, ev.id, "album", album.id),
    ]);
  }
  // Client repeats the call while `more` is true (500 items per request keeps us in the free CPU budget).
  return c.json({ removed, more: (remaining?.n ?? 0) > 0 });
});

manage.delete("/e/:code/manage", async (c) => {
  const ev = await managedEvent(c);
  if (c.get("ownerId") !== ev.owner_id) throw new HTTPException(403, { message: "owner_only" });
  await c.env.DB.prepare("UPDATE events SET deleted = 1, code = code || '-deleted-' || id WHERE id = ?").bind(ev.id).run();
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ uploaded songs (owner's Google Drive)

const trackId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");

async function eventTrack(c: Context<AppEnv>, eventId: string) {
  const t = await c.env.DB.prepare("SELECT * FROM event_tracks WHERE id = ? AND event_id = ?")
    .bind(c.req.param("id"), eventId)
    .first<TrackRow>();
  if (!t) throw new HTTPException(404, { message: "not_found" });
  return t;
}

function cleanTrackTitle(raw: string) {
  return cleanName(raw.replace(/\.(mp3|m4a|mp4|aac)$/i, "").replace(/[_]+/g, " "), 80);
}

/** Body = the raw audio file. Headers: Content-Type, Content-Length, X-Filename (URI-encoded), X-Duration (seconds). */
manage.post("/e/:code/manage/tracks", async (c) => {
  const ev = await managedEvent(c);
  assertNotMigrating(ev);
  const mime = (c.req.header("Content-Type") || "").toLowerCase();
  if (!AUDIO_MIME_RE.test(mime)) throw new HTTPException(415, { message: "bad_audio" });
  const size = Number(c.req.header("Content-Length") || 0);
  if (!size) throw new HTTPException(400, { message: "empty" });
  if (size > MAX_TRACK_BYTES) throw new HTTPException(413, { message: "track_too_large" });
  const body = c.req.raw.body;
  if (!body) throw new HTTPException(400, { message: "empty" });
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM event_tracks WHERE event_id = ?").bind(ev.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_UPLOADED_TRACKS) throw new HTTPException(409, { message: "too_many_tracks" });
  await rateLimit(c.env, `track:${ev.id}`, 60, 3600_000);

  let name = "";
  try {
    name = decodeURIComponent(c.req.header("X-Filename") || "");
  } catch {
    /* keep empty */
  }
  const title = cleanTrackTitle(name) || "שיר";
  const dur = Math.round(Number(c.req.header("X-Duration")));
  const duration = Number.isFinite(dur) && dur > 0 && dur < 24 * 3600 ? dur : null;
  const normMime = mime === "audio/mp3" ? "audio/mpeg" : mime === "audio/x-m4a" ? "audio/mp4" : mime;

  const ref = eventRef(ev);
  let driveId: string;
  try {
    // Songs live in the Drive of the event's account, next to its photos.
    const token = await eventToken(c.env, ev);
    const saved = await musicFolder(c.env, ev.owner_id, ref);
    const folderId = await driveEnsureFolder(token, saved, MUSIC_FOLDER);
    if (folderId !== saved) await setMusicFolder(c.env, ev.owner_id, ref, folderId);
    const { readable, writable } = new FixedLengthStream(size);
    const pipe = body.pipeTo(writable);
    [driveId] = await Promise.all([
      driveUpload(token, { name: `${ev.title} - ${title}`.slice(0, 200), mime: normMime, size, folderId, body: readable }),
      pipe,
    ]);
  } catch (e) {
    if (e instanceof GoogleError && e.storageFull) throw new HTTPException(507, { message: "storage_full" });
    throw e;
  }
  const id = trackId();
  await c.env.DB.prepare(
    "INSERT INTO event_tracks (id, event_id, owner_id, drive_id, title, mime, size, duration, created_at, account_ref) VALUES (?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(id, ev.id, ev.owner_id, driveId, title, normMime, size, duration, Date.now(), ref)
    .run();
  return c.json({ id, title, duration, size });
});

manage.patch("/e/:code/manage/tracks/:id", async (c) => {
  const ev = await managedEvent(c);
  const t = await eventTrack(c, ev.id);
  const { title } = await c.req.json<{ title: string }>();
  const clean = cleanName(title || "", 80);
  if (!clean) throw new HTTPException(400, { message: "name_required" });
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE event_tracks SET title = ? WHERE id = ?").bind(clean, t.id),
    changeStmt(c.env, ev.id, "event", null),
  ]);
  return c.json({ ok: true });
});

/** Deletes the song from Drive and from the event's playlist. */
manage.delete("/e/:code/manage/tracks/:id", async (c) => {
  const ev = await managedEvent(c);
  const t = await eventTrack(c, ev.id);
  try {
    await driveDelete(await tokenForRef(c.env, ev.owner_id, t.account_ref), t.drive_id);
  } catch (e) {
    // The site copy is removed anyway; the file can still be deleted by hand in Drive.
    console.warn("drive delete failed", t.drive_id, e);
  }
  const music = parseMusic(ev.music, ev.type as EventType);
  music.tracks = music.tracks.filter((r) => !(r.src === "up" && r.id === t.id));
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM event_tracks WHERE id = ?").bind(t.id),
    c.env.DB.prepare("UPDATE events SET music = ? WHERE id = ?").bind(ev.music ? JSON.stringify(music) : null, ev.id),
    changeStmt(c.env, ev.id, "event", null),
  ]);
  return c.json({ ok: true });
});
