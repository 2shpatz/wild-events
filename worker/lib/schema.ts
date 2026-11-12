// Brings the database structure up to date by itself, whatever way the site was installed (from a computer,
// from GitHub through Cloudflare, or any other platform) and whatever the database is called.
//
// It uses wrangler's own bookkeeping table ("d1_migrations", same columns, same file names), so migrations that
// `wrangler d1 migrations apply` already ran are never run again, and the other way round.
// (Not to be confused with lib/migration.ts, which moves an event's photos between Google accounts.)
import migrations from "virtual:migrations";
import type { Env } from "../env";
import { APP } from "./appInfo";

// Exactly what wrangler creates (wrangler-dist/cli.js getCreateMigrationsTableQuery).
const TABLE_DDL = `CREATE TABLE IF NOT EXISTS "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);`;

/** D1 queries one request may spend on migrations (the free plan allows 50 per request). */
const BUDGET = 40;
const ERROR_PAUSE_MS = 30_000;

/** ready = up to date; pending = updated something just now (answer "try again", fresh budget next time); error = see logs. */
export type SchemaState = "ready" | "pending" | "error";

// Plain values only: a promise must never be shared between requests (Workers can't resolve it across request
// contexts, and waiting requests would hang if the first one is cancelled). Requests that check at the same time are
// safe anyway: each migration is one atomic batch and its name is UNIQUE in d1_migrations.
let ready = false;
let pausedUntil = 0;

async function appliedNames(db: D1Database): Promise<Set<string>> {
  try {
    const r = await db.prepare(`SELECT name FROM "d1_migrations"`).all<{ name: string }>();
    return new Set(r.results.map((x) => x.name));
  } catch (e) {
    if (!/no such table/i.test(String((e as Error)?.message))) throw e;
    await db.prepare(TABLE_DDL).run();
    return new Set();
  }
}

/** Applies one migration. False = another instance of the Worker applied it at the same moment. */
async function applyOne(db: D1Database, m: { name: string; statements: string[] }, first: boolean): Promise<boolean> {
  const batch = m.statements.map((s) => db.prepare(s));
  batch.push(db.prepare(`INSERT INTO "d1_migrations" (name) VALUES (?)`).bind(m.name));
  // A brand-new site: remember the version it started with, so the admin isn't told "the site was updated".
  if (first) batch.push(db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('last_seen_version', ?)").bind(APP.version));
  try {
    await db.batch(batch); // one transaction: all or nothing
    return true;
  } catch (e) {
    if ((await appliedNames(db)).has(m.name)) return false;
    throw new Error(`${m.name}: ${(e as Error)?.message || e}`);
  }
}

async function run(env: Env): Promise<SchemaState> {
  try {
    const done = await appliedNames(env.DB);
    const todo = migrations.filter((m) => !done.has(m.name));
    if (!todo.length) {
      ready = true;
      return "ready";
    }
    let used = 2;
    for (const m of todo) {
      const cost = m.statements.length + 2;
      if (used > 2 && used + cost > BUDGET) return "pending";
      if (await applyOne(env.DB, m, m.name === migrations[0]?.name)) console.log(`database updated: ${m.name}`);
      used += cost;
    }
    ready = true;
    return "pending";
  } catch (e) {
    console.error("database update failed", e);
    pausedUntil = Date.now() + ERROR_PAUSE_MS;
    try {
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_error', ?)")
        .bind(JSON.stringify({ at: Date.now(), version: APP.version, message: String((e as Error)?.message || e).slice(0, 500) }))
        .run();
    } catch {
      /* the settings table may not exist yet */
    }
    return "error";
  }
}

/**
 * Called before every /api request and every cron run. Costs one query per Worker instance once up to date.
 * "pending" means this request already spent its database budget on the update: answer 503 and let the client retry.
 * "error" fails open (the site keeps working with what it has; the admin sees the error).
 */
export function ensureSchema(env: Env): Promise<SchemaState> | SchemaState {
  if (ready) return "ready";
  if (Date.now() < pausedUntil) return "error";
  return run(env);
}

/** True once this Worker instance confirmed every bundled migration is applied. */
export const schemaReady = () => ready;

/** 503 "try again in a second" while the database structure is being updated. */
export function updatingResponse() {
  return Response.json(
    { error: "updating" },
    { status: 503, headers: { "Retry-After": "1", "Cache-Control": "no-store", "X-Updating": "1" } },
  );
}
