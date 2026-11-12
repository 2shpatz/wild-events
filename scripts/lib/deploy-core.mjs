// Shared deploy logic for `npm run setup` (guided, first time), `npm run deploy` (from a computer) and the
// build on Cloudflare Workers Builds (scripts/ci/deploy.mjs). Node built-ins only: it also runs while
// node_modules is being reinstalled.
//
// Every installer's own values (Worker name, D1 id, custom domain, setup token) live in the gitignored
// .deploy-state.json. wrangler.jsonc is never edited: the values are handed to the build in EP_DEPLOY_CONFIG
// (applied by vite.config.ts), so nobody's real ids end up in git.
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const STATE = ".deploy-state.json";
export const DB_NAME = "live-event-albums";
export const DEFAULT_NAME = "albums";
const WIN = process.platform === "win32";

export const bold = (s) => `\x1b[1m${s}\x1b[0m`;
export const green = (s) => `\x1b[32m${s}\x1b[0m`;
export const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
export const step = (s) => console.log(`\n${bold(`▶ ${s}`)}`);
const b64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Runs a command and returns stdout (stderr is shown to the user). */
export const run = (cmd, opts = {}) => execSync(cmd, { stdio: ["inherit", "pipe", "inherit"], encoding: "utf8", ...opts });
/** Runs a command attached to the terminal (so wrangler can ask questions / open the browser). */
export const runLive = (cmd, env = {}) => {
  const r = spawnSync(cmd, { stdio: "inherit", shell: true, env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`Command failed: ${cmd}`);
};

export const readState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {});
export const writeState = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2) + "\n");

export function isLoggedIn() {
  const who = spawnSync("npx wrangler whoami", { encoding: "utf8", shell: true });
  return who.status === 0 && !/not authenticated|You are not logged in/i.test(who.stdout + who.stderr);
}

export function openInBrowser(url) {
  const cmd = WIN ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  spawnSync(cmd, { shell: true, stdio: "ignore" });
}

export const validWorkerName = (n) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(n);
export const validDomain = (d) => /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d);

/**
 * Names of the secrets already set on the Worker, or null when the Worker doesn't exist yet.
 * Any other failure (network, login, Cloudflare error) throws: treating it as "no secrets" would
 * generate new encryption keys and make every stored Google connection unreadable.
 */
export function listSecretNames(workerName) {
  const r = spawnSync(`npx wrangler secret list --name ${workerName} --format json`, { shell: true, encoding: "utf8" });
  if (r.status === 0) {
    try {
      return JSON.parse(r.stdout).map((s) => s.name);
    } catch {
      throw new Error(`Could not read the secret list of "${workerName}":\n${r.stdout}`);
    }
  }
  const out = `${r.stdout}\n${r.stderr}`;
  if (/Worker "[^"]+"[^\n]* not found/.test(out)) return null;
  throw new Error(`Could not read the secret list of "${workerName}" (nothing was changed):\n${out.trim()}`);
}

/**
 * The secrets a deploy must add. Existing secrets are never replaced: new encryption keys would make the stored
 * Google connections unreadable, and a new setup code would silently break the admin's link.
 * `setupToken` (optional) = the setup code to use when one has to be created (so a saved link stays valid).
 */
export function missingSecrets(existing, { setupToken, rotateSetup = false } = {}) {
  const have = new Set(existing ?? []);
  const add = {};
  if (!have.has("TOKEN_ENC_KEY")) add.TOKEN_ENC_KEY = b64url(randomBytes(32));
  if (!have.has("SESSION_SECRET")) add.SESSION_SECRET = b64url(randomBytes(32));
  if (!have.has("SETUP_TOKEN") || rotateSetup) add.SETUP_TOKEN = (!rotateSetup && setupToken) || b64url(randomBytes(18));
  return add;
}

/** Finds this installer's D1 database by name, or creates it. Returns its id. */
export function findOrCreateDatabase() {
  const find = () => JSON.parse(run("npx wrangler d1 list --json")).find((d) => d.name === DB_NAME)?.uuid;
  let id = find();
  if (!id) {
    run(`npx wrangler d1 create ${DB_NAME}`);
    id = find();
  }
  if (!id) throw new Error("Could not create or find the D1 database");
  return id;
}

