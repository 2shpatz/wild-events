// Unit checks for the pure guest-planner logic (shared/guests.ts). Run: npm run test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCell,
  autoSeat,
  computeStats,
  defaultConfig,
  emptyFloor,
  emptyHousehold,
  fillTemplate,
  guessColumns,
  parseStatus,
  parseTable,
  sanitizeConfig,
  sanitizeFloor,
  sanitizeHousehold,
  splitFullName,
  waNumber,
  budgetSummary,
  type FloorItem,
  type Household,
} from "../../shared/guests.ts";

const cfg = defaultConfig("wedding");
const table = (id: string, seats: number, extra: Partial<FloorItem> = {}): FloorItem => ({
  id, kind: "table", shape: "round", x: 0, y: 0, w: 150, h: 150, rot: 0, seats, label: id, color: null, tableKind: "regular", audience: "mixed", text: "", fontSize: 32, locked: false, ...extra,
});
const hh = (id: string, p: Partial<Household>): Household => ({ ...emptyHousehold(id), ...p });

test("phones -> wa.me numbers", () => {
  assert.equal(waNumber("050-123-4567"), "972501234567");
  assert.equal(waNumber("+972 50 1234567"), "972501234567");
  assert.equal(waNumber("0097250 1234567"), "972501234567");
  assert.equal(waNumber("501234567"), "972501234567");
  assert.equal(waNumber("abc"), "");
});

test("templates fill and drop empty place", () => {
  const out = fillTemplate("שלום {שם}! ל{אירוע}{מקום}.\n{קישור}", { name: "דנה", fullName: "דנה כהן", event: "חתונה", date: "", time: "", place: "", link: "https://x/r/1", table: "" });
  assert.equal(out, "שלום דנה! לחתונה.\nhttps://x/r/1");
  assert.match(fillTemplate("{מקום}", { name: "", fullName: "", event: "", date: "", time: "", place: "גן ורדים", link: "", table: "" }), /בגן ורדים/);
});

test("status words", () => {
  assert.equal(parseStatus("מגיעים"), "coming");
  assert.equal(parseStatus("לא"), "not_coming");
  assert.equal(parseStatus("אולי"), "maybe");
  assert.equal(parseStatus("טרם ענו"), "pending");
  assert.equal(parseStatus("???"), null);
});

test("pasted cells (TSV) and CSV with quotes", () => {
  assert.deepEqual(parseTable("שם\tטלפון\nדנה\t050\n"), [["שם", "טלפון"], ["דנה", "050"]]);
  assert.deepEqual(parseTable('a,b\n"x, y","he said ""hi"""'), [["a", "b"], ["x, y", 'he said "hi"']]);
});

test("column guessing (Hebrew + English + unknown)", () => {
  const g = guessColumns(["שם פרטי", "Last Name", "נייד", "כמות", "חוג"], cfg);
  assert.deepEqual(g.slice(0, 4).map((x) => (x.kind === "field" ? x.key : x.kind)), ["first", "last", "phone", "invited"]);
  assert.equal(g[4].kind, "new");
});

test("applyCell creates unknown circles and parses meals", () => {
  const c = structuredClone(cfg);
  const d: Record<string, unknown> = {};
  applyCell(d, "circle", "חוג ריקוד", c, { tablesByLabel: new Map() });
  assert.ok(c.circles.some((t) => t.name === "חוג ריקוד"));
  applyCell(d, "meals", "2 צמחוני, טבעוני 1", c, { tablesByLabel: new Map() });
  const veg = c.meals.find((m) => m.name === "צמחוני")!;
  const vegan = c.meals.find((m) => m.name === "טבעוני")!;
  assert.deepEqual(d.meals, { [veg.id]: 2, [vegan.id]: 1 });
});

test("full name split", () => {
  assert.deepEqual(splitFullName("דנה לוי כהן"), { first: "דנה לוי", last: "כהן" });
  assert.deepEqual(splitFullName("משפחת כהן"), { first: "משפחת כהן", last: "" });
});

test("sanitize household clamps and drops unknown tags", () => {
  const h = sanitizeHousehold({ first: "  דנה  ", invited: 3, coming: 9, status: "coming", side: "nope", invitedKids: 7 }, cfg, "h1");
  assert.equal(h.first, "דנה");
  assert.equal(h.coming, 3); // not more than invited (allowMore off)
  assert.equal(h.invitedKids, 3);
  assert.equal(h.side, null);
  const no = sanitizeHousehold({ status: "not_coming", coming: 4, invited: 4 }, cfg, "h2");
  assert.equal(no.coming, 0);
});

