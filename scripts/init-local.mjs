#!/usr/bin/env node
// Local development: creates .dev.vars with random secrets (once) and applies D1 migrations locally.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";

const b64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
if (!existsSync(".dev.vars")) {
  writeFileSync(
    ".dev.vars",
    `TOKEN_ENC_KEY=${b64url(randomBytes(32))}\nSESSION_SECRET=${b64url(randomBytes(32))}\nSETUP_TOKEN=${b64url(randomBytes(18))}\n`,
    { mode: 0o600 },
  );
  console.log("created .dev.vars");
}
execSync("npx wrangler d1 migrations apply DB --local", { stdio: "inherit" });
const token = readFileSync(".dev.vars", "utf8").match(/SETUP_TOKEN=(.+)/)[1];
console.log(`\nLocal setup link: http://localhost:5173/setup?token=${token}\n`);
