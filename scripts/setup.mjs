#!/usr/bin/env node
// `npm run setup` - guided first-time installation. Safe to run again at any time.
// Puts the site on YOUR free Cloudflare account, then opens the in-site wizard (Hebrew) that connects YOUR Google account.
// Terminal text is English on purpose: Windows terminals can't display right-to-left Hebrew correctly.
// The same steps are explained in Hebrew in README.md.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import {
  deploy,
  isLoggedIn,
  openInBrowser,
  readState,
  runLive,
  validDomain,
  validWorkerName,
  DEFAULT_NAME,
  bold,
  green,
  yellow,
} from "./lib/deploy-core.mjs";

// One line reader for all questions (works both in a terminal and with piped input).
const rl = createInterface({ input: process.stdin, output: process.stdout });
const lines = rl[Symbol.asyncIterator]();
const ask = async (q) => {
  process.stdout.write(q);
  const { value, done } = await lines.next();
  if (done) fail("Input ended. Run this again.");
  return value.trim();
};
const pause = (msg = "Press Enter to continue...") => ask(`\n  ${msg}`);
let n = 0;
const title = (s) => console.log(`\n${bold(`=== Step ${++n} of 5: ${s} ===`)}`);

function fail(msg) {
  console.error(`\n${yellow("X")} ${msg}\n`);
  rl.close();
  process.exit(1);
}

console.log(`
${bold("Welcome! This installs the event photo album site (\"Eirua Parua\").")}
  - The site is installed on YOUR Cloudflare account; photos are saved in YOUR Google account.
  - You own and operate this site. The code's developer has no access to it.
  - It's free and takes about 20 minutes, once.`);

// 1. Node + packages
title("Checking your computer");
// The minimum comes from package.json "engines" (also checked by the build on Cloudflare, scripts/ci/deploy.mjs).
const need = (/(\d+)\.(\d+)/.exec(JSON.parse(readFileSync("package.json", "utf8")).engines?.node || "") || [0, 0, 0]).slice(1).map(Number);
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < need[0] || (major === need[0] && minor < need[1])) {
  fail(`Node.js ${need.join(".")} or newer is needed (you have ${process.versions.node}). Install the LTS version from https://nodejs.org and run this again.`);
}
console.log(`  Node.js ${process.versions.node} - OK`);
if (!existsSync("node_modules")) {
  console.log("  Installing components (1-2 minutes)...");
  const r = spawnSync("npm install", { stdio: "inherit", shell: true });
  if (r.status !== 0) fail("Installing components failed. Check your internet connection and run this again.");
}
console.log("  Components - OK");

// 2. Cloudflare account
title("Your Cloudflare account");
if (isLoggedIn()) console.log("  Already logged in - OK");
else {
  console.log(`  A browser window will open with Cloudflare.
  - No account yet? Click ${bold("Sign up")} and create a free account, then come back here and run this again.
  - Have an account? Log in and click ${bold("Allow")}.`);
  await pause();
  try {
    runLive("npx wrangler login");
  } catch {
    /* checked below */
  }
  if (!isLoggedIn()) fail("Cloudflare login was not completed. Run this again.");
  console.log(`  ${green("Logged in - OK")}`);
}

// 3. Site address
const state = readState();
title("Your site's address");
console.log("  Pick a short English name for the site (lowercase letters, digits, dashes). It becomes part of the address.");
let workerName = state.workerName;
for (;;) {
  const def = workerName || DEFAULT_NAME;
  const v = (await ask(`  Site name [${def}]: `)).toLowerCase() || def;
  if (validWorkerName(v)) {
    workerName = v;
    break;
  }
  console.log(yellow("  Not valid. Use only a-z, 0-9 and dashes, no spaces (for example: my-albums)."));
}
console.log(`  Your address will be: https://${workerName}.<your-subdomain>.workers.dev`);

console.log(`
  ${bold("Optional:")} do you have your own domain that is already in THIS Cloudflare account?
  Type a full address (for example photos.example.com). No? Just press Enter.`);
let customDomain = state.customDomain || "";
for (;;) {
  const v = (await ask(`  Your own domain [${customDomain || "none"}]: `)).toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (v === "-" || v === "none") {
    customDomain = "";
    break;
  }
  if (!v || validDomain(v)) {
    customDomain = v || customDomain;
    break;
  }
  console.log(yellow("  That is not a valid address. Example: photos.example.com"));
}

// 4. Deploy
title("Publishing the site to Cloudflare");
console.log(`  This takes about 2 minutes.
  ${bold("If Cloudflare asks")} "Would you like to register a workers.dev subdomain now?":
  type ${bold("y")}, press Enter, then type a short English name (for example your name).
  It becomes the second part of your address, and you choose it only once.`);
await pause();
// Release the terminal so Cloudflare's own questions (e.g. the workers.dev subdomain) work normally.
rl.close();
let result;
try {
  result = await deploy({ workerName, customDomain, rotateSetupIfUnknown: true });
} catch (e) {
  fail(`Publishing failed: ${e.message}
  - If Cloudflare asked to register a workers.dev subdomain and you said no: run this again and answer y.
  - If you entered your own domain: make sure it is in the same Cloudflare account.`);
}

// 5. Google
title("Connecting Google");
console.log(`  ${green(`Your site is live: ${result.url}`)}

  The site's setup wizard (in Hebrew) is opening in your browser now. It guides you, step by step,
  through connecting your Google account (about 15 minutes, once). If the browser didn't open, copy this link:

  ${bold(result.setupUrl)}

  ${yellow("Keep this link private. Whoever has it can change the site's settings.")}`);
openInBrowser(result.setupUrl);

console.log(`
${bold("What's next")}
  - When the wizard is done: open your site, log in with Google and create your first event.
  - ${bold("Don't delete this folder.")} The hidden file .deploy-state.json in it keeps your site's settings.
  - New versions: your site's admin dashboard tells you when one is out and what's new. To update, download
    the new code, copy .deploy-state.json from this folder into it, then run: npm run deploy
    Lost the file? Run npm run setup and choose exactly the same site name.
  - Want new versions to install by themselves? README.md explains how to move this site to
    GitHub + Cloudflare builds (your database, Google connection and address stay).
`);
