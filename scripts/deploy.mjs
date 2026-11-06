#!/usr/bin/env node
// `npm run deploy` - publishes the current code to Cloudflare (use it after updating to a new version).
// First time? Run `npm run setup` instead - it guides you step by step.
// Never rotates encryption keys; your settings stay in .deploy-state.json.
import { deploy, isLoggedIn, green, bold, step } from "./lib/deploy-core.mjs";

step("Checking the Cloudflare login");
if (!isLoggedIn()) {
  console.error("Not logged in to Cloudflare. Run: npm run setup (or npx wrangler login)");
  process.exit(1);
}

const { url, setupUrl } = deploy();
console.log(`\n${green(`Your site is live: ${url}`)}`);
console.log(`\n${bold("Setup link (open it on a computer; keep it private):")}\n  ${setupUrl}\n`);
