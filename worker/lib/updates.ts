// New versions: checks the original repository's release-notes.json, tells the site admin what's new, and (for sites
// installed from GitHub) asks the hosting platform to rebuild the site through the admin's Deploy Hook URL.
// The rebuild itself takes the newest code (scripts/ci-bootstrap.mjs), so the copy on GitHub never needs syncing.
//
// Settings keys: update_feed (JSON {at, releases, error}), update_latest, update_hook_enc (encrypted URL),
// update_auto ("0" = off), update_trigger (JSON TriggerState), last_seen_version, schema_error.
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { ReleaseEntry, UpdateFlag, UpdatesInfo } from "../../shared/types";
import { APP, bundledReleases, compareVersions, feedUrl, readReleases } from "./appInfo";
import { decrypt, encrypt } from "./crypto";
import { getSetting, putSetting } from "./site";
import { schemaReady } from "./schema";

type HasEnv = { env: Env };

const FEED_MAX_BYTES = 256 * 1024;
const HOUR = 3_600_000;
/** Don't rebuild while guests are uploading: a live event must never be disturbed. */
const EVENT_QUIET_MS = 60 * 60_000;
/**
 * After asking for a version, don't ask again for it for 12 hours (a build still running, or "update now" pressed this
 * evening). The next night's run asks again if the site still isn't on it, so a failing build costs one try a night.
 */
const ASK_AGAIN_AFTER = 12 * HOUR;

interface FeedState {
  at: number;
  releases: ReleaseEntry[];
  error: string | null;
}

interface TriggerState {
  version: string;
  at: number;
  attempts: number;
  ok: boolean;
  error?: string;
  /** The platform refused the hook (4xx): stop until the admin saves a new URL. */
  stopped?: boolean;
}

const parse = <T>(s: string | null): T | null => {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
};

async function readCapped(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error("feed_too_big");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let pos = 0;
  for (const c of chunks) {
    all.set(c, pos);
    pos += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Downloads the list of released versions and stores it. A failure keeps the last good list. */
export async function checkFeed(env: Env): Promise<FeedState> {
  const c = { env };
  const prev = parse<FeedState>(await getSetting(c, "update_feed"));
  const url = feedUrl(env);
  let next: FeedState;
  if (!url) {
    next = { at: Date.now(), releases: prev?.releases ?? [], error: "no_feed" };
  } else {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "eirua-parua-site", Accept: "application/json" },
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const releases = readReleases(JSON.parse(await readCapped(res, FEED_MAX_BYTES)));
      next = { at: Date.now(), releases, error: null };
    } catch (e) {
      next = { at: Date.now(), releases: prev?.releases ?? [], error: String((e as Error)?.message || e).slice(0, 200) };
    }
  }
  await putSetting(c, "update_feed", JSON.stringify(next));
  if (!next.error) {
    // Follows the last good list exactly (a pulled release or another source can lower it).
    const latest = next.releases[0]?.version;
    if (latest) await putSetting(c, "update_latest", latest);
    else await env.DB.prepare("DELETE FROM settings WHERE key = 'update_latest'").run();
  }
  return next;
}

/** Bundled notes + downloaded notes, one entry per version (downloaded wins), newest first. */
function mergeReleases(feed: ReleaseEntry[]): ReleaseEntry[] {
  const byVersion = new Map<string, ReleaseEntry>();
  for (const r of bundledReleases) byVersion.set(r.version, r);
  for (const r of feed) byVersion.set(r.version, r);
  return [...byVersion.values()].sort((a, b) => compareVersions(b.version, a.version));
}

/** Small and cheap, for /api/auth/me: is there something to tell the site admin? */
export async function updateFlag(env: Env): Promise<UpdateFlag> {
  const rows = await env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('last_seen_version', 'update_latest')").all<{
    key: string;
    value: string;
  }>();
  const get = (k: string) => rows.results.find((r) => r.key === k)?.value ?? null;
  if (get("last_seen_version") !== APP.version) return "updated";
  const latest = get("update_latest");
  return latest && compareVersions(latest, APP.version) > 0 ? "available" : null;
}

/** The admin saw the "the site was updated" notice. */
export async function markSeen(env: Env) {
  await putSetting({ env }, "last_seen_version", APP.version);
}

// ---------------------------------------------------------------- deploy hook

/** Checks a Deploy Hook URL the admin pasted. Throws 400 bad_hook_url. */
export function cleanHookUrl(raw: unknown, siteOrigin: string): string {
  if (typeof raw !== "string") throw new HTTPException(400, { message: "bad_hook_url" });
  const s = raw.trim();
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new HTTPException(400, { message: "bad_hook_url" });
  }
  const local = u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname); // local testing only
  if ((u.protocol !== "https:" && !local) || u.username || u.password || s.length > 500 || u.origin === siteOrigin) {
    throw new HTTPException(400, { message: "bad_hook_url" });
  }
  return u.toString();
}

/** Shows enough to recognise the hook without revealing it (the URL itself is the password). */
export function maskHook(url: string): string {
  try {
    const u = new URL(url);
    const tail = u.pathname.replace(/\/+$/, "").split("/").pop() || "";
    const kind = /\/workers\/builds\/deploy_hooks\//.test(u.pathname) ? "Cloudflare Deploy Hook" : u.host;
    return `${kind} ...${tail.slice(-4)}`;
  } catch {
    return "...";
  }
}

