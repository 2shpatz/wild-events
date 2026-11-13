import { Copy, Lock, LockOpen, RotateCw, Trash2, UserMinus, X } from "lucide-react";
import {
  AUDIENCES,
  AUDIENCE_LABELS,
  ELEMENT_KINDS,
  ELEMENT_LABELS,
  SHAPE_LABELS,
  TABLE_KINDS,
  TABLE_KIND_LABELS,
  TABLE_SHAPES,
  TAG_COLORS,
  tableSize,
  type Audience,
  type ElementKind,
  type FloorItem,
  type TableKind,
  type TableShape,
} from "../../../../shared/guests";
import { Button, IconButton, cx, inputClass } from "../../ui";
import { Stepper, selectClass, smallInput } from "../bits";
import type { Occupant } from "./Canvas";

/** Settings of the selected table / element (side panel on desktop, under the map on phones). */
export function Inspector({
  it,
  occupants,
  unseated,
  onChange,
  onDelete,
  onDuplicate,
  onClose,
  onUnseat,
  onSeat,
}: {
  it: FloorItem;
  occupants: Occupant[];
  unseated: { id: string; name: string; n: number }[];
  onChange: (patch: Partial<FloorItem>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
  onUnseat: (householdId: string) => void;
  onSeat: (householdId: string) => void;
}) {
  const isTable = it.kind === "table";
  const used = occupants.reduce((a, o) => a + o.n, 0);
  const setShape = (shape: TableShape) => onChange({ shape, ...tableSize(shape, it.seats) });
  const setSeats = (seats: number) => onChange({ seats, ...tableSize(it.shape, seats) });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{isTable ? `שולחן ${it.label || ""}` : ELEMENT_LABELS[it.kind as ElementKind]}</h2>
        <IconButton label="סגירה" onClick={onClose} className="hover:bg-fg/5">
          <X className="size-5" aria-hidden />
        </IconButton>
      </div>

      {it.kind === "text" ? (
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">הטקסט</span>
          <textarea className={cx(inputClass, "min-h-20 py-2")} value={it.text} maxLength={300} onChange={(e) => onChange({ text: e.target.value })} />
        </label>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">{isTable ? "מספר או שם השולחן" : "כיתוב"}</span>
          <input className={smallInput} value={it.label} maxLength={40} onChange={(e) => onChange({ label: e.target.value })} placeholder={isTable ? "12, או: משפחת כהן" : ELEMENT_LABELS[it.kind as ElementKind]} />
        </label>
      )}

      {isTable ? (
        <>
          <fieldset>
            <legend className="mb-1.5 font-semibold">צורה</legend>
            <div className="grid grid-cols-3 gap-1.5">
              {TABLE_SHAPES.map((s) => (
                <button key={s} type="button" aria-pressed={it.shape === s} onClick={() => setShape(s)} className={cx("min-h-11 rounded-xl border px-1 text-sm font-semibold", it.shape === s ? "border-primary bg-primary text-on-primary" : "border-border bg-card hover:bg-fg/5")}>
                  {SHAPE_LABELS[s]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">מקומות ישיבה</span>
            <Stepper label="מקומות ישיבה" value={it.seats} min={1} max={60} onChange={setSeats} />
          </div>
          <p className={cx("text-sm", used > it.seats ? "font-bold text-destructive" : "text-muted-fg")} role="status">
            יושבים {used} מתוך {it.seats}
            {used > it.seats ? ` - ${used - it.seats} יותר מדי` : used < it.seats ? ` - ${it.seats - used} פנויים` : " - מלא"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              סוג
              <select className={cx(smallInput, "pe-7")} value={it.tableKind} onChange={(e) => onChange({ tableKind: e.target.value as TableKind })}>
                {TABLE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {TABLE_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              למי
              <select className={cx(smallInput, "pe-7")} value={it.audience} onChange={(e) => onChange({ audience: e.target.value as Audience })}>
                {AUDIENCES.map((k) => (
                  <option key={k} value={k}>
                    {AUDIENCE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      ) : (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          סוג האלמנט
          <select className={selectClass} value={it.kind} onChange={(e) => onChange({ kind: e.target.value as ElementKind })}>
            {ELEMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {ELEMENT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      )}

      {it.kind === "text" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">גודל הטקסט</span>
          <Stepper label="גודל הטקסט" value={it.fontSize} min={10} max={200} onChange={(n) => onChange({ fontSize: n, w: Math.max(it.w, n * 6), h: Math.max(40, n * 1.6) })} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Size label="רוחב (ס״מ)" value={it.w} onChange={(w) => onChange(it.shape === "round" && isTable ? { w, h: w } : { w })} />
          {!(it.shape === "round" && (isTable || it.kind === "pillar")) && <Size label="עומק (ס״מ)" value={it.h} onChange={(h) => onChange({ h })} />}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">צבע</span>
        <button type="button" aria-pressed={!it.color} onClick={() => onChange({ color: null })} className={cx("min-h-11 rounded-full border px-3 text-sm font-semibold", !it.color ? "border-fg" : "border-border")}>
          רגיל
        </button>
        {TAG_COLORS.slice(0, 8).map((c) => (
          <button key={c} type="button" aria-label={c} aria-pressed={it.color === c} onClick={() => onChange({ color: c })} className={cx("size-11 rounded-full border-4", it.color === c ? "border-fg" : "border-transparent")} style={{ background: c }} />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => onChange({ rot: (it.rot + 15) % 360 })}>
          סיבוב ({it.rot}°)
        </Button>
        <Button size="sm" variant="outline" icon={it.locked ? <LockOpen className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />} onClick={() => onChange({ locked: !it.locked })}>
          {it.locked ? "שחרור נעילה" : "נעילה במקום"}
        </Button>
        <Button size="sm" variant="outline" icon={<Copy className="size-4" aria-hidden />} onClick={onDuplicate}>
          שכפול
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive" icon={<Trash2 className="size-4" aria-hidden />} onClick={onDelete}>
          מחיקה
        </Button>
      </div>
      {it.locked && isTable && <p className="text-sm text-muted-fg">שולחן נעול לא זז, וההושבה המהירה לא מושיבה בו.</p>}

      {isTable && (
        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="font-bold">מי יושב כאן</h3>
          {occupants.length === 0 ? (
            <p className="text-sm text-muted-fg">אף אחד עדיין. בוחרים משפחה מהרשימה ולוחצים על השולחן, או מוסיפים מכאן:</p>
          ) : (
            <ul className="space-y-1">
              {occupants.map((o) => (
                <li key={o.id} className="flex items-center gap-2">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: o.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  <span className="text-sm tabular-nums text-muted-fg">{o.n}</span>
                  <IconButton label={`הורדת ${o.name} מהשולחן`} className="hover:bg-fg/5" onClick={() => onUnseat(o.id)}>
                    <UserMinus className="size-4" aria-hidden />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          {unseated.length > 0 && (
            <select className={smallInput} value="" onChange={(e) => e.target.value && onSeat(e.target.value)} aria-label="הושבת משפחה בשולחן">
              <option value="">הושבת משפחה כאן...</option>
              {unseated.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.n})
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

function Size({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      {label}
      <input type="number" inputMode="numeric" className={smallInput} value={Math.round(value)} min={10} max={5000} step={10} onChange={(e) => onChange(Math.max(10, Math.min(5000, Number(e.target.value) || 10)))} />
    </label>
  );
}
