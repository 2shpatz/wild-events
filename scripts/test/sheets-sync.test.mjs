// Two-way Google Sheets sync (worker/lib/sheets.ts) against a fake Sheets API and an in-memory SQLite "D1".
// The real Worker code is bundled with esbuild (from Vite's dependencies); nothing talks to Google.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { bundle, d1 } from "./harness.mjs";

const { syncSheet, encrypt } = await bundle(`export { syncSheet } from "./worker/lib/sheets.ts"; export { encrypt } from "./worker/lib/crypto.ts";`);

// ------------------------------------------------ fake Google Sheets
const colIdx = (letters) => [...letters].reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
function parseRange(r) {
  const m = /^'((?:[^']|'')+)'!([A-Z]+)(\d+)(?::([A-Z]+)(\d+)?)?$/.exec(r);
  if (!m) throw new Error("bad range " + r);
  return { tab: m[1].replace(/''/g, "'"), col: colIdx(m[2]), row: Number(m[3]) - 1 };
}
function fakeSheets() {
  const files = new Map(); // id -> { tabs: [{sheetId,title,values}] }
  const calls = [];
  let n = 0;
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fetchMock = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push(`${method} ${u.pathname}`);
    if (u.hostname === "www.googleapis.com" && u.pathname.includes("/permissions")) return json({ id: "perm" });
    if (u.hostname !== "sheets.googleapis.com") return json({ error: { message: "unexpected " + url } }, 500);
    const path = decodeURIComponent(u.pathname.replace("/v4/spreadsheets", ""));
    if (method === "POST" && path === "") {
      const id = `sheet${++n}`;
      files.set(id, { tabs: body.sheets.map((s) => ({ sheetId: s.properties.sheetId, title: s.properties.title, values: [] })) });
      return json({ spreadsheetId: id, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}` });
    }
    const m = /^\/([^/:]+)(.*)$/.exec(path);
    const file = files.get(m[1]);
    if (!file) return json({ error: { message: "not found", status: "NOT_FOUND" } }, 404);
    const rest = m[2];
    const tab = (title) => file.tabs.find((t) => t.title === title);
    if (method === "GET" && rest === "") return json({ sheets: file.tabs.map((t) => ({ properties: { sheetId: t.sheetId, title: t.title } })) });
    if (method === "GET" && rest.startsWith("/values/")) {
      const r = parseRange(rest.slice(8));
      const vals = tab(r.tab).values.map((row) => {
        const out = [...row];
        while (out.length && (out[out.length - 1] === "" || out[out.length - 1] == null)) out.pop();
        return out;
      });
      while (vals.length && !vals[vals.length - 1].length) vals.pop();
      return json({ values: vals });
    }
    if (method === "POST" && rest === "/values:batchClear") {
      for (const range of body.ranges) {
        const r = parseRange(range);
        const t = tab(r.tab);
        t.values.forEach((row, i) => {
          if (i >= r.row) for (let c = r.col; c < row.length; c++) row[c] = "";
        });
      }
      return json({});
    }
    if (method === "POST" && rest === "/values:batchUpdate") {
      for (const d of body.data) {
        const r = parseRange(d.range);
        const t = tab(r.tab);
        d.values.forEach((line, i) => {
          const row = (t.values[r.row + i] ??= []);
          line.forEach((v, j) => (row[r.col + j] = v));
        });
      }
      return json({});
    }
    if (method === "POST" && rest === ":batchUpdate") {
      for (const q of body.requests) if (q.addSheet) file.tabs.push({ sheetId: q.addSheet.properties.sheetId, title: q.addSheet.properties.title, values: [] });
      return json({});
    }
    return json({ error: { message: "unhandled " + method + " " + path } }, 500);
  };
  return { files, calls, fetchMock };
}

// ------------------------------------------------ fixture
const KEY = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("base64url");
async function setup() {
  const DB = d1();
  const env = { DB, TOKEN_ENC_KEY: KEY, SESSION_SECRET: "s", SETUP_TOKEN: "x", CANONICAL_ORIGIN: "https://site.test" };
  const tok = await encrypt(KEY, "access");
  DB.raw.prepare("INSERT INTO owners (id, google_sub, email, refresh_token_enc, access_token_enc, access_expires, created_at) VALUES ('o1','sub1','owner@test', ?, ?, ?, 0)").run(tok, tok, Date.now() + 3600_000);
  DB.raw.prepare("INSERT INTO events (id, owner_id, code, title, type, theme, created_at) VALUES ('e1','o1','demo','נועה ואיתי','wedding','wedding',0)").run();
  const ev = DB.raw.prepare("SELECT * FROM events WHERE id='e1'").get();
  const sides = [{ id: "sideA", name: "צד הכלה", color: "#2563eb" }, { id: "sideB", name: "צד החתן", color: "#ea580c" }];
  const circles = [{ id: "fam", name: "משפחה", color: "#7c3aed" }];
  const config = { v: 1, onboarded: true, sides, circles, hidden: [], custom: [], meals: [], turnoutPct: 85, spareSeats: 0, planBy: "confirmed_maybe", rsvp: { open: true }, budget: {}, seatingPublished: false };
  DB.raw.prepare("INSERT INTO guest_planner (event_id, config, updated_at) VALUES ('e1', ?, 0)").run(JSON.stringify(config));
  const add = (id, data, sort) =>
    DB.raw.prepare("INSERT INTO households (id, event_id, rsvp_token, data, sort, created_at, updated_at) VALUES (?, 'e1', ?, ?, ?, 0, 0)").run(id, `tok${id}`.padEnd(16, "x"), JSON.stringify(data), sort);
  add("h1", { first: "דנה", last: "כהן", phone: "0501111111", invited: 2, status: "pending", side: "sideA", circle: "fam" }, 1);
  add("h2", { first: "יוסי", last: "לוי", phone: "0502222222", invited: 3, status: "pending", side: "sideB" }, 2);
  add("h3", { first: "רון", last: "בר", invited: 1, status: "pending" }, 3);
  return { env, ev, DB, add };
}
const guests = (f) => [...f.files.values()][0].tabs.find((t) => t.sheetId === 0).values.filter((r) => r.some((c) => c !== "" && c != null));
const col = (rows, label) => rows[0].indexOf(label);
const hh = (DB, id) => {
  const r = DB.raw.prepare("SELECT data, deleted_at FROM households WHERE id = ?").get(id);
  return r ? { ...JSON.parse(r.data), deleted: r.deleted_at != null } : null;
};

test("create, pull edits / new rows / new columns / deletes, push app changes", async () => {
  const { env, ev, DB } = await setup();
  const f = fakeSheets();
  globalThis.fetch = f.fetchMock;

  let r = await syncSheet(env, ev, { create: true, ownerEmail: "other@test" });
  assert.equal(r.ok, true, JSON.stringify(r));
  let rows = guests(f);
  assert.equal(rows[0][0], "מזהה");
  assert.equal(rows.length, 4, "header + 3 households");
  assert.deepEqual(rows.slice(1).map((x) => x[0]), ["h1", "h2", "h3"]);
  assert.equal(rows[1][col(rows, "טלפון")], "0501111111", "phone stays text");
  assert.equal(rows[1][col(rows, "צד")], "צד הכלה");
  assert.match(String(rows[1][col(rows, "קישור אישי")]), /^https:\/\/site\.test\/demo\/r\//);
  assert.ok(f.calls.some((c) => c.includes("/permissions")), "shared with the owner's other account");

  // --- the hosts edit the sheet
  const tab = [...f.files.values()][0].tabs[0].values;
  const st = col(rows, "סטטוס");
  tab[1][st] = "מגיע"; // h1 coming
  tab[1][col(rows, "מספר מגיעים")] = 2;
  tab[0].push("הסעה"); // a new column
  tab[2][tab[0].length - 1] = "כן"; // h2 needs a ride
  tab.splice(3, 1); // h3 row deleted
  tab.push(["", "מיכל", "אבן", "", "", "צד החתן", "חברים מהצבא"]); // a new row (unknown circle name)
  r = await syncSheet(env, ev);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.added, 1);
  assert.equal(r.deleted, 1);
  assert.equal(hh(DB, "h1").status, "coming");
  assert.equal(hh(DB, "h1").coming, 2);
  assert.equal(hh(DB, "h1").rsvpBy, "sheet");
  assert.equal(hh(DB, "h3").deleted, true);
  const cfg = JSON.parse(DB.raw.prepare("SELECT config FROM guest_planner").get().config);
  const ride = cfg.custom.find((c) => c.label === "הסעה");
  assert.ok(ride, "new sheet column became a custom field");
  assert.equal(hh(DB, "h2").custom[ride.id], "כן");
  assert.ok(cfg.circles.some((c) => c.name === "חברים מהצבא"), "unknown circle created");
  const fresh = DB.raw.prepare("SELECT id, data FROM households WHERE deleted_at IS NULL AND id NOT IN ('h1','h2')").all();
  assert.equal(fresh.length, 1);
  assert.equal(JSON.parse(fresh[0].data).first, "מיכל");
  rows = guests(f);
  assert.equal(rows.length, 4, "header + h1, h2, new row");
  assert.ok(rows.slice(1).every((x) => x[0]), "every row has its id written back");
  assert.equal(rows[0].filter((h) => h === "הסעה").length, 1, "the custom column is kept once");
  const logs = DB.raw.prepare("SELECT by, status FROM rsvp_log").all();
  assert.ok(logs.some((l) => l.by === "sheet" && l.status === "coming"));

  // --- a change in the app goes to the sheet; an unchanged sync pulls nothing
  const h2 = hh(DB, "h2");
  DB.raw.prepare("UPDATE households SET data = ? WHERE id = 'h2'").run(JSON.stringify({ ...h2, phone: "0549999999" }));
  r = await syncSheet(env, ev);
  assert.equal(r.pulled, 0);
  rows = guests(f);
  const h2row = rows.find((x) => x[0] === "h2");
  assert.equal(h2row[col(rows, "טלפון")], "0549999999");

  // --- conflict: a guest answered through the link after the last sync; the sheet's stale status loses
  const now = Date.now() + 5000;
  DB.raw.prepare("UPDATE households SET data = ? WHERE id = 'h2'").run(JSON.stringify({ ...hh(DB, "h2"), status: "maybe", coming: 3, rsvpBy: "guest", rsvpAt: now }));
  const tab2 = [...f.files.values()][0].tabs[0].values;
  const i2 = tab2.findIndex((x) => x[0] === "h2");
  tab2[i2][col(rows, "סטטוס")] = "לא מגיע";
  tab2[i2][col(rows, "הערות")] = "התקשרו";
  await syncSheet(env, ev);
  assert.equal(hh(DB, "h2").status, "maybe", "guest's own answer wins");
  assert.equal(hh(DB, "h2").notes, "התקשרו", "other cells from the sheet still apply");
  rows = guests(f);
  assert.equal(rows.find((x) => x[0] === "h2")[col(rows, "סטטוס")], "אולי", "sheet shows the guest's answer again");

  // --- the hosts reorder columns: still matched by header
  const t3 = [...f.files.values()][0].tabs[0].values;
  const a = col(rows, "שם פרטי");
  const b = col(rows, "שם משפחה");
  for (const line of t3) [line[a], line[b]] = [line[b], line[a]];
  t3[t3.findIndex((x) => x[0] === "h1")][a] = "כהן-לוי"; // now under "שם משפחה"
  await syncSheet(env, ev);
  assert.equal(hh(DB, "h1").last, "כהן-לוי");
  assert.equal(hh(DB, "h1").first, "דנה");
});

test("many rows deleted at once wait for confirmation; restore + delete keep working", async () => {
  const { env, ev, DB, add } = await setup();
  for (let i = 4; i <= 12; i++) add(`h${i}`, { first: `אורח${i}`, last: "ט", invited: 1 }, i);
  const f = fakeSheets();
  globalThis.fetch = f.fetchMock;
  await syncSheet(env, ev, { create: true });
  const tab = [...f.files.values()][0].tabs[0].values;
  tab.splice(1, 6); // 6 of 12 rows gone
  let r = await syncSheet(env, ev);
  assert.equal(r.deleted, 0);
  assert.equal(r.pendingDeletes, 6);
  assert.equal(guests(f).length, 13, "rows written back to the sheet");
  r = await syncSheet(env, ev, { confirmDeletes: true });
  assert.equal(r.deleted, 6);
  assert.equal(r.pendingDeletes, 0);
  assert.equal(guests(f).length, 7);
  // restored in the app -> back in the sheet, not deleted again
  DB.raw.prepare("UPDATE households SET deleted_at = NULL WHERE id = 'h1'").run();
  r = await syncSheet(env, ev);
  assert.equal(r.deleted, 0);
  assert.equal(hh(DB, "h1").deleted, false);
  assert.ok(guests(f).some((x) => x[0] === "h1"));
});

test("lost id column stops the sync instead of duplicating; overwrite repairs", async () => {
  const { env, ev, DB } = await setup();
  const f = fakeSheets();
  globalThis.fetch = f.fetchMock;
  await syncSheet(env, ev, { create: true });
  const tab = [...f.files.values()][0].tabs[0].values;
  for (const line of tab) line.shift(); // column A deleted
  let r = await syncSheet(env, ev);
  assert.equal(r.ok, false);
  assert.equal(r.error, "sheet_no_ids");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM households WHERE deleted_at IS NULL").get().n, 3, "nothing duplicated");
  r = await syncSheet(env, ev, { overwrite: true });
  assert.equal(r.ok, true);
  assert.deepEqual(guests(f).slice(1).map((x) => x[0]), ["h1", "h2", "h3"]);
  assert.equal(DB.raw.prepare("SELECT sheet_error FROM guest_planner").get().sheet_error, null);
});

test("Sheets API disabled -> friendly error code, planner untouched", async () => {
  const { env, ev, DB } = await setup();
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED", message: "Google Sheets API has not been used in project 1 before or it is disabled." } }), { status: 403 });
  const r = await syncSheet(env, ev, { create: true });
  assert.equal(r.ok, false);
  assert.equal(r.error, "sheets_disabled");
  assert.equal(DB.raw.prepare("SELECT sheet_error FROM guest_planner").get().sheet_error, "sheets_disabled");
});