/** Several settings in one query. */
async function settings(env: Env, keys: string[]): Promise<Record<string, string | null>> {
  const rows = await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${keys.map(() => "?").join(",")})`)
    .bind(...keys)
    .all<{ key: string; value: string }>();
  const out: Record<string, string | null> = Object.fromEntries(keys.map((k) => [k, null]));
  for (const r of rows.results) out[r.key] = r.value;
  return out;
}

async function decryptHook(env: Env, enc: string | null): Promise<string | null> {
  if (!enc) return null;
  try {
    return await decrypt(env.TOKEN_ENC_KEY, enc);
  } catch {
    return null;
  }
}

async function readHook(env: Env): Promise<string | null> {
  return decryptHook(env, await getSetting({ env }, "update_hook_enc"));
}

/** Saves (or with null, removes) the Deploy Hook URL, encrypted. A new URL also clears an earlier "stopped". */
export async function saveHook(env: Env, url: string | null) {
  if (url) await putSetting({ env }, "update_hook_enc", await encrypt(env.TOKEN_ENC_KEY, url));
  else await env.DB.prepare("DELETE FROM settings WHERE key = 'update_hook_enc'").run();
  await env.DB.prepare("DELETE FROM settings WHERE key = 'update_trigger'").run();
}

/** Asks the hosting platform to rebuild the site. Records the attempt (for ASK_AGAIN_AFTER and the admin screen). */
export async function triggerRebuild(env: Env, version: string): Promise<TriggerState> {
  const url = await readHook(env);
  if (!url) throw new HTTPException(400, { message: "no_hook" });
  const prev = parse<TriggerState>(await getSetting({ env }, "update_trigger"));
  const state: TriggerState = {
    version,
    at: Date.now(),
    attempts: prev?.version === version ? prev.attempts + 1 : 1,
    ok: false,
  };
  try {
    const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(10_000) });
    state.ok = res.ok;
    if (!res.ok) {
      state.error = `HTTP ${res.status}`;
      // 4xx = the platform doesn't accept this URL (deleted hook, typo): asking again won't help.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) state.stopped = true;
    }
  } catch (e) {
    state.error = String((e as Error)?.message || e).slice(0, 200);
  }
  await putSetting({ env }, "update_trigger", JSON.stringify(state));
  console.log(`rebuild requested for ${version}: ${state.ok ? "accepted" : state.error}`);
  return state;
}

async function uploadsRecently(env: Env, now: number) {
  const r = await env.DB.prepare("SELECT 1 AS x FROM uploads WHERE created_at > ? LIMIT 1").bind(now - EVENT_QUIET_MS).first();
  return !!r;
}

type Waiting = UpdatesInfo["auto"]["waiting"];

/** Why the night run would not ask for this version (null = it would, if guests aren't uploading right then). */
function requestBlocked(t: TriggerState | null, latest: string, now: number): Waiting {
  if (t?.version !== latest) return null;
  if (t.stopped) return "stopped";
  if (now < t.at + ASK_AGAIN_AFTER) return "requested";
  return null;
}

/**
 * Night cron: when a newer version exists and the admin allowed automatic updates, ask for a rebuild. Never while
 * guests uploaded in the last hour (an event running late): then it waits for the next night.
 */
export async function maybeAutoUpdate(env: Env, feed: FeedState, now = Date.now()) {
  if (!APP.autoCapable) return;
  const latest = feed.releases[0]?.version;
  if (!latest || compareVersions(latest, APP.version) <= 0) return;
  const st = await settings(env, ["update_auto", "update_hook_enc", "update_trigger"]);
  if (st.update_auto === "0" || !st.update_hook_enc) return;
  if (requestBlocked(parse<TriggerState>(st.update_trigger), latest, now)) return;
  if (await uploadsRecently(env, now)) {
    console.log(`update to ${latest} waits for the next night: guests uploaded in the last hour`);
    return;
  }
  await triggerRebuild(env, latest);
}

// ---------------------------------------------------------------- admin screen

export async function updatesInfo(c: HasEnv): Promise<UpdatesInfo> {
  const env = c.env;
  const st = await settings(env, ["update_feed", "last_seen_version", "update_hook_enc", "update_trigger", "update_auto", "schema_error"]);
  const feed = parse<FeedState>(st.update_feed);
  const all = mergeReleases(feed?.releases ?? []);
  const newer = all.filter((r) => compareVersions(r.version, APP.version) > 0);
  const latest = all[0]?.version ?? null;

  const seen = st.last_seen_version;
  let justUpdated: UpdatesInfo["justUpdated"] = null;
  if (seen !== APP.version) {
    const releases = all.filter(
      (r) => compareVersions(r.version, APP.version) <= 0 && (seen ? compareVersions(r.version, seen) > 0 : r.version === APP.version),
    );
    justUpdated = { from: seen, releases };
  }

  const hook = await decryptHook(env, st.update_hook_enc);
  const trigger = parse<TriggerState>(st.update_trigger);
  const enabled = st.update_auto !== "0";
  const waiting = newer.length && APP.autoCapable && enabled && hook ? requestBlocked(trigger, newer[0].version, Date.now()) : null;

  let schemaError: string | null = null;
  const se = parse<{ message: string; version: string }>(st.schema_error);
  if (se) {
    if (schemaReady()) await env.DB.prepare("DELETE FROM settings WHERE key = 'schema_error'").run();
    else schemaError = se.message;
  }

  return {
    current: { version: APP.version, commit: APP.commit, builtAt: APP.builtAt },
    source: APP.source,
    autoCapable: APP.autoCapable,
    latest,
    newer,
    justUpdated,
    history: all,
    checkedAt: feed?.at ?? null,
    checkError: feed?.error ?? null,
    auto: {
      enabled,
      hook: { set: !!hook, masked: hook ? maskHook(hook) : null },
      last: trigger ? { version: trigger.version, at: trigger.at, attempts: trigger.attempts, ok: trigger.ok, error: trigger.error } : null,
      waiting,
    },
    schemaError,
  };
}
