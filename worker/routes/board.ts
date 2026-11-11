/**
 * Guest-writable page elements: the message board ("לוח ברכות") and the checklist.
 * Guests are known by the name they typed + their random device id (sent as X-Device, never returned).
 * What guests may do is decided by the element's settings in the saved design; hosts may always manage.
 */
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../env";
import { cleanName, eventByCode, type EventRow } from "../lib/db";
import { canManage, rateLimit } from "../lib/session";
import { randomId } from "../lib/crypto";
import { CHECKLIST_ITEM_MAX, MAX_CHECKLIST_ITEMS, MESSAGE_MAX, checklistIds, parseDesign, visibleBlock, type ChecklistBlock } from "../../shared/design";
import type { BoardMessage, ChecklistItem } from "../../shared/types";
import { deviceTag } from "../../shared/deviceTag";

export const board = new Hono<AppEnv>();

const PAGE = 50;
const MAX_MESSAGES = 5000;

/** The device id from the X-Device header (same rules as the guest identity), or null. */
function deviceOf(c: Context<AppEnv>): string | null {
  const id = (c.req.header("X-Device") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  return id.length >= 12 ? id : null;
}

function requireDevice(c: Context<AppEnv>): string {
  const id = deviceOf(c);
  if (!id) throw new HTTPException(400, { message: "bad_device" });
  return id;
}

const ip = (c: Context<AppEnv>) => c.req.header("CF-Connecting-IP") || "local";

/** Limits for guests' writes: per phone, and per IP (generous - guests share the venue WiFi). */
async function guestLimits(c: Context<AppEnv>, ev: EventRow, what: string, device: string, perDevice: number, perIp: number) {
  await rateLimit(c.env, `${what}:d:${ev.id}:${device}`, perDevice, 10 * 60_000);
  await rateLimit(c.env, `${what}:ip:${ev.id}:${ip(c)}`, perIp, 3600_000);
}

const json = async (c: Context<AppEnv>) => (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

/** Multi-line guest text: normalized, at most one empty line in a row, trimmed. */
const cleanBody = (v: unknown) =>
  (typeof v === "string" ? v : "").normalize("NFKC").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

async function setup(c: Context<AppEnv>, type: "messages") {
  const ev = await eventByCode(c.env, c.req.param("code")!);
  const manager = await canManage(c, ev.id);
  const block = visibleBlock(parseDesign(ev.design), type);
  // Guests only reach an element that is on the page; hosts can always see and tidy the content.
  if (!block && !manager) throw new HTTPException(403, { message: "board_closed" });
  return { ev, manager, block };
}

// ------------------------------------------------------------------ message board

type MessageRow = { id: string; name: string; body: string; device_id: string; created_at: number };
const toMessage = (r: MessageRow, device: string | null): BoardMessage => ({
  id: r.id,
  name: r.name,
  body: r.body,
  createdAt: r.created_at,
  mine: !!device && r.device_id === device,
  // Salted, so it can't be matched with the tag on the same guest's photos.
  by: deviceTag(`board:${r.device_id}`) ?? "",
});

/** Newest first, PAGE at a time (`before` = createdAt of the last one already shown). */
board.get("/e/:code/messages", async (c) => {
  const { ev } = await setup(c, "messages");
  const before = Number(c.req.query("before")) || 0;
  const res = await c.env.DB.prepare(
    `SELECT id, name, body, device_id, created_at FROM event_messages
      WHERE event_id = ? ${before ? "AND created_at < ?" : ""} ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(...(before ? [ev.id, before, PAGE + 1] : [ev.id, PAGE + 1]))
    .all<MessageRow>();
  const device = deviceOf(c);
  const rows = res.results;
  return c.json({ messages: rows.slice(0, PAGE).map((r) => toMessage(r, device)), more: rows.length > PAGE });
});

board.post("/e/:code/messages", async (c) => {
  const { ev, block } = await setup(c, "messages");
  if (!block) throw new HTTPException(403, { message: "board_closed" });
  const device = requireDevice(c);
  const b = await json(c);
  const name = cleanName(typeof b.name === "string" ? b.name : "", 40);
  if (!name) throw new HTTPException(400, { message: "name_required" });
  const body = cleanBody(b.body);
  if (!body) throw new HTTPException(400, { message: "message_empty" });
  if (body.length > MESSAGE_MAX) throw new HTTPException(400, { message: "message_too_long" });
  await guestLimits(c, ev, "msg", device, 10, 300);
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM event_messages WHERE event_id = ?").bind(ev.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_MESSAGES) throw new HTTPException(409, { message: "board_full" });
  const row: MessageRow = { id: randomId(9), name, body, device_id: device, created_at: Date.now() };
  await c.env.DB.prepare("INSERT INTO event_messages (id, event_id, name, body, device_id, created_at) VALUES (?,?,?,?,?,?)")
    .bind(row.id, ev.id, row.name, row.body, row.device_id, row.created_at)
    .run();
  return c.json({ message: toMessage(row, device) });
});

/** The device that wrote it, or the hosts. */
board.delete("/e/:code/messages/:id", async (c) => {
  const ev = await eventByCode(c.env, c.req.param("code"));
  const row = await c.env.DB.prepare("SELECT device_id FROM event_messages WHERE id = ? AND event_id = ?")
    .bind(c.req.param("id"), ev.id)
    .first<{ device_id: string }>();
  if (!row) return c.json({ ok: true });
  const device = deviceOf(c);
  if (!(device && row.device_id === device) && !(await canManage(c, ev.id))) throw new HTTPException(403, { message: "not_allowed" });
  await c.env.DB.prepare("DELETE FROM event_messages WHERE id = ? AND event_id = ?").bind(c.req.param("id"), ev.id).run();
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ checklist
// A page may hold several checklists; items belong to one by list_id (= the checklist block id).
// Items from before lists existed have list_id NULL and belong to the page's first checklist.

const LIST_RE = /^[a-z0-9]{1,16}$/;

async function listSetup(c: Context<AppEnv>) {
  const ev = await eventByCode(c.env, c.req.param("code")!);
  const listId = c.req.param("list") ?? "";
  if (!LIST_RE.test(listId)) throw new HTTPException(404, { message: "not_found" });
  const manager = await canManage(c, ev.id);
  const design = parseDesign(ev.design);
  const block = [...design.before, ...design.after].find((b): b is ChecklistBlock => b.type === "checklist" && b.id === listId && !b.hidden) ?? null;
  // Guests only reach a list that is on the page; hosts also reach lists of an unsaved draft.
  if (!block && !manager) throw new HTTPException(403, { message: "board_closed" });
  const legacy = checklistIds(design)[0] === listId ? 1 : 0;
  return { ev, manager, block, listId, legacy };
}

type ItemRow = { id: string; text: string; done: number; done_by: string | null; added_by: string | null };
type ListCtx = { ev: EventRow; listId: string; legacy: number };
/** This list's items: list_id matches, or (first list only) the old items without a list. */
const IN_LIST = "event_id = ? AND (list_id = ? OR (list_id IS NULL AND ? = 1))";
const listArgs = (l: ListCtx) => [l.ev.id, l.listId, l.legacy];

async function listItems(c: Context<AppEnv>, l: ListCtx): Promise<ChecklistItem[]> {
  const res = await c.env.DB.prepare(`SELECT id, text, done, done_by, added_by FROM checklist_items WHERE ${IN_LIST} ORDER BY position, created_at`)
    .bind(...listArgs(l))
    .all<ItemRow>();
  return res.results.map((r) => ({ id: r.id, text: r.text, done: !!r.done, doneBy: r.done ? r.done_by : null, addedBy: r.added_by }));
}

const guestName = (v: unknown) => cleanName(typeof v === "string" ? v : "", 40) || null;

board.get("/e/:code/checklist/:list", async (c) => {
  const l = await listSetup(c);
  return c.json({ items: await listItems(c, l) });
});

board.post("/e/:code/checklist/:list", async (c) => {
  const l = await listSetup(c);
  const { ev, manager, block } = l;
  if (!manager && !block?.guestsAdd) throw new HTTPException(403, { message: "not_allowed" });
  const b = await json(c);
  const text = cleanName(typeof b.text === "string" ? b.text : "", CHECKLIST_ITEM_MAX);
  if (!text) throw new HTTPException(400, { message: "item_empty" });
  const device = manager ? deviceOf(c) : requireDevice(c);
  if (!manager) await guestLimits(c, ev, "todo", device!, 30, 600);
  const stats = await c.env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(MAX(position), 0) AS p FROM checklist_items WHERE ${IN_LIST}`)
    .bind(...listArgs(l))
    .first<{ n: number; p: number }>();
  if ((stats?.n ?? 0) >= MAX_CHECKLIST_ITEMS) throw new HTTPException(409, { message: "too_many_items" });
  await c.env.DB.prepare(
    "INSERT INTO checklist_items (id, event_id, list_id, text, position, added_by, device_id, created_at) VALUES (?,?,?,?,?,?,?,?)",
  )
    .bind(randomId(9), ev.id, l.listId, text, (stats?.p ?? 0) + 1, manager ? null : guestName(b.name), device, Date.now())
    .run();
  return c.json({ items: await listItems(c, l) });
});

/** Tick / untick (hosts, or guests when allowed); rename (hosts). */
board.patch("/e/:code/checklist/:list/:id", async (c) => {
  const l = await listSetup(c);
  const { ev, manager, block } = l;
  const b = await json(c);
  const id = c.req.param("id");
  if (typeof b.text === "string") {
    if (!manager) throw new HTTPException(403, { message: "not_allowed" });
    const text = cleanName(b.text, CHECKLIST_ITEM_MAX);
    if (!text) throw new HTTPException(400, { message: "item_empty" });
    await c.env.DB.prepare(`UPDATE checklist_items SET text = ? WHERE id = ? AND ${IN_LIST}`).bind(text, id, ...listArgs(l)).run();
  }
  if (typeof b.done === "boolean") {
    if (!manager && !block?.guestsTick) throw new HTTPException(403, { message: "not_allowed" });
    if (!manager) await guestLimits(c, ev, "tick", requireDevice(c), 120, 1200);
    await c.env.DB.prepare(`UPDATE checklist_items SET done = ?, done_by = ?, done_at = ? WHERE id = ? AND ${IN_LIST}`)
      .bind(b.done ? 1 : 0, b.done && !manager ? guestName(b.name) : null, b.done ? Date.now() : null, id, ...listArgs(l))
      .run();
  }
  return c.json({ items: await listItems(c, l) });
});

board.delete("/e/:code/checklist/:list/:id", async (c) => {
  const l = await listSetup(c);
  const { ev, manager, block } = l;
  if (!manager && !block?.guestsDelete) throw new HTTPException(403, { message: "not_allowed" });
  if (!manager) await guestLimits(c, ev, "todo", requireDevice(c), 30, 600);
  await c.env.DB.prepare(`DELETE FROM checklist_items WHERE id = ? AND ${IN_LIST}`).bind(c.req.param("id"), ...listArgs(l)).run();
  return c.json({ items: await listItems(c, l) });
});

/** New order of the list's items (hosts only). */
board.put("/e/:code/checklist/:list/order", async (c) => {
  const l = await listSetup(c);
  if (!l.manager) throw new HTTPException(403, { message: "not_allowed" });
  const b = await json(c);
  const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x): x is string => typeof x === "string").slice(0, MAX_CHECKLIST_ITEMS);
  if (ids.length) {
    await c.env.DB.batch(
      ids.map((id, i) => c.env.DB.prepare(`UPDATE checklist_items SET position = ? WHERE id = ? AND ${IN_LIST}`).bind(i + 1, id, ...listArgs(l))),
    );
  }
  return c.json({ items: await listItems(c, l) });
});
