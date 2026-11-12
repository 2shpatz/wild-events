#!/usr/bin/env node
// Developer only: `npm run release -- patch|minor|major` turns the work on the `dev` branch into a new version.
//
//   patch = fixes · minor = new features · major = the site admin must do something by hand (say so in adminAction)
//
// 1. Checks: on `dev`, nothing uncommitted, `main` is not behind GitHub, release-notes.json has an "unreleased"
//    entry with notes (that text is what every site admin sees as "what's new").
// 2. Bumps the version (package.json + lock), dates the notes, regenerates CHANGELOG.md.
// 3. Typecheck, build, and all migrations on a brand-new local database.
// 4. Commits "Release vX.Y.Z" on dev, fast-forwards main to it, tags vX.Y.Z, returns to dev.
// It never pushes. Publishing = pushing main (every site installed from GitHub then updates itself):
//   git push origin dev main vX.Y.Z
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeChangelog } from "./changelog.mjs";
import { bold, green, step } from "./lib/deploy-core.mjs";

const KINDS = ["patch", "minor", "major"];
const kind = process.argv[2];
const git = (args) => execSync(`git ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const ok = (args) => spawnSync(`git ${args}`, { shell: true, stdio: "ignore" }).status === 0;
const sh = (cmd) => {
  if (spawnSync(cmd, { shell: true, stdio: "inherit" }).status !== 0) throw new Error(`Failed: ${cmd}`);
};
function fail(msg) {
  console.error(`\nX ${msg}\n`);
  process.exit(1);
}

if (!KINDS.includes(kind)) fail(`Usage: npm run release -- ${KINDS.join("|")}`);

// ---------------------------------------------------------------- 1. checks
step("Checking");
if (git("branch --show-current") !== "dev") fail("Releases are made from the dev branch (git checkout dev).");
if (git("status --porcelain")) fail("There are uncommitted changes. Commit them first.");
if (!ok("rev-parse --verify --quiet main")) fail("No local main branch.");
if (!ok("merge-base --is-ancestor main dev")) fail("main has commits that dev doesn't. Merge main into dev first.");
try {
  git("fetch --quiet origin main");
} catch {
  console.log("  (could not reach GitHub to compare main - continuing)");
}
if (ok("rev-parse --verify --quiet origin/main")) {
  if (!ok("merge-base --is-ancestor origin/main main")) fail("GitHub's main has commits your local main doesn't. Pull them first.");
  if (git("rev-parse main") !== git("rev-parse origin/main")) console.log("  Note: an earlier release on main isn't pushed yet; it goes out with this one.");
}
const notes = JSON.parse(readFileSync("release-notes.json", "utf8"));
const top = notes.releases?.[0];
if (top?.version !== "unreleased" || !top.notes?.filter((n) => n.trim()).length) {
  fail('release-notes.json needs an "unreleased" entry at the top with at least one note (what site admins will see).');
}
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const [a, b, c] = pkg.version.split(".").map(Number);
const version = kind === "major" ? `${a + 1}.0.0` : kind === "minor" ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
if (ok(`rev-parse --verify --quiet refs/tags/v${version}`)) fail(`Tag v${version} already exists.`);
console.log(`  ${pkg.version} -> ${bold(version)}`);

// ---------------------------------------------------------------- 2. bump
const files = ["package.json", "package-lock.json", "release-notes.json", "CHANGELOG.md"];
const restore = () => {
  spawnSync("git checkout -- package.json package-lock.json release-notes.json", { shell: true, stdio: "ignore" });
  if (ok("ls-files --error-unmatch CHANGELOG.md")) spawnSync("git checkout -- CHANGELOG.md", { shell: true, stdio: "ignore" });
  else rmSync("CHANGELOG.md", { force: true });
};
try {
  step("Stamping the version");
  sh(`npm version ${version} --no-git-tag-version --allow-same-version`);
  const d = new Date();
  top.version = version;
  top.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  top.notes = top.notes.map((n) => n.trim()).filter(Boolean);
  writeFileSync("release-notes.json", JSON.stringify(notes, null, 2) + "\n");
  writeChangelog();

  // ---------------------------------------------------------------- 3. checks that the release works
  step("Typecheck");
  sh("npm run typecheck");
  step("Build");
  sh("npm run build");
  step("Migrations on a brand-new database");
  const dir = mkdtempSync(join(tmpdir(), "ep-release-db-"));
  try {
    sh(`npx wrangler d1 migrations apply DB --local --persist-to "${dir}"`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
} catch (e) {
  restore();
  fail(`${e.message}\n  Nothing was committed; the version files were restored.`);
}

// ---------------------------------------------------------------- 4. commit, main, tag
step("Committing");
const body = top.notes.map((n) => `- ${n}`).join("\n") + (top.adminAction ? `\n\nAdmin action: ${top.adminAction}` : "");
const msgFile = join(mkdtempSync(join(tmpdir(), "ep-release-")), "msg.txt");
writeFileSync(msgFile, `Release v${version}\n\n${body}\n`);
git(`add ${files.join(" ")}`);
git(`commit -q -F "${msgFile}"`);
git("checkout -q main");
try {
  git("merge --ff-only -q dev");
  git(`tag -a v${version} -F "${msgFile}"`);
} finally {
  git("checkout -q dev");
  rmSync(msgFile, { force: true });
}

console.log(`
${green(`Version ${version} is ready on main (tag v${version}).`)}

Publish it (every site installed from GitHub then updates itself, not during live events):
  ${bold(`git push origin dev main v${version}`)}

After this, add the next change's notes to a new "unreleased" entry at the top of release-notes.json.
`);
