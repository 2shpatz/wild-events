#!/usr/bin/env node
// FROZEN FILE. Copies of this repository (GitHub forks, "Deploy to Cloudflare" clones) keep running THEIR copy of
// this file forever, so what it does must never need to change. Node built-ins only. Keep it tiny.
//
// Runs as the deploy command (`npm run deploy`) on Cloudflare Workers Builds. Unless FOLLOW_UPSTREAM=off, it
// swaps the code being built for the newest code of the original repository and then runs THAT code's deploy
// script (scripts/ci/deploy.mjs). This is how sites installed from GitHub always get the newest version without
// anyone having to sync their copy.
//
// Optional build variables (Cloudflare dashboard -> the Worker -> Settings -> Build -> Variables and secrets):
//   FOLLOW_UPSTREAM=off        build this copy exactly as it is (for people who change the code themselves)
//   UPSTREAM_REPO=<git url>    take the newest code from another repository
//   UPSTREAM_REF=<branch|tag>  default "main"; a version tag such as v1.2.0 stays on that version
import { spawnSync } from "node:child_process";

const DEFAULT_REPO = "https://github.com/2shpatz/wild-events.git";
const follow = (process.env.FOLLOW_UPSTREAM || "").trim().toLowerCase() !== "off";
const git = (...args) =>
  spawnSync("git", ["-c", "safe.directory=*", "-c", "advice.detachedHead=false", ...args], { stdio: "inherit" }).status === 0;

if (follow) {
  const repo = (process.env.UPSTREAM_REPO || "").trim() || DEFAULT_REPO;
  const ref = (process.env.UPSTREAM_REF || "").trim() || "main";
  console.log(`\n>>> Getting the newest code: ${repo} (${ref})`);
  if (!git("fetch", "--depth=1", "--no-tags", repo, ref) || !git("checkout", "-f", "--detach", "FETCH_HEAD")) {
    console.error(
      `\nX Could not get the newest code from ${repo} (${ref}). Nothing was deployed; the site keeps its current version.` +
        "\n  Try again later (Retry build). To build this copy as it is, set the build variable FOLLOW_UPSTREAM=off.",
    );
    process.exit(1);
  }
}

const r = spawnSync(process.execPath, ["scripts/ci/deploy.mjs"], {
  stdio: "inherit",
  env: { ...process.env, EP_FOLLOWS_UPSTREAM: follow ? "1" : "0" },
});
process.exit(r.status ?? 1);
