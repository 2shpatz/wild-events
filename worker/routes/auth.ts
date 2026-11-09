import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv, Env } from "../env";
import { b64url, encrypt, fromB64url, randomId, sign, verifySig } from "../lib/crypto";
import {
  authUrl,
  exchangeCode,
  getOAuthClient,
  GMAIL_SEND,
  GoogleError,
  pickerCreate,
  pickerDelete,
  revokeToken,
  SCOPES,
  storageQuota,
  userInfo,
} from "../lib/google";
import { createSession, destroySessions, hasSetupSession, isSiteAdmin, rateLimit } from "../lib/session";
import { findMember, getSetting, getSiteAdmin, normEmail, putSetting, siteOrigin, waitlistEnabled, type MemberRow } from "../lib/site";
import { sendMail } from "../lib/mail";
import { waitlistRequestMail } from "../lib/emails";
import type { OwnerMe } from "../../shared/types";

export const auth = new Hono<AppEnv>();

const STATE_COOKIE = "oauth_state";

function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

auth.get("/login", async (c) => {
  const client = await getOAuthClient(c.env);
  if (!client) return c.redirect("/login?error=not_configured");
  // login: normal owner login · test: setup wizard connection test (also claims site admin)
  // claim: setup wizard, only makes this Google account the site admin · mail: the admin allows sending email
  const q = c.req.query("mode");
  const mode = q === "test" || q === "mail" || q === "claim" ? q : "login";
  if ((mode === "test" || mode === "claim") && !(await hasSetupSession(c))) return c.redirect("/setup");
  let hint: string | undefined;
  if (mode === "mail") {
    if (!(await isSiteAdmin(c))) return c.redirect("/dashboard");
    hint = (await getSiteAdmin(c.env))?.email;
  }
  const payload = b64url(
    new TextEncoder().encode(JSON.stringify({ n: randomId(12), m: mode, next: safeNext(c.req.query("next")) })),
  );
  const state = `${payload}.${await sign(c.env.SESSION_SECRET, `st:${payload}`)}`;
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/api/auth",
    maxAge: 900,
  });
  const origin = new URL(c.req.url).origin;
  return c.redirect(authUrl(client, `${origin}/api/auth/callback`, state, hint, mode === "mail" ? [GMAIL_SEND] : []));
});

