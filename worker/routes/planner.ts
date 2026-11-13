/**
 * The hosts' event planner ("רשימת אורחים"): guest list + RSVP, seating chart, gifts, vendors and expenses.
 * Managers = the event owner or the event-password holder (same as the manage page).
 * Public: the personal RSVP link of a household, and "find my table" on the event page.
 *
 * D1 allows ~50 queries per request: every bulk write is ONE statement over json_each(?), never a query per row.
 */
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, Env } from "../env";
import { eventByCode, selectIn, type EventRow } from "../lib/db";
import { canManage, rateLimit } from "../lib/session";
import { randomId } from "../lib/crypto";
import { parseDesign } from "../../shared/design";
import type { EventType } from "../../shared/types";
import {
  HOST_EDITABLE,
  MAX_EXPENSES,
  MAX_HOUSEHOLDS,
  MAX_PARTY,
  MAX_VENDORS,
  NOTE_MAX,
  STATUSES,
  cleanText,
  emptyHousehold,
  sanitizeConfig,
  sanitizeExpense,
  sanitizeFloor,
  sanitizeHousehold,
  sanitizeVendor,
  tableLabelOf,
  tables,
  type ExpenseDTO,
  type FloorPlan,
  type Household,
  type HouseholdDTO,
  type PlannerConfig,
  type PlannerData,
  type RsvpStatus,
  type VendorDTO,
} from "../../shared/guests";
import { syncSheet } from "../lib/sheets";

export const planner = new Hono<AppEnv>();

type PlannerRow = {
  event_id: string;
  config: string;
  floor: string | null;
  version: number;
  sheet_id: string | null;
  sheet_url: string | null;
  sheet_synced_at: number | null;
  sheet_error: string | null;
  sheet_dirty: number;
};
type HouseholdRow = { id: string; rsvp_token: string; data: string; sort: number; created_at: number; updated_at: number };
type RecordRow = { id: string; kind: string; data: string; sort: number; updated_at: number };

const json = async (c: Context<AppEnv>) => (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
const parse = (s: string | null | undefined): unknown => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};
const ip = (c: Context<AppEnv>) => c.req.header("CF-Connecting-IP") || "local";

async function managed(c: Context<AppEnv>) {
  const ev = await eventByCode(c.env, c.req.param("code")!);
  if (!(await canManage(c, ev.id))) throw new HTTPException(403, { message: "not_allowed" });
  return ev;
}

/** The event's planner row (created with the defaults on first use). */
export async function plannerRow(env: Env, ev: EventRow): Promise<PlannerRow> {
  const row = await env.DB.prepare("SELECT * FROM guest_planner WHERE event_id = ?").bind(ev.id).first<PlannerRow>();
  if (row) return row;
  const config = JSON.stringify(sanitizeConfig(null, ev.type as EventType));
  await env.DB.prepare("INSERT OR IGNORE INTO guest_planner (event_id, config, updated_at) VALUES (?,?,?)").bind(ev.id, config, Date.now()).run();
  return (await env.DB.prepare("SELECT * FROM guest_planner WHERE event_id = ?").bind(ev.id).first<PlannerRow>())!;
}

export const configOf = (row: PlannerRow, ev: EventRow) => sanitizeConfig(parse(row.config), ev.type as EventType);
export const floorOf = (row: PlannerRow) => sanitizeFloor(parse(row.floor));

/** Every change: bump the version (the open planner pages poll it) and mark the Google Sheet as behind. */
export const bump = (env: Env, eventId: string) =>
  env.DB.prepare(
    "UPDATE guest_planner SET version = version + 1, sheet_dirty = CASE WHEN sheet_id IS NULL THEN 0 ELSE 1 END, updated_at = ? WHERE event_id = ?",
  ).bind(Date.now(), eventId);

/** Stored household -> what the browser gets. Seats on tables that no longer exist are dropped here. */
export function toHousehold(r: HouseholdRow, cfg: PlannerConfig, tableIds: Set<string>): HouseholdDTO {
  const h = sanitizeHousehold(parse(r.data), cfg, r.id);
  h.seats = h.seats.filter((s) => tableIds.has(s.t));
  return { ...h, token: r.rsvp_token, sort: r.sort, createdAt: r.created_at, updatedAt: r.updated_at };
}

