#!/usr/bin/env node
// Stage 2 of a build on Cloudflare Workers Builds (a site installed from GitHub). Started by scripts/ci-bootstrap.mjs,
// usually after it fetched the newest code of the original repository, so this file is always the newest version
// and may change freely.
//
// Builds the site, deploys it, adds the internal secrets a new site needs (never replaces existing ones), and on a
// brand-new site prints the setup code at the end of the build log.
import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { bold, build, green, listSecretNames, missingSecrets, step, warmUp, wranglerDeploy, yellow } from "../lib/deploy-core.mjs";

const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
const follows = process.env.EP_FOLLOWS_UPSTREAM === "1";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

function fail(msg) {
  console.error(`\n${yellow("X")} ${msg}\n`);
  process.exit(1);
}

function checkNode() {
  const need = /(\d+)\.(\d+)/.exec(pkg.engines?.node || "") || [];
  const [major, minor] = process.versions.node.split(".").map(Number);
  const [nMajor, nMinor] = [Number(need[1] || 0), Number(need[2] || 0)];
  if (major < nMajor || (major === nMajor && minor < nMinor)) {
    fail(
      `This version needs Node.js ${pkg.engines.node} (the build has ${process.versions.node}).\n` +
        `  Cloudflare dashboard -> your Worker -> Settings -> Build -> Variables and secrets: add NODE_VERSION = ${nMajor}, then Retry build.`,
    );
  }
}

/**
 * A copy made with the "Deploy to Cloudflare" button has the database Cloudflare created for it written in its own
 * wrangler.jsonc. The newest code doesn't, so keep using that database.
 */
function databaseFromOwnCopy() {
  const sha = process.env.WORKERS_CI_COMMIT_SHA;
  if (!follows || !sha) return undefined;
  try {
    const own = execSync(`git -c safe.directory=* show ${sha}:wrangler.jsonc`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const id = /"database_id"\s*:\s*"([0-9a-f-]{36})"/.exec(own)?.[1];
    return id && id !== PLACEHOLDER ? id : undefined;
  } catch {
    return undefined;
  }
}

function workerName() {
  if (process.env.WRANGLER_CI_OVERRIDE_NAME) return process.env.WRANGLER_CI_OVERRIDE_NAME;
  const name = /"name"\s*:\s*"([^"]+)"/.exec(readFileSync("wrangler.jsonc", "utf8"))?.[1];
  if (!name) fail("No Worker name found in wrangler.jsonc.");
  return name;
}

let commit = "";
try {
  commit = execSync("git -c safe.directory=* rev-parse --short HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
} catch {
  /* not important */
}
console.log(`\n${bold(`Eirua Parua ${pkg.version}${commit ? ` (${commit})` : ""}${follows ? " - newest code of the original repository" : " - this copy as it is"}`)}`);

checkNode();
if (follows) {
  step("Installing components");
  if (spawnSync("npm ci --no-audit --no-fund", { shell: true, stdio: "inherit" }).status !== 0) fail("Installing components failed. Retry the build.");
}

const name = workerName();
step(`Checking the site "${name}"`);
let existing;
try {
  existing = listSecretNames(name);
} catch (e) {
  fail(`${e.message}\n  Nothing was deployed. Retry the build; if it keeps failing, check the build's API token permissions.`);
}
const secrets = missingSecrets(existing);

step("Building the site");
const databaseId = databaseFromOwnCopy();
if (databaseId) console.log(`  Database from this copy: ${databaseId}`);
build({ databaseId });

step("Uploading to Cloudflare");
const targets = wranglerDeploy(secrets);
if (Object.keys(secrets).length) console.log(`  Internal secrets set: ${Object.keys(secrets).join(", ")}`);
const url = targets.find((t) => /\.workers\.dev/.test(t))?.replace(/\/$/, "") || targets[0]?.replace(/\/$/, "");

step("Updating the database structure");
await warmUp(url);

console.log(`\n${green(`Done: ${url || "your site"} runs version ${pkg.version}.`)}`);
if (secrets.SETUP_TOKEN) {
  const link = url ? `${url}/setup?token=${secrets.SETUP_TOKEN}` : "(your site's address)/setup";
  const lines = [
    "YOUR SITE IS READY - NEXT STEP: THE SETUP WIZARD",
    "",
    "Setup link (open it on a computer):",
    `  ${link}`,
    "",
    "Setup code (if the wizard asks for it):",
    `  ${secrets.SETUP_TOKEN}`,
    "",
    "Keep them private: whoever has them can change the site's settings.",
    "This is shown only once. Lost it? See 'Lost setup link' in README.md.",
  ];
  const w = Math.max(...lines.map((l) => l.length)) + 2;
  console.log(`\n+${"-".repeat(w)}+`);
  for (const l of lines) console.log(`| ${l.padEnd(w - 1)}|`);
  console.log(`+${"-".repeat(w)}+\n`);
}
