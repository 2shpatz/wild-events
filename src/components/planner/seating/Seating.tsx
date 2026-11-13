import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, List, Map as MapIcon, Maximize, Minus, Plus, Printer, Search, Shapes, Sparkles, Undo2, Wand2, X } from "lucide-react";
import {
  ELEMENT_KINDS,
  ELEMENT_LABELS,
  SHAPE_LABELS,
  STATUS_COLORS,
  TABLE_SHAPES,
  autoSeat,
  fullName,
  nextTableNumber,
  newId,
  partySize,
  tableName,
  tables,
  type ElementKind,
  type FloorItem,
  type FloorPlan,
  type HouseholdDTO,
  type Seat,
  type TableShape,
} from "../../../../shared/guests";
import { Button, Card, Modal, Segmented, cx, inputClass, useToast } from "../../ui";
import { Toggle } from "../../manage/Toggle";
import { usePlanner } from "../store";
import { Empty, Stepper, TagDot, num, selectClass, smallInput, smallSelect } from "../bits";
import { Canvas, type CanvasHandle, type Occupant } from "./Canvas";
import { Inspector } from "./Inspector";
import { newElement, newTable, planBounds, tableGrid } from "./geometry";
import { printPlan } from "./print";

type ColorBy = "side" | "circle" | "status";
type View = "map" | "list";

/** People of a household that sit at a table when it is seated whole. */
const seatSize = (h: HouseholdDTO) => Math.max(1, h.status === "coming" || h.status === "maybe" ? h.coming || h.invited : h.invited);

/**
 * The seating chart: the hall map (tables, elements, free text), the families waiting for a table, quick seating by
 * side / circle, a list view (no map needed), printouts, and publishing the tables to the guests.
 */
