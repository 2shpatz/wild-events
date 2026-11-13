import { useMemo, useState } from "react";
import { Copy, MessageSquareText, Phone, PhoneCall, Send, SkipForward, SquarePen } from "lucide-react";
import {
  PLACEHOLDERS,
  TEMPLATE_IDS,
  TEMPLATE_LABELS,
  DEFAULT_TEMPLATES,
  displayPhone,
  fullName,
  smsLink,
  telLink,
  waLink,
  waNumber,
  type HouseholdDTO,
  type RsvpStatus,
  type TemplateId,
} from "../../../shared/guests";
import { Button, Card, Field, Segmented, cx, inputClass, useToast } from "../ui";
import { Toggle } from "../manage/Toggle";
import { WhatsAppIcon } from "../QRShare";
import { usePlanner } from "./store";
import { Empty, StatusBadge, StatusPicker, Stepper, num } from "./bits";

type Mode = "send" | "calls" | "texts";
type Audience = "notSent" | "pending" | "maybe" | "coming" | "all";
const AUDIENCES: { id: Audience; label: string; tpl: TemplateId }[] = [
  { id: "notSent", label: "עוד לא קיבלו הזמנה", tpl: "invite" },
  { id: "pending", label: "קיבלו ולא ענו", tpl: "reminder" },
  { id: "maybe", label: "ענו אולי", tpl: "reminder" },
  { id: "coming", label: "מגיעים (מספר שולחן / תודה)", tpl: "table" },
  { id: "all", label: "כולם", tpl: "invite" },
];

/**
 * RSVP center: rounds of personal WhatsApp messages (free click-to-chat, one tap per family, then the next),
 * a caller list for whoever didn't answer, and the message texts. Everything also works with the personal link.
 */
export function RsvpCenter({ go }: { go: (p: string) => void }) {
  const p = usePlanner();
  const { config: cfg, households } = p.data;
  const [mode, setMode] = useState<Mode>("send");
  const answered = households.filter((h) => h.status !== "pending").length;
  const pct = households.length ? Math.round((answered / households.length) * 100) : 0;
  const setRsvp = (patch: Partial<typeof cfg.rsvp>, msg?: string) => p.saveConfig({ ...cfg, rsvp: { ...cfg.rsvp, ...patch } }, msg);

  if (!households.length)
    return (
      <Empty
        icon={<Send className="size-7" aria-hidden />}
        title="קודם מוסיפים מוזמנים"
        text="אחרי שהרשימה מוכנה, כאן שולחים לכל משפחה קישור אישי לאישור הגעה."
        action={<Button onClick={() => go("guests")}>לרשימת המוזמנים</Button>}
      />
    );

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="min-w-48 flex-1">
            <p className="mb-2 flex items-baseline justify-between gap-2 font-semibold">
              <span>
                {num(answered)} מתוך {num(households.length)} הזמנות ענו
              </span>
              <span className="text-sm text-muted-fg">{pct}%</span>
            </p>
            <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="ענו" aria-valuemin={0} aria-valuemax={households.length} aria-valuenow={answered}>
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">תאריך אחרון לאישור</span>
              <input type="date" className={cx(inputClass, "min-h-11 w-44")} value={cfg.rsvp.deadline ?? ""} onChange={(e) => setRsvp({ deadline: e.target.value || null }, "התאריך נשמר")} />
            </label>
            <div className="min-w-56">
              <Toggle checked={cfg.rsvp.open} onChange={(v) => setRsvp({ open: v }, v ? "אישורי ההגעה פתוחים" : "אישורי ההגעה נסגרו")} label="אישורי הגעה פתוחים" hint="כבוי = הקישור האישי רק מציג את התשובה" />
            </div>
          </div>
        </div>
      </Card>

      <Segmented
        label="מצב"
        value={mode}
        onChange={setMode}
        options={[
          { value: "send", label: "שליחה בוואטסאפ", icon: <WhatsAppIcon className="size-4" /> },
          { value: "calls", label: "שיחות טלפון", icon: <PhoneCall className="size-4" aria-hidden /> },
          { value: "texts", label: "נוסחי ההודעות", icon: <SquarePen className="size-4" aria-hidden /> },
        ]}
      />
      {mode === "send" && <SendQueue />}
      {mode === "calls" && <Calls />}
      {mode === "texts" && <Texts />}
    </div>
  );
}