/** Stored data (without id: the row id is the source of truth). */
const store = (h: Household) => {
  const { id: _id, ...rest } = h;
  void _id;
  return JSON.stringify(rest);
};

export async function loadHouseholds(env: Env, eventId: string, cfg: PlannerConfig, floor: FloorPlan) {
  const res = await env.DB.prepare(
    "SELECT id, rsvp_token, data, sort, created_at, updated_at FROM households WHERE event_id = ? AND deleted_at IS NULL ORDER BY sort, created_at",
  )
    .bind(eventId)
    .all<HouseholdRow>();
  const ids = new Set(tables(floor).map((t) => t.id));
  return res.results.map((r) => toHousehold(r, cfg, ids));
}

async function loadRecords(env: Env, eventId: string) {
  const res = await env.DB.prepare("SELECT id, kind, data, sort, updated_at FROM planner_records WHERE event_id = ? AND deleted_at IS NULL ORDER BY sort, created_at")
    .bind(eventId)
    .all<RecordRow>();
  const vendors: VendorDTO[] = [];
  const expenses: ExpenseDTO[] = [];
  for (const r of res.results) {
    if (r.kind === "vendor") vendors.push({ ...sanitizeVendor(parse(r.data), r.id), sort: r.sort, updatedAt: r.updated_at });
    else if (r.kind === "expense") expenses.push({ ...sanitizeExpense(parse(r.data), r.id), sort: r.sort, updatedAt: r.updated_at });
  }
  return { vendors, expenses };
}

function eventBasics(ev: EventRow): PlannerData["event"] {
  return {
    code: ev.code,
    title: ev.title,
    type: ev.type as EventType,
    theme: ev.theme,
    date: ev.event_date,
    time: ev.event_time,
    venueName: ev.venue_name,
    venueAddress: ev.venue_address,
  };
}

async function pendingDeletes(env: Env, row: PlannerRow) {
  if (!row.sheet_id) return 0;
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(`sheet_pending:${row.event_id}`).first<{ value: string }>();
  const ids = parse(r?.value);
  return Array.isArray(ids) ? ids.length : 0;
}

async function fullData(env: Env, ev: EventRow, row: PlannerRow): Promise<PlannerData> {
  const config = configOf(row, ev);
  const floor = floorOf(row);
  const [households, records, replies, pending] = await Promise.all([
    loadHouseholds(env, ev.id, config, floor),
    loadRecords(env, ev.id),
    env.DB.prepare(
      "SELECT date(at / 1000, 'unixepoch', '+3 hours') AS day, COUNT(*) AS n FROM rsvp_log WHERE event_id = ? AND status != 'pending' GROUP BY day ORDER BY day",
    )
      .bind(ev.id)
      .all<{ day: string; n: number }>(),
    pendingDeletes(env, row),
  ]);
  return {
    config,
    floor,
    households,
    vendors: records.vendors,
    expenses: records.expenses,
    replies: replies.results,
    sheet: row.sheet_id ? { url: row.sheet_url ?? "", syncedAt: row.sheet_synced_at, error: row.sheet_error, pendingDeletes: pending } : null,
    version: row.version,
    event: eventBasics(ev),
  };
}

// ------------------------------------------------------------------ load / settings / floor

/** Everything in one go; `?since=<version>` answers {unchanged} when nothing changed (the page polls it). */
planner.get("/e/:code/planner", async (c) => {
  const ev = await managed(c);
  const row = await plannerRow(c.env, ev);
  const since = Number(c.req.query("since"));
  if (since && since === row.version) return c.json({ unchanged: true, version: row.version });
  return c.json(await fullData(c.env, ev, row));
});

planner.put("/e/:code/planner/config", async (c) => {
  const ev = await managed(c);
  await plannerRow(c.env, ev);
  const b = await json(c);
  const config = sanitizeConfig(b.config, ev.type as EventType);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE guest_planner SET config = ? WHERE event_id = ?").bind(JSON.stringify(config), ev.id),
    bump(c.env, ev.id),
  ]);
  return c.json({ config });
});

