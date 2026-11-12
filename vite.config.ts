import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
// @ts-expect-error - plain JS helper shared with the release script
import { splitSql, compareMigrationNames } from "./scripts/lib/sql-split.mjs";

const DEFAULT_UPSTREAM = "https://github.com/2shpatz/wild-events.git";

/**
 * Build-time facts about this copy of the site. Only Worker code reads them (declared in worker/build-info.d.ts),
 * so the version never ends up in the public JavaScript; the admin screen gets it from the API.
 */
function buildInfo() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  let commit = "";
  try {
    commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    /* ZIP download: no git */
  }
  // Set by scripts/ci-bootstrap.mjs for builds connected to a git repo (Cloudflare Workers Builds).
  const follows = process.env.EP_FOLLOWS_UPSTREAM === "1";
  const repo = process.env.UPSTREAM_REPO || DEFAULT_UPSTREAM;
  const ref = process.env.UPSTREAM_REF || "main";
  const pinned = /^v?\d+\.\d+\.\d+$/.test(ref); // pinned to a release tag: tell about new versions, never auto-update
  const gh = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(repo);
  const feed = gh ? `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${pinned ? "main" : ref}/release-notes.json` : "";
  return {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
    __BUILD_SOURCE__: JSON.stringify(process.env.WORKERS_CI ? "git" : "manual"),
    __AUTO_UPDATE__: JSON.stringify(follows && !pinned),
    __BUILT_AT__: JSON.stringify(new Date().toISOString()),
    __UPDATE_FEED_URL__: JSON.stringify(feed),
  };
}

/** `virtual:migrations`: migrations/*.sql split into statements at build time, in wrangler's order (worker/lib/schema.ts). */
function migrationsPlugin(): Plugin {
  const id = "virtual:migrations";
  return {
    name: "ep-migrations",
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load(loadId) {
      if (loadId !== `\0${id}`) return;
      const dir = resolve("migrations");
      const names = readdirSync(dir)
        .filter((f) => f.endsWith(".sql"))
        .sort(compareMigrationNames);
      const list = names.map((name: string) => {
        const file = join(dir, name);
        this.addWatchFile(file);
        return { name, statements: splitSql(readFileSync(file, "utf8")) };
      });
      return `export default ${JSON.stringify(list)};`;
    },
  };
}

interface DeployOverrides {
  name?: string;
  databaseId?: string;
  databaseName?: string;
  canonicalOrigin?: string;
  routes?: { pattern: string; custom_domain: boolean }[];
}

/**
 * The deploy scripts pass this installer's own values in EP_DEPLOY_CONFIG (JSON), so wrangler.jsonc in git stays
 * generic and is never edited. Mutates in place (returning an object would merge arrays and duplicate bindings).
 */
function applyDeployOverrides(config: {
  name?: string;
  d1_databases?: { binding: string; database_id?: string; database_name?: string }[];
  vars?: Record<string, unknown>;
  routes?: unknown[];
}) {
  const raw = process.env.EP_DEPLOY_CONFIG;
  if (!raw) return;
  const o = JSON.parse(raw) as DeployOverrides;
  if (o.name) config.name = o.name;
  const db = config.d1_databases?.find((d) => d.binding === "DB");
  if (db && o.databaseId) {
    db.database_id = o.databaseId;
    if (o.databaseName) db.database_name = o.databaseName;
  }
  if (o.canonicalOrigin !== undefined) config.vars = { ...config.vars, CANONICAL_ORIGIN: o.canonicalOrigin };
  if (o.routes?.length) config.routes = o.routes;
}

export default defineConfig({
  plugins: [react(), tailwindcss(), migrationsPlugin(), cloudflare({ config: applyDeployOverrides })],
  define: buildInfo(),
  build: {
    chunkSizeWarningLimit: 900,
  },
});
