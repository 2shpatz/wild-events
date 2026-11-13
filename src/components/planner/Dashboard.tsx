import { useMemo, type ReactNode } from "react";
import { AlertOctagon, AlertTriangle, Armchair, CheckCircle2, ChevronLeft, Clock, HelpCircle, Info, UserCheck, UserX, Users, Wallet } from "lucide-react";
import { GIFT_LABELS, budgetSummary, localToday } from "../../../shared/guests";
import { Card, cx } from "../ui";
import { usePlanner } from "./store";
import { ils, num, StatTile } from "./bits";
import { sheetError } from "./store";

type Level = "critical" | "warning" | "info";
type Alert = { level: Level; text: string; action: string; to: string };

/**
 * One screen of "where are we": headcounts by status, seats vs people, what needs attention (each warning links to
 * the page that fixes it), breakdowns by side / circle, meals for the caterer, answers over time and money.
 */
export function Dashboard({ go }: { go: (p: string) => void }) {
  const { data, stats } = usePlanner();
  const cfg = data.config;
  const today = localToday();
  const money = useMemo(() => budgetSummary(data.expenses, data.vendors, stats.expected, cfg, today), [data.expenses, data.vendors, stats.expected, cfg, today]);

  const alerts: Alert[] = [];
  if (stats.households === 0) alerts.push({ level: "info", text: "הרשימה עוד ריקה. מתחילים בהוספת מוזמנים או בייבוא רשימה קיימת.", action: "לרשימת המוזמנים", to: "guests" });
  if (stats.toSeat > 0 && stats.tables === 0) alerts.push({ level: "warning", text: "עוד לא הוגדרו שולחנות באולם.", action: "לסידור ההושבה", to: "seating" });
  else if (stats.seats < stats.toSeat)
    alerts.push({ level: "critical", text: `חסרים ${num(stats.toSeat - stats.seats)} מקומות ישיבה: יש ${num(stats.seats)} כיסאות ל-${num(stats.toSeat)} אנשים.`, action: "הוספת שולחנות", to: "seating" });
  if (stats.tables > 0 && stats.unseatedPeople > 0)
    alerts.push({ level: "warning", text: `${num(stats.unseatedPeople)} אנשים (${num(stats.unseatedHouseholds)} הזמנות) עדיין בלי שולחן.`, action: "להושיב", to: "seating" });
  for (const t of stats.overTables.slice(0, 3)) alerts.push({ level: "critical", text: `בשולחן ${t.label} יש ${num(t.over)} אנשים יותר מהכיסאות.`, action: "לשולחן", to: "seating" });
  if (stats.notSent > 0) alerts.push({ level: "warning", text: `${num(stats.notSent)} הזמנות עוד לא נשלחו.`, action: "לשליחה", to: "rsvp" });
  if (cfg.rsvp.deadline) {
    const days = Math.round((Date.parse(cfg.rsvp.deadline) - Date.parse(today)) / 86_400_000);
    const pending = stats.byStatus.pending.households;
    if (pending > 0 && days < 0) alerts.push({ level: "critical", text: `התאריך האחרון לאישור עבר ו-${num(pending)} הזמנות עוד לא ענו.`, action: "תזכורת / טלפון", to: "rsvp" });
    else if (pending > 0 && days <= 7) alerts.push({ level: "warning", text: `${days === 0 ? "היום" : `בעוד ${num(days)} ימים`} התאריך האחרון לאישור, ו-${num(pending)} הזמנות עוד לא ענו.`, action: "שליחת תזכורת", to: "rsvp" });
  }
  if (stats.noPhone > 0 && stats.households > 0) alerts.push({ level: "info", text: `חסר טלפון תקין ל-${num(stats.noPhone)} הזמנות (בלעדיו אי אפשר לשלוח וואטסאפ).`, action: "להשלים", to: "guests" });
  for (const d of money.overdue.slice(0, 3)) alerts.push({ level: "critical", text: `תשלום של ${ils(d.payment.amount)} עבור "${d.title}" היה צריך לצאת לפני ${num(-d.days)} ימים.`, action: "לתשלומים", to: "expenses" });
  for (const d of money.due.filter((d) => d.days <= 7).slice(0, 3))
    alerts.push({ level: "warning", text: `תשלום של ${ils(d.payment.amount)} עבור "${d.title}" ${d.days === 0 ? "היום" : `בעוד ${num(d.days)} ימים`}.`, action: "לתשלומים", to: "expenses" });
  if (money.overBudget > 0) alerts.push({ level: "critical", text: `ההוצאות עברו את התקציב ב-${ils(money.overBudget)}.`, action: "להוצאות", to: "expenses" });
  if (cfg.budget.minGuests && stats.expected < cfg.budget.minGuests)
    alerts.push({ level: "warning", text: `התחייבתם לאולם על ${num(cfg.budget.minGuests)} מנות, וצפויים רק כ-${num(stats.expected)} אורחים.`, action: "להוצאות", to: "expenses" });
  if (data.sheet?.error) alerts.push({ level: "warning", text: `Google Sheets: ${sheetError(data.sheet.error)}`, action: "להגדרות", to: "settings" });
  if (data.sheet?.pendingDeletes) alerts.push({ level: "warning", text: `${num(data.sheet.pendingDeletes)} שורות נמחקו מהגיליון. צריך לאשר אם למחוק אותן גם כאן.`, action: "להחלטה", to: "settings" });
  const order: Record<Level, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);

  const s = stats.byStatus;
  return (
    <div className="space-y-6">
      <section aria-label="מספרים" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="הוזמנו" icon={<Users className="size-4" aria-hidden />} value={num(stats.invited)} sub={`${num(stats.households)} הזמנות${stats.invitedKids ? ` · ${num(stats.invitedKids)} ילדים` : ""}`} />
        <StatTile label="מגיעים" tone="good" icon={<UserCheck className="size-4" aria-hidden />} value={num(stats.confirmed)} sub={`${num(s.coming.households)} הזמנות${stats.confirmedKids ? ` · ${num(stats.confirmedKids)} ילדים` : ""}`} />
        <StatTile label="אולי" tone="warn" icon={<HelpCircle className="size-4" aria-hidden />} value={num(s.maybe.people)} sub={`${num(s.maybe.households)} הזמנות`} />
        <StatTile label="ממתינים" tone="muted" icon={<Clock className="size-4" aria-hidden />} value={num(s.pending.people)} sub={`${num(s.pending.households)} הזמנות`} />
        <StatTile label="לא מגיעים" tone="bad" icon={<UserX className="size-4" aria-hidden />} value={num(s.not_coming.people)} sub={`${num(s.not_coming.households)} הזמנות`} />
        <StatTile label="צפויים להגיע" icon={<CheckCircle2 className="size-4" aria-hidden />} value={`כ-${num(stats.expected)}`} sub={`מגיעים + חצי מה"אולי" + ${cfg.turnoutPct}% מהממתינים`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <AlertTriangle className="size-5 text-primary" aria-hidden />
            מה דורש טיפול
          </h2>
          {alerts.length === 0 ? (
            <p className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircle2 className="size-6 text-green-600" aria-hidden />
              הכול מסודר כרגע.
            </p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a, i) => (
                <li key={i}>
                  <AlertRow alert={a} onGo={() => go(a.to)} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
            <Armchair className="size-5 text-primary" aria-hidden />
            מקומות ישיבה
          </h2>
          <p className="mb-5 text-sm text-muted-fg">
            הסידור סופר {cfg.planBy === "confirmed" ? "רק את המגיעים" : cfg.planBy === "all" ? "את כל המוזמנים שלא סירבו" : 'את המגיעים ואת ה"אולי"'} (משנים בהגדרות).
          </p>
          <SeatMeter seats={stats.seats} toSeat={stats.toSeat} seated={stats.seated} expected={stats.expected} />
          <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
            <Figure label="שולחנות" value={num(stats.tables)} />
            <Figure label="כיסאות" value={num(stats.seats)} />
            <Figure label="הושבו" value={num(stats.seated)} />
          </dl>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {stats.bySide.length > 0 && <Breakdown title="לפי צד" rows={stats.bySide} />}
        <Breakdown title="לפי מעגל היכרות" rows={stats.byCircle} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {cfg.meals.length > 0 && (
          <Card>
            <h2 className="mb-3 text-lg font-bold">מנות לקייטרינג</h2>
            <p className="mb-3 text-sm text-muted-fg">לפי המגיעים בלבד.</p>
            <table className="w-full text-start">
              <tbody>
                <tr className="border-b border-border">
                  <th scope="row" className="py-2 text-start font-semibold">רגילה</th>
                  <td className="py-2 text-end text-lg font-bold tabular-nums">{num(stats.regularMeals)}</td>
                </tr>
                {stats.meals.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <th scope="row" className="py-2 text-start font-semibold">{m.name}</th>
                    <td className="py-2 text-end text-lg font-bold tabular-nums">{num(m.n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <Card>
          <h2 className="mb-3 text-lg font-bold">תשובות לאורך הזמן</h2>
          <Replies replies={data.replies} />
        </Card>
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <Wallet className="size-5 text-primary" aria-hidden />
            כסף
          </h2>
          <dl className="space-y-2">
            <MoneyRow label="סך ההוצאות" value={ils(money.total)} />
            {money.budget != null && <MoneyRow label="תקציב" value={ils(money.budget)} />}
            <MoneyRow label="שולם" value={ils(money.paid)} />
            <MoneyRow label="נשאר לשלם" value={ils(money.left)} strong />
            {money.perGuest != null && <MoneyRow label="עלות לאורח צפוי" value={ils(money.perGuest)} />}
            {stats.gifts.count > 0 && (
              <>
                <MoneyRow label={`מתנות (${num(stats.gifts.count)})`} value={ils(stats.gifts.total)} />
                <MoneyRow label="מאזן (מתנות פחות הוצאות)" value={ils(stats.gifts.total - money.total)} strong />
              </>
            )}
          </dl>
          {stats.gifts.byMethod.length > 0 && (
            <p className="mt-3 text-sm text-muted-fg">{stats.gifts.byMethod.map((g) => `${GIFT_LABELS[g.method]}: ${ils(g.total)}`).join(" · ")}</p>
          )}
          <button type="button" onClick={() => go("expenses")} className="mt-4 inline-flex min-h-11 items-center gap-1 font-semibold text-primary hover:underline">
            להוצאות ולתשלומים
            <ChevronLeft className="size-4" aria-hidden />
          </button>
        </Card>
      </div>
    </div>
  );
}

const ALERT_STYLE: Record<Level, { box: string; icon: ReactNode; label: string }> = {
  critical: { box: "border-red-600/40 bg-red-600/10", icon: <AlertOctagon className="size-5 shrink-0 text-red-600" aria-hidden />, label: "דחוף" },
  warning: { box: "border-amber-500/50 bg-amber-500/10", icon: <AlertTriangle className="size-5 shrink-0 text-amber-600" aria-hidden />, label: "לתשומת לב" },
  info: { box: "border-border bg-muted/60", icon: <Info className="size-5 shrink-0 text-sky-600" aria-hidden />, label: "מידע" },
};

function AlertRow({ alert, onGo }: { alert: Alert; onGo: () => void }) {
  const st = ALERT_STYLE[alert.level];
  return (
    <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5", st.box)}>
      {st.icon}
      <p className="min-w-0 flex-1">
        <span className="sr-only">{st.label}: </span>
        {alert.text}
      </p>
      <button type="button" onClick={onGo} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-bold text-fg underline-offset-2 hover:underline">
        {alert.action}
        <ChevronLeft className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Bullet meter: the bar = chairs, the filled part = people seated, a marker = people to seat. Text says the same
 * (never color alone).
 */
function SeatMeter({ seats, toSeat, seated, expected }: { seats: number; toSeat: number; seated: number; expected: number }) {
  const max = Math.max(seats, toSeat, expected, 1);
  const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  const short = toSeat - seats;
  return (
    <div>
      <p className="mb-3 text-lg font-semibold" role="status">
        {short > 0 ? (
          <span className="text-destructive">חסרים {num(short)} כיסאות</span>
        ) : seats > 0 ? (
          <span>נשארו {num(seats - toSeat)} כיסאות פנויים</span>
        ) : (
          <span>אין עדיין כיסאות</span>
        )}
      </p>
      <div className="relative h-6 rounded-md bg-muted" aria-hidden>
        <div className="absolute inset-y-0 start-0 rounded-md bg-fg/15" style={{ width: pct(seats) }} />
        <div className="absolute inset-y-1 start-0 rounded-[4px] bg-primary" style={{ width: pct(Math.min(seated, seats)) }} />
        <div className={cx("absolute -inset-y-1.5 w-[3px] rounded-full", short > 0 ? "bg-destructive" : "bg-fg")} style={{ insetInlineStart: `calc(${pct(toSeat)} - 1.5px)` }} />
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-fg">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm bg-fg/15" aria-hidden />
          כיסאות: {num(seats)}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm bg-primary" aria-hidden />
          הושבו: {num(seated)}
        </li>
        <li className="flex items-center gap-1.5">
          <span className={cx("inline-block h-4 w-[3px] rounded-full", short > 0 ? "bg-destructive" : "bg-fg")} aria-hidden />
          צריך להושיב: {num(toSeat)}
        </li>
      </ul>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-2 py-3">
      <dt className="text-sm text-muted-fg">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

/** Horizontal bars: track = invited, fill = confirmed; both numbers are written (direct labels). */
function Breakdown({ title, rows }: { title: string; rows: { id: string | null; name: string; color: string; invited: number; confirmed: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.invited));
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="flex items-center gap-3 text-sm text-muted-fg">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-sm bg-fg/15" aria-hidden />
            הוזמנו
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-sm bg-primary" aria-hidden />
            מגיעים
          </span>
        </p>
      </div>
      {rows.every((r) => !r.invited) ? (
        <p className="text-muted-fg">אין עדיין מוזמנים.</p>
      ) : (
        <ul className="space-y-3">
          {rows
            .filter((r) => r.invited > 0)
            .map((r) => (
              <li key={r.id ?? "none"} title={`${r.name}: הוזמנו ${r.invited}, מגיעים ${r.confirmed}`}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                    <span className="inline-block size-3 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
                    <span className="truncate">{r.name}</span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-fg">
                    <span className="font-bold text-fg">{num(r.confirmed)}</span> מגיעים מתוך {num(r.invited)}
                  </span>
                </div>
                <div className="relative h-2.5 rounded-full bg-muted" aria-hidden>
                  <div className="absolute inset-y-0 start-0 rounded-full bg-fg/15" style={{ width: `${(r.invited / max) * 100}%` }} />
                  <div className="absolute inset-y-0 start-0 rounded-full bg-primary" style={{ width: `${(r.confirmed / max) * 100}%` }} />
                </div>
              </li>
            ))}
        </ul>
      )}
    </Card>
  );
}

/** Answers per day (last 30 days with answers), columns with a tooltip each + a sentence for screen readers. */
function Replies({ replies }: { replies: { day: string; n: number }[] }) {
  const list = replies.slice(-30);
  if (!list.length) return <p className="text-muted-fg">עוד אין תשובות. אחרי שליחת הקישורים יופיעו כאן התשובות לפי ימים.</p>;
  const max = Math.max(...list.map((r) => r.n));
  const total = list.reduce((a, r) => a + r.n, 0);
  const day = (iso: string) => new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric" }).format(new Date(iso));
  return (
    <div>
      <p className="mb-3 text-sm text-muted-fg">
        {num(total)} תשובות ב-{num(list.length)} ימים. השיא: {num(max)} ביום אחד.
      </p>
      <div className="flex h-28 items-end gap-0.5" role="img" aria-label={`תשובות לפי ימים: ${list.map((r) => `${day(r.day)} ${r.n}`).join(", ")}`}>
        {list.map((r) => (
          <div key={r.day} className="group relative flex h-full flex-1 items-end">
            <div className="w-full rounded-t-[4px] bg-primary transition-opacity duration-150 group-hover:opacity-80" style={{ height: `${Math.max(4, (r.n / max) * 100)}%` }} />
            <span className="pointer-events-none absolute bottom-full start-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs font-semibold text-white opacity-0 shadow-lift group-hover:opacity-100">
              {day(r.day)}: {num(r.n)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-fg">
        <span>{day(list[0].day)}</span>
        <span>{day(list[list.length - 1].day)}</span>
      </div>
    </div>
  );
}

function MoneyRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2 last:border-0">
      <dt className="text-muted-fg">{label}</dt>
      <dd className={cx("tabular-nums", strong ? "text-lg font-bold" : "font-semibold")}>{value}</dd>
    </div>
  );
}