/** PUT from the page; POST = the same, sent by navigator.sendBeacon when the page closes with an unsaved change. */
const saveFloor = async (c: Context<AppEnv>) => {
  const ev = await managed(c);
  await plannerRow(c.env, ev);
  const b = await json(c);
  const floor = sanitizeFloor(b.floor);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE guest_planner SET floor = ? WHERE event_id = ?").bind(JSON.stringify(floor), ev.id),
    bump(c.env, ev.id),
  ]);
  return c.json({ floor });
};
planner.put("/e/:code/planner/floor", saveFloor);
planner.post("/e/:code/planner/floor", saveFloor);

// ------------------------------------------------------------------ households

async function countHouseholds(env: Env, eventId: string) {
  return (await env.DB.prepare("SELECT COUNT(*) AS n FROM households WHERE event_id = ? AND deleted_at IS NULL").bind(eventId).first<{ n: number }>())?.n ?? 0;
}

/** New invitations (one, or many from an import). Body: {households: Partial<Household>[]}. */
planner.post("/e/:code/planner/households", async (c) => {
  const ev = await managed(c);
  const row = await plannerRow(c.env, ev);
  const cfg = configOf(row, ev);
  const floor = floorOf(row);
  const b = await json(c);
  const list = Array.isArray(b.households) ? b.households.slice(0, MAX_HOUSEHOLDS) : [];
  if (!list.length) throw new HTTPException(400, { message: "nothing_to_add" });
  const have = await countHouseholds(c.env, ev.id);
  if (have + list.length > MAX_HOUSEHOLDS) throw new HTTPException(409, { message: "guest_cap" });
  const last = await c.env.DB.prepare("SELECT MAX(sort) AS s FROM households WHERE event_id = ?").bind(ev.id).first<{ s: number | null }>();
  let sort = (last?.s ?? 0) + 1;
  const now = Date.now();
  const tableIds = new Set(tables(floor).map((t) => t.id));
  const rows = list.map((input) => {
    const hid = randomId(9);
    const h = sanitizeHousehold({ ...emptyHousehold(hid), ...(typeof input === "object" && input ? input : {}) }, cfg, hid);
    h.seats = h.seats.filter((s) => tableIds.has(s.t));
    if (h.status !== "pending") {
      h.rsvpAt = now;
      h.rsvpBy = "host";
    }
    return { id: hid, token: randomId(12), data: store(h), sort: sort++, h };
  });
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO households (id, event_id, rsvp_token, data, sort, created_at, updated_at)
       SELECT json_extract(j.value, '$.id'), ?1, json_extract(j.value, '$.token'), json_extract(j.value, '$.data'), json_extract(j.value, '$.sort'), ?2, ?2
         FROM json_each(?3) j`,
    ).bind(ev.id, now, JSON.stringify(rows.map(({ h: _h, ...r }) => (void _h, r)))),
    bump(c.env, ev.id),
  ]);
  return c.json({
    households: rows.map((r): HouseholdDTO => ({ ...r.h, token: r.token, sort: r.sort, createdAt: now, updatedAt: now })),
  });
});

/**
 * Changes to one or many invitations: {items: [{id, patch}]} (the bulk bar sends the same patch for many ids).
 * A status change by a host is written to the RSVP history.
 */
planner.patch("/e/:code/planner/households", async (c) => {
  const ev = await managed(c);
  const row = await plannerRow(c.env, ev);
  const cfg = configOf(row, ev);
  const floor = floorOf(row);
  const b = await json(c);
  const items = (Array.isArray(b.items) ? b.items : [])
    .slice(0, MAX_HOUSEHOLDS)
    .filter((x): x is { id: string; patch: Record<string, unknown> } => !!x && typeof x.id === "string" && !!x.patch && typeof x.patch === "object");
  if (!items.length) return c.json({ households: [] });
  const stored = await selectIn<HouseholdRow>(
    c.env,
    (ph) => `SELECT id, rsvp_token, data, sort, created_at, updated_at FROM households WHERE event_id = ? AND deleted_at IS NULL AND id IN (${ph})`,
    [ev.id],
    [...new Set(items.map((i) => i.id))],
  );
  const byId = new Map(stored.map((r) => [r.id, r]));
  const tableIds = new Set(tables(floor).map((t) => t.id));
  const now = Date.now();
  const out: HouseholdDTO[] = [];
  const updates: { id: string; data: string; sort: number }[] = [];
  const log: { hid: string; status: RsvpStatus; coming: number }[] = [];
  for (const { id, patch } of items) {
    const r = byId.get(id);
    if (!r) continue;
    const before = toHousehold(r, cfg, tableIds);
    const allowed = Object.fromEntries(Object.entries(patch).filter(([k]) => HOST_EDITABLE.includes(k as keyof Household)));
    const merged = { ...before, ...allowed } as Record<string, unknown>;
    if ("custom" in allowed) merged.custom = { ...before.custom, ...(allowed.custom as object) };
    const h = sanitizeHousehold(merged, cfg, id);
    h.seats = h.seats.filter((s) => tableIds.has(s.t));
    if (h.status !== before.status || h.coming !== before.coming) {
      h.rsvpAt = now;
      h.rsvpBy = "host";
      if (h.status !== before.status) log.push({ hid: id, status: h.status, coming: h.coming });
    } else {
      h.rsvpAt = before.rsvpAt;
      h.rsvpBy = before.rsvpBy;
    }
    const sort = typeof patch.sort === "number" && Number.isFinite(patch.sort) ? patch.sort : r.sort;
    updates.push({ id, data: store(h), sort });
    out.push({ ...h, token: r.rsvp_token, sort, createdAt: r.created_at, updatedAt: now });
  }
  if (!updates.length) return c.json({ households: [] });
  const stmts = [
    c.env.DB.prepare(
      `UPDATE households SET data = json_extract(j.value, '$.data'), sort = json_extract(j.value, '$.sort'), updated_at = ?1
         FROM json_each(?2) j WHERE households.id = json_extract(j.value, '$.id') AND households.event_id = ?3`,
    ).bind(now, JSON.stringify(updates), ev.id),
    bump(c.env, ev.id),
  ];
  if (log.length)
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO rsvp_log (event_id, household_id, at, by, status, coming)
         SELECT ?1, json_extract(j.value, '$.hid'), ?2, 'host', json_extract(j.value, '$.status'), json_extract(j.value, '$.coming') FROM json_each(?3) j`,
      ).bind(ev.id, now, JSON.stringify(log)),
    );
  await c.env.DB.batch(stmts);
  return c.json({ households: out });
});

