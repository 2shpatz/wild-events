import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  CUSTOM_FIELD_TYPES,
  DEFAULT_CIRCLES,
  FIELDS,
  GROUP_LABELS,
  MAX_CUSTOM_FIELDS,
  newId,
  type CustomFieldType,
  type FieldGroup,
  type PlanBy,
  type PlannerConfig,
} from "../../../shared/guests";
import { Button, Card, IconButton, cx } from "../ui";
import { Toggle } from "../manage/Toggle";
import { usePlanner } from "./store";
import { TagEditor } from "./TagEditor";
import { SheetCard } from "./SheetCard";
import { Stepper, smallInput } from "./bits";

const TYPE_LABELS: Record<CustomFieldType, string> = { text: "טקסט", number: "מספר", choice: "בחירה מרשימה", checkbox: "כן / לא", date: "תאריך" };

/**
 * The guest-list part of the settings page. Changes are kept as a draft and saved from the sticky bar
 * (renaming a tag letter by letter would otherwise send a request per key).
 */
export function PlannerSettings() {
  const p = usePlanner();
  const saved = p.data.config;
  const [cfg, setCfg] = useState<PlannerConfig>(saved);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);
  // another device / the sheet changed the settings while nothing is being edited here
  useEffect(() => {
    if (!dirty) setCfg(saved);
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const usage = useMemo(() => {
    const side: Record<string, number> = {};
    const circle: Record<string, number> = {};
    for (const h of p.data.households) {
      if (h.side) side[h.side] = (side[h.side] ?? 0) + 1;
      if (h.circle) circle[h.circle] = (circle[h.circle] ?? 0) + 1;
    }
    return { side, circle };
  }, [p.data.households]);
  const set = <K extends keyof PlannerConfig>(k: K, v: PlannerConfig[K]) => setCfg({ ...cfg, [k]: v });
  const groups = Object.keys(GROUP_LABELS) as FieldGroup[];

  return (
    <div className="space-y-6 pb-24">
      <h2 className="border-t border-border pt-6 text-2xl font-bold">רשימת האורחים</h2>
      <SheetCard />

      <Card>
        <h3 className="mb-1 text-lg font-bold">בעלי השמחה (צדדים)</h3>
        <p className="mb-4 text-muted-fg">לכל הזמנה מסמנים של מי היא. אפשר שניים או יותר (למשל: צד הכלה, צד החתן, משותף). בלי צדדים, העמודה נעלמת.</p>
        <TagEditor tags={cfg.sides} onChange={(v) => set("sides", v)} noun="צד" placeholder="צד חדש" usage={usage.side} />
      </Card>

      <Card>
        <h3 className="mb-1 text-lg font-bold">מעגלי היכרות</h3>
        <p className="mb-4 text-muted-fg">מאיפה מכירים: משפחה, עבודה, צבא... משמש לסינון, לסיכומים ולהושבה מהירה של חבורות יחד.</p>
        <TagEditor tags={cfg.circles} onChange={(v) => set("circles", v)} noun="מעגל" placeholder="מעגל חדש" usage={usage.circle} suggestions={DEFAULT_CIRCLES} />
      </Card>

      <Card>
        <h3 className="mb-1 text-lg font-bold">עמודות</h3>
        <p className="mb-4 text-muted-fg">אילו פרטים לנהל. עמודה כבויה לא מופיעה בטבלה, בכרטיס ובגיליון (הנתונים שבה לא נמחקים).</p>
        <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          {groups.map((g) => {
            const fields = FIELDS.filter((f) => f.group === g && f.hideable);
            if (!fields.length) return null;
            return (
              <fieldset key={g}>
                <legend className="mb-1 font-bold">{GROUP_LABELS[g]}</legend>
                {fields.map((f) => (
                  <Toggle key={f.key} checked={!cfg.hidden.includes(f.key)} onChange={(v) => set("hidden", v ? cfg.hidden.filter((k) => k !== f.key) : [...cfg.hidden, f.key])} label={f.label} />
                ))}
              </fieldset>
            );
          })}
        </div>

        <h4 className="mt-6 mb-2 font-bold">עמודות משלכם</h4>
        <p className="mb-3 text-sm text-muted-fg">למשל: הסעה, כתובת למשלוח הזמנה, גיל, &quot;צריך חניה&quot;. עמודה שתוסיפו בגיליון תופיע כאן מעצמה.</p>
        <ul className="space-y-2">
          {cfg.custom.map((f, i) => (
            <li key={f.id} className="space-y-2 rounded-xl border border-border p-2">
              <div className="flex flex-wrap items-center gap-2">
                <input className={cx(smallInput, "min-w-40 flex-1")} value={f.label} maxLength={40} aria-label="שם העמודה" onChange={(e) => set("custom", cfg.custom.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <select className={cx(smallInput, "w-auto pe-8")} value={f.type} aria-label="סוג" onChange={(e) => set("custom", cfg.custom.map((x, j) => (j === i ? { ...x, type: e.target.value as CustomFieldType } : x)))}>
                  {CUSTOM_FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <IconButton label={`מחיקת העמודה ${f.label}`} className="text-destructive hover:bg-destructive/10" onClick={() => set("custom", cfg.custom.filter((_, j) => j !== i))}>
                  <Trash2 className="size-5" aria-hidden />
                </IconButton>
              </div>
              {f.type === "choice" && (
                <input
                  className={smallInput}
                  aria-label="האפשרויות, מופרדות בפסיק"
                  placeholder="האפשרויות, מופרדות בפסיק: כן, לא, אולי"
                  defaultValue={f.options.join(", ")}
                  onBlur={(e) => set("custom", cfg.custom.map((x, j) => (j === i ? { ...x, options: [...new Set(e.target.value.split(/[,،]/).map((s) => s.trim()).filter(Boolean))] } : x)))}
                />
              )}
            </li>
          ))}
        </ul>
        {cfg.custom.length < MAX_CUSTOM_FIELDS && (
          <Button variant="outline" className="mt-3" icon={<Plus className="size-4" aria-hidden />} onClick={() => set("custom", [...cfg.custom, { id: newId(), label: `עמודה ${cfg.custom.length + 1}`, type: "text", options: [] }])}>
            עמודה חדשה
          </Button>
        )}
      </Card>

      <Card>
        <h3 className="mb-1 text-lg font-bold">מנות מיוחדות</h3>
        <p className="mb-4 text-muted-fg">מי שלא בחר מקבל מנה רגילה. הספירה מופיעה בלוח הבקרה, לקייטרינג.</p>
        <TagEditor tags={cfg.meals} onChange={(v) => set("meals", v)} noun="מנה" placeholder="מנה חדשה, למשל: כשר למהדרין" max={12} suggestions={["צמחוני", "טבעוני", "ללא גלוטן", "מנת ילדים", "כשר למהדרין", "ללא לקטוז"]} />
      </Card>

      <Card>
        <h3 className="mb-4 text-lg font-bold">חישובים והושבה</h3>
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">אחוז הגעה צפוי ממי שעוד לא ענה</p>
              <p className="text-sm text-muted-fg">בישראל מגיעים בדרך כלל כ-85% מהמוזמנים. משמש ל&quot;צפויים להגיע&quot;.</p>
            </div>
            <span className="inline-flex items-center gap-2">
              <Stepper label="אחוז הגעה" value={cfg.turnoutPct} min={0} max={100} onChange={(n) => set("turnoutPct", n)} />%
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">כיסאות פנויים בכל שולחן בהושבה מהירה</p>
              <p className="text-sm text-muted-fg">למשל 1-2, כדי שיהיה מקום למי שמגיע בלי להודיע.</p>
            </div>
            <Stepper label="כיסאות פנויים" value={cfg.spareSeats} min={0} max={10} onChange={(n) => set("spareSeats", n)} />
          </div>
          <fieldset>
            <legend className="mb-2 font-semibold">את מי מושיבים</legend>
            <div className="space-y-1.5">
              {(
                [
                  ["confirmed", "רק מי שאישר הגעה"],
                  ["confirmed_maybe", 'מי שאישר + "אולי"'],
                  ["all", "כל המוזמנים שלא סירבו (גם מי שלא ענה)"],
                ] as [PlanBy, string][]
              ).map(([v, l]) => (
                <label key={v} className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input type="radio" name="planBy" className="size-5 accent-[var(--primary)]" checked={cfg.planBy === v} onChange={() => set("planBy", v)} />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Card>

      <Card>
        <h3 className="mb-1 text-lg font-bold">עמוד אישור ההגעה</h3>
        <p className="mb-3 text-muted-fg">מה שואלים את האורחים בקישור האישי.</p>
        <Toggle checked={cfg.rsvp.askKids} onChange={(v) => set("rsvp", { ...cfg.rsvp, askKids: v })} label="כמה מהמגיעים ילדים" />
        <Toggle checked={cfg.rsvp.askMeals} onChange={(v) => set("rsvp", { ...cfg.rsvp, askMeals: v })} label="מנות מיוחדות" hint={cfg.meals.length ? undefined : "קודם מוסיפים מנות מיוחדות למעלה"} />
        <Toggle checked={cfg.rsvp.askNote} onChange={(v) => set("rsvp", { ...cfg.rsvp, askNote: v })} label="הערה לבעלי השמחה" />
        <Toggle checked={cfg.rsvp.allowMore} onChange={(v) => set("rsvp", { ...cfg.rsvp, allowMore: v })} label="מותר לאשר יותר אנשים ממה שהוזמנו" hint="כבוי = עד מספר המוזמנים בהזמנה" />
        <Toggle checked={cfg.seatingPublished} onChange={(v) => set("seatingPublished", v)} label="להראות לאורחים את מספר השולחן" hint={'בקישור האישי ובאלמנט "איפה אני יושב?" בעמוד האירוע'} />
      </Card>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 py-3 shadow-lift backdrop-blur safe-bottom" role="region" aria-label="שמירת השינויים">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-3">
            <span className="me-auto font-semibold">יש שינויים שלא נשמרו</span>
            <Button variant="ghost" onClick={() => setCfg(saved)} disabled={busy}>
              ביטול השינויים
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await p.saveConfig({ ...cfg, onboarded: true }, "ההגדרות נשמרו");
                setBusy(false);
              }}
            >
              שמירה
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
