import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../env";
import { changeStmt, cleanName, cleanTime, createEventAlbum, eventByCode, listAlbums, normName, toPublicEvent, type AlbumRow } from "../lib/db";
import { canManage } from "../lib/session";
import { hashPassword, sha256 } from "../lib/crypto";
import { hideMedia } from "../lib/media";
import { ownerToken, renameAlbum } from "../lib/google";
import { ownerStorage, slugTaken } from "./owner";
import { isValidSlug } from "../../shared/slug";
import { MAX_FEATURED, type ManageEvent } from "../../shared/types";
import { MAX_IMAGES, sanitizeDesign, usedImageSlots } from "../../shared/design";

export const manage = new Hono<AppEnv>();

const TYPES = ["wedding", "birthday", "family", "party", "general"];
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
    albums: await listAlbums(c.env, ev.id, true),
  };
  return c.json(body);
});

manage.get("/e/:code/manage/storage", async (c) => {
  const ev = await managedEvent(c);
  return c.json(await ownerStorage(c.env, ev.owner_id, c.req.query("fresh") === "1"));
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
  if (album.google_album_id) {
    try {
      await renameAlbum(await ownerToken(c.env, ev.owner_id), album.google_album_id, `${ev.title} · ${clean}`);
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
