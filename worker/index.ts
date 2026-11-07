import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, Env } from "./env";
import { loadSession } from "./lib/session";
import { GoogleError } from "./lib/google";
import { getSetting, setup } from "./routes/setup";
import { auth } from "./routes/auth";
import { owner, ownerStorage } from "./routes/owner";
import { events } from "./routes/events";
import { uploads } from "./routes/uploads";
import { manage } from "./routes/manage";
import { imports } from "./routes/import";

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", loadSession);
app.use("*", async (c, next) => {
  await next();
  if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store");
});

app.route("/setup", setup);
app.route("/auth", auth);
app.route("/owner", owner);
app.route("/", events);
app.route("/", uploads);
app.route("/", manage);
app.route("/", imports);

app.get("/health", (c) => c.json({ ok: true }));

/** Public: who operates this copy of the site (privacy / terms pages). */
app.get("/site", async (c) => {
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ operatorName: (await getSetting(c, "operator_name")) || null, operatorEmail: (await getSetting(c, "operator_email")) || null });
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  if (err instanceof GoogleError) {
    console.error("google error", err.status, err.googleStatus, err.message);
    if (err.needsReauth) return c.json({ error: "owner_reauth" }, 503);
    if (err.status === 429) return c.json({ error: "google_rate_limited" }, 503);
    return c.json({ error: "google_error", detail: err.message.slice(0, 200) }, 502);
  }
  console.error(err);
  return c.json({ error: "server_error" }, 500);
});

async function scheduled(_: ScheduledController, env: Env) {
  // Daily: refresh storage usage for owners with recent events (feeds the 80% banner).
  const owners = await env.DB.prepare(
    `SELECT DISTINCT o.id FROM owners o JOIN events e ON e.owner_id = o.id
      WHERE o.refresh_token_enc IS NOT NULL AND e.deleted = 0 AND e.created_at > ? LIMIT 20`,
  )
    .bind(Date.now() - 120 * 86_400_000)
    .all<{ id: string }>();
  for (const o of owners.results) {
    try {
      await ownerStorage(env, o.id, true);
    } catch (e) {
      console.warn("storage check failed", o.id, e);
    }
  }
  // Housekeeping.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()),
    env.DB.prepare("DELETE FROM rate_limits WHERE window_end < ?").bind(Date.now()),
    env.DB.prepare("DELETE FROM uploads WHERE created_at < ? AND status != 'started'").bind(Date.now() - 2 * 86_400_000),
    env.DB.prepare("DELETE FROM uploads WHERE created_at < ?").bind(Date.now() - 7 * 86_400_000),
  ]);
}

/** Old workers.dev page links (QR codes already shared) move to the main address. API calls are not redirected. */
function canonicalRedirect(request: Request, env: Env): Response | null {
  if (!env.CANONICAL_ORIGIN || (request.method !== "GET" && request.method !== "HEAD")) return null;
  const url = new URL(request.url);
  const target = new URL(env.CANONICAL_ORIGIN);
  if (url.host === target.host || !url.hostname.endsWith(".workers.dev") || url.pathname.startsWith("/api/")) return null;
  return Response.redirect(`${target.origin}${url.pathname}${url.search}`, 302);
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
};

/** Basic browser protections on every page and API response. */
function withSecurityHeaders(res: Response): Response {
  if (res.status === 101) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const redirect = canonicalRedirect(request, env);
    if (redirect) return redirect;
    if (new URL(request.url).pathname.startsWith("/api/")) return withSecurityHeaders(await app.fetch(request, env, ctx));
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
  scheduled,
} satisfies ExportedHandler<Env>;