export default function Seating() {
  const p = usePlanner();
  const toast = useToast();
  const { floor, households, config: cfg } = p.data;
  const canvas = useRef<CanvasHandle>(null);
  const [live, setLive] = useState<FloorItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [colorBy, setColorBy] = useState<ColorBy>(cfg.sides.length ? "side" : "circle");
  const [view, setView] = useState<View>("map");
  const [adding, setAdding] = useState<"tables" | "elements" | null>(null);
  const [auto, setAuto] = useState(false);
  const history = useRef<FloorPlan[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const plan: FloorPlan = live ? { ...floor, items: live } : floor;
  const tbls = tables(plan);
  const tableIds = useMemo(() => new Set(tbls.map((t) => t.id)), [tbls]);

  const commit = useCallback(
    (next: FloorPlan) => {
      history.current = [...history.current.slice(-29), floor];
      setCanUndo(true);
      setLive(null);
      p.saveFloor(next);
    },
    [floor, p],
  );
  const undo = () => {
    const prev = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (prev) p.saveFloor(prev);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(e.target as HTMLElement).closest("input,textarea,select")) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ------------------------------------------------ who sits where
  const colorOf = useCallback(
    (h: HouseholdDTO) => {
      if (colorBy === "status") return STATUS_COLORS[h.status];
      const tag = colorBy === "side" ? cfg.sides.find((t) => t.id === h.side) : cfg.circles.find((t) => t.id === h.circle);
      return tag?.color ?? "#475569";
    },
    [colorBy, cfg.sides, cfg.circles],
  );
  const occupants = useMemo(() => {
    const m = new Map<string, Occupant[]>();
    for (const h of households)
      for (const s of h.seats) if (tableIds.has(s.t)) m.set(s.t, [...(m.get(s.t) ?? []), { id: h.id, name: fullName(h), n: s.n, color: colorOf(h) }]);
    return m;
  }, [households, tableIds, colorOf]);
  const seatedOf = (h: HouseholdDTO) => h.seats.filter((s) => tableIds.has(s.t)).reduce((a, s) => a + s.n, 0);
  const waiting = households.filter((h) => partySize(h, cfg.planBy) > seatedOf(h));

  const setSeats = (items: { id: string; seats: Seat[] }[], msg?: string) => p.patchHouseholds(items.map((i) => ({ id: i.id, patch: { seats: i.seats } })), msg);
  const seat = (hid: string, tid: string) => {
    const h = households.find((x) => x.id === hid);
    const t = tbls.find((x) => x.id === tid);
    if (!h || !t) return;
    const used = (occupants.get(tid) ?? []).filter((o) => o.id !== hid).reduce((a, o) => a + o.n, 0);
    const n = seatSize(h);
    setSeats([{ id: hid, seats: [{ t: tid, n }] }], `${fullName(h)} הושבו בשולחן ${tableName(t)}`);
    if (used + n > t.seats) toast(`שימו לב: בשולחן ${tableName(t)} יש עכשיו ${used + n} אנשים ל-${t.seats} מקומות`, "info");
    setArmed(null);
  };
  const unseat = (hid: string, tid: string) => {
    const h = households.find((x) => x.id === hid);
    if (h) setSeats([{ id: hid, seats: h.seats.filter((s) => s.t !== tid) }]);
  };

  // ------------------------------------------------ editing the floor
  const update = (id: string, patch: Partial<FloorItem>) => commit({ ...plan, items: plan.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const add = (items: FloorItem[]) => {
    // the hall grows to hold what was added (a row of tables below the last one may pass its edge)
    const next = { ...plan, items: [...plan.items, ...items] };
    const b = planBounds({ ...next, w: 0, h: 0 });
    const round = (n: number) => Math.min(10_000, Math.ceil(n / 100) * 100);
    commit({ ...next, w: Math.max(plan.w, round(b.x2 + 100)), h: Math.max(plan.h, round(b.y2 + 100)) });
    if (items.length === 1) setSelected(items[0].id);
    setAdding(null);
    setTimeout(() => items.length > 1 && canvas.current?.fit(), 50);
  };
  const remove = (id: string) => {
    const it = plan.items.find((i) => i.id === id);
    if (!it) return;
    commit({ ...plan, items: plan.items.filter((i) => i.id !== id) });
    setSelected(null);
    const seated = households.filter((h) => h.seats.some((s) => s.t === id));
    if (seated.length) setSeats(seated.map((h) => ({ id: h.id, seats: h.seats.filter((s) => s.t !== id) })));
    toast(it.kind === "table" ? `שולחן ${tableName(it)} נמחק${seated.length ? ` (${seated.length} משפחות חזרו לרשימת הממתינים)` : ""}` : "נמחק", "info");
  };
  const duplicate = (id: string) => {
    const it = plan.items.find((i) => i.id === id);
    if (!it) return;
    const copy = it.kind === "table" ? { ...it, id: newId(), label: String(nextTableNumber(plan)) } : { ...it, id: newId() };
    add([{ ...copy, x: it.x + 60, y: it.y + 60, locked: false }]);
  };
  const sel = plan.items.find((i) => i.id === selected) ?? null;
  const armedH = households.find((h) => h.id === armed) ?? null;

  const unseatedOptions = waiting.map((h) => ({ id: h.id, name: fullName(h), n: seatSize(h) }));

  return (
    <div className="space-y-4">
      {/* toolbar (one scrolling row on phones, so the map stays near the top) */}
      <div className="no-scrollbar -mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0">
        <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding("tables")}>
          שולחנות
        </Button>
        <Button variant="outline" icon={<Shapes className="size-4" aria-hidden />} onClick={() => setAdding("elements")}>
          אלמנטים וטקסט
        </Button>
        <Button variant="outline" icon={<Wand2 className="size-4" aria-hidden />} onClick={() => setAuto(true)} disabled={!tbls.length || !waiting.length}>
          הושבה מהירה
        </Button>
        <Button variant="ghost" icon={<Undo2 className="size-4" aria-hidden />} onClick={undo} disabled={!canUndo}>
          ביטול
        </Button>
        <span className="flex items-center gap-2 sm:ms-auto sm:flex-wrap">
          <Segmented
            label="תצוגה"
            value={view}
            onChange={setView}
            options={[
              { value: "map", label: "מפה", icon: <MapIcon className="size-4" aria-hidden /> },
              { value: "list", label: "רשימה", icon: <List className="size-4" aria-hidden /> },
            ]}
          />
          <PrintMenu onPrint={(k) => printPlan(k, { title: p.data.event.title, floor: plan, households, svg: canvas.current?.svg() ?? null })} disabled={!tbls.length} />
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-border bg-card px-4 py-2">
        <div className="min-w-64 flex-1">
          <Toggle checked={cfg.seatingPublished} onChange={(v) => p.saveConfig({ ...cfg, seatingPublished: v }, v ? "האורחים יכולים לראות את השולחן שלהם" : "ההושבה מוסתרת מהאורחים")} label="פרסום ההושבה לאורחים" hint='בקישור האישי ובאלמנט "איפה אני יושב?"' />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          צביעה לפי
          <select className={smallSelect} value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
            {cfg.sides.length > 0 && <option value="side">צד</option>}
            <option value="circle">מעגל</option>
            <option value="status">סטטוס</option>
          </select>
        </label>
        <p className="text-sm text-muted-fg" role="status">
          {num(p.stats.tables)} שולחנות · {num(p.stats.seats)} מקומות · הושבו {num(p.stats.seated)} מתוך {num(p.stats.toSeat)}
          {p.stats.seats < p.stats.toSeat ? <b className="text-destructive"> · חסרים {num(p.stats.toSeat - p.stats.seats)} מקומות</b> : null}
        </p>
      </div>

      {armedH && (
        <div className="sticky top-2 z-30 flex items-center gap-3 rounded-2xl bg-zinc-900 px-4 py-2 text-white shadow-lift" role="status">
          <span className="flex-1">
            בחרתם את <b>{fullName(armedH)}</b> ({seatSize(armedH)}). עכשיו לוחצים על שולחן.
          </span>
          <Button size="sm" variant="glass" icon={<X className="size-4" aria-hidden />} onClick={() => setArmed(null)}>
            ביטול
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {view === "map" ? (
          <div className="relative h-[65dvh] min-h-[24rem] lg:h-[calc(100dvh-16rem)]">
            {!plan.items.length && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
                <div className="pointer-events-auto max-w-sm rounded-2xl bg-card p-5 text-center shadow-lift">
                  <p className="mb-1 text-lg font-bold">האולם עוד ריק</p>
                  <p className="mb-4 text-muted-fg">מוסיפים כמה שולחנות בבת אחת, ואז רחבה, במה, בר וכל מה שיש באולם.</p>
                  <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding("tables")}>
                    הוספת שולחנות
                  </Button>
                </div>
              </div>
            )}
            <Canvas
              ref={canvas}
              floor={plan}
              occupants={occupants}
              selected={selected}
              armed={!!armed}
              onSelect={setSelected}
              onMove={(items, done) => (done ? commit({ ...plan, items }) : setLive(items))}
              onTableTap={(tid) => armed && seat(armed, tid)}
              onDropHousehold={seat}
              onDelete={remove}
              onRotate={(id) => {
                const it = plan.items.find((i) => i.id === id);
                if (it) update(id, { rot: (it.rot + 15) % 360 });
              }}
            />
            <div className="absolute bottom-3 start-3 flex flex-col gap-1.5">
              <ZoomBtn label="התקרבות" onClick={() => canvas.current?.zoom(1.3)}>
                <Plus className="size-5" aria-hidden />
              </ZoomBtn>
              <ZoomBtn label="התרחקות" onClick={() => canvas.current?.zoom(1 / 1.3)}>
                <Minus className="size-5" aria-hidden />
              </ZoomBtn>
              <ZoomBtn label="כל האולם במסך" onClick={() => canvas.current?.fit()}>
                <Maximize className="size-5" aria-hidden />
              </ZoomBtn>
            </div>
          </div>
        ) : (
          <TableList occupants={occupants} tbls={tbls} unseated={unseatedOptions} onSeat={seat} onUnseat={unseat} onSelect={(id) => { setSelected(id); }} />
        )}

        <aside className="space-y-4" aria-label="פרטים">
          {sel ? (
            <Card className="!p-4">
              <Inspector
                key={sel.id}
                it={sel}
                occupants={occupants.get(sel.id) ?? []}
                unseated={unseatedOptions}
                onChange={(patch) => update(sel.id, patch)}
                onDelete={() => remove(sel.id)}
                onDuplicate={() => duplicate(sel.id)}
                onClose={() => setSelected(null)}
                onUnseat={(hid) => unseat(hid, sel.id)}
                onSeat={(hid) => seat(hid, sel.id)}
              />
            </Card>
          ) : (
            <Waiting waiting={waiting} armed={armed} onArm={setArmed} colorOf={colorOf} seatedOf={seatedOf} />
          )}
          {!sel && <HallSize floor={plan} onChange={(w, h) => commit({ ...plan, w, h })} />}
        </aside>
      </div>

      <AddDialog open={adding} onClose={() => setAdding(null)} floor={plan} center={() => canvas.current?.center() ?? { x: plan.w / 2, y: plan.h / 2 }} onAdd={add} />
      <AutoSeatDialog open={auto} onClose={() => setAuto(false)} />
    </div>
  );
}

function ZoomBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="flex size-11 items-center justify-center rounded-xl border border-border bg-card shadow-soft hover:bg-fg/5">
      {children}
    </button>
  );
}