/** Builds the site. `overrides` = this installer's values for vite.config.ts (applyDeployOverrides). */
export function build(overrides = {}) {
  runLive("npm run build", { EP_DEPLOY_CONFIG: JSON.stringify(overrides) });
}

/**
 * `wrangler deploy` attached to the terminal, uploading `secrets` together with the new version (added to the
 * existing ones; nothing is deleted). Returns the addresses wrangler reports.
 */
export function wranglerDeploy(secrets = {}) {
  const dir = mkdtempSync(join(tmpdir(), "lea-"));
  const out = join(dir, "out.ndjson");
  const file = join(dir, "secrets.json");
  try {
    let cmd = "npx wrangler deploy";
    if (Object.keys(secrets).length) {
      writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
      cmd += ` --secrets-file "${file}"`;
    }
    runLive(cmd, { WRANGLER_OUTPUT_FILE_PATH: out });
    const lines = existsSync(out) ? readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    return lines.find((l) => l.type === "deploy")?.targets ?? [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Opens the new version once so it updates its database structure (worker/lib/schema.ts answers 503 "updating"
 * until done) before the first guest arrives. Never fails the deploy.
 */
export async function warmUp(url) {
  if (!url) return;
  const until = Date.now() + 90_000;
  let last = "";
  while (Date.now() < until) {
    try {
      const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(15_000), headers: { "Cache-Control": "no-cache" } });
      if (r.ok) return console.log("  Ready");
      last = `HTTP ${r.status}`;
    } catch (e) {
      last = e.message;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(yellow(`  The site did not answer yet (${last}). It finishes updating by itself on the first visit.`));
}

/**
 * Deploy from a computer. `opts` may override the saved Worker name / custom domain (used by the guided setup);
 * `opts.rotateSetupIfUnknown` (setup only) makes a new setup code when this folder doesn't know the current one.
 * Returns { url, setupUrl } (setupUrl is null when the setup code isn't known here).
 */
export async function deploy(opts = {}) {
  const state = readState();
  state.workerName = opts.workerName || state.workerName || DEFAULT_NAME;
  if (opts.customDomain !== undefined) state.customDomain = opts.customDomain || undefined;

  step("Checking the site on Cloudflare");
  const existing = listSecretNames(state.workerName); // null = a new site
  console.log(existing ? `  Found "${state.workerName}"` : `  New site "${state.workerName}"`);

  step("D1 database");
  // A site that already exists keeps the database it is connected to (even if this folder doesn't know it, e.g.
  // a site installed from GitHub). Only a brand-new site gets the database found or created by name.
  if (!state.databaseId && existing === null) state.databaseId = findOrCreateDatabase();
  console.log(state.databaseId ? `  D1: ${state.databaseId}` : "  Keeps the database already connected to the site");
  writeState(state);

  const rotateSetup = !!opts.rotateSetupIfUnknown && !!existing?.includes("SETUP_TOKEN") && !state.setupToken;
  const secrets = missingSecrets(existing, { setupToken: state.setupToken, rotateSetup });

  step("Building the site");
  build({
    name: state.workerName,
    databaseId: state.databaseId,
    databaseName: state.databaseId ? DB_NAME : undefined,
    canonicalOrigin: state.customDomain ? `https://${state.customDomain}` : "",
    routes: state.customDomain ? [{ pattern: state.customDomain, custom_domain: true }] : undefined,
  });

  step("Uploading to Cloudflare");
  const targets = wranglerDeploy(secrets);
  if (secrets.SETUP_TOKEN) state.setupToken = secrets.SETUP_TOKEN;
  if (Object.keys(secrets).length) console.log(`  Internal secrets set: ${Object.keys(secrets).join(", ")}`);

  const workersDev = targets.find((t) => /\.workers\.dev/.test(t))?.replace(/\/$/, "");
  const url = state.customDomain ? `https://${state.customDomain}` : workersDev || state.url;
  if (url) state.url = url;
  writeState(state);

  step("Updating the database structure");
  await warmUp(workersDev || state.url);

  const base = state.url || "<site-address>";
  return { url: base, setupUrl: state.setupToken ? `${base}/setup?token=${state.setupToken}` : null };
}
