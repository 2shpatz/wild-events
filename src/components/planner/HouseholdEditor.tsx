import { useEffect, useRef, useState } from "react";
import { ClockFading, Copy, Link2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import {
  GIFT_LABELS,
  GIFT_METHODS,
  STATUS_LABELS,
  fullName,
  tables,
  tableName,
  waLink,
  type CustomField,
  type GiftMethod,
  type Household,
  type HouseholdDTO,
  type RsvpStatus,
} from "../../../shared/guests";
import { api } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { Button, ConfirmDialog, Field, IconButton, Modal, cx, inputClass } from "../ui";
import { Switch } from "../manage/Toggle";
import { WhatsAppIcon } from "../QRShare";
import { usePlanner } from "./store";
import { Stepper, StatusPicker, TagSelect, selectClass } from "./bits";

type Draft = Household;

/** Everything about one invitation, in groups; saves only what changed. `household = null` = a new one. */
export function HouseholdEditor({ household, open, onClose }: { household: HouseholdDTO | null; open: boolean; onClose: () => void }) {
  const p = usePlanner();
  const { config: cfg, floor } = p.data;
  const show = (k: string) => !cfg.hidden.includes(k as never);
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [log, setLog] = useState<{ at: number; by: string; status: string; coming: number }[] | null>(null);
  const [companion, setCompanion] = useState("");
  // what the household was when the editor opened: only fields changed in the editor are sent
  const orig = useRef<Draft | null>(null);

  useEffect(() => {
    if (!open) return;
    orig.current = household ? structuredClone(household) : null;
    setD(household ? structuredClone(household) : (structuredClone(emptyDraft()) as Draft));
    setLog(null);
    setCompanion("");
    if (household) api<{ log: typeof log }>(`/e/${p.code}/planner/households/${household.id}/log`).then((r) => setLog(r.log)).catch(() => setLog([]));
  }, [open, household?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!d) return null;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => (x ? { ...x, [k]: v } : x));
  const isNew = !household;
  const tbls = tables(floor);
  const size = d.status === "not_coming" ? 0 : d.coming || d.invited;

  const save = async () => {
    if (!d.first.trim() && !d.last.trim()) return;
    setBusy(true);
    let ok: boolean;
    if (isNew) ok = !!(await p.addHouseholds([d]));
    else {
      const patch: Record<string, unknown> = {};
      for (const k of Object.keys(d) as (keyof Draft)[]) if (JSON.stringify(d[k]) !== JSON.stringify(orig.current![k])) patch[k] = d[k];
      ok = Object.keys(patch).length ? await p.patchOne(household!.id, patch) : true;
    }
    setBusy(false);
    if (ok) onClose();
  };
  const setStatus = (s: RsvpStatus) => setD((x) => (x ? { ...x, status: s, coming: s === "not_coming" ? 0 : x.coming || (s === "coming" ? x.invited : 0) } : x));
  const setTable = (tid: string) => set("seats", tid ? [{ t: tid, n: Math.max(1, size) }] : []);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isNew ? "הזמנה חדשה" : fullName(household!) || "הזמנה"}
      footer={
        <>
          {!isNew && (
            <Button variant="ghost" className="me-auto text-destructive" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirmDelete(true)}>
              מחיקה
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={save} loading={busy} disabled={!d.first.trim() && !d.last.trim()}>
            {isNew ? "הוספה" : "שמירה"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-7"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Group title="פרטים">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="שם פרטי" htmlFor="h-first">
              <input id="h-first" className={inputClass} value={d.first} onChange={(e) => set("first", e.target.value)} maxLength={40} autoFocus={isNew} placeholder='למשל: דנה, או "משפחת"' />
            </Field>
            <Field label="שם משפחה" htmlFor="h-last">
              <input id="h-last" className={inputClass} value={d.last} onChange={(e) => set("last", e.target.value)} maxLength={40} />
            </Field>
            {show("phone") && (
              <Field label="טלפון" htmlFor="h-phone">
                <input id="h-phone" className={inputClass} dir="ltr" type="tel" inputMode="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} placeholder="050-1234567" />
              </Field>
            )}
            {show("email") && (
              <Field label="אימייל" htmlFor="h-email">
                <input id="h-email" className={inputClass} dir="ltr" type="email" value={d.email} onChange={(e) => set("email", e.target.value)} maxLength={120} />
              </Field>
            )}
            {cfg.sides.length > 0 && show("side") && (
              <Field label="צד" htmlFor="h-side">
                <TagSelect id="h-side" value={d.side} tags={cfg.sides} onChange={(v) => set("side", v)} empty="לא נבחר" />
              </Field>
            )}
            {show("circle") && (
              <Field label="מעגל היכרות" htmlFor="h-circle">
                <TagSelect id="h-circle" value={d.circle} tags={cfg.circles} onChange={(v) => set("circle", v)} empty="לא נבחר" />
              </Field>
            )}
            {show("priority") && (
              <Field label="עדיפות" htmlFor="h-pri" hint='רשימה א = חובה, ב = אם יש מקום'>
                <select id="h-pri" className={selectClass} value={d.priority ?? ""} onChange={(e) => set("priority", (e.target.value || null) as Draft["priority"])}>
                  <option value="">ללא</option>
                  <option value="a">רשימה א</option>
                  <option value="b">רשימה ב</option>
                </select>
              </Field>
            )}
          </div>
          <div className="flex flex-wrap gap-6">
            <Labeled label="מספר מוזמנים (כולל המוזמן/ת)">
              <Stepper label="מספר מוזמנים" value={d.invited} min={0} max={60} onChange={(n) => setD((x) => (x ? { ...x, invited: n, invitedKids: Math.min(x.invitedKids, n) } : x))} />
            </Labeled>
            {show("invitedKids") && (
              <Labeled label="מתוכם ילדים">
                <Stepper label="מתוכם ילדים" value={d.invitedKids} min={0} max={d.invited} onChange={(n) => set("invitedKids", n)} />
              </Labeled>
            )}
          </div>
          {show("companions") && (
            <div className="space-y-2">
              <p className="font-semibold">שמות המצטרפים</p>
              {d.companions.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {d.companions.map((c, i) => (
                    <li key={i} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-muted ps-3 pe-1 font-semibold">
                      {c}
                      <IconButton label={`הסרת ${c}`} className="hover:bg-fg/10" type="button" onClick={() => set("companions", d.companions.filter((_, j) => j !== i))}>
                        <X className="size-4" aria-hidden />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <input
                  className={cx(inputClass, "flex-1")}
                  value={companion}
                  maxLength={40}
                  aria-label="שם מצטרף"
                  placeholder="שם בן/בת הזוג, הילדים..."
                  onChange={(e) => setCompanion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (companion.trim()) set("companions", [...d.companions, companion.trim()]);
                      setCompanion("");
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  icon={<Plus className="size-4" aria-hidden />}
                  disabled={!companion.trim()}
                  onClick={() => {
                    set("companions", [...d.companions, companion.trim()]);
                    setCompanion("");
                  }}
                >
                  הוספה
                </Button>
              </div>
            </div>
          )}
        </Group>

        <Group title="אישור הגעה">
          <StatusPicker value={d.status} onChange={setStatus} />
          {(d.status === "coming" || d.status === "maybe") && (
            <div className="flex flex-wrap gap-6">
              <Labeled label="כמה מגיעים">
                <Stepper label="כמה מגיעים" value={d.coming || d.invited} min={1} max={60} onChange={(n) => setD((x) => (x ? { ...x, coming: n, comingKids: Math.min(x.comingKids, n) } : x))} />
              </Labeled>
              {show("comingKids") && (
                <Labeled label="מתוכם ילדים">
                  <Stepper label="ילדים מגיעים" value={d.comingKids} min={0} max={d.coming || d.invited} onChange={(n) => set("comingKids", n)} />
                </Labeled>
              )}
            </div>
          )}
          {d.guestNote && (
            <p className="rounded-xl bg-muted px-4 py-3">
              <span className="font-semibold">האורח כתב: </span>
              {d.guestNote}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="inline-flex items-center gap-3 font-semibold">
              <Switch checked={!!d.inviteSentAt} onChange={(v) => set("inviteSentAt", v ? Date.now() : null)} label="ההזמנה נשלחה" />
              ההזמנה נשלחה{d.inviteSentAt ? ` (${timeAgo(d.inviteSentAt)})` : ""}
            </label>
            {d.reminders > 0 && <span className="text-sm text-muted-fg">נשלחו {d.reminders} תזכורות</span>}
          </div>
          {!isNew && <PersonalLink h={household!} />}
        </Group>

        {(cfg.meals.length > 0 && show("meals")) || show("allergies") || show("accessibility") ? (
          <Group title="מנות וצרכים">
            {cfg.meals.length > 0 && show("meals") && (
              <div className="flex flex-wrap gap-6">
                {cfg.meals.map((m) => (
                  <Labeled key={m.id} label={m.name}>
                    <Stepper size="sm" label={`מנות ${m.name}`} value={d.meals[m.id] ?? 0} min={0} max={60} onChange={(n) => set("meals", { ...d.meals, [m.id]: n })} />
                  </Labeled>
                ))}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {show("allergies") && (
                <Field label="אלרגיות / רגישויות" htmlFor="h-all">
                  <input id="h-all" className={inputClass} value={d.allergies} onChange={(e) => set("allergies", e.target.value)} maxLength={200} />
                </Field>
              )}
              {show("accessibility") && (
                <Field label="נגישות" htmlFor="h-acc" hint="כיסא גלגלים, ליד היציאה, רחוק מהרמקולים...">
                  <input id="h-acc" className={inputClass} value={d.accessibility} onChange={(e) => set("accessibility", e.target.value)} maxLength={200} />
                </Field>
              )}
            </div>
          </Group>
        ) : null}

        {show("table") && tbls.length > 0 && (
          <Group title="הושבה">
            <Field label="שולחן" htmlFor="h-table" hint={d.seats.length > 1 ? `המשפחה מפוצלת בין ${d.seats.length} שולחנות. בחירה כאן תושיב את כולם יחד.` : undefined}>
              <select id="h-table" className={selectClass} value={d.seats.length === 1 ? d.seats[0].t : ""} onChange={(e) => setTable(e.target.value)}>
                <option value="">{d.seats.length > 1 ? "מפוצל" : "ללא שולחן"}</option>
                {tbls.map((t) => (
                  <option key={t.id} value={t.id}>
                    שולחן {tableName(t)} ({t.seats} מקומות)
                  </option>
                ))}
              </select>
            </Field>
          </Group>
        )}

        {(show("giftAmount") || show("giftMethod")) && (
          <Group title="מתנה">
            <div className="grid gap-4 sm:grid-cols-3">
              {show("giftAmount") && (
                <Field label="סכום (₪)" htmlFor="h-gift">
                  <input id="h-gift" className={inputClass} inputMode="decimal" value={d.giftAmount ?? ""} onChange={(e) => set("giftAmount", e.target.value === "" ? null : Number(e.target.value.replace(/[^\d.]/g, "")) || 0)} />
                </Field>
              )}
              {show("giftMethod") && (
                <Field label="אמצעי" htmlFor="h-gm">
                  <select id="h-gm" className={selectClass} value={d.giftMethod ?? ""} onChange={(e) => set("giftMethod", (e.target.value || null) as GiftMethod | null)}>
                    <option value="">לא צוין</option>
                    {GIFT_METHODS.map((g) => (
                      <option key={g} value={g}>
                        {GIFT_LABELS[g]}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {show("giftNote") && (
                <Field label="הערה" htmlFor="h-gn">
                  <input id="h-gn" className={inputClass} value={d.giftNote} onChange={(e) => set("giftNote", e.target.value)} maxLength={200} placeholder="למשל: מספר צ'ק, בנק" />
                </Field>
              )}
            </div>
            {show("thanked") && (
              <label className="inline-flex items-center gap-3 font-semibold">
                <Switch checked={d.thanked} onChange={(v) => set("thanked", v)} label="נשלחה תודה" />
                נשלחה תודה
              </label>
            )}
          </Group>
        )}

        {show("arrived") && (
          <Group title="ביום האירוע">
            <Labeled label="הגיעו בפועל (צ'ק-אין בכניסה)">
              <Stepper label="הגיעו בפועל" value={d.arrived} min={0} max={60} onChange={(n) => set("arrived", n)} />
            </Labeled>
          </Group>
        )}

        {cfg.custom.length > 0 && (
          <Group title="עמודות נוספות">
            <div className="grid gap-4 sm:grid-cols-2">
              {cfg.custom.map((f) => (
                <CustomInput key={f.id} f={f} value={d.custom[f.id] ?? null} onChange={(v) => set("custom", { ...d.custom, [f.id]: v })} />
              ))}
            </div>
          </Group>
        )}

        {show("notes") && (
          <Field label="הערות" htmlFor="h-notes">
            <textarea id="h-notes" className={cx(inputClass, "min-h-24 py-3")} value={d.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
          </Field>
        )}

        {!isNew && log && log.length > 0 && (
          <Group title="היסטוריית תשובות" icon={<ClockFading className="size-5" aria-hidden />}>
            <ul className="space-y-1 text-sm">
              {log.map((l, i) => (
                <li key={i} className="flex flex-wrap gap-x-2">
                  <span className="text-muted-fg">{timeAgo(l.at)}</span>
                  <span className="font-semibold">{STATUS_LABELS[l.status as RsvpStatus] ?? l.status}</span>
                  {l.coming > 0 && <span>({l.coming})</span>}
                  <span className="text-muted-fg">{l.by === "guest" ? "דרך הקישור האישי" : l.by === "sheet" ? "מהגיליון" : "עודכן ידנית"}</span>
                </li>
              ))}
            </ul>
          </Group>
        )}
        <button type="submit" hidden />
      </form>

      {!isNew && (
        <ConfirmDialog
          open={confirmDelete}
          title={`למחוק את ההזמנה של ${fullName(household!)}?`}
          message={<p>ההזמנה ({household!.invited} מוזמנים) תוסר מהרשימה, מהשולחן ומהגיליון. אפשר לבטל מיד אחרי המחיקה.</p>}
          confirmLabel="מחיקה"
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            if (await p.deleteHouseholds([household!.id])) onClose();
          }}
        />
      )}
    </Modal>
  );
}

function emptyDraft(): Household {
  return {
    id: "",
    first: "",
    last: "",
    phone: "",
    email: "",
    side: null,
    circle: null,
    priority: null,
    invited: 1,
    invitedKids: 0,
    companions: [],
    status: "pending",
    coming: 0,
    comingKids: 0,
    rsvpAt: null,
    rsvpBy: null,
    guestNote: "",
    inviteSentAt: null,
    reminders: 0,
    lastContactAt: null,
    meals: {},
    allergies: "",
    accessibility: "",
    notes: "",
    seats: [],
    giftAmount: null,
    giftMethod: null,
    giftNote: "",
    thanked: false,
    arrived: 0,
    custom: {},
  };
}

function Group({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 flex items-center gap-2 text-lg font-bold">
        {icon}
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-semibold">{label}</span>
      {children}
    </div>
  );
}

export function CustomInput({ f, value, onChange, compact }: { f: CustomField; value: string | number | boolean | null; onChange: (v: string | number | boolean | null) => void; compact?: boolean }) {
  const id = `cf-${f.id}`;
  const cls = compact ? "min-h-11 w-full rounded-lg border border-border bg-card px-2 text-base" : inputClass;
  const input =
    f.type === "checkbox" ? (
      <Switch id={id} checked={value === true} onChange={(v) => onChange(v)} label={f.label} />
    ) : f.type === "choice" ? (
      <select id={id} className={cx(cls, "pe-8")} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">-</option>
        {f.options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    ) : f.type === "number" ? (
      <input id={id} className={cls} inputMode="decimal" value={value === null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value) || 0)} />
    ) : f.type === "date" ? (
      <input id={id} className={cls} type="date" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)} />
    ) : (
      <input id={id} className={cls} value={typeof value === "string" ? value : value === null ? "" : String(value)} onChange={(e) => onChange(e.target.value || null)} maxLength={200} />
    );
  if (compact) return input;
  return (
    <Field label={f.label} htmlFor={id}>
      {input}
    </Field>
  );
}

/** The household's personal RSVP link: copy, send by WhatsApp, or replace (old link stops working). */
function PersonalLink({ h }: { h: HouseholdDTO }) {
  const p = usePlanner();
  const url = p.rsvpUrl(h);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/50 p-3">
      <p className="flex items-center gap-2 font-semibold">
        <Link2 className="size-4" aria-hidden />
        קישור אישי לאישור הגעה
      </p>
      <code dir="ltr" className="block truncate rounded-lg bg-card px-3 py-2 text-sm">
        {url}
      </code>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          icon={<Copy className="size-4" aria-hidden />}
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          <span aria-live="polite">{copied ? "הועתק" : "העתקה"}</span>
        </Button>
        <a
          href={waLink(h.phone, p.message(h.inviteSentAt ? "reminder" : "invite", h))}
          target="_blank"
          rel="noopener"
          onClick={() => p.patchOne(h.id, h.inviteSentAt ? { reminders: h.reminders + 1, lastContactAt: Date.now() } : { inviteSentAt: Date.now(), lastContactAt: Date.now() })}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-sm font-semibold text-[#052e16] no-underline hover:brightness-105"
        >
          <WhatsAppIcon className="size-4" />
          {h.inviteSentAt ? "שליחת תזכורת" : "שליחה בוואטסאפ"}
        </a>
        <Button type="button" size="sm" variant="ghost" icon={<RefreshCw className="size-4" aria-hidden />} onClick={() => setConfirm(true)}>
          קישור חדש
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        danger={false}
        title="ליצור קישור אישי חדש?"
        message={<p>הקישור הנוכחי יפסיק לעבוד. כדאי רק אם הקישור הגיע למישהו אחר בטעות.</p>}
        confirmLabel="יצירת קישור חדש"
        onClose={() => setConfirm(false)}
        onConfirm={() => p.newLink(h.id)}
      />
    </div>
  );
}