const idList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(x)))].slice(0, MAX_HOUSEHOLDS) : []);

planner.post("/e/:code/planner/households/delete", async (c) => {
  const ev = await managed(c);
  const ids = idList((await json(c)).ids);
  if (!ids.length) return c.json({ ok: true });
  await c.env.DB.batch([
    // snapshot = NULL: a household brought back later is new to the sheet (else the next sync would see it "deleted there")
    c.env.DB.prepare("UPDATE households SET deleted_at = ?1, snapshot = NULL FROM json_each(?2) j WHERE households.id = j.value AND households.event_id = ?3 AND deleted_at IS NULL").bind(
      Date.now(),
      JSON.stringify(ids),
      ev.id,
    ),
    bump(c.env, ev.id),
  ]);
  return c.json({ ok: true });
});

planner.post("/e/:code/planner/households/restore", async (c) => {
  const ev = await managed(c);
  const ids = idList((await json(c)).ids);
  if (!ids.length) return c.json({ households: [] });
  const have = await countHouseholds(c.env, ev.id);
  if (have + ids.length > MAX_HOUSEHOLDS) throw new HTTPException(409, { message: "guest_cap" });
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE households SET deleted_at = NULL FROM json_each(?1) j WHERE households.id = j.value AND households.event_id = ?2").bind(JSON.stringify(ids), ev.id),
    bump(c.env, ev.id),
  ]);
  return c.json({ ok: true });
});

/** A new personal link (the old one stops working) - if a link reached the wrong person. */
planner.post("/e/:code/planner/households/:id/new-link", async (c) => {
  const ev = await managed(c);
  const token = randomId(12);
  const r = await c.env.DB.prepare("UPDATE households SET rsvp_token = ? WHERE id = ? AND event_id = ? AND deleted_at IS NULL").bind(token, c.req.param("id"), ev.id).run();
  if (!r.meta.changes) throw new HTTPException(404, { message: "not_found" });
  return c.json({ token });
});