function PrintMenu({ onPrint, disabled }: { onPrint: (k: "map" | "entrance" | "cards") => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" icon={<Printer className="size-4" aria-hidden />} onClick={() => setOpen(true)} disabled={disabled}>
        הדפסה
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="מה להדפיס">
        <p className="mb-4 text-muted-fg">נפתח חלון הדפסה. אפשר לבחור בו &quot;שמירה כ-PDF&quot;.</p>
        <div className="grid gap-2">
          {(
            [
              ["map", "מפת האולם + רשימה לכל שולחן", "לצוות האולם ולמלצרים"],
              ["entrance", "רשימת כניסה לפי א-ב", "שם המשפחה ומספר השולחן, לתלייה בכניסה"],
              ["cards", "שלטי מספרים לשולחנות", "מספר גדול לכל שולחן, שניים בעמוד"],
            ] as const
          ).map(([k, t, d]) => (
            <button key={k} type="button" onClick={() => { onPrint(k); setOpen(false); }} className="rounded-2xl border-2 border-border p-4 text-start hover:border-primary hover:bg-primary/5">
              <span className="block font-bold">{t}</span>
              <span className="text-sm text-muted-fg">{d}</span>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}

/** Families still without a (full) table, by side then circle. Pick one (or drag it) and tap a table. */
function Waiting({ waiting, armed, onArm, colorOf, seatedOf }: { waiting: HouseholdDTO[]; armed: string | null; onArm: (id: string | null) => void; colorOf: (h: HouseholdDTO) => string; seatedOf: (h: HouseholdDTO) => number }) {
  const p = usePlanner();
  const cfg = p.data.config;
  const [q, setQ] = useState("");
  const list = waiting.filter((h) => !q.trim() || `${h.first} ${h.last}`.includes(q.trim()));
  const groups = new Map<string, HouseholdDTO[]>();
  for (const h of list) {
    const k = `${cfg.sides.find((t) => t.id === h.side)?.name ?? ""}${cfg.sides.length ? " · " : ""}${cfg.circles.find((t) => t.id === h.circle)?.name ?? "בלי מעגל"}`;
    groups.set(k, [...(groups.get(k) ?? []), h]);
  }
  const people = waiting.reduce((a, h) => a + partySize(h, cfg.planBy) - seatedOf(h), 0);
  return (
    <Card className="!p-4">
      <h2 className="mb-1 text-lg font-bold">ממתינים לשולחן</h2>
      <p className="mb-3 text-sm text-muted-fg">
        {waiting.length ? `${num(waiting.length)} משפחות, ${num(people)} אנשים. בוחרים משפחה ולוחצים על שולחן (או גוררים אותה לשולחן).` : "כולם הושבו."}
      </p>
      {waiting.length > 6 && (
        <label className="relative mb-3 block">
          <span className="sr-only">חיפוש</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" aria-hidden />
          <input className={cx(smallInput, "ps-9")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש שם" type="search" />
        </label>
      )}
      {waiting.length === 0 ? (
        <Empty icon={<Sparkles className="size-7" aria-hidden />} title="כולם במקום" />
      ) : (
        <div className="max-h-[55dvh] space-y-3 overflow-y-auto pe-1 [scrollbar-width:thin]">
          {[...groups.entries()].map(([g, hs]) => (
            <div key={g}>
              <p className="mb-1.5 text-sm font-bold text-muted-fg">
                {g} ({num(hs.reduce((a, h) => a + seatSize(h), 0))})
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {hs.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/x-household", h.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      aria-pressed={armed === h.id}
                      onClick={() => onArm(armed === h.id ? null : h.id)}
                      className={cx(
                        "inline-flex min-h-11 cursor-grab items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors duration-150",
                        armed === h.id ? "border-primary bg-primary text-on-primary" : "border-border bg-card hover:border-primary",
                      )}
                    >
                      <TagDot color={colorOf(h)} />
                      {fullName(h)}
                      <span className="tabular-nums opacity-75">{seatSize(h)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** The seating without the map: every table with its families; add / remove from a list. */
function TableList({ tbls, occupants, unseated, onSeat, onUnseat, onSelect }: { tbls: FloorItem[]; occupants: Map<string, Occupant[]>; unseated: { id: string; name: string; n: number }[]; onSeat: (hid: string, tid: string) => void; onUnseat: (hid: string, tid: string) => void; onSelect: (id: string) => void }) {
  if (!tbls.length) return <Empty icon={<LayoutGrid className="size-7" aria-hidden />} title="אין עדיין שולחנות" text='מוסיפים שולחנות בכפתור "שולחנות" למעלה.' />;
  return (
    <ul className="grid content-start gap-3 sm:grid-cols-2">
      {tbls.map((t) => {
        const occ = occupants.get(t.id) ?? [];
        const used = occ.reduce((a, o) => a + o.n, 0);
        return (
          <li key={t.id} className="rounded-2xl border border-border bg-card p-3 shadow-soft">
            <div className="mb-2 flex items-center justify-between gap-2">
              <button type="button" onClick={() => onSelect(t.id)} className="text-lg font-bold hover:underline">
                שולחן {tableName(t)}
              </button>
              <span className={cx("text-sm font-semibold tabular-nums", used > t.seats ? "text-destructive" : "text-muted-fg")}>
                {used}/{t.seats} · {SHAPE_LABELS[t.shape]}
              </span>
            </div>
            <ul className="mb-2 space-y-1">
              {occ.map((o) => (
                <li key={o.id} className="flex items-center gap-2 text-sm">
                  <TagDot color={o.color} />
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  <span className="tabular-nums text-muted-fg">{o.n}</span>
                  <button type="button" className="min-h-11 rounded-lg px-2 font-semibold text-destructive hover:bg-destructive/10" onClick={() => onUnseat(o.id, t.id)}>
                    הורדה
                  </button>
                </li>
              ))}
            </ul>
            {unseated.length > 0 && (
              <select className={cx(smallInput, "pe-8")} value="" onChange={(e) => e.target.value && onSeat(e.target.value, t.id)} aria-label={`הושבה בשולחן ${tableName(t)}`}>
                <option value="">הוספת משפחה...</option>
                {unseated.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.n})
                  </option>
                ))}
              </select>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function HallSize({ floor, onChange }: { floor: FloorPlan; onChange: (w: number, h: number) => void }) {
  return (
    <Card className="!p-4">
      <h2 className="mb-2 font-bold">גודל האולם</h2>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-semibold">
          רוחב
          <Stepper size="sm" label="רוחב האולם במטרים" value={Math.round(floor.w / 100)} min={6} max={100} onChange={(m) => onChange(m * 100, floor.h)} />
          מ׳
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          אורך
          <Stepper size="sm" label="אורך האולם במטרים" value={Math.round(floor.h / 100)} min={6} max={100} onChange={(m) => onChange(floor.w, m * 100)} />
          מ׳
        </label>
      </div>
    </Card>
  );
}

const QUICK_TABLES: { shape: TableShape; seats: number; label: string }[] = [
  { shape: "round", seats: 10, label: "עגול 10" },
  { shape: "round", seats: 12, label: "עגול 12" },
  { shape: "square", seats: 12, label: "מרובע 12" },
  { shape: "knights", seats: 20, label: "אבירים 20" },
  { shape: "rect", seats: 8, label: "מלבני 8" },
  { shape: "oval", seats: 14, label: "אובלי 14" },
];

function AddDialog({ open, onClose, floor, center, onAdd }: { open: "tables" | "elements" | null; onClose: () => void; floor: FloorPlan; center: () => { x: number; y: number }; onAdd: (items: FloorItem[]) => void }) {
  const [shape, setShape] = useState<TableShape>("round");
  const [seats, setSeats] = useState(10);
  const [count, setCount] = useState(10);
  const [perRow, setPerRow] = useState(5);
  return (
    <Modal open={!!open} onClose={onClose} size="lg" title={open === "elements" ? "הוספת אלמנט" : "הוספת שולחנות"}>
      {open === "tables" ? (
        <div className="space-y-5">
          <div>
            <p className="mb-2 font-semibold">שולחן אחד</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {QUICK_TABLES.map((q) => (
                <button key={q.label} type="button" onClick={() => onAdd([newTable(floor, q.shape, q.seats, center())])} className="min-h-12 rounded-xl border-2 border-border font-semibold hover:border-primary hover:bg-primary/5">
                  {q.label}
                </button>
              ))}
            </div>
          </div>
          <fieldset className="space-y-3 rounded-2xl border border-border p-4">
            <legend className="px-1 font-bold">כמה שולחנות בבת אחת</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 font-semibold">
                צורה
                <select className={selectClass} value={shape} onChange={(e) => setShape(e.target.value as TableShape)}>
                  {TABLE_SHAPES.map((s) => (
                    <option key={s} value={s}>
                      {SHAPE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-1">
                <span className="font-semibold">מקומות בכל שולחן</span>
                <Stepper label="מקומות בכל שולחן" value={seats} min={1} max={60} onChange={setSeats} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold">כמה שולחנות</span>
                <Stepper label="כמה שולחנות" value={count} min={1} max={100} onChange={setCount} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold">בכל שורה</span>
                <Stepper label="שולחנות בכל שורה" value={perRow} min={1} max={20} onChange={setPerRow} />
              </div>
            </div>
            <p className="text-sm text-muted-fg" role="status">
              {num(count)} שולחנות × {num(seats)} = {num(count * seats)} מקומות. ממוספרים אוטומטית, ואפשר לגרור כל אחד למקום.
            </p>
            <Button onClick={() => onAdd(tableGrid(floor, count, shape, seats, perRow))} icon={<Plus className="size-4" aria-hidden />}>
              הוספת {num(count)} שולחנות
            </Button>
          </fieldset>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ELEMENT_KINDS.map((k: ElementKind) => (
            <button key={k} type="button" onClick={() => onAdd([newElement(k, center(), ELEMENT_LABELS[k])])} className="min-h-14 rounded-xl border-2 border-border px-2 font-semibold hover:border-primary hover:bg-primary/5">
              {ELEMENT_LABELS[k]}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Quick seating: choose who (all / a side / a circle), see the proposal, apply (one undo brings it back). */
function AutoSeatDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = usePlanner();
  const { households, floor, config: cfg } = p.data;
  const [scope, setScope] = useState("all");
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [last, setLast] = useState<{ id: string; seats: Seat[] }[] | null>(null);
  const subset = households.filter((h) => scope === "all" || (scope.startsWith("s:") ? h.side === scope.slice(2) : h.circle === scope.slice(2)));
  const result = useMemo(() => (open ? autoSeat({ households: subset, all: households, floor, cfg, onlyEmptyTables: onlyEmpty }) : null), [open, subset, households, floor, cfg, onlyEmpty]);
  const left = result?.leftover.reduce((a, l) => a + l.people, 0) ?? 0;
  const typical = Math.max(1, ...tables(floor).map((t) => t.seats));
  const apply = async () => {
    if (!result) return;
    const before = [...result.moves.keys()].map((id) => ({ id, seats: households.find((h) => h.id === id)!.seats }));
    const ok = await p.patchHouseholds([...result.moves.entries()].map(([id, seats]) => ({ id, patch: { seats } })), `הושבו ${num(result.placedPeople)} אנשים`);
    if (ok) setLast(before);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="הושבה מהירה"
      footer={
        <>
          {last && (
            <Button
              variant="ghost"
              className="me-auto"
              icon={<Undo2 className="size-4" aria-hidden />}
              onClick={async () => {
                await p.patchHouseholds(last.map((l) => ({ id: l.id, patch: { seats: l.seats } })), "ההושבה המהירה בוטלה");
                setLast(null);
              }}
            >
              ביטול ההושבה
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            סגירה
          </Button>
          <Button onClick={apply} disabled={!result?.placedPeople} icon={<Wand2 className="size-4" aria-hidden />}>
            להושיב
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-muted-fg">
          כל משפחה יושבת יחד, וחבורות מאותו צד ומעגל יושבות באותם שולחנות. שולחנות נעולים, רזרבה, ילדים וצוות לא מתמלאים. משפחות שכבר יושבות לא זזות.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">את מי להושיב</span>
          <select className={inputClass} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">את כל מי שממתין</option>
            {cfg.sides.map((s) => (
              <option key={s.id} value={`s:${s.id}`}>
                רק {s.name}
              </option>
            ))}
            {cfg.circles.map((c) => (
              <option key={c.id} value={`c:${c.id}`}>
                רק {c.name}
              </option>
            ))}
          </select>
        </label>
        <Toggle checked={onlyEmpty} onChange={setOnlyEmpty} label="רק בשולחנות ריקים" hint="לא להוסיף אנשים לשולחנות שכבר יש בהם מישהו" />
        {cfg.spareSeats > 0 && <p className="text-sm text-muted-fg">משאירים {cfg.spareSeats} כיסאות פנויים בכל שולחן (משנים בהגדרות).</p>}
        {result && (
          <div className="rounded-xl bg-muted px-4 py-3" role="status">
            <p className="font-semibold">יושבו {num(result.placedPeople)} אנשים ({num(result.moves.size)} משפחות).</p>
            {left > 0 && (
              <p className="mt-1 text-destructive">
                {num(left)} אנשים לא נכנסו. צריך עוד כ-{num(Math.ceil(left / typical))} שולחנות של {typical}.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
