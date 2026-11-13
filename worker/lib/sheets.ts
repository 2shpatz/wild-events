/**
 * Two-way sync between the planner's guest list and a Google Sheet the app created in the event's Google account.
 *
 * - Tab "מוזמנים" (sheetId 0): one row per invitation; hidden column A = the invitation id. Columns are matched by
 *   their header text, so the hosts may reorder them; a column the hosts add becomes a new custom field.
 * - Tabs "נותני שירות" (1) and "הוצאות" (2): written from the app on every sync (read only).
 * - 3-way merge per cell: households.snapshot holds the cells as last synced. A cell the sheet changed is taken
 *   (the sheet wins over the app), except RSVP answers a guest gave through their link after the last sync.
 * - Rows deleted in the sheet are deleted in the app, unless many vanish at once: then they are written back and the
 *   hosts confirm in the app (settings key sheet_pending:<event>).
 *
 * Costs per sync: ~4-6 Google calls and a handful of D1 queries (bulk statements over json_each).
 */
import type { Env } from "../env";
import type { EventRow } from "./db";
import { eventRef, eventToken, accountInfo } from "./accounts";
import { GoogleError, a1, driveShare, sheetsBatch, sheetsClear, sheetsCreate, sheetsDisabled, sheetsRead, sheetsTabs, sheetsWrite, type CellValue } from "./google";
import { randomId } from "./crypto";
import { bump, configOf, floorOf, plannerRow } from "../routes/planner";
import {
  FIELDS,
  FIELD,
  GIFT_LABELS,
  GIFT_METHODS,
  PAYMENT_METHOD_LABELS,
  STATUS_LABELS,
  STATUSES,
  VENDOR_CATEGORY_LABELS,
  VENDOR_STATUS_LABELS,
  applyCell,
  cleanText,
  emptyHousehold,
  expenseTotal,
  formatCell,
  newId,
  paidOf,
  partySize,
  sanitizeConfig,
  sanitizeExpense,
  sanitizeHousehold,
  sanitizeVendor,
  tableLabelKey,
  tables,
  visibleFields,
  computeStats,
  type FieldKey,
  type FloorItem,
  type Household,
  type HouseholdDTO,
  type PlannerConfig,
} from "../../shared/guests";
import type { EventType } from "../../shared/types";

const TAB_GUESTS = { sheetId: 0, title: "מוזמנים" };
const TAB_VENDORS = { sheetId: 1, title: "נותני שירות" };
const TAB_EXPENSES = { sheetId: 2, title: "הוצאות" };
const ID_HEADER = "מזהה";
/** More deleted rows than this (and more than this share) waits for the hosts' confirmation. */
const MASS_DELETE = { min: 3, share: 0.2 };
const RSVP_KEYS: FieldKey[] = ["status", "coming", "comingKids", "meals", "guestNote"];

export type SyncResult = { ok: true; created: boolean; pulled: number; added: number; deleted: number; pendingDeletes: number } | { ok: false; error: string };

type Row = { id: string; rsvp_token: string; data: string; sort: number; snapshot: string | null; created_at: number; updated_at: number };
type Column = { key: string; label: string; field?: FieldKey; custom?: string };

const parse = (s: string | null) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};
const cellStr = (v: CellValue | undefined | null) => (v === undefined || v === null ? "" : typeof v === "boolean" ? (v ? "TRUE" : "") : String(v).trim());
const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const colLetter = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

class SheetNoIds extends Error {}

function errorCode(e: unknown): string {
  if (e instanceof SheetNoIds) return "sheet_no_ids";
  if (sheetsDisabled(e)) return "sheets_disabled";
  if (e instanceof GoogleError) {
    if (e.status === 404) return "sheet_missing";
    if (e.needsReauth) return "account_disconnected";
    if (e.status === 403) return "sheet_no_access";
    if (e.status === 429) return "google_rate_limited";
  }
  if (e && typeof e === "object" && "status" in e && (e as { status: number }).status === 401) return "account_disconnected";
  return "google_error";
}