/** RSVP history of one invitation. */
planner.get("/e/:code/planner/households/:id/log", async (c) => {
  const ev = await managed(c);
  const res = await c.env.DB.prepare("SELECT at, by, status, coming FROM rsvp_log WHERE event_id = ? AND household_id = ? ORDER BY at DESC LIMIT 50")
    .bind(ev.id, c.req.param("id"))
    .all<{ at: number; by: string; status: string; coming: number }>();
  return c.json({ log: res.results });
});

// ------------------------------------------------------------------ vendors / expenses

const RECORD_KINDS = { vendor: MAX_VENDORS, expense: MAX_EXPENSES } as const;
type RecordKind = keyof typeof RECORD_KINDS;
const recordKind = (v: unknown): RecordKind => {
  if (v !== "vendor" && v !== "expense") throw new HTTPException(400, { message: "not_found" });
  return v;
};
const cleanRecord = (kind: RecordKind, data: unknown, rid: string) => (kind === "vendor" ? sanitizeVendor(data, rid) : sanitizeExpense(data, rid));
const recordDTO = (kind: RecordKind, data: unknown, rid: string, sort: number, updatedAt: number) => ({ ...cleanRecord(kind, data, rid), sort, updatedAt });

planner.post("/e/:code/planner/records", async (c) => {
  const ev = await managed(c);
  await plannerRow(c.env, ev);
  const b = await json(c);
  const kind = recordKind(b.kind);
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n, MAX(sort) AS s FROM planner_records WHERE event_id = ? AND kind = ? AND deleted_at IS NULL")
    .bind(ev.id, kind)
    .first<{ n: number; s: number | null }>();
  if ((n?.n ?? 0) >= RECORD_KINDS[kind]) throw new HTTPException(409, { message: "too_many_records" });
  const rid = randomId(9);
  const rec = cleanRecord(kind, b.data, rid);
  const sort = (n?.s ?? 0) + 1;
  const now = Date.now();
  const { id: _i, ...data } = rec;
  void _i;
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO planner_records (id, event_id, kind, data, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?)").bind(
      rid,
      ev.id,
      kind,
      JSON.stringify(data),
      sort,
      now,
      now,
    ),
    bump(c.env, ev.id),
  ]);
  return c.json({ record: recordDTO(kind, data, rid, sort, now) });
});

planner.put("/e/:code/planner/records/:id", async (c) => {
  const ev = await managed(c);
  const r = await c.env.DB.prepare("SELECT kind, sort FROM planner_records WHERE id = ? AND event_id = ? AND deleted_at IS NULL")
    .bind(c.req.param("id"), ev.id)
    .first<{ kind: string; sort: number }>();
  if (!r) throw new HTTPException(404, { message: "not_found" });
  const kind = recordKind(r.kind);
  const b = await json(c);
  const rid = c.req.param("id");
  const rec = cleanRecord(kind, b.data, rid);
  const { id: _i, ...data } = rec;
  void _i;
  const now = Date.now();
  const sort = typeof b.sort === "number" && Number.isFinite(b.sort) ? b.sort : r.sort;
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE planner_records SET data = ?, sort = ?, updated_at = ? WHERE id = ? AND event_id = ?").bind(JSON.stringify(data), sort, now, rid, ev.id),
    bump(c.env, ev.id),
  ]);
  return c.json({ record: recordDTO(kind, data, rid, sort, now) });
});

planner.delete("/e/:code/planner/records/:id", async (c) => {
  const ev = await managed(c);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE planner_records SET deleted_at = ? WHERE id = ? AND event_id = ? AND deleted_at IS NULL").bind(Date.now(), c.req.param("id"), ev.id),
    bump(c.env, ev.id),
  ]);
  return c.json({ ok: true });
});

planner.post("/e/:code/planner/records/:id/restore", async (c) => {
  const ev = await managed(c);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE planner_records SET deleted_at = NULL WHERE id = ? AND event_id = ?").bind(c.req.param("id"), ev.id),
    bump(c.env, ev.id),
  ]);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ Google Sheet

