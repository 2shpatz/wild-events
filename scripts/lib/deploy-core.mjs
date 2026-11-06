// Shared deploy logic for `npm run setup` (guided, first time) and `npm run deploy` (updates).
//
// Every installer's own values (Worker name, D1 id, custom domain, setup token) live in the gitignored
// .deploy-state.json. wrangler.jsonc in the repo keeps generic placeholders; it is patched only for the
// duration of a deploy and then restored, so nobody's real ids end up in git.
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CONFIG = "wrangler.jsonc";
export const STATE = ".deploy-state.json";
export const DB_NAME = "live-event-albums";
export const DEFAULT_NAME = "albums";
const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
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

/** Finds (or creates) this installer's D1 database and returns its id. */
function ensureDatabase(state) {
  if (state.databaseId) return state.databaseId;
  // Older installs kept the real id inside wrangler.jsonc - adopt it.
  const inConfig = readFileSync(CONFIG, "utf8").match(/"database_id"\s*:\s*"([0-9a-f-]{36})"/)?.[1];
  if (inConfig && inConfig !== PLACEHOLDER) return inConfig;
  const find = () => JSON.parse(run("npx wrangler d1 list --json")).find((d) => d.name === DB_NAME)?.uuid;
  let id = find();
  if (!id) {
    run(`npx wrangler d1 create ${DB_NAME}`);
    id = find();
  }
  if (!id) throw new Error("Could not create or find the D1 database");
  return id;
}

/** Writes this installer's values into wrangler.jsonc. Returns the original text (to restore). */
export function patchConfig({ workerName, databaseId, customDomain }) {
  const original = readFileSync(CONFIG, "utf8");
  let s = original
    .replace(/"name"\s*:\s*"[^"]*"/, `"name": "${workerName}"`)
    .replace(/"database_id"\s*:\s*"[^"]*"/, `"database_id": "${databaseId}"`);
  if (customDomain) {
    const extra =
      `"routes": [{ "pattern": "${customDomain}", "custom_domain": true }],\n` +
      `  "vars": { "CANONICAL_ORIGIN": "https://${customDomain}" },\n  `;
    s = s.replace(/"d1_databases"/, `${extra}"d1_databases"`);
  }
  writeFileSync(CONFIG, s);
  return original;
}

/** wrangler deploy attached to the terminal; the resulting addresses are read from wrangler's output file. */
function wranglerDeploy() {
  const dir = mkdtempSync(join(tmpdir(), "lea-out-"));
  const out = join(dir, "out.ndjson");
  try {
    runLive("npx wrangler deploy", { WRANGLER_OUTPUT_FILE_PATH: out });
    const lines = existsSync(out) ? readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    return lines.find((l) => l.type === "deploy")?.targets ?? [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function ensureSecrets(state, workerName) {
  let existing = [];
  try {
    existing = JSON.parse(run(`npx wrangler secret list --name ${workerName} --format json`)).map((s) => s.name);
  } catch {
    /* first deploy */
  }
  const toSet = {};
  // Encryption keys are generated ONCE - rotating them would make stored Google tokens unreadable.
  if (!existing.includes("TOKEN_ENC_KEY")) toSet.TOKEN_ENC_KEY = b64url(randomBytes(32));
  if (!existing.includes("SESSION_SECRET")) toSet.SESSION_SECRET = b64url(randomBytes(32));
  if (!existing.includes("SETUP_TOKEN") || !state.setupToken) {
    state.setupToken = b64url(randomBytes(18));
    toSet.SETUP_TOKEN = state.setupToken;
  }
  if (!Object.keys(toSet).length) return console.log("  Already set");
  const dir = mkdtempSync(join(tmpdir(), "lea-"));
  const file = join(dir, "secrets.json");
  writeFileSync(file, JSON.stringify(toSet), { mode: 0o600 });
  try {
    run(`npx wrangler secret bulk "${file}" --name ${workerName}`, { stdio: "inherit" });
  } finally {
    unlinkSync(file);
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`  Set: ${Object.keys(toSet).join(", ")}`);
}

/**
 * Full deploy. `opts` may override the saved Worker name / custom domain (used by the guided setup).
 * Returns { url, setupUrl }.
 */
export function deploy(opts = {}) {
  const state = readState();
  state.workerName = opts.workerName || state.workerName || DEFAULT_NAME;
  if (opts.customDomain !== undefined) state.customDomain = opts.customDomain || undefined;

  step("D1 database");
  state.databaseId = ensureDatabase(state);
  writeState(state);
  console.log(`  D1: ${state.databaseId}`);

  const original = patchConfig(state);
  const restore = () => writeFileSync(CONFIG, original);
  const onSignal = () => {
    restore();
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  let targets;
  try {
    step("Building the site");
    run("npm run build", { stdio: "inherit" });

    step("Updating the database structure (migrations)");
    run("npx wrangler d1 migrations apply DB --remote", { stdio: "inherit" });

    step("Uploading to Cloudflare");
    targets = wranglerDeploy();

    step("Internal secrets");
    ensureSecrets(state, state.workerName);
  } finally {
    restore();
    process.off("SIGINT", onSignal);
  }

  const workersDev = targets.find((t) => /\.workers\.dev/.test(t));
  const url = state.customDomain ? `https://${state.customDomain}` : workersDev ? workersDev.replace(/\/$/, "") : state.url;
  if (url) state.url = url;
  writeState(state);
  const base = state.url || "<site-address>";
  return { url: base, setupUrl: `${base}/setup?token=${state.setupToken}` };
}