export async function syncSheet(
  env: Env,
  ev: EventRow,
  opts: { create?: boolean; ownerEmail?: string | null; confirmDeletes?: boolean; keepDeleted?: boolean; overwrite?: boolean } = {},
): Promise<SyncResult> {
  let row = await plannerRow(env, ev);
  if (!row.sheet_id && !opts.create) return { ok: false, error: "sheet_missing" };
  const startVersion = row.version;
  try {
    const token = await eventToken(env, ev);
    let created = false;
    if (!row.sheet_id) {
      const s = await sheetsCreate(token, `רשימת אורחים - ${ev.title}`.slice(0, 100), [TAB_GUESTS, TAB_VENDORS, TAB_EXPENSES]);
      // The sheet lives in the event's Google account; the owner logs in with maybe another one: let them edit it.
      const acc = await accountInfo(env, ev.owner_id, eventRef(ev));
      if (opts.ownerEmail && acc.email && opts.ownerEmail.toLowerCase() !== acc.email.toLowerCase()) {
        try {
          await driveShare(token, s.spreadsheetId, opts.ownerEmail);
        } catch (e) {
          console.warn("sheet share failed", e);
        }
      }
      await env.DB.prepare("UPDATE guest_planner SET sheet_id = ?, sheet_url = ?, sheet_error = NULL WHERE event_id = ?").bind(s.spreadsheetId, s.spreadsheetUrl, ev.id).run();
      await env.DB.prepare("UPDATE households SET snapshot = NULL WHERE event_id = ?").bind(ev.id).run();
      row = { ...row, sheet_id: s.spreadsheetId, sheet_url: s.spreadsheetUrl };
      created = true;
    }
    const sheetId = row.sheet_id!;
    const tabs = await sheetsTabs(token, sheetId);
    const tabOf = (t: { sheetId: number; title: string }) => tabs.find((x) => x.sheetId === t.sheetId);
    const missingTabs = [TAB_GUESTS, TAB_VENDORS, TAB_EXPENSES].filter((t) => !tabOf(t));
    if (missingTabs.length) {
      await sheetsBatch(
        token,
        sheetId,
        missingTabs.map((t) => ({ addSheet: { properties: { sheetId: t.sheetId, title: tabs.some((x) => x.title === t.title) ? `${t.title} (${t.sheetId})` : t.title, rightToLeft: true, gridProperties: { frozenRowCount: 1 } } } })),
      );
      tabs.push(...(await sheetsTabs(token, sheetId)).filter((t) => !tabs.some((x) => x.sheetId === t.sheetId)));
    }
    const guestsTab = tabOf(TAB_GUESTS)!.title;
    // overwrite = the hosts chose to rewrite the guests tab from the app (e.g. after the id column was lost)
    const freshGuests = created || !!opts.overwrite || missingTabs.some((t) => t.sheetId === TAB_GUESTS.sheetId);

    // ------------------------------------------------ pull
    const cfg = configOf(row, ev);
    let cfgChanged = false;
    const floor = floorOf(row);
    const tbls = tables(floor);
    const tablesById = new Map(tbls.map((t) => [t.id, t]));
    const tablesByLabel = new Map<string, FloorItem>();
    for (const t of tbls) if (t.label) tablesByLabel.set(tableLabelKey(t.label), t);
    const res = await env.DB.prepare(
      "SELECT id, rsvp_token, data, sort, snapshot, created_at, updated_at FROM households WHERE event_id = ? AND deleted_at IS NULL ORDER BY sort, created_at",
    )
      .bind(ev.id)
      .all<Row>();
    const stored = new Map(res.results.map((r) => [r.id, r]));
    const hh = new Map<string, Household>();
    for (const r of res.results) hh.set(r.id, sanitizeHousehold(parse(r.data), cfg, r.id));

    const values = freshGuests ? [] : await sheetsRead(token, sheetId, a1(guestsTab, "A1:ZZ"));
    const header = (values[0] ?? []).map((v) => cellStr(v));
    // column index -> what it holds
    const sheetCols: (Column | null)[] = header.map((h) => {
      if (norm(h) === norm(ID_HEADER)) return { key: "id", label: ID_HEADER };
      const n = norm(h);
      if (!n) return null;
      const f = FIELDS.find((f) => norm(f.label) === n);
      if (f) return { key: f.key, label: f.label, field: f.key };
      let c = cfg.custom.find((c) => norm(c.label) === n);
      if (!c && cfg.custom.length < 30) {
        // a column the hosts added in the sheet -> a new custom field
        c = { id: newId(), label: cleanText(h, 40), type: "text", options: [] };
        cfg.custom.push(c);
        cfgChanged = true;
      }
      return c ? { key: `c:${c.id}`, label: c.label, custom: c.id } : null;
    });
    const idCol = sheetCols.findIndex((c) => c?.key === "id");
    // Without the id column every row would look new (and be added twice): stop and let the hosts decide.
    if (idCol < 0 && values.length > 1 && res.results.some((r) => r.snapshot)) throw new SheetNoIds();
    const syncedAt = row.sheet_synced_at ?? 0;
    const changed = new Set<string>();
    const added: { h: Household; token: string }[] = [];
    const seen = new Set<string>();
    const sheetOrder: string[] = [];
    let pulled = 0;

    for (const cells of values.slice(1)) {
      const strs = header.map((_, i) => cellStr(cells[i]));
      if (!strs.some((s, i) => s && i !== idCol)) continue; // empty row
      const rid = idCol >= 0 ? strs[idCol] : "";
      const known = rid && hh.has(rid) && !seen.has(rid) ? hh.get(rid)! : null;
      if (known) {
        seen.add(rid);
        sheetOrder.push(rid);
        const snap = (parse(stored.get(rid)!.snapshot) ?? {}) as Record<string, string>;
        const draft = { ...known } as Record<string, unknown>;
        draft.custom = { ...known.custom };
        let touched = false;
        const guestAnsweredSince = known.rsvpBy === "guest" && (known.rsvpAt ?? 0) > syncedAt;
        sheetCols.forEach((col, i) => {
          if (!col || col.key === "id") return;
          const cell = strs[i];
          const before = snap[col.key];
          // unchanged in the sheet since the last sync (or a column the app just added and the hosts left empty)
          if (before === undefined ? cell === "" : cell === before) return;
          if (col.field) {
            if (FIELD[col.field].readOnly) return;
            if (guestAnsweredSince && RSVP_KEYS.includes(col.field)) return;
            const size = partySize({ ...known, ...(draft as Partial<Household>) } as Household, "all");
            if (applyCell(draft, col.field, cell, cfg, { tablesByLabel, partySize: size })) touched = true;
          } else if (col.custom) {
            (draft.custom as Record<string, unknown>)[col.custom] = cell === "" ? null : cell;
            touched = true;
          }
        });
        if (touched) {
          const before = known;
          const h = sanitizeHousehold(draft, cfg, rid);
          h.seats = h.seats.filter((s) => tablesById.has(s.t));
          if (h.status !== before.status || h.coming !== before.coming) {
            h.rsvpAt = Date.now();
            h.rsvpBy = "sheet";
          }
          hh.set(rid, h);
          changed.add(rid);
          pulled++;
        }
      } else if (!rid || seen.has(rid)) {
        // a row typed in the sheet (or a copied row with a duplicate id) -> a new invitation.
        // (A row whose id the app doesn't know was deleted in the app: it is left out of the sheet below.)
        const nid = randomId(9);
        const draft = { ...emptyHousehold(nid) } as Record<string, unknown>;
        draft.custom = {};
        sheetCols.forEach((col, i) => {
          if (!col || col.key === "id" || !strs[i]) return;
          if (col.field) applyCell(draft, col.field, strs[i], cfg, { tablesByLabel, partySize: Number(draft.invited) || 1 });
          else if (col.custom) (draft.custom as Record<string, unknown>)[col.custom] = strs[i];
        });
        const h = sanitizeHousehold(draft, cfg, nid);
        if (!h.first && !h.last) continue;
        if (h.status !== "pending") {
          h.rsvpAt = Date.now();
          h.rsvpBy = "sheet";
        }
        added.push({ h, token: randomId(12) });
        hh.set(nid, h);
        sheetOrder.push(nid);
      }
    }
    // the tags/meals applyCell created for unknown names are now part of the config
    const cfgAfter = sanitizeConfig(cfg, ev.type as EventType);
    if (JSON.stringify(cfgAfter) !== JSON.stringify(configOf(row, ev))) cfgChanged = true;

    // rows that were in the sheet before and are gone now
    const synced = res.results.filter((r) => r.snapshot);
    const gone = freshGuests ? [] : synced.filter((r) => !seen.has(r.id)).map((r) => r.id);
    let deleted: string[] = [];
    let pendingDeletes = 0;
    const pendingKey = `sheet_pending:${ev.id}`;
    const prevPending = new Set<string>((parse((await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(pendingKey).first<{ value: string }>())?.value ?? null) as string[]) ?? []);
    if (opts.confirmDeletes) deleted = [...prevPending].filter((id) => hh.has(id));
    if (gone.length) {
      const mass = gone.length > MASS_DELETE.min && gone.length > synced.length * MASS_DELETE.share;
      if (mass || opts.keepDeleted) {
        // written back below; the hosts decide in the app
        for (const id of gone) prevPending.add(id);
      } else deleted.push(...gone);
    }
    if (opts.keepDeleted) prevPending.clear();
    for (const id of deleted) {
      hh.delete(id);
      prevPending.delete(id);
    }
    pendingDeletes = prevPending.size;

    // ------------------------------------------------ push
    // keep the sheet's column order; add the app's visible columns that are missing at the end
    const cols: Column[] = [{ key: "id", label: ID_HEADER }];
    // (the id column always goes back to A, hidden)
    for (const c of sheetCols) if (c && c.key !== "id" && !cols.some((x) => x.key === c.key)) cols.push(c);
    for (const f of visibleFields(cfgAfter)) if (!cols.some((x) => x.key === f.key)) cols.push({ key: f.key, label: f.label, field: f.key });
    for (const c of cfgAfter.custom) if (!cols.some((x) => x.key === `c:${c.id}`)) cols.push({ key: `c:${c.id}`, label: c.label, custom: c.id });
    // renamed in the app -> new header text
    for (const c of cols) {
      if (c.field) c.label = FIELD[c.field].label;
      else if (c.custom) c.label = cfgAfter.custom.find((x) => x.id === c.custom)?.label ?? c.label;
    }
    const liveCols = cols.filter((c) => !c.custom || cfgAfter.custom.some((x) => x.id === c.custom));

    const origin = env.CANONICAL_ORIGIN || "";
    const link = (t: string) => (origin ? `${origin.replace(/\/$/, "")}/${ev.code}/r/${t}` : `/${ev.code}/r/${t}`);
    const order = [...sheetOrder.filter((id) => hh.has(id))];
    for (const r of res.results) if (hh.has(r.id) && !order.includes(r.id)) order.push(r.id);
    const tokenOf = new Map<string, string>([...res.results.map((r) => [r.id, r.rsvp_token] as const), ...added.map((a) => [a.h.id, a.token] as const)]);
    const snapshots: { id: string; snapshot: string }[] = [];
    const guestRows: CellValue[][] = [liveCols.map((c) => c.label)];
    for (const id of order) {
      const h = hh.get(id)!;
      const dto = { ...h, token: tokenOf.get(id)!, sort: 0, createdAt: 0, updatedAt: 0 } as HouseholdDTO;
      const snap: Record<string, string> = {};
      const line = liveCols.map((c) => {
        let v: CellValue;
        if (c.key === "id") v = id;
        else if (c.field) v = formatCell(c.field, dto, cfgAfter, { tables: tablesById, link });
        else {
          const x = h.custom[c.custom!];
          v = x === null || x === undefined ? "" : typeof x === "boolean" ? (x ? "כן" : "") : x;
        }
        if (c.key !== "id") snap[c.key] = cellStr(v);
        return v;
      });
      snapshots.push({ id, snapshot: JSON.stringify(snap) });
      guestRows.push(line);
    }

    // read-only tabs
    const rec = await env.DB.prepare("SELECT kind, id, data FROM planner_records WHERE event_id = ? AND deleted_at IS NULL ORDER BY sort, created_at")
      .bind(ev.id)
      .all<{ kind: string; id: string; data: string }>();
    const note = "הלשונית מתעדכנת מהאתר. שינויים כאן לא יישמרו.";
    const vendorRows: CellValue[][] = [["תחום", "שם", "איש קשר", "טלפון", "אימייל", "אתר", "כתובת", "סטטוס", "שעת הגעה", "הערות"]];
    const vendorName = new Map<string, string>();
    for (const r of rec.results.filter((r) => r.kind === "vendor")) {
      const v = sanitizeVendor(parse(r.data), r.id);
      vendorName.set(r.id, v.name);
      vendorRows.push([VENDOR_CATEGORY_LABELS[v.category], v.name, v.contact, v.phone, v.email, v.website, v.address, VENDOR_STATUS_LABELS[v.status], v.arrival ?? "", v.notes]);
    }
    vendorRows.push([], [note]);
    const stats = computeStats([...hh.values()], floor, cfgAfter);
    const expenseRows: CellValue[][] = [["הוצאה", "נותן שירות", "סה\"כ", "שולם", "יתרה", "תשלום הבא", "סכום", "אמצעי", "הערות"]];
    for (const r of rec.results.filter((r) => r.kind === "expense")) {
      const e = sanitizeExpense(parse(r.data), r.id);
      const total = expenseTotal(e, stats.expected, cfgAfter.budget.minGuests);
      const paid = paidOf(e);
      const next = e.payments.filter((p) => !p.paidAt).sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9"))[0];
      expenseRows.push([
        e.title,
        e.vendorId ? vendorName.get(e.vendorId) ?? "" : "",
        total,
        paid,
        total - paid,
        next?.due ?? "",
        next?.amount ?? "",
        next?.method ? PAYMENT_METHOD_LABELS[next.method] : "",
        e.notes,
      ]);
    }
    expenseRows.push([], [note]);

    const vendorsTab = tabOf(TAB_VENDORS)!.title;
    const expensesTab = tabOf(TAB_EXPENSES)!.title;
    await sheetsClear(token, sheetId, [
      a1(guestsTab, `A${guestRows.length + 1}:ZZ`),
      ...(header.length > liveCols.length ? [a1(guestsTab, `${colLetter(liveCols.length)}1:ZZ`)] : []),
      a1(vendorsTab, "A1:ZZ"),
      a1(expensesTab, "A1:ZZ"),
    ]);
    await sheetsWrite(token, sheetId, [
      { range: a1(guestsTab, "A1"), values: guestRows },
      { range: a1(vendorsTab, "A1"), values: vendorRows },
      { range: a1(expensesTab, "A1"), values: expenseRows },
    ]);
    await formatSheet(env, ev.id, token, sheetId, liveCols, cfgAfter, created || missingTabs.length > 0);

    // ------------------------------------------------ store
    const now = Date.now();
    const stmts: D1PreparedStatement[] = [];
    const store = (h: Household) => {
      const { id: _i, ...rest } = h;
      void _i;
      return JSON.stringify(rest);
    };
    if (cfgChanged) stmts.push(env.DB.prepare("UPDATE guest_planner SET config = ? WHERE event_id = ?").bind(JSON.stringify(cfgAfter), ev.id));
    if (added.length) {
      const last = Math.max(0, ...res.results.map((r) => r.sort));
      stmts.push(
        env.DB.prepare(
          `INSERT INTO households (id, event_id, rsvp_token, data, sort, created_at, updated_at)
           SELECT json_extract(j.value, '$.id'), ?1, json_extract(j.value, '$.token'), json_extract(j.value, '$.data'), json_extract(j.value, '$.sort'), ?2, ?2 FROM json_each(?3) j`,
        ).bind(ev.id, now, JSON.stringify(added.map((a, i) => ({ id: a.h.id, token: a.token, data: store(a.h), sort: last + 1 + i })))),
      );
    }
    if (changed.size) {
      stmts.push(
        env.DB.prepare(
          `UPDATE households SET data = json_extract(j.value, '$.data'), updated_at = ?1 FROM json_each(?2) j
            WHERE households.id = json_extract(j.value, '$.id') AND households.event_id = ?3`,
        ).bind(now, JSON.stringify([...changed].filter((id) => hh.has(id)).map((id) => ({ id, data: store(hh.get(id)!) }))), ev.id),
      );
      const log = [...changed].filter((id) => hh.has(id) && hh.get(id)!.rsvpBy === "sheet" && hh.get(id)!.rsvpAt! >= now - 60_000);
      if (log.length)
        stmts.push(
          env.DB.prepare(
            `INSERT INTO rsvp_log (event_id, household_id, at, by, status, coming)
             SELECT ?1, json_extract(j.value, '$.id'), ?2, 'sheet', json_extract(j.value, '$.status'), json_extract(j.value, '$.coming') FROM json_each(?3) j`,
          ).bind(ev.id, now, JSON.stringify(log.map((id) => ({ id, status: hh.get(id)!.status, coming: hh.get(id)!.coming })))),
        );
    }
    if (deleted.length)
      stmts.push(
        env.DB.prepare("UPDATE households SET deleted_at = ?1, snapshot = NULL FROM json_each(?2) j WHERE households.id = j.value AND households.event_id = ?3").bind(now, JSON.stringify(deleted), ev.id),
      );
    stmts.push(
      env.DB.prepare("UPDATE households SET snapshot = json_extract(j.value, '$.snapshot') FROM json_each(?1) j WHERE households.id = json_extract(j.value, '$.id') AND households.event_id = ?2").bind(
        JSON.stringify(snapshots),
        ev.id,
      ),
    );
    stmts.push(
      pendingDeletes
        ? env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(pendingKey, JSON.stringify([...prevPending]))
        : env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(pendingKey),
    );
    if (cfgChanged || added.length || changed.size || deleted.length) stmts.push(bump(env, ev.id));
    // still behind when someone changed something while this sync ran
    stmts.push(
      env.DB.prepare(
        "UPDATE guest_planner SET sheet_synced_at = ?1, sheet_error = NULL, sheet_dirty = CASE WHEN version <= ?2 + ?3 THEN 0 ELSE 1 END WHERE event_id = ?4",
      ).bind(now, startVersion, cfgChanged || added.length || changed.size || deleted.length ? 1 : 0, ev.id),
    );
    await env.DB.batch(stmts);
    return { ok: true, created, pulled, added: added.length, deleted: deleted.length, pendingDeletes };
  } catch (e) {
    const code = errorCode(e);
    console.warn("sheet sync failed", ev.id, e);
    // a sheet the hosts deleted from Drive: forget it, so the next "connect" creates a new one
    if (code === "sheet_missing")
      await env.DB.prepare("UPDATE guest_planner SET sheet_id = NULL, sheet_url = NULL, sheet_error = ?, sheet_dirty = 0 WHERE event_id = ?").bind(code, ev.id).run();
    else await env.DB.prepare("UPDATE guest_planner SET sheet_error = ? WHERE event_id = ?").bind(code, ev.id).run();
    return { ok: false, error: code };
  }
}

