// Site-wide settings, the site admin (the person who hosts this copy of the site) and the members list.
//
// The site admin is whoever proves they host the site: they open the setup link (SETUP_TOKEN - a plain
// secret/env var on any hosting platform) and log in with Google. Their Google account id (`sub`, stable even
// if the email changes) is stored in settings.site_admin_sub. Nothing here depends on the hosting platform.
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { GMAIL_SEND } from "./google";

type HasEnv = { env: Env };

export async function getSetting(c: HasEnv, key: string) {
  const r = await c.env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return r?.value ?? null;
}

export async function putSetting(c: HasEnv, key: string, value: string) {
  await c.env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, value).run();
}

/** The waitlist is on unless the admin turned it off. */
export async function waitlistEnabled(c: HasEnv) {
  return (await getSetting(c, "waitlist_enabled")) !== "0";
}

export interface AdminOwner {
  id: string;
  email: string;
  name: string | null;
  sub: string;
  /** The admin granted "send email" (Gmail) and the grant is still alive. */
  mailConnected: boolean;
}

export async function getSiteAdmin(env: Env): Promise<AdminOwner | null> {
  const r = await env.DB.prepare(
    `SELECT o.id, o.email, o.name, o.google_sub, o.scopes, o.refresh_token_enc
       FROM settings s JOIN owners o ON o.google_sub = s.value WHERE s.key = 'site_admin_sub'`,
  ).first<{ id: string; email: string; name: string | null; google_sub: string; scopes: string | null; refresh_token_enc: string | null }>();
  if (!r) return null;
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    sub: r.google_sub,
    mailConnected: !!r.refresh_token_enc && (r.scopes || "").split(" ").includes(GMAIL_SEND),
  };
}

// ---------------------------------------------------------------- members

export type MemberStatus = "approved" | "pending" | "archived";

export interface MemberRow {
  email: string;
  name: string | null;
  status: MemberStatus;
  source: string;
  google_sub: string | null;
  picture: string | null;
  requested_at: number | null;
  approved_at: number | null;
  archived_at: number | null;
  invited_at: number | null;
  created_at: number;
}

export const normEmail = (e: string) => e.trim().toLowerCase();
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(raw: unknown): string {
  const email = normEmail(typeof raw === "string" ? raw : "").slice(0, 120);
  if (!EMAIL_RE.test(email)) throw new HTTPException(400, { message: "bad_email" });
  return email;
}

/** Finds the member by Google account first (emails can change), then by email. */
export async function findMember(env: Env, sub: string | null, email: string | null): Promise<MemberRow | null> {
  if (sub) {
    const bySub = await env.DB.prepare("SELECT * FROM members WHERE google_sub = ?").bind(sub).first<MemberRow>();
    if (bySub) return bySub;
  }
  if (!email) return null;
  return env.DB.prepare("SELECT * FROM members WHERE email = ?").bind(normEmail(email)).first<MemberRow>();
}

/** Public address of the site, for links in emails. */
export function siteOrigin(env: Env, requestUrl: string) {
  return (env.CANONICAL_ORIGIN || new URL(requestUrl).origin).replace(/\/$/, "");
}
