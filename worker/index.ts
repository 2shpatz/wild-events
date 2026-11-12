import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, Env } from "./env";
import { loadSession } from "./lib/session";
import { GoogleError } from "./lib/google";
import { setup } from "./routes/setup";
import { getSetting, putSetting } from "./lib/site";
import { checkFeed, maybeAutoUpdate } from "./lib/updates";
import { auth } from "./routes/auth";
import { owner, ownerStorage } from "./routes/owner";
import { migrate } from "./routes/migrate";
import { accountStorage } from "./lib/accounts";
import { events } from "./routes/events";
import { uploads } from "./routes/uploads";
import { manage } from "./routes/manage";
import { imports } from "./routes/import";
import { admin } from "./routes/admin";
import { board } from "./routes/board";
import { ensureSchema, updatingResponse } from "./lib/schema";

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", loadSession);
app.use("*", async (c, next) => {
  await next();
  if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store");
});

app.route("/setup", setup);
app.route("/auth", auth);
app.route("/owner", owner);
app.route("/admin", admin);
app.route("/", events);
app.route("/", uploads);
app.route("/", manage);
app.route("/", imports);
app.route("/", migrate);
app.route("/", board);

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

/**
 * Cron, every 15 minutes. Once a day (from 06:00 UTC): storage check + housekeeping. The other runs: look for a new
 * version and, for sites installed from GitHub, rebuild when allowed (lib/updates.ts). Never both in one run, to
 * stay within the outgoing-request limit of one run.
 */
async function scheduled(controller: ScheduledController, env: Env) {
  const schema = await ensureSchema(env);
  if (schema === "pending") return; // spent this run on the database update; the next run continues
  const now = controller.scheduledTime;
  const lastDaily = Number(await getSetting({ env }, "last_daily_run")) || 0;
  if (now - lastDaily >= 20 * 3_600_000 && new Date(now).getUTCHours() >= 6) {
    await putSetting({ env }, "last_daily_run", String(now));
    await runDaily(env);
    return;
  }
  try {
    await maybeAutoUpdate(env, await checkFeed(env), now);
  } catch (e) {
    console.warn("update check failed", e);
  }
}

async function runDaily(env: Env) {
  // Refresh storage usage for owners with recent events (feeds the 80% banner).
  const owners = await env.DB.prepare(
    `SELECT DISTINCT o.id FROM owners o JOIN events e ON e.owner_id = o.id
      WHERE o.refresh_token_enc IS NOT NULL AND e.deleted = 0 AND e.created_at > ?
        AND NOT EXISTS (SELECT 1 FROM members m WHERE m.google_sub = o.google_sub AND m.status = 'archived') LIMIT 20`,
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
  // Same for the extra accounts that hold event photos.
  const accounts = await env.DB.prepare(
    `SELECT DISTINCT s.id, s.owner_id FROM storage_accounts s JOIN events e ON e.storage_account_id = s.id
      WHERE s.refresh_token_enc IS NOT NULL AND e.deleted = 0 AND e.created_at > ? LIMIT 20`,
  )
    .bind(Date.now() - 120 * 86_400_000)
    .all<{ id: string; owner_id: string }>();
  for (const a of accounts.results) {
    try {
      await accountStorage(env, a.owner_id, a.id, true);
    } catch (e) {
      console.warn("storage check failed", a.id, e);
    }
  }
  // Housekeeping.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()),
    env.DB.prepare("DELETE FROM rate_limits WHERE window_end < ?").bind(Date.now()),
    env.DB.prepare("DELETE FROM uploads WHERE created_at < ? AND status != 'started'").bind(Date.now() - 2 * 86_400_000),
    env.DB.prepare("DELETE FROM uploads WHERE created_at < ?").bind(Date.now() - 7 * 86_400_000),
    // Checklist items deleted more than a day ago (the undo window is minutes).
    env.DB.prepare("DELETE FROM checklist_items WHERE deleted_at < ?").bind(Date.now() - 86_400_000),
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

/**
 * Built-in background tracks. Static assets answer Range requests with the whole file (200),
 * but iOS Safari only plays audio from a server that returns 206 partial responses - so slice here.
 */
async function serveMusic(request: Request, env: Env): Promise<Response> {
  const res = await env.ASSETS.fetch(new Request(request.url, { method: "GET" }));
  if (!res.ok || !(res.headers.get("Content-Type") || "").startsWith("audio/")) return res;
  const headers = new Headers({
    "Content-Type": res.headers.get("Content-Type")!,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=604800",
  });
  const etag = res.headers.get("ETag");
  if (etag) headers.set("ETag", etag);
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("Range") || "");
  if (!range) {
    const len = res.headers.get("Content-Length");
    if (len) headers.set("Content-Length", len);
    return new Response(request.method === "HEAD" ? null : res.body, { status: 200, headers });
  }
  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  let start: number;
  let end: number;
  if (range[1] === "") {
    // "bytes=-N": the last N bytes
    start = Math.max(0, size - Number(range[2] || 0));
    end = size - 1;
  } else {
    start = Number(range[1]);
    end = range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1);
  }
  if (start >= size || start > end) {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(request.method === "HEAD" ? null : buf.slice(start, end + 1), { status: 206, headers });
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
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) {
      // The database structure updates itself after a new version (lib/schema.ts).
      if ((await ensureSchema(env)) === "pending") return withSecurityHeaders(updatingResponse());
      return withSecurityHeaders(await app.fetch(request, env, ctx));
    }
    if (pathname.startsWith("/music/")) return withSecurityHeaders(await serveMusic(request, env));
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
  scheduled,
} satisfies ExportedHandler<Env>;