test("config / floor survive junk", () => {
  assert.equal(sanitizeConfig({ v: 2 }, "general").v, 1);
  const f = sanitizeFloor({ v: 1, items: [{ id: "a", kind: "table", seats: 500 }, { id: "a", kind: "table" }, { id: "b", kind: "hack" }] });
  assert.equal(f.items.length, 2);
  assert.equal(f.items[0].seats, 60);
  assert.equal(f.items[1].kind, "area");
});

test("stats: expected, seats short, over-full tables", () => {
  const floor = { ...emptyFloor(), items: [table("t1", 10), table("t2", 2)] };
  const hs = [
    hh("a", { status: "coming", invited: 4, coming: 4, seats: [{ t: "t1", n: 4 }] }),
    hh("b", { status: "coming", invited: 3, coming: 3, seats: [{ t: "t2", n: 3 }] }),
    hh("c", { status: "maybe", invited: 2 }),
    hh("d", { status: "pending", invited: 10 }),
    hh("e", { status: "not_coming", invited: 5 }),
  ];
  const s = computeStats(hs, floor, cfg);
  assert.equal(s.confirmed, 7);
  assert.equal(s.expected, Math.round(7 + 2 * 0.5 + 10 * 0.85));
  assert.equal(s.toSeat, 9); // confirmed + maybe (default planBy)
  assert.equal(s.seats, 12);
  assert.deepEqual(s.overTables.map((t) => [t.id, t.over]), [["t2", 1]]);
  assert.equal(s.unseatedPeople, 2);
});

test("autoSeat keeps families whole, groups circles, reports leftovers", () => {
  const c = structuredClone(cfg);
  const fam = c.circles[0].id;
  const work = c.circles[2].id;
  const floor = { ...emptyFloor(), items: [table("t1", 10), table("t2", 10), table("t3", 10), table("res", 10, { tableKind: "reserve" })] };
  const hs = [
    hh("f1", { status: "coming", invited: 4, coming: 4, circle: fam }),
    hh("f2", { status: "coming", invited: 5, coming: 5, circle: fam }),
    hh("w1", { status: "coming", invited: 3, coming: 3, circle: work }),
    hh("w2", { status: "coming", invited: 6, coming: 6, circle: work }),
    hh("w3", { status: "coming", invited: 4, coming: 4, circle: work }),
  ];
  const r = autoSeat({ households: hs, all: hs, floor, cfg: c });
  for (const [, seats] of r.moves) assert.equal(seats.length, 1, "a family is not split when it fits");
  const at = (id: string) => r.moves.get(id)?.[0].t;
  assert.equal(at("f1"), at("f2"), "same circle sits together");
  assert.ok(![...r.moves.values()].some((s) => s[0].t === "res"), "reserve tables stay empty");
  assert.equal(r.placedPeople, 22);
  assert.equal(r.leftover.length, 0);
  // too few seats: the rest is reported
  const small = autoSeat({ households: hs, all: hs, floor: { ...floor, items: floor.items.slice(0, 2) }, cfg: c });
  assert.equal(small.placedPeople + small.leftover.reduce((a, l) => a + l.people, 0), 22);
  assert.ok(small.leftover.length >= 1, "20 seats for 22 people");
  // the input was not mutated
  assert.equal(hs[0].seats.length, 0);
});

test("autoSeat splits a family bigger than any table", () => {
  const floor = { ...emptyFloor(), items: [table("t1", 10), table("t2", 10)] };
  const hs = [hh("big", { status: "coming", invited: 14, coming: 14 })];
  const r = autoSeat({ households: hs, all: hs, floor, cfg: { ...cfg, rsvp: { ...cfg.rsvp, allowMore: true } } });
  assert.equal(r.moves.get("big")!.reduce((a, s) => a + s.n, 0), 14);
});

test("budget: per-guest deals, due and overdue payments", () => {
  const today = "2026-11-13";
  const exp = [
    { id: "e1", title: "אולם", vendorId: null, category: "venue", amount: 300, perGuest: true, notes: "", payments: [{ id: "p1", label: "מקדמה", amount: 10000, due: "2026-11-01", paidAt: null, method: null }] },
    { id: "e2", title: "צלם", vendorId: null, category: "photo", amount: 8000, perGuest: false, notes: "", payments: [{ id: "p2", label: "", amount: 4000, due: "2026-11-20", paidAt: null, method: null }, { id: "p3", label: "", amount: 4000, due: null, paidAt: "2026-10-01", method: null }] },
  ];
  const b = budgetSummary(exp, [], 200, { ...cfg, budget: { ...cfg.budget, minGuests: 250, total: 50000 } }, today);
  assert.equal(b.total, 300 * 250 + 8000);
  assert.equal(b.paid, 4000);
  assert.equal(b.overdue.length, 1);
  assert.equal(b.due[0].days, 7);
  assert.equal(b.overBudget, b.total - 50000);
});