/**
 * Looks of the guests tab: bold header, hidden id column, drop-down lists for status / side / circle / gift method.
 * Sent only when the columns or the lists changed (a fingerprint in settings), or for a new sheet.
 */
async function formatSheet(env: Env, eventId: string, token: string, sheetId: string, cols: Column[], cfg: PlannerConfig, fresh: boolean) {
  const lists: { col: number; values: string[] }[] = [];
  cols.forEach((c, i) => {
    if (c.field === "status") lists.push({ col: i, values: STATUSES.map((s) => STATUS_LABELS[s]) });
    if (c.field === "side" && cfg.sides.length) lists.push({ col: i, values: cfg.sides.map((s) => s.name) });
    if (c.field === "circle" && cfg.circles.length) lists.push({ col: i, values: cfg.circles.map((s) => s.name) });
    if (c.field === "giftMethod") lists.push({ col: i, values: GIFT_METHODS.map((g) => GIFT_LABELS[g]) });
    if (c.field === "priority") lists.push({ col: i, values: ["א", "ב"] });
    if (c.field === "thanked") lists.push({ col: i, values: ["כן"] });
    const cf = c.custom ? cfg.custom.find((x) => x.id === c.custom) : null;
    if (cf?.type === "choice" && cf.options.length) lists.push({ col: i, values: cf.options });
    if (cf?.type === "checkbox") lists.push({ col: i, values: ["כן"] });
  });
  const fingerprint = JSON.stringify([cols.map((c) => c.key), lists]);
  const key = `sheet_fmt:${eventId}`;
  const prev = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  if (!fresh && prev?.value === fingerprint) return;
  const g = TAB_GUESTS.sheetId;
  const requests: unknown[] = [
    // clear old drop-downs first (columns may have moved)
    { setDataValidation: { range: { sheetId: g, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: Math.max(cols.length, 26) } } },
    ...lists.map((l) => ({
      setDataValidation: {
        range: { sheetId: g, startRowIndex: 1, startColumnIndex: l.col, endColumnIndex: l.col + 1 },
        rule: { condition: { type: "ONE_OF_LIST", values: l.values.slice(0, 500).map((v) => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false },
      },
    })),
    {
      repeatCell: {
        range: { sheetId: g, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.93, green: 0.93, blue: 0.96 } } },
        fields: "userEnteredFormat(textFormat,backgroundColor)",
      },
    },
    { updateDimensionProperties: { range: { sheetId: g, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
  ];
  if (fresh) {
    requests.push(
      { addProtectedRange: { protectedRange: { range: { sheetId: g, startColumnIndex: 0, endColumnIndex: 1 }, description: "מזהה השורה - לא לשנות", warningOnly: true } } },
      ...[1, 2].map((sid) => ({
        repeatCell: {
          range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: "userEnteredFormat(textFormat)",
        },
      })),
    );
  }
  await sheetsBatch(token, sheetId, requests);
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, fingerprint).run();
}

/** Cron: push the sheets that are behind (guests answered while nobody had the planner open). */
export async function syncDirtySheets(env: Env, max = 3) {
  const res = await env.DB.prepare(
    `SELECT e.* FROM guest_planner g JOIN events e ON e.id = g.event_id
      WHERE g.sheet_dirty = 1 AND g.sheet_id IS NOT NULL AND e.deleted = 0 AND e.migrating IS NULL
        AND (g.sheet_error IS NULL OR g.sheet_error IN ('google_error','google_rate_limited'))
        AND (g.sheet_synced_at IS NULL OR g.sheet_synced_at < ?)
      ORDER BY g.updated_at LIMIT ?`,
  )
    .bind(Date.now() - 5 * 60_000, max)
    .all<EventRow>();
  for (const ev of res.results) {
    try {
      await syncSheet(env, ev);
    } catch (e) {
      console.warn("cron sheet sync failed", ev.id, e);
    }
  }
}
