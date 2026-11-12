#!/usr/bin/env node
// `npm run deploy`. Keep this file tiny and never change what it does: copies of this repository (forks, and
// sites installed with the "Deploy to Cloudflare" button) keep running THEIR copy of it forever.
//   - On Cloudflare Workers Builds (site installed from GitHub): scripts/ci-bootstrap.mjs
//   - On your computer: scripts/deploy-cli.mjs
if (process.env.WORKERS_CI) await import("./ci-bootstrap.mjs");
else await import("./deploy-cli.mjs");
