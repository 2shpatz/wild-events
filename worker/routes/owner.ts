import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, Env } from "../env";
import { eventCode, hashPassword, randomId } from "../lib/crypto";
import { createAlbum } from "../lib/google";
import { accountStorage, assertOwnAccount, listAccounts, removeAccount, SELF, tokenForRef } from "../lib/accounts";
import { cleanName, cleanTime, createEventAlbum } from "../lib/db";
import { rateLimit, requireOwner } from "../lib/session";
import type { OwnerEventSummary, StorageInfo } from "../../shared/types";
import { isValidSlug, suggestSlug } from "../../shared/slug";

export const owner = new Hono<AppEnv>();
owner.use("/*", requireOwner);

const EVENT_TYPES = ["wedding", "birthday", "family", "party", "general"];

/** The owner's own login account. */
export function ownerStorage(env: Env, ownerId: string, fresh = false): Promise<StorageInfo> {
  return accountStorage(env, ownerId, SELF, fresh);
}

owner.get("/storage", async (c) => {
  return c.json(await ownerStorage(c.env, c.get("ownerId")!, c.req.query("fresh") === "1"));
});

/** Every Google account the owner can store event photos in, with free space. */
owner.get("/accounts", async (c) => {
  const accounts = await listAccounts(c.env, c.get("ownerId")!, c.req.query("fresh") === "1");
  return c.json({ accounts });
});

/** Disconnects a storage account (only when no event is stored in it). */
owner.delete("/accounts/:id", async (c) => {
  const ownerId = c.get("ownerId")!;
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT id FROM storage_accounts WHERE id = ? AND owner_id = ?").bind(id, ownerId).first();
  if (!row) throw new HTTPException(404, { message: "account_not_found" });
  const used = await c.env.DB.prepare(
    `SELECT 1 FROM events e WHERE e.owner_id = ?1 AND e.deleted = 0
        AND (e.storage_account_id = ?2 OR EXISTS (SELECT 1 FROM media m WHERE m.event_id = e.id AND m.hidden = 0 AND m.account_ref = ?2)
             OR EXISTS (SELECT 1 FROM storage_migrations s WHERE s.event_id = e.id AND s.status = 'running' AND s.to_ref = ?2))
      LIMIT 1`,
  )
    .bind(ownerId, id)
    .first();
  if (used) throw new HTTPException(409, { message: "account_in_use" });
  await removeAccount(c.env, id);
  return c.json({ ok: true });
});

owner.get("/events", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT e.id, e.code, e.title, e.event_date, e.type, e.theme, e.quality, e.google_album_url, e.created_at,
            e.storage_account_id, e.migrating, e.share_text,
            (SELECT COUNT(*) FROM media m WHERE m.event_id = e.id AND m.hidden = 0) AS media_count,
            (SELECT COUNT(*) FROM albums a WHERE a.event_id = e.id AND a.hidden = 0) AS album_count
       FROM events e WHERE e.owner_id = ? AND e.deleted = 0 ORDER BY e.created_at DESC`,
  )
    .bind(c.get("ownerId"))
    .all<any>();
  const events: OwnerEventSummary[] = rows.results.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    date: r.event_date,
    type: r.type,
    theme: r.theme,
    quality: r.quality,
    mediaCount: r.media_count,
    albumCount: r.album_count,
    googleAlbumUrl: r.google_album_url,
    shareText: r.share_text ?? null,
    createdAt: r.created_at,
    storageAccountId: r.storage_account_id || SELF,
    migrating: !!r.migrating,
  }));
  return c.json({ events });
});

/** Is the URL slug free? Also returns a free variant (noa-itai-2) when taken. */
owner.get("/code-available", async (c) => {
  const code = (c.req.query("code") || "").toLowerCase();
  if (!isValidSlug(code)) return c.json({ available: false, reason: "format" });
  if (!(await slugTaken(c.env, code))) return c.json({ available: true });
  return c.json({ available: false, reason: "taken", suggestion: await freeSlug(c.env, code) });
});

export async function slugTaken(env: Env, code: string) {
  return !!(await env.DB.prepare("SELECT 1 FROM events WHERE code = ?").bind(code).first());
}

async function freeSlug(env: Env, base: string) {
  for (let i = 2; i < 50; i++) {
    const s = `${base.slice(0, 36)}-${i}`;
    if (!(await slugTaken(env, s))) return s;
  }
  return `${base.slice(0, 30)}-${eventCode(4)}`;
}

owner.post("/events", async (c) => {
  const ownerId = c.get("ownerId")!;
  const b = await c.req.json<{
    title: string;
    subtitle?: string;
    welcome?: string;
    date?: string;
    time?: string;
    venueName?: string;
    venueAddress?: string;
    type?: string;
    theme?: string;
    background?: string;
    quality?: string;
    adminPassword?: string;
    code?: string;
    /** "self" (the login account) or one of the owner's storage accounts */
    storageAccountId?: string;
  }>();
  const title = cleanName(b.title || "", 80);
  if (!title) throw new HTTPException(400, { message: "title_required" });
  if (b.adminPassword && b.adminPassword.length < 4) throw new HTTPException(400, { message: "password_too_short" });
  await rateLimit(c.env, `newevent:${ownerId}`, 20, 86_400_000);
  const type = EVENT_TYPES.includes(b.type || "") ? b.type! : "general";
  const theme = EVENT_TYPES.includes(b.theme || "") ? b.theme! : type;
  const quality = b.quality === "original" ? "original" : "compressed";

  // URL slug: the owner's choice, otherwise derived from the event name (/noa-itai), otherwise random.
  let code = (b.code || "").toLowerCase().trim();
  if (code) {
    if (!isValidSlug(code)) throw new HTTPException(400, { message: "bad_code" });
    if (await slugTaken(c.env, code)) throw new HTTPException(409, { message: "code_taken" });
  } else {
    const suggested = suggestSlug(title);
    if (suggested && isValidSlug(suggested)) code = (await slugTaken(c.env, suggested)) ? await freeSlug(c.env, suggested) : suggested;
    else {
      do code = eventCode();
      while (await slugTaken(c.env, code));
    }
  }

  const ref = await assertOwnAccount(c.env, ownerId, b.storageAccountId);
  const storageAccountId = ref === SELF ? null : ref;
  const token = await tokenForRef(c.env, ownerId, ref);
  const master = await createAlbum(token, `${title} · כל התמונות`);
  const id = randomId(9);
  await c.env.DB.prepare(
    `INSERT INTO events (id, owner_id, code, title, subtitle, welcome, event_date, event_time, venue_name, venue_address, type, theme, background, quality,
       admin_password_hash, google_album_id, google_album_url, created_at, storage_account_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id,
      ownerId,
      code,
      title,
      b.subtitle ? cleanName(b.subtitle, 120) : null,
      b.welcome ? b.welcome.normalize("NFKC").trim().slice(0, 600) : null,
      b.date || null,
      cleanTime(b.time),
      b.venueName ? cleanName(b.venueName, 80) || null : null,
      b.venueAddress ? cleanName(b.venueAddress, 160) || null : null,
      type,
      theme,
      b.background || null,
      quality,
      b.adminPassword ? await hashPassword(b.adminPassword) : null,
      master.id,
      master.productUrl,
      Date.now(),
      storageAccountId,
    )
    .run();
  await createEventAlbum(c.env, { id, owner_id: ownerId, title, storage_account_id: storageAccountId }, "host", "בעלי השמחה");
  return c.json({ id, code });
});
