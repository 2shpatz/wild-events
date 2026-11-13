import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Armchair, CalendarPlus, CheckCircle2, Clock, HelpCircle, MapPin, PartyPopper, XCircle } from "lucide-react";
import type { PublicEvent } from "../../shared/types";
import type { RsvpStatus } from "../../shared/guests";
import { api, errorMessage } from "../lib/api";
import { applyTheme, isDarkBackground } from "../lib/themes";
import { EventBackdrop, EventStatus, EventTitle } from "../components/EventChrome";
import { Button, cx } from "../components/ui";
import { destination, googleCalendarUrl, navLinks, whenText } from "../lib/eventInfo";
import { WazeIcon } from "../components/EventDetails";
import { Stepper } from "../components/planner/bits";

type View = {
  household: { first: string; last: string; invited: number; invitedKids: number; companions: string[]; status: RsvpStatus; coming: number; comingKids: number; meals: Record<string, number>; note: string; answeredAt: number | null };
  settings: { closed: boolean; deadline: string | null; askKids: boolean; askMeals: boolean; askNote: boolean; maxComing: number; meals: { id: string; name: string }[] };
  table: string | null;
};

const CHOICES: { s: Exclude<RsvpStatus, "pending">; label: string; Icon: typeof CheckCircle2; tone: string }[] = [
  { s: "coming", label: "מגיעים", Icon: CheckCircle2, tone: "border-green-600 bg-green-600 text-white" },
  { s: "maybe", label: "אולי", Icon: HelpCircle, tone: "border-amber-500 bg-amber-500 text-zinc-900" },
  { s: "not_coming", label: "לא נוכל להגיע", Icon: XCircle, tone: "border-zinc-700 bg-zinc-700 text-white" },
];

/**
 * The personal RSVP link a family gets by WhatsApp (/<event>/r/<token>): the event's look, big answer buttons,
 * how many (adults / kids), special meals and a note. After answering: the event details, navigation, calendar,
 * and the table once the hosts publish the seating.
 */
