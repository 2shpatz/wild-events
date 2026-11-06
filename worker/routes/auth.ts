import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv, Env } from "../env";
import { b64url, encrypt, fromB64url, randomId, sign, verifySig } from "../lib/crypto";
import {
  authUrl,
  exchangeCode,
  getOAuthClient,
  GoogleError,
  pickerCreate,
  pickerDelete,
  SCOPES,
  storageQuota,
  userInfo,
} from "../lib/google";
import { createSession, destroySessions, hasSetupSession } from "../lib/session";
import type { OwnerMe } from "../../shared/types";

export const auth = new Hono<AppEnv>();

const STATE_COOKIE = "oauth_state";

function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

auth.get("/login", async (c) => {
  const client = await getOAuthClient(c.env);
  if (!client) return c.redirect("/login?error=not_configured");
  const mode = c.req.query("mode") === "test" ? "test" : "login";
  if (mode === "test" && !(await hasSetupSession(c))) return c.redirect("/setup");
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
  return c.redirect(authUrl(client, `${origin}/api/auth/callback`, state));
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
  const fail = (code: string) => c.redirect(st.m === "test" ? `/setup?error=${code}` : `/login?error=${code}`);

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
  const existing = await c.env.DB.prepare("SELECT id FROM owners WHERE google_sub = ?")
    .bind(me.sub)
    .first<{ id: string }>();
  const ownerId = existing?.id ?? randomId(12);
  const now = Date.now();
  const accessEnc = await encrypt(c.env.TOKEN_ENC_KEY, tokens.access_token);
  const refreshEnc = tokens.refresh_token ? await encrypt(c.env.TOKEN_ENC_KEY, tokens.refresh_token) : null;
  if (existing) {
    await c.env.DB.prepare(
      `UPDATE owners SET email = ?, name = ?, picture = ?, access_token_enc = ?, access_expires = ?, scopes = ?,
         refresh_token_enc = COALESCE(?, refresh_token_enc) WHERE id = ?`,
    )
      .bind(me.email, me.name ?? null, me.picture ?? null, accessEnc, now + tokens.expires_in * 1000, tokens.scope, refreshEnc, ownerId)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO owners (id, google_sub, email, name, picture, refresh_token_enc, access_token_enc, access_expires, scopes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(ownerId, me.sub, me.email, me.name ?? null, me.picture ?? null, refreshEnc, accessEnc, now + tokens.expires_in * 1000, tokens.scope, now)
      .run();
  }
  await createSession(c, "owner", { ownerId });

  if (st.m === "test") {
    await c.env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('setup_test', ?)")
      .bind(JSON.stringify(await runApiTests(c.env, tokens.access_token)))
      .run();
    return c.redirect("/setup?tested=1");
  }
  return c.redirect(st.next);
});

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
  return c.json({ owner, adminEventId: c.get("adminEventId") ?? null, configured });
});