function audienceOf(a: Audience, list: HouseholdDTO[]) {
  switch (a) {
    case "notSent":
      return list.filter((h) => h.status === "pending" && !h.inviteSentAt);
    case "pending":
      return list.filter((h) => h.status === "pending" && h.inviteSentAt);
    case "maybe":
      return list.filter((h) => h.status === "maybe");
    case "coming":
      return list.filter((h) => h.status === "coming");
    default:
      return list.filter((h) => h.status !== "not_coming");
  }
}

/** One family at a time: open WhatsApp with the personal message, mark it sent, go to the next. */
function SendQueue() {
  const p = usePlanner();
  const toast = useToast();
  const [audience, setAudience] = useState<Audience>("notSent");
  const [tpl, setTpl] = useState<TemplateId>("invite");
  const [done, setDone] = useState<Set<string>>(new Set());
  const all = useMemo(() => audienceOf(audience, p.data.households), [audience, p.data.households]);
  // The round is fixed once it starts (sent families would otherwise drop out of "not sent yet" and move the count).
  const [frozen, setFrozen] = useState<string[] | null>(null);
  const byId = new Map(p.data.households.map((h) => [h.id, h]));
  const live = all.filter((h) => waNumber(h.phone));
  const withPhone = frozen ? (frozen.map((id) => byId.get(id)).filter(Boolean) as HouseholdDTO[]) : live;
  const noPhone = all.filter((h) => !waNumber(h.phone));
  const queue = withPhone.filter((h) => !done.has(h.id));
  const cur = queue[0];
  const pick = (a: Audience) => {
    setAudience(a);
    setTpl(AUDIENCES.find((x) => x.id === a)!.tpl);
    setDone(new Set());
    setFrozen(null);
  };
  const mark = (h: HouseholdDTO) => {
    if (!frozen) setFrozen(withPhone.map((x) => x.id));
    const now = Date.now();
    if (tpl === "invite" && !h.inviteSentAt) p.patchOne(h.id, { inviteSentAt: now, lastContactAt: now });
    else if (tpl === "reminder") p.patchOne(h.id, { reminders: h.reminders + 1, lastContactAt: now, inviteSentAt: h.inviteSentAt ?? now });
    else p.patchOne(h.id, { lastContactAt: now });
    setDone((s) => new Set(s).add(h.id));
  };
  const text = cur ? p.message(tpl, cur) : "";
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <Card className="space-y-4">
        <fieldset>
          <legend className="mb-2 font-bold">למי שולחים</legend>
          <div className="space-y-1.5">
            {AUDIENCES.map((a) => {
              const n = audienceOf(a.id, p.data.households).length;
              return (
                <label key={a.id} className={cx("flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3", audience === a.id ? "border-primary bg-primary/5" : "border-border")}>
                  <input type="radio" name="aud" className="size-5 accent-[var(--primary)]" checked={audience === a.id} onChange={() => pick(a.id)} />
                  <span className="flex-1 font-semibold">{a.label}</span>
                  <span className="text-sm tabular-nums text-muted-fg">{num(n)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <Field label="איזו הודעה" htmlFor="q-tpl">
          <select id="q-tpl" className={inputClass} value={tpl} onChange={(e) => setTpl(e.target.value as TemplateId)}>
            {TEMPLATE_IDS.map((t) => (
              <option key={t} value={t}>
                {TEMPLATE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-sm text-muted-fg">וואטסאפ נפתח עם ההודעה מוכנה. לוחצים &quot;שליחה&quot; בוואטסאפ, חוזרים לכאן, וממשיכים למשפחה הבאה.</p>
      </Card>

      <div className="space-y-4">
        {!withPhone.length && !noPhone.length ? (
          <Empty icon={<Send className="size-7" aria-hidden />} title="אין כאן אף אחד" text="בחרו קבוצה אחרת." />
        ) : cur ? (
          <Card className="space-y-4">
            <p className="text-sm font-semibold text-muted-fg" role="status">
              {num(done.size + 1)} מתוך {num(withPhone.length)}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-2xl font-bold">{fullName(cur)}</p>
                <p className="text-muted-fg">
                  <bdi dir="ltr">{displayPhone(cur.phone)}</bdi> · {num(cur.invited)} מוזמנים
                </p>
              </div>
              <StatusBadge status={cur.status} />
            </div>
            <p className="whitespace-pre-line rounded-2xl bg-[#dcf8c6] px-4 py-3 text-[#111b21]" dir="auto">
              {text}
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={waLink(cur.phone, text)}
                target="_blank"
                rel="noopener"
                onClick={() => mark(cur)}
                className="inline-flex min-h-14 flex-1 items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] px-6 text-lg font-bold text-[#052e16] no-underline shadow-soft hover:brightness-105"
              >
                <WhatsAppIcon className="size-6" />
                שליחה בוואטסאפ
              </a>
              <a href={smsLink(cur.phone, text)} onClick={() => mark(cur)} className="inline-flex min-h-14 items-center gap-2 rounded-2xl border-2 border-border px-4 font-semibold text-fg no-underline hover:bg-fg/5">
                <MessageSquareText className="size-5" aria-hidden />
                SMS
              </a>
              <Button size="lg" variant="ghost" icon={<SkipForward className="size-5" aria-hidden />} onClick={() => { if (!frozen) setFrozen(withPhone.map((x) => x.id)); setDone((s) => new Set(s).add(cur.id)); }}>
                דילוג
              </Button>
            </div>
          </Card>
        ) : (
          <Card>
            <p className="text-lg font-bold">סיימתם את כל {num(withPhone.length)} ההודעות בקבוצה הזו.</p>
            <Button variant="outline" className="mt-3" onClick={() => { setDone(new Set()); setFrozen(null); }}>
              להתחיל מחדש
            </Button>
          </Card>
        )}
        {noPhone.length > 0 && (
          <Card>
            <h3 className="mb-2 font-bold">בלי מספר טלפון ({num(noPhone.length)})</h3>
            <p className="mb-3 text-sm text-muted-fg">אפשר להעתיק את הקישור האישי ולשלוח בדרך אחרת, או להוסיף טלפון ברשימה.</p>
            <ul className="divide-y divide-border">
              {noPhone.slice(0, 50).map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="font-semibold">{fullName(h)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Copy className="size-4" aria-hidden />}
                    onClick={async () => {
                      await navigator.clipboard.writeText(p.message(tpl, h));
                      toast("ההודעה עם הקישור הועתקה");
                    }}
                  >
                    העתקת ההודעה
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

/** Caller list ("טלפנים"): everyone who didn't answer (and "maybe"), call + one-tap answer + headcount. */
function Calls() {
  const p = usePlanner();
  const [show, setShow] = useState<"pending" | "maybe">("pending");
  const list = p.data.households.filter((h) => h.status === show);
  const answer = (h: HouseholdDTO, s: RsvpStatus) => p.patchOne(h.id, { status: s, coming: s === "not_coming" ? 0 : h.coming || h.invited, lastContactAt: Date.now() });
  return (
    <div className="space-y-4">
      <Segmented
        label="מי ברשימה"
        value={show}
        onChange={setShow}
        options={[
          { value: "pending", label: `לא ענו (${num(p.data.households.filter((h) => h.status === "pending").length)})` },
          { value: "maybe", label: `אולי (${num(p.data.households.filter((h) => h.status === "maybe").length)})` },
        ]}
      />
      {!list.length ? (
        <Empty icon={<Phone className="size-7" aria-hidden />} title="אין למי להתקשר" text="כל מי שברשימה הזו כבר ענה." />
      ) : (
        <ul className="space-y-2">
          {list.slice(0, 200).map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
              <div className="min-w-40 flex-1">
                <p className="font-bold">{fullName(h)}</p>
                <p className="text-sm text-muted-fg">
                  {h.phone ? <bdi dir="ltr">{displayPhone(h.phone)}</bdi> : "אין טלפון"} · {num(h.invited)} מוזמנים
                  {h.lastContactAt ? ` · נוצר קשר לאחרונה ${new Date(h.lastContactAt).toLocaleDateString("he-IL")}` : ""}
                </p>
              </div>
              {waNumber(h.phone) && (
                <a href={telLink(h.phone)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-on-primary no-underline shadow-soft hover:brightness-110">
                  <Phone className="size-4" aria-hidden />
                  חיוג
                </a>
              )}
              <div className="w-full sm:w-auto sm:min-w-80">
                <StatusPicker compact value={h.status} onChange={(s) => answer(h, s)} label={`תשובה - ${fullName(h)}`} />
              </div>
              {h.status === "maybe" && <Stepper size="sm" label="כמה מגיעים" value={h.coming || h.invited} min={1} max={60} onChange={(n) => p.patchOne(h.id, { coming: n })} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The 4 message texts with placeholders and a live preview. */
function Texts() {
  const p = usePlanner();
  const cfg = p.data.config;
  const [id, setId] = useState<TemplateId>("invite");
  const [draft, setDraft] = useState(cfg.rsvp.templates);
  const sample = p.data.households[0];
  const insert = (ph: string) => {
    const el = document.getElementById("tpl-text") as HTMLTextAreaElement | null;
    const v = draft[id];
    const at = el?.selectionStart ?? v.length;
    setDraft({ ...draft, [id]: v.slice(0, at) + ph + v.slice(el?.selectionEnd ?? at) });
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(cfg.rsvp.templates);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="space-y-4">
        <Field label="הודעה" htmlFor="tpl-id">
          <select id="tpl-id" className={inputClass} value={id} onChange={(e) => setId(e.target.value as TemplateId)}>
            {TEMPLATE_IDS.map((t) => (
              <option key={t} value={t}>
                {TEMPLATE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="הנוסח" htmlFor="tpl-text">
          <textarea id="tpl-text" className={cx(inputClass, "min-h-40 py-3")} value={draft[id]} maxLength={1000} onChange={(e) => setDraft({ ...draft, [id]: e.target.value })} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-semibold">הוספת פרט שמתחלף לכל משפחה:</p>
          <div className="flex flex-wrap gap-1.5">
            {PLACEHOLDERS.map((ph) => (
              <button key={ph} type="button" onClick={() => insert(ph)} className="min-h-11 rounded-full border border-border px-3 text-sm font-semibold hover:border-primary hover:bg-primary/5">
                {ph}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!dirty} onClick={() => p.saveConfig({ ...cfg, rsvp: { ...cfg.rsvp, templates: draft } }, "הנוסחים נשמרו")}>
            שמירה
          </Button>
          <Button variant="ghost" onClick={() => setDraft({ ...draft, [id]: DEFAULT_TEMPLATES[id] })}>
            חזרה לנוסח המקורי
          </Button>
        </div>
      </Card>
      <Card>
        <p className="mb-2 font-bold">כך זה ייראה{sample ? ` אצל ${fullName(sample)}` : ""}</p>
        <p className="whitespace-pre-line rounded-2xl bg-[#dcf8c6] px-4 py-3 text-[#111b21]" dir="auto">
          {sample ? p.message(draft[id], sample) : draft[id]}
        </p>
        <p className="mt-3 text-sm text-muted-fg">{"{קישור}"} הוא הקישור האישי של כל משפחה. דרכו הם עונים בלחיצה, ואתם רואים את התשובה כאן ובגיליון.</p>
      </Card>
    </div>
  );
}
