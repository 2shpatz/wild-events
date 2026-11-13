import { useMemo, useState } from "react";
import { ClipboardPaste, FileUp } from "lucide-react";
import {
  FIELDS,
  MAX_CUSTOM_FIELDS,
  applyCell,
  emptyHousehold,
  fullName,
  guessColumns,
  newId,
  parseTable,
  splitFullName,
  tableLabelKey,
  tables,
  type ColumnTarget,
  type FloorItem,
  type Household,
  type PlannerConfig,
} from "../../../shared/guests";
import { Button, Modal, cx, inputClass } from "../ui";
import { Toggle } from "../manage/Toggle";
import { usePlanner } from "./store";
import { selectClass } from "./bits";

const enc = (t: ColumnTarget) => (t.kind === "field" ? `f:${t.key}` : t.kind === "custom" ? `c:${t.id}` : t.kind === "new" ? `n:${t.label}` : "skip");
const dec = (v: string): ColumnTarget =>
  v.startsWith("f:") ? { kind: "field", key: v.slice(2) as never } : v.startsWith("c:") ? { kind: "custom", id: v.slice(2) } : v.startsWith("n:") ? { kind: "new", label: v.slice(2) } : { kind: "skip" };

/**
 * Import from Excel / Google Sheets / CSV: paste the cells (or pick a file), check which column goes where (guessed
 * from the headers, Hebrew and English), then add. Unknown columns become new columns; unknown sides / circles are
 * created. Names already on the list can be skipped.
 */
