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
import { CHECKLIST_ITEM_MAX, MAX_CHECKLIST_ITEMS, MESSAGE_MAX, parseDesign, visibleBlock } from "../../shared/design";
import type { BoardMessage, ChecklistItem } from "../../shared/types";

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

async function setup<T extends "messages" | "checklist">(c: Context<AppEnv>, type: T) {
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

type ItemRow = { id: string; text: string; done: number; done_by: string | null; added_by: string | null };

async function listItems(c: Context<AppEnv>, eventId: string): Promise<ChecklistItem[]> {
  const res = await c.env.DB.prepare(
    "SELECT id, text, done, done_by, added_by FROM checklist_items WHERE event_id = ? ORDER BY position, created_at",
  )
    .bind(eventId)
    .all<ItemRow>();
  return res.results.map((r) => ({ id: r.id, text: r.text, done: !!r.done, doneBy: r.done ? r.done_by : null, addedBy: r.added_by }));
}

const guestName = (v: unknown) => cleanName(typeof v === "string" ? v : "", 40) || null;

board.get("/e/:code/checklist", async (c) => {
  const { ev } = await setup(c, "checklist");
  return c.json({ items: await listItems(c, ev.id) });
});

board.post("/e/:code/checklist", async (c) => {
  const { ev, manager, block } = await setup(c, "checklist");
  if (!manager && !block?.guestsEdit) throw new HTTPException(403, { message: "not_allowed" });
  const b = await json(c);
  const text = cleanName(typeof b.text === "string" ? b.text : "", CHECKLIST_ITEM_MAX);
  if (!text) throw new HTTPException(400, { message: "item_empty" });
  const device = manager ? deviceOf(c) : requireDevice(c);
  if (!manager) await guestLimits(c, ev, "todo", device!, 30, 600);
  const stats = await c.env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(position), 0) AS p FROM checklist_items WHERE event_id = ?")
    .bind(ev.id)
    .first<{ n: number; p: number }>();
  if ((stats?.n ?? 0) >= MAX_CHECKLIST_ITEMS) throw new HTTPException(409, { message: "too_many_items" });
  await c.env.DB.prepare(
    "INSERT INTO checklist_items (id, event_id, text, position, added_by, device_id, created_at) VALUES (?,?,?,?,?,?,?)",
  )
    .bind(randomId(9), ev.id, text, (stats?.p ?? 0) + 1, manager ? null : guestName(b.name), device, Date.now())
    .run();
  return c.json({ items: await listItems(c, ev.id) });
});

/** Tick / untick (hosts, or guests when allowed); rename (hosts). */
board.patch("/e/:code/checklist/:id", async (c) => {
  const { ev, manager, block } = await setup(c, "checklist");
  const b = await json(c);
  const id = c.req.param("id");
  if (typeof b.text === "string") {
    if (!manager) throw new HTTPException(403, { message: "not_allowed" });
    const text = cleanName(b.text, CHECKLIST_ITEM_MAX);
    if (!text) throw new HTTPException(400, { message: "item_empty" });
    await c.env.DB.prepare("UPDATE checklist_items SET text = ? WHERE id = ? AND event_id = ?").bind(text, id, ev.id).run();
  }
  if (typeof b.done === "boolean") {
    if (!manager && !block?.guestsTick) throw new HTTPException(403, { message: "not_allowed" });
    if (!manager) await guestLimits(c, ev, "tick", requireDevice(c), 120, 1200);
    await c.env.DB.prepare("UPDATE checklist_items SET done = ?, done_by = ?, done_at = ? WHERE id = ? AND event_id = ?")
      .bind(b.done ? 1 : 0, b.done && !manager ? guestName(b.name) : null, b.done ? Date.now() : null, id, ev.id)
      .run();
  }
  return c.json({ items: await listItems(c, ev.id) });
});

board.delete("/e/:code/checklist/:id", async (c) => {
  const { ev, manager, block } = await setup(c, "checklist");
  if (!manager && !block?.guestsEdit) throw new HTTPException(403, { message: "not_allowed" });
  if (!manager) await guestLimits(c, ev, "todo", requireDevice(c), 30, 600);
  await c.env.DB.prepare("DELETE FROM checklist_items WHERE id = ? AND event_id = ?").bind(c.req.param("id"), ev.id).run();
  return c.json({ items: await listItems(c, ev.id) });
});

/** New order of all the items (hosts only). */
board.put("/e/:code/checklist/order", async (c) => {
  const { ev, manager } = await setup(c, "checklist");
  if (!manager) throw new HTTPException(403, { message: "not_allowed" });
  const b = await json(c);
  const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x): x is string => typeof x === "string").slice(0, MAX_CHECKLIST_ITEMS);
  if (ids.length) {
    await c.env.DB.batch(
      ids.map((id, i) => c.env.DB.prepare("UPDATE checklist_items SET position = ? WHERE id = ? AND event_id = ?").bind(i + 1, id, ev.id)),
    );
  }
  return c.json({ items: await listItems(c, ev.id) });
});