/** Sync now (also creates the sheet when `create` is set). */
planner.post("/e/:code/planner/sheet/sync", async (c) => {
  const ev = await managed(c);
  const b = await json(c);
  await rateLimit(c.env, `sheet:${ev.id}`, 6, 60_000);
  const res = await syncSheet(c.env, ev, {
    create: b.create === true,
    ownerEmail: c.get("ownerId") === ev.owner_id ? await ownerEmail(c.env, ev.owner_id) : null,
    confirmDeletes: b.confirmDeletes === true,
    keepDeleted: b.keepDeleted === true,
    overwrite: b.overwrite === true,
  });
  const row = await plannerRow(c.env, ev);
  return c.json({ ...res, data: await fullData(c.env, ev, row) });
});

/** Stops syncing; the sheet itself stays in Google Drive. */
planner.delete("/e/:code/planner/sheet", async (c) => {
  const ev = await managed(c);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE guest_planner SET sheet_id = NULL, sheet_url = NULL, sheet_synced_at = NULL, sheet_error = NULL, sheet_dirty = 0 WHERE event_id = ?").bind(ev.id),
    c.env.DB.prepare("UPDATE households SET snapshot = NULL WHERE event_id = ?").bind(ev.id),
    c.env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(`sheet_pending:${ev.id}`),
    bump(c.env, ev.id),
  ]);
  return c.json({ ok: true });
});

async function ownerEmail(env: Env, ownerId: string) {
  return (await env.DB.prepare("SELECT email FROM owners WHERE id = ?").bind(ownerId).first<{ email: string | null }>())?.email ?? null;
}

// ------------------------------------------------------------------ public: personal RSVP link

async function byToken(c: Context<AppEnv>) {
  const token = c.req.param("token") ?? "";
  if (!/^[A-Za-z0-9_-]{16}$/.test(token)) throw new HTTPException(404, { message: "rsvp_not_found" });
  const ev = await eventByCode(c.env, c.req.param("code")!);
  const r = await c.env.DB.prepare(
    "SELECT id, rsvp_token, data, sort, created_at, updated_at FROM households WHERE rsvp_token = ? AND event_id = ? AND deleted_at IS NULL",
  )
    .bind(token, ev.id)
    .first<HouseholdRow>();
  if (!r) throw new HTTPException(404, { message: "rsvp_not_found" });
  const row = await plannerRow(c.env, ev);
  const cfg = configOf(row, ev);
  const floor = floorOf(row);
  const h = toHousehold(r, cfg, new Set(tables(floor).map((t) => t.id)));
  return { ev, row, cfg, floor, h };
}

/** Israel date of today, "YYYY-MM-DD". */
const todayIL = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

function rsvpView(cfg: PlannerConfig, floor: FloorPlan, h: Household) {
  const closed = !cfg.rsvp.open || (!!cfg.rsvp.deadline && todayIL() > cfg.rsvp.deadline);
  return {
    household: {
      first: h.first,
      last: h.last,
      invited: h.invited,
      invitedKids: h.invitedKids,
      companions: h.companions,
      status: h.status,
      coming: h.coming,
      comingKids: h.comingKids,
      meals: h.meals,
      note: h.guestNote,
      answeredAt: h.rsvpAt,
    },
    settings: {
      closed,
      deadline: cfg.rsvp.deadline,
      askKids: cfg.rsvp.askKids,
      askMeals: cfg.rsvp.askMeals && cfg.meals.length > 0,
      askNote: cfg.rsvp.askNote,
      maxComing: cfg.rsvp.allowMore ? MAX_PARTY : Math.max(1, h.invited),
      meals: cfg.meals.map((m) => ({ id: m.id, name: m.name })),
    },
    table: cfg.seatingPublished && h.status !== "not_coming" ? tableLabelOf(h, new Map(tables(floor).map((t) => [t.id, t]))) || null : null,
  };
}

planner.get("/e/:code/rsvp/:token", async (c) => {
  await rateLimit(c.env, `rsvp-view:${ip(c)}`, 300, 3600_000);
  const { cfg, floor, h } = await byToken(c);
  return c.json(rsvpView(cfg, floor, h));
});

