import { useMemo, useRef, useState } from "react";
import { Gift, Search } from "lucide-react";
import { GIFT_LABELS, GIFT_METHODS, fullName, waLink, waNumber, type GiftMethod, type HouseholdDTO } from "../../../shared/guests";
import { Button, Card, cx } from "../ui";
import { Switch } from "../manage/Toggle";
import { WhatsAppIcon } from "../QRShare";
import { usePlanner } from "./store";
import { Empty, StatTile, ils, num, smallInput } from "./bits";

/**
 * Gifts: built for the evening after the event - search a name, type the amount, pick how it was given, Enter, next.
 * Totals by method, and a thank-you list with a ready WhatsApp message.
 */
export function Gifts() {
  const p = usePlanner();
  const hs = p.data.households;
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<HouseholdDTO | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<GiftMethod>("cheque");
  const [note, setNote] = useState("");
  const [onlyUnthanked, setOnlyUnthanked] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (n.length < 2) return [];
    return hs.filter((h) => `${h.first} ${h.last} ${h.companions.join(" ")}`.toLowerCase().includes(n)).slice(0, 8);
  }, [q, hs]);
  const given = hs.filter((h) => h.giftAmount != null || h.giftMethod);
  const list = onlyUnthanked ? given.filter((h) => !h.thanked) : given;
  const st = p.stats.gifts;

  const choose = (h: HouseholdDTO) => {
    setPick(h);
    setQ(fullName(h));
    setAmount(h.giftAmount != null ? String(h.giftAmount) : "");
    setMethod(h.giftMethod ?? method);
    setNote(h.giftNote);
    setTimeout(() => amountRef.current?.focus(), 0);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pick) return;
    const ok = await p.patchOne(pick.id, { giftAmount: amount === "" ? null : Number(amount.replace(/[^\d.]/g, "")) || 0, giftMethod: method, giftNote: note }, );
    if (ok) {
      setPick(null);
      setQ("");
      setAmount("");
      setNote("");
      search.current?.focus();
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="סך המתנות" value={ils(st.total)} sub={`${num(st.count)} משפחות`} />
        <StatTile label="ממוצע למשפחה" value={st.count ? ils(st.total / st.count) : "-"} />
        <StatTile label="לאורח שהגיע" value={p.stats.confirmed ? ils(st.total / Math.max(1, p.stats.arrived || p.stats.confirmed)) : "-"} sub={p.stats.arrived ? "לפי מי שהגיע בפועל" : "לפי המגיעים"} />
        <StatTile label="עוד לא קיבלו תודה" value={num(st.notThanked)} tone={st.notThanked ? "warn" : "good"} />
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-bold">רישום מתנה</h2>
        <form onSubmit={save} className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" aria-hidden />
            <input
              ref={search}
              className={cx(smallInput, "min-h-12 ps-9 text-lg")}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPick(null);
              }}
              placeholder="שם מהרשימה (מה שכתוב על המעטפה)"
              aria-label="חיפוש שם"
              autoComplete="off"
            />
            {!pick && matches.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-card shadow-lift" role="listbox" aria-label="תוצאות">
                {matches.map((h) => (
                  <li key={h.id}>
                    <button type="button" role="option" aria-selected={false} onClick={() => choose(h)} className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-start hover:bg-fg/5">
                      <span className="font-semibold">{fullName(h)}</span>
                      <span className="text-sm text-muted-fg">{h.giftAmount != null ? `כבר נרשם: ${ils(h.giftAmount)}` : h.companions.join(", ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {pick && (
            <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <label className="flex flex-col gap-1">
                <span className="font-semibold">סכום (₪)</span>
                <input ref={amountRef} className={cx(smallInput, "min-h-12 text-lg font-bold")} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <fieldset>
                <legend className="mb-1 font-semibold">איך</legend>
                <div className="flex flex-wrap gap-1.5">
                  {GIFT_METHODS.map((g) => (
                    <button key={g} type="button" aria-pressed={method === g} onClick={() => setMethod(g)} className={cx("min-h-11 rounded-xl border px-3 font-semibold", method === g ? "border-primary bg-primary text-on-primary" : "border-border bg-card hover:bg-fg/5")}>
                      {GIFT_LABELS[g]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="font-semibold">הערה (לא חובה)</span>
                <input className={smallInput} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="מספר צ'ק, מתנה, ברכה מיוחדת..." />
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" icon={<Gift className="size-4" aria-hidden />}>
                  שמירה והבא
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setPick(null); setQ(""); }}>
                  ביטול
                </Button>
              </div>
            </div>
          )}
        </form>
        {st.byMethod.length > 0 && (
          <p className="mt-4 text-sm text-muted-fg">{st.byMethod.map((g) => `${GIFT_LABELS[g.method]}: ${ils(g.total)} (${num(g.count)})`).join(" · ")}</p>
        )}
      </Card>

      {given.length === 0 ? (
        <Empty icon={<Gift className="size-7" aria-hidden />} title="עוד לא נרשמו מתנות" text="אחרי האירוע מחפשים את השם מהמעטפה, כותבים את הסכום וממשיכים הלאה." />
      ) : (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">מתנות שנרשמו ({num(given.length)})</h2>
            <label className="inline-flex items-center gap-2 font-semibold">
              <Switch checked={onlyUnthanked} onChange={setOnlyUnthanked} label="רק מי שעוד לא קיבל תודה" />
              רק מי שעוד לא קיבל תודה
            </label>
          </div>
          <ul className="divide-y divide-border">
            {list.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 py-2">
                <button type="button" className="min-w-40 flex-1 text-start" onClick={() => choose(h)}>
                  <span className="block font-semibold">{fullName(h)}</span>
                  <span className="text-sm text-muted-fg">
                    {h.giftMethod ? GIFT_LABELS[h.giftMethod] : ""}
                    {h.giftNote ? ` · ${h.giftNote}` : ""}
                  </span>
                </button>
                <span className="w-24 text-end text-lg font-bold tabular-nums">{ils(h.giftAmount ?? 0)}</span>
                {waNumber(h.phone) && (
                  <a
                    href={waLink(h.phone, p.message("thanks", h))}
                    target="_blank"
                    rel="noopener"
                    onClick={() => !h.thanked && p.patchOne(h.id, { thanked: true })}
                    aria-label={`תודה בוואטסאפ ל${fullName(h)}`}
                    title="שליחת תודה בוואטסאפ"
                    className="inline-flex size-11 items-center justify-center rounded-full bg-[#25D366] text-[#052e16] hover:brightness-105"
                  >
                    <WhatsAppIcon className="size-5" />
                  </a>
                )}
                <label className="inline-flex items-center gap-2 text-sm font-semibold">
                  <Switch checked={h.thanked} onChange={(v) => p.patchOne(h.id, { thanked: v })} label={`נשלחה תודה ל${fullName(h)}`} />
                  תודה
                </label>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
