#!/usr/bin/env node
// `npm run deploy` on your computer - publishes this folder's code to your Cloudflare account (use it after
// downloading a new version). First time? Run `npm run setup` instead - it guides you step by step.
// Never replaces existing secrets; your settings stay in .deploy-state.json.
import { deploy, isLoggedIn, green, bold, yellow, step } from "./lib/deploy-core.mjs";

step("Checking the Cloudflare login");
if (!isLoggedIn()) {
  console.error("Not logged in to Cloudflare. Run: npm run setup (or npx wrangler login)");
  process.exit(1);
}

try {
  const { url, setupUrl } = await deploy();
  console.log(`\n${green(`Your site is live: ${url}`)}`);
  if (setupUrl) console.log(`\n${bold("Setup link (open it on a computer; keep it private):")}\n  ${setupUrl}\n`);
  else
    console.log(`
${bold("Setup link:")} this folder doesn't know your site's setup code (it was created elsewhere).
  - Site admin? Open your site, log in, then: Site management (ניהול האתר) -> Updates (עדכונים) -> Open the setup wizard.
  - Or run ${bold("npm run setup")} with the same site name to create a new setup link.
`);
} catch (e) {
  console.error(`\n${yellow("X")} ${e.message}\n`);
  process.exit(1);
}