planner.post("/e/:code/rsvp/:token", async (c) => {
  const { ev, cfg, floor, h } = await byToken(c);
  await rateLimit(c.env, `rsvp:t:${h.id}`, 20, 3600_000);
  await rateLimit(c.env, `rsvp:ip:${ip(c)}`, 60, 3600_000);
  const view = rsvpView(cfg, floor, h);
  if (view.settings.closed) throw new HTTPException(409, { message: "rsvp_closed" });
  const b = await json(c);
  const status = STATUSES.includes(b.status as RsvpStatus) && b.status !== "pending" ? (b.status as RsvpStatus) : null;
  if (!status) throw new HTTPException(400, { message: "rsvp_pick" });
  const max = view.settings.maxComing;
  const coming = status === "not_coming" ? 0 : Math.min(max, Math.max(1, Math.round(Number(b.coming) || 1)));
  const comingKids = status === "not_coming" || !cfg.rsvp.askKids ? 0 : Math.min(coming, Math.max(0, Math.round(Number(b.comingKids) || 0)));
  const meals: Record<string, number> = {};
  if (view.settings.askMeals && b.meals && typeof b.meals === "object")
    for (const m of cfg.meals) {
      const n = Math.min(coming, Math.max(0, Math.round(Number((b.meals as Record<string, unknown>)[m.id]) || 0)));
      if (n) meals[m.id] = n;
    }
  const now = Date.now();
  const next = sanitizeHousehold(
    {
      ...h,
      status,
      coming,
      comingKids,
      meals: view.settings.askMeals ? meals : h.meals,
      guestNote: cfg.rsvp.askNote ? cleanText(b.note, NOTE_MAX, true) : h.guestNote,
      rsvpAt: now,
      rsvpBy: "guest",
      // a guest who said "coming" with more people than invited (allowed by the hosts) raises the invited count
      invited: Math.max(h.invited, coming),
    },
    cfg,
    h.id,
  );
  next.seats = h.seats;
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE households SET data = ?, updated_at = ? WHERE id = ? AND event_id = ?").bind(store(next), now, h.id, ev.id),
    c.env.DB.prepare("INSERT INTO rsvp_log (event_id, household_id, at, by, status, coming) VALUES (?,?,?,?,?,?)").bind(ev.id, h.id, now, "guest", status, coming),
    bump(c.env, ev.id),
  ]);
  return c.json(rsvpView(cfg, floor, next));
});

// ------------------------------------------------------------------ public: "find my table" element

const nameKey = (s: string) => s.normalize("NFKC").replace(/["'״׳`.-]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Needs first AND last name; answers only name + table, at most 3 matches. */
planner.get("/e/:code/find-table", async (c) => {
  const ev = await eventByCode(c.env, c.req.param("code")!);
  const design = parseDesign(ev.design);
  const on = [...design.before, ...design.after].some((b) => b.type === "findTable" && !b.hidden);
  if (!on) throw new HTTPException(403, { message: "board_closed" });
  await rateLimit(c.env, `findtable:${ev.id}:${ip(c)}`, 40, 3600_000);
  const first = nameKey(c.req.query("first") ?? "");
  const last = nameKey(c.req.query("last") ?? "");
  if (first.length < 2 || last.length < 2) throw new HTTPException(400, { message: "find_table_name" });
  const row = await plannerRow(c.env, ev);
  const cfg = configOf(row, ev);
  if (!cfg.seatingPublished) return c.json({ published: false, matches: [] });
  const floor = floorOf(row);
  const byId = new Map(tables(floor).map((t) => [t.id, t]));
  const hs = await loadHouseholds(c.env, ev.id, cfg, floor);
  const matches = hs
    .filter((h) => h.status !== "not_coming" && h.seats.length)
    .filter((h) => {
      const l = nameKey(h.last);
      const firsts = [h.first, ...h.companions].map(nameKey);
      const lastOk = l === last || (l.length > 2 && l.startsWith(last) && last.length >= 3);
      const companionFull = h.companions.some((n) => nameKey(n) === `${first} ${last}`);
      return (lastOk && firsts.some((f) => f === first || f.split(" ")[0] === first)) || companionFull;
    })
    .slice(0, 3)
    .map((h) => ({ name: `${h.first} ${h.last}`.trim(), table: tableLabelOf(h, byId) }));
  return c.json({ published: true, matches });
});
