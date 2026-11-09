import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../env";
import { encrypt } from "../lib/crypto";
import { clearClientCache, getOAuthClient, GMAIL_SEND, SCOPES } from "../lib/google";
import { createSession, hasSetupSession, rateLimit } from "../lib/session";
import { cleanName } from "../lib/db";
import { EMAIL_RE, getSetting, getSiteAdmin, putSetting } from "../lib/site";

export const setup = new Hono<AppEnv>();

/** Who runs this copy of the site (shown on the privacy / terms pages). Shared with the admin dashboard. */
export async function saveOperator(c: { env: AppEnv["Bindings"] }, body: { name?: string; email?: string }) {
  const name = cleanName(body.name || "", 80);
  const email = (body.email || "").trim().slice(0, 120);
  if (!name) throw new HTTPException(400, { message: "name_required" });
  if (!EMAIL_RE.test(email)) throw new HTTPException(400, { message: "bad_email" });
  await putSetting(c, "operator_name", name);
  await putSetting(c, "operator_email", email);
}

setup.get("/status", async (c) => {
  const client = await getOAuthClient(c.env);
  const unlocked = await hasSetupSession(c);
  const origin = new URL(c.req.url).origin;
  const base = { configured: !!client, unlocked };
  if (!unlocked) return c.json(base);
  return c.json({
    ...base,
    origin,
    redirectUri: `${origin}/api/auth/callback`,
    // gmail.send is declared on the consent screen too, but only the site admin is ever asked for it.
    scopes: [...SCOPES.filter((s) => s.startsWith("https://")), GMAIL_SEND],
    clientId: client?.clientId ?? null,
    progress: JSON.parse((await getSetting(c, "setup_progress")) || "{}"),
    test: JSON.parse((await getSetting(c, "setup_test")) || "null"),
    operator: { name: (await getSetting(c, "operator_name")) || "", email: (await getSetting(c, "operator_email")) || "" },
    admin: await adminInfo(c.env),
  });
});

async function adminInfo(env: AppEnv["Bindings"]) {
  const a = await getSiteAdmin(env);
  return a ? { email: a.email, name: a.name } : null;
}

setup.post("/unlock", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") || "local";
  await rateLimit(c.env, `setup:${ip}`, 10, 15 * 60_000);
  const { token } = await c.req.json<{ token: string }>();
  const expected = c.env.SETUP_TOKEN || "";
  let diff = token?.length === expected.length ? 0 : 1;
  for (let i = 0; i < expected.length && !diff; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  if (!expected || diff) throw new HTTPException(403, { message: "bad_setup_token" });
  await createSession(c, "setup", { days: 7 });
  return c.json({ ok: true });
});

setup.use("/*", async (c, next) => {
  if (c.req.path.endsWith("/status") || c.req.path.endsWith("/unlock")) return next();
  if (!(await hasSetupSession(c))) throw new HTTPException(403, { message: "setup_locked" });
  await next();
});

setup.post("/progress", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  await putSetting(c, "setup_progress", JSON.stringify(body).slice(0, 4000));
  return c.json({ ok: true });
});

setup.post("/operator", async (c) => {
  await saveOperator(c, await c.req.json<{ name?: string; email?: string }>());
  return c.json({ ok: true });
});

setup.post("/credentials", async (c) => {
  const { clientId, clientSecret } = await c.req.json<{ clientId: string; clientSecret: string }>();
  const id = (clientId || "").trim();
  const secret = (clientSecret || "").trim();
  if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id)) {
    throw new HTTPException(400, { message: "bad_client_id" });
  }
  if (secret.length < 10 || /\s/.test(secret)) throw new HTTPException(400, { message: "bad_client_secret" });
  await putSetting(c, "google_client_id", id);
  await putSetting(c, "google_client_secret_enc", await encrypt(c.env.TOKEN_ENC_KEY, secret));
  await c.env.DB.prepare("DELETE FROM settings WHERE key = 'setup_test'").run();
  clearClientCache();
  return c.json({ ok: true });
});
