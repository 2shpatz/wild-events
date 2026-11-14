// Shared helpers for the Worker tests: bundle a Worker module with esbuild, and a D1 stand-in on node:sqlite.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

export const root = new URL("../../", import.meta.url).pathname;

/** Bundles `code` (ESM, resolved from the repo root) and imports it. */
export async function bundle(code) {
  const dir = mkdtempSync(join(tmpdir(), "worker-test-"));
  const out = join(dir, "bundle.mjs");
  await build({ stdin: { contents: code, resolveDir: root, loader: "ts" }, bundle: true, format: "esm", platform: "neutral", mainFields: ["module", "main"], outfile: out, logLevel: "error" });
  const mod = await import(pathToFileURL(out).href);
  rmSync(dir, { recursive: true, force: true });
  return mod;
}

// ------------------------------------------------ D1 on node:sqlite
export function d1() {
  const db = new DatabaseSync(":memory:");
  const files = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) db.exec(readFileSync(join(root, "migrations", f), "utf8"));
  const norm = (p) => p.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v));
  class Stmt {
    constructor(sql, params = []) {
      this.sql = sql;
      this.params = params;
    }
    bind(...p) {
      return new Stmt(this.sql, p);
    }
    async first(col) {
      const r = db.prepare(this.sql).get(...norm(this.params));
      return r ? (col ? r[col] : { ...r }) : null;
    }
    async all() {
      return { results: db.prepare(this.sql).all(...norm(this.params)).map((r) => ({ ...r })) };
    }
    async run() {
      const r = db.prepare(this.sql).run(...norm(this.params));
      return { meta: { changes: Number(r.changes) } };
    }
  }
  return {
    raw: db,
    prepare: (sql) => new Stmt(sql),
    async batch(stmts) {
      db.exec("BEGIN");
      try {
        const res = [];
        for (const s of stmts) res.push(await s.run());
        db.exec("COMMIT");
        return res;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

