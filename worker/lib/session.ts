import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, Env } from "../env";
import { randomId, sign, verifySig } from "./crypto";

const OWNER_COOKIE = "sid";
const ADMIN_COOKIE = "asid";
const DAY = 86_400_000;

export type SessionKind = "owner" | "event_admin" | "setup";

export async function createSession(
  c: Context<AppEnv>,
  kind: SessionKind,
  opts: { ownerId?: string; eventId?: string; days?: number },
) {
  const id = randomId(24);
  const days = opts.days ?? 30;
  await c.env.DB.prepare("INSERT INTO sessions (id, kind, owner_id, event_id, expires_at) VALUES (?,?,?,?,?)")
    .bind(id, kind, opts.ownerId ?? null, opts.eventId ?? null, Date.now() + days * DAY)
    .run();
  const name = kind === "owner" ? OWNER_COOKIE : kind === "setup" ? "ssid" : ADMIN_COOKIE;
  setCookie(c, name, id, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: days * 86_400,
  });
}

export async function destroySessions(c: Context<AppEnv>) {
  for (const name of [OWNER_COOKIE, ADMIN_COOKIE]) {
    const id = getCookie(c, name);
    if (id) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    deleteCookie(c, name, { path: "/" });
  }
}

async function lookup(env: Env, id: string | undefined, kind: SessionKind) {
  if (!id) return null;
  return env.DB.prepare("SELECT owner_id, event_id FROM sessions WHERE id = ? AND kind = ? AND expires_at > ?")
    .bind(id, kind, Date.now())
    .first<{ owner_id: string | null; event_id: string | null }>();
}

/** Loads owner + event-admin sessions into context variables (never rejects). */
export const loadSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const owner = await lookup(c.env, getCookie(c, OWNER_COOKIE), "owner");
  if (owner?.owner_id) c.set("ownerId", owner.owner_id);
  const admin = await lookup(c.env, getCookie(c, ADMIN_COOKIE), "event_admin");
  if (admin?.event_id) c.set("adminEventId", admin.event_id);
  await next();
};

export async function hasSetupSession(c: Context<AppEnv>) {
  const s = await lookup(c.env, getCookie(c, "ssid"), "setup");
  return !!s;
}

export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("ownerId")) throw new HTTPException(401, { message: "login_required" });
  await next();
};

/** Is the logged-in owner the site admin (the Google account claimed through the setup link)? */
export async function isSiteAdmin(c: Context<AppEnv>): Promise<boolean> {
  const ownerId = c.get("ownerId");
  if (!ownerId) return false;
  const row = await c.env.DB.prepare(
    "SELECT 1 FROM owners o JOIN settings s ON s.key = 'site_admin_sub' AND s.value = o.google_sub WHERE o.id = ?",
  )
    .bind(ownerId)
    .first();
  return !!row;
}

export const requireSiteAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("ownerId")) throw new HTTPException(401, { message: "login_required" });
  if (!(await isSiteAdmin(c))) throw new HTTPException(403, { message: "admin_only" });
  await next();
};

/** Logs a user out everywhere: their Google-login sessions and password sessions of their events. */
export function endUserSessions(env: Env, ownerId: string) {
  return [
    env.DB.prepare("DELETE FROM sessions WHERE owner_id = ?").bind(ownerId),
    env.DB.prepare("DELETE FROM sessions WHERE event_id IN (SELECT id FROM events WHERE owner_id = ?)").bind(ownerId),
  ];
}

/** Can the current visitor manage this event (Google owner, or holder of the event admin password)? */
export async function canManage(c: Context<AppEnv>, eventId: string): Promise<boolean> {
  if (c.get("adminEventId") === eventId) return true;
  const ownerId = c.get("ownerId");
  if (!ownerId) return false;
  const row = await c.env.DB.prepare("SELECT 1 FROM events WHERE id = ? AND owner_id = ? AND deleted = 0")
    .bind(eventId, ownerId)
    .first();
  return !!row;
}

// ------------------------------------------------------------------ guest tokens
// Format: <albumId>.<deviceId>.<sig>  - lets a guest act on their own album without logging in.

export async function guestToken(env: Env, albumId: string, deviceId: string) {
  return `${albumId}.${deviceId}.${await sign(env.SESSION_SECRET, `g:${albumId}:${deviceId}`)}`;
}

export async function readGuestToken(c: Context<AppEnv>): Promise<{ albumId: string; deviceId: string } | null> {
  const raw = c.req.header("X-Guest");
  if (!raw) return null;
  const [albumId, deviceId, sig] = raw.split(".");
  if (!albumId || !deviceId || !sig) return null;
  if (!(await verifySig(c.env.SESSION_SECRET, `g:${albumId}:${deviceId}`, sig))) return null;
  return { albumId, deviceId };
}

// ------------------------------------------------------------------ rate limiting

export async function rateLimit(env: Env, key: string, max: number, windowMs: number) {
  const now = Date.now();
  const row = await env.DB.prepare("SELECT count, window_end FROM rate_limits WHERE key = ?")
    .bind(key)
    .first<{ count: number; window_end: number }>();
  if (!row || row.window_end < now) {
    await env.DB.prepare("INSERT OR REPLACE INTO rate_limits (key, count, window_end) VALUES (?, 1, ?)")
      .bind(key, now + windowMs)
      .run();
    return;
  }
  if (row.count >= max) throw new HTTPException(429, { message: "too_many_attempts" });
  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
}