auth.get("/callback", async (c) => {
  const origin = new URL(c.req.url).origin;
  const state = c.req.query("state") || "";
  const cookie = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/api/auth" });
  const [payload, sig] = state.split(".");
  if (!cookie || cookie !== state || !(await verifySig(c.env.SESSION_SECRET, `st:${payload}`, sig || ""))) {
    return c.redirect("/login?error=state");
  }
  const st = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { m: string; next: string };
  const fail = (code: string) =>
    c.redirect(st.m === "test" || st.m === "claim" ? `/setup?error=${code}` : st.m === "mail" ? `/admin?tab=settings&mail=${code}` : `/login?error=${code}`);

  const err = c.req.query("error");
  if (err) return fail(err === "access_denied" ? "denied" : err);
  const client = await getOAuthClient(c.env);
  if (!client) return fail("not_configured");

  let tokens;
  try {
    tokens = await exchangeCode(client, c.req.query("code") || "", `${origin}/api/auth/callback`);
  } catch (e) {
    const msg = e instanceof GoogleError ? e.googleStatus || e.message : "exchange";
    return fail(msg === "invalid_client" ? "invalid_client" : "exchange");
  }
  const granted = new Set(tokens.scope.split(" "));
  const missing = SCOPES.filter((s) => s.startsWith("https://") && !granted.has(s));
  if (missing.length) return fail("scopes");

  const me = await userInfo(tokens.access_token);
  const now = Date.now();

  if (st.m === "mail") {
    // Only the site admin's own account can become the email sender.
    const admin = await getSiteAdmin(c.env);
    if (!admin || admin.sub !== me.sub || !(await isSiteAdmin(c))) return fail("wrong_account");
    if (!granted.has(GMAIL_SEND)) return fail("not_granted");
  } else if (st.m === "test" || st.m === "claim") {
    // Holding the setup link proves this person hosts the site: their Google account becomes the site admin.
    if (!(await hasSetupSession(c))) return fail("setup_locked");
    await putSetting(c, "site_admin_sub", me.sub);
    await upsertApproved(c.env, await findMember(c.env, me.sub, me.email), me, "admin", now);
  } else {
    const gate = await checkAccess(c, me, now);
    if (gate !== "ok") {
      // Not allowed (yet): keep nothing of their Google access.
      await revokeToken(tokens.refresh_token || tokens.access_token);
      return gate === "waitlist" ? c.redirect("/login?waitlist=1") : fail(gate);
    }
  }

  const existing = await c.env.DB.prepare("SELECT id FROM owners WHERE google_sub = ?")
    .bind(me.sub)
    .first<{ id: string }>();
  const ownerId = existing?.id ?? randomId(12);
  const accessEnc = await encrypt(c.env.TOKEN_ENC_KEY, tokens.access_token);
  const refreshEnc = tokens.refresh_token ? await encrypt(c.env.TOKEN_ENC_KEY, tokens.refresh_token) : null;
  if (existing) {
    await c.env.DB.prepare(
      `UPDATE owners SET email = ?, name = ?, picture = ?, access_token_enc = ?, access_expires = ?, scopes = ?,
         refresh_token_enc = COALESCE(?, refresh_token_enc), last_login_at = ? WHERE id = ?`,
    )
      .bind(me.email, me.name ?? null, me.picture ?? null, accessEnc, now + tokens.expires_in * 1000, tokens.scope, refreshEnc, now, ownerId)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO owners (id, google_sub, email, name, picture, refresh_token_enc, access_token_enc, access_expires, scopes, created_at, last_login_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(ownerId, me.sub, me.email, me.name ?? null, me.picture ?? null, refreshEnc, accessEnc, now + tokens.expires_in * 1000, tokens.scope, now, now)
      .run();
  }
  if (st.m !== "mail") await createSession(c, "owner", { ownerId });

  if (st.m === "mail") return c.redirect("/admin?tab=settings&mail=connected");
  if (st.m === "claim") return c.redirect("/admin");
  if (st.m === "test") {
    await c.env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('setup_test', ?)")
      .bind(JSON.stringify(await runApiTests(c.env, tokens.access_token)))
      .run();
    return c.redirect("/setup?tested=1");
  }
  return c.redirect(st.next);
});

type GoogleUser = { sub: string; email: string; name?: string; picture?: string };

/** Marks the member approved (creating the row if needed) and records their Google account. */
async function upsertApproved(env: Env, member: MemberRow | null, me: GoogleUser, source: string, now: number) {
  if (member) {
    // OR IGNORE: if another row already holds this Google account, keep the data as is rather than fail the login.
    await env.DB.prepare(
      `UPDATE OR IGNORE members SET status = 'approved', archived_at = NULL, google_sub = ?, picture = ?,
         name = COALESCE(name, ?), approved_at = COALESCE(approved_at, ?) WHERE email = ?`,
    )
      .bind(me.sub, me.picture ?? null, me.name ?? null, now, member.email)
      .run();
    return;
  }
  await env.DB.prepare(
    `INSERT OR IGNORE INTO members (email, name, status, source, google_sub, picture, approved_at, created_at)
     VALUES (?, ?, 'approved', ?, ?, ?, ?, ?)`,
  )
    .bind(normEmail(me.email), me.name ?? null, source, me.sub, me.picture ?? null, now, now)
    .run();
}

/**
 * Who may log in: the site admin, approved members, and - when the waitlist is off - anyone.
 * Everyone else is put on the waitlist (and the admin gets an email about new requests).
 */
async function checkAccess(c: Context<AppEnv>, me: GoogleUser, now: number): Promise<"ok" | "waitlist" | string> {
  const member = await findMember(c.env, me.sub, me.email);
  if (me.sub === (await getSetting(c, "site_admin_sub"))) {
    await upsertApproved(c.env, member, me, "admin", now);
    return "ok";
  }
  if (member?.status === "archived") return "account_disabled";
  if (member?.status === "approved") {
    await upsertApproved(c.env, member, me, "approved", now);
    return "ok";
  }
  if (!(await waitlistEnabled(c))) {
    await upsertApproved(c.env, member, me, "open", now);
    return "ok";
  }
  if (member) {
    // Already waiting: refresh what we know about them, no new email.
    await c.env.DB.prepare("UPDATE OR IGNORE members SET google_sub = ?, picture = ?, name = COALESCE(name, ?) WHERE email = ?")
      .bind(me.sub, me.picture ?? null, me.name ?? null, member.email)
      .run();
    return "waitlist";
  }
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "local";
  try {
    await rateLimit(c.env, `waitlist:${ip}`, 10, 60 * 60_000);
  } catch {
    return "too_many";
  }
  const pending = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE status = 'pending'").first<{ n: number }>();
  if ((pending?.n ?? 0) >= 1000) return "waitlist_full";
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO members (email, name, status, source, google_sub, picture, requested_at, created_at)
     VALUES (?, ?, 'pending', 'waitlist', ?, ?, ?, ?)`,
  )
    .bind(normEmail(me.email), me.name ?? null, me.sub, me.picture ?? null, now, now)
    .run();
  await notifyAdmin(c, { email: normEmail(me.email), name: me.name ?? null }, (pending?.n ?? 0) + 1);
  return "waitlist";
}

async function notifyAdmin(c: Context<AppEnv>, person: { email: string; name: string | null }, pendingCount: number) {
  const admin = await getSiteAdmin(c.env);
  if (!admin) return;
  try {
    // A flood of requests must not flood the admin's inbox - beyond this they only show in the dashboard.
    await rateLimit(c.env, "waitlist-mail", 30, 86_400_000);
  } catch {
    return;
  }
  await sendMail(c.env, waitlistRequestMail(siteOrigin(c.env, c.req.url), admin.email, person, pendingCount));
}

/** Checks every Google API the app depends on, so the setup wizard can point at the broken step. */
async function runApiTests(_env: Env, token: string) {
  const result: Record<string, { ok: boolean; message?: string }> = {};
  try {
    const r = await fetch("https://photoslibrary.googleapis.com/v1/albums?pageSize=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
    result.photos = r.ok ? { ok: true } : { ok: false, message: `${r.status} ${(await r.text()).slice(0, 200)}` };
  } catch (e) {
    result.photos = { ok: false, message: String(e) };
  }
  try {
    const s = await pickerCreate(token);
    await pickerDelete(token, s.id);
    result.picker = { ok: true };
  } catch (e) {
    result.picker = { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  try {
    await storageQuota(token);
    result.drive = { ok: true };
  } catch (e) {
    result.drive = { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  return { at: Date.now(), result, ok: Object.values(result).every((r) => r.ok) };
}

auth.post("/logout", async (c) => {
  await destroySessions(c);
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  const ownerId = c.get("ownerId");
  let owner: OwnerMe | null = null;
  if (ownerId) {
    const r = await c.env.DB.prepare("SELECT id, email, name, picture, refresh_token_enc FROM owners WHERE id = ?")
      .bind(ownerId)
      .first<{ id: string; email: string; name: string | null; picture: string | null; refresh_token_enc: string | null }>();
    if (r) owner = { id: r.id, email: r.email, name: r.name, picture: r.picture, connected: !!r.refresh_token_enc };
  }
  const configured = !!(await getOAuthClient(c.env));
  let siteAdmin: { pending: number } | null = null;
  if (owner && (await isSiteAdmin(c))) {
    const r = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE status = 'pending'").first<{ n: number }>();
    siteAdmin = { pending: r?.n ?? 0 };
  }
  return c.json({ owner, adminEventId: c.get("adminEventId") ?? null, configured, siteAdmin });
});