export default function Rsvp() {
  const { code = "", token = "" } = useParams();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState<Exclude<RsvpStatus, "pending"> | null>(null);
  const [coming, setComing] = useState(1);
  const [kids, setKids] = useState(0);
  const [meals, setMeals] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    Promise.all([api<PublicEvent>(`/e/${code}`), api<View>(`/e/${code}/rsvp/${token}`)])
      .then(([ev, v]) => {
        setEvent(ev);
        applyTheme(ev.theme);
        document.title = `אישור הגעה · ${ev.title}`;
        setView(v);
        const h = v.household;
        setStatus(h.status === "pending" ? null : h.status);
        setComing(Math.max(1, h.coming || h.invited || 1));
        setKids(h.comingKids);
        setMeals(h.meals);
        setNote(h.note);
        setEditing(h.status === "pending");
      })
      .catch(setError);
  }, [code, token]);

  if (!event || !view) return <EventStatus error={error} loading />;
  const dark = isDarkBackground(event.background, event.theme);
  const h = view.household;
  const s = view.settings;
  const name = [h.first, h.last].filter(Boolean).join(" ");
  const answered = h.status !== "pending";
  const card = cx("rounded-[2rem] px-5 py-6 backdrop-blur-md sm:px-8", dark ? "bg-zinc-950/55 text-white" : "bg-card/90 shadow-lift");
  const dest = destination(event);

  const send = async () => {
    if (!status) return;
    setBusy(true);
    setSendError(null);
    try {
      const v = await api<View>(`/e/${code}/rsvp/${token}`, { method: "POST", json: { status, coming, comingKids: kids, meals, note } });
      setView(v);
      setEditing(false);
      navigator.vibrate?.(10);
    } catch (e) {
      setSendError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <EventBackdrop event={event}>
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-4 py-10 sm:py-16">
        <EventTitle event={event} size="md" />

        <section className={card} aria-labelledby="rsvp-title">
          <h2 id="rsvp-title" className="mb-1 text-center text-2xl font-bold">
            {name ? `שלום ${name}!` : "שלום!"}
          </h2>
          <p className="mb-6 text-center text-lg opacity-90">
            {h.invited > 1 ? `ההזמנה ל-${h.invited} אנשים${h.companions.length ? ` (${h.companions.join(", ")})` : ""}.` : "נשמח לדעת אם תגיעו."}
          </p>

          {!editing && answered ? (
            <div className="space-y-4 text-center" role="status">
              {h.status === "coming" ? (
                <PartyPopper className="mx-auto size-12 text-primary" aria-hidden />
              ) : h.status === "maybe" ? (
                <HelpCircle className="mx-auto size-12 text-amber-500" aria-hidden />
              ) : (
                <XCircle className="mx-auto size-12 opacity-70" aria-hidden />
              )}
              <p className="text-xl font-bold">
                {h.status === "coming" ? `תודה! רשמנו ${h.coming} מגיעים${h.comingKids ? ` (מתוכם ${h.comingKids} ילדים)` : ""}.` : h.status === "maybe" ? "רשמנו שאולי תגיעו. אפשר לעדכן כאן בכל רגע." : "חבל שלא תוכלו להגיע. תודה שעדכנתם."}
              </p>
              {view.table && h.status !== "not_coming" && (
                <p className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-xl font-bold text-on-primary">
                  <Armchair className="size-6" aria-hidden />
                  השולחן שלכם: {view.table}
                </p>
              )}
              {!s.closed && (
                <div>
                  <Button variant={dark ? "glass" : "outline"} onClick={() => setEditing(true)}>
                    שינוי התשובה
                  </Button>
                </div>
              )}
            </div>
          ) : s.closed ? (
            <p className="text-center text-lg font-semibold">אישורי ההגעה נסגרו. לשינוי אפשר לפנות לבעלי השמחה.</p>
          ) : (
            <form
              className="space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <div role="radiogroup" aria-label="האם מגיעים" className="grid gap-2 sm:grid-cols-3">
                {CHOICES.map((c) => (
                  <button
                    key={c.s}
                    type="button"
                    role="radio"
                    aria-checked={status === c.s}
                    onClick={() => setStatus(c.s)}
                    className={cx(
                      "flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 px-3 text-lg font-bold transition-colors duration-200",
                      status === c.s ? c.tone : dark ? "border-white/40 bg-white/10 hover:bg-white/20" : "border-border bg-card hover:border-primary",
                    )}
                  >
                    <c.Icon className="size-6" aria-hidden />
                    {c.label}
                  </button>
                ))}
              </div>

              {(status === "coming" || status === "maybe") && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-lg font-semibold">כמה תגיעו?</span>
                    <Stepper label="כמה מגיעים" value={coming} min={1} max={s.maxComing} onChange={(n) => { setComing(n); setKids((k) => Math.min(k, n)); }} />
                  </div>
                  {s.askKids && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-lg font-semibold">מתוכם ילדים</span>
                      <Stepper label="מתוכם ילדים" value={kids} min={0} max={coming} onChange={setKids} />
                    </div>
                  )}
                  {s.askMeals && (
                    <fieldset className="space-y-3">
                      <legend className="mb-1 text-lg font-semibold">מנות מיוחדות (אם צריך)</legend>
                      {s.meals.map((m) => (
                        <div key={m.id} className="flex flex-wrap items-center justify-between gap-3">
                          <span>{m.name}</span>
                          <Stepper size="sm" label={`מנות ${m.name}`} value={meals[m.id] ?? 0} min={0} max={coming} onChange={(n) => setMeals({ ...meals, [m.id]: n })} />
                        </div>
                      ))}
                    </fieldset>
                  )}
                </div>
              )}

              {s.askNote && status && (
                <label className="block">
                  <span className="mb-1.5 block font-semibold">רוצים להוסיף משהו? (לא חובה)</span>
                  <textarea
                    className={cx("min-h-20 w-full rounded-xl border px-4 py-3 text-base focus:outline-none focus:ring-4 focus:ring-primary/20", dark ? "border-white/30 bg-white/10 text-white placeholder:text-white/60" : "border-border bg-card text-fg")}
                    value={note}
                    maxLength={500}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="אלרגיה, הסעה, ברכה..."
                  />
                </label>
              )}

              {sendError && (
                <p role="alert" className="font-semibold text-destructive">
                  {sendError}
                </p>
              )}
              <Button type="submit" size="xl" className="w-full" loading={busy} disabled={!status}>
                שליחת התשובה
              </Button>
              {s.deadline && (
                <p className="flex items-center justify-center gap-1.5 text-sm opacity-80">
                  <Clock className="size-4" aria-hidden />
                  נשמח לתשובה עד {new Date(s.deadline).toLocaleDateString("he-IL")}
                </p>
              )}
            </form>
          )}
        </section>

        {(event.date || dest) && (
          <section className={card} aria-label="פרטי האירוע">
            {event.date && <p className="mb-3 text-center text-lg font-semibold">{whenText(event)}</p>}
            {dest && (
              <p className="mb-4 flex items-center justify-center gap-1.5 text-center">
                <MapPin className="size-5 shrink-0" aria-hidden />
                {[event.venueName, event.venueAddress].filter(Boolean).join(", ")}
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              {dest && (
                <a href={navLinks(dest).waze} target="_blank" rel="noopener" className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#33ccff] px-5 font-bold text-[#0b1f33] no-underline hover:brightness-105">
                  <WazeIcon className="size-6" />
                  ניווט ב-Waze
                </a>
              )}
              {googleCalendarUrl(event) && (
                <a href={googleCalendarUrl(event)!} target="_blank" rel="noopener" className={cx("inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 px-5 font-bold no-underline", dark ? "border-white/40 text-white hover:bg-white/10" : "border-border text-fg hover:bg-fg/5")}>
                  <CalendarPlus className="size-5" aria-hidden />
                  הוספה ליומן
                </a>
              )}
            </div>
          </section>
        )}

        <p className="text-center">
          <Link to={`/${code}`} className="font-semibold underline underline-offset-4">
            לעמוד האירוע
          </Link>
        </p>
      </main>
    </EventBackdrop>
  );
}