export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = usePlanner();
  const [text, setText] = useState("");
  const [headerRow, setHeaderRow] = useState(true);
  const [targets, setTargets] = useState<ColumnTarget[] | null>(null);
  const [skipDupes, setSkipDupes] = useState(true);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => parseTable(text), [text]);
  const width = Math.max(0, ...rows.map((r) => r.length));
  const headers = headerRow && rows[0] ? rows[0] : Array.from({ length: width }, (_, i) => `עמודה ${i + 1}`);
  const body = headerRow ? rows.slice(1) : rows;
  const cols = targets ?? (rows.length ? guessColumns(headerRow ? headers : headers.map(() => ""), p.data.config).map((t, i) => (headerRow ? t : i === 0 ? ({ kind: "field", key: "first" } as ColumnTarget) : ({ kind: "skip" } as ColumnTarget))) : []);
  const reset = () => {
    setText("");
    setTargets(null);
  };

  const build = () => {
    const cfg: PlannerConfig = structuredClone(p.data.config);
    // new columns -> custom fields
    const newIds = new Map<number, string>();
    cols.forEach((t, i) => {
      if (t.kind === "new" && cfg.custom.length < MAX_CUSTOM_FIELDS) {
        const id = newId();
        cfg.custom.push({ id, label: t.label || headers[i] || `עמודה ${i + 1}`, type: "text", options: [] });
        newIds.set(i, id);
      }
    });
    const byLabel = new Map<string, FloorItem>();
    for (const t of tables(p.data.floor)) if (t.label) byLabel.set(tableLabelKey(t.label), t);
    const hasLast = cols.some((t) => t.kind === "field" && t.key === "last");
    const existing = new Set(p.data.households.map((h) => fullName(h).replace(/\s+/g, " ").trim()));
    const out: Household[] = [];
    let dupes = 0;
    for (const r of body) {
      const draft = { ...emptyHousehold("x") } as Record<string, unknown>;
      draft.custom = {};
      cols.forEach((t, i) => {
        const v = (r[i] ?? "").trim();
        if (t.kind === "field") applyCell(draft, t.key, v, cfg, { tablesByLabel: byLabel, partySize: Number(draft.invited) || 1 });
        else if (t.kind === "custom" || t.kind === "new") {
          const id = t.kind === "custom" ? t.id : newIds.get(i);
          if (id && v) (draft.custom as Record<string, unknown>)[id] = v;
        }
      });
      if (!hasLast && typeof draft.first === "string") Object.assign(draft, splitFullName(draft.first));
      const h = draft as unknown as Household;
      if (!String(h.first ?? "").trim() && !String(h.last ?? "").trim()) continue;
      if (h.status === "coming" && !h.coming) h.coming = h.invited;
      const key = `${h.first} ${h.last}`.replace(/\s+/g, " ").trim();
      if (skipDupes && existing.has(key)) {
        dupes++;
        continue;
      }
      existing.add(key);
      out.push(h);
    }
    return { cfg, out, dupes };
  };
  const preview = rows.length ? build() : null;

  const run = async () => {
    if (!preview?.out.length) return;
    setBusy(true);
    const changedCfg = JSON.stringify(preview.cfg) !== JSON.stringify(p.data.config);
    const added = await p.addHouseholds(
      preview.out.map(({ id: _id, ...h }) => (void _id, h)),
      changedCfg ? preview.cfg : undefined,
    );
    setBusy(false);
    if (added) {
      reset();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="ייבוא רשימה"
      footer={
        <>
          <Button variant="ghost" onClick={rows.length ? reset : onClose}>
            {rows.length ? "התחלה מחדש" : "ביטול"}
          </Button>
          <Button onClick={run} loading={busy} disabled={!preview?.out.length}>
            {preview?.out.length ? `הוספת ${preview.out.length.toLocaleString("he-IL")} הזמנות` : "הוספה"}
          </Button>
        </>
      }
    >
      {!rows.length ? (
        <div className="space-y-4">
          <p className="text-muted-fg">
            מסמנים את התאים ב-Excel או ב-Google Sheets (כולל שורת הכותרות), מעתיקים ומדביקים כאן. אפשר גם לבחור קובץ CSV. נזהה לבד את העמודות: שם, משפחה, טלפון, מספר מוזמנים, צד, מעגל, סטטוס ועוד.
          </p>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 font-semibold">
              <ClipboardPaste className="size-4" aria-hidden />
              הדבקה
            </span>
            <textarea className={cx(inputClass, "min-h-48 py-3 font-mono text-sm")} value={text} onChange={(e) => setText(e.target.value)} placeholder={"שם פרטי\tשם משפחה\tטלפון\tמספר מוזמנים\nדנה\tכהן\t050-1234567\t2"} />
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 font-semibold hover:border-primary">
            <FileUp className="size-5" aria-hidden />
            בחירת קובץ CSV
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const buf = await f.arrayBuffer();
                // Excel's Hebrew CSV may be Windows-1255: fall back when UTF-8 decoding finds broken characters
                let t = new TextDecoder("utf-8").decode(buf);
                if (t.includes("�")) t = new TextDecoder("windows-1255").decode(buf);
                setText(t);
              }}
            />
          </label>
        </div>
      ) : (
        <div className="space-y-5">
          <Toggle checked={headerRow} onChange={(v) => { setHeaderRow(v); setTargets(null); }} label="השורה הראשונה היא כותרות" />
          <div className="space-y-3">
            <p className="font-semibold">לאן הולכת כל עמודה?</p>
            <ul className="space-y-2">
              {headers.map((h, i) => (
                <li key={i} className="grid items-center gap-2 rounded-xl border border-border p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{h || `עמודה ${i + 1}`}</p>
                    <p className="truncate text-sm text-muted-fg">{body.slice(0, 3).map((r) => r[i]).filter(Boolean).join(" · ") || "ריק"}</p>
                  </div>
                  <select
                    className={selectClass}
                    aria-label={`יעד העמודה ${h || i + 1}`}
                    value={enc(cols[i] ?? { kind: "skip" })}
                    onChange={(e) => {
                      const next = [...cols];
                      next[i] = dec(e.target.value);
                      setTargets(next);
                    }}
                  >
                    <option value="skip">לא לייבא</option>
                    <optgroup label="עמודות קיימות">
                      {FIELDS.filter((f) => f.key !== "link").map((f) => (
                        <option key={f.key} value={`f:${f.key}`}>
                          {f.label}
                        </option>
                      ))}
                      {p.data.config.custom.map((c) => (
                        <option key={c.id} value={`c:${c.id}`}>
                          {c.label}
                        </option>
                      ))}
                    </optgroup>
                    <option value={`n:${h || `עמודה ${i + 1}`}`}>עמודה חדשה: {h || `עמודה ${i + 1}`}</option>
                  </select>
                </li>
              ))}
            </ul>
          </div>
          <Toggle checked={skipDupes} onChange={setSkipDupes} label="לדלג על שמות שכבר ברשימה" />
          {preview && (
            <p className="rounded-xl bg-muted px-4 py-3" role="status">
              יתווספו {preview.out.length.toLocaleString("he-IL")} הזמנות ({preview.out.reduce((a, h) => a + (h.invited || 0), 0).toLocaleString("he-IL")} מוזמנים)
              {preview.dupes ? `, ${preview.dupes.toLocaleString("he-IL")} כבר ברשימה ולא יתווספו` : ""}.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
