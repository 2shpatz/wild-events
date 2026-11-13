import { useMemo, useState } from "react";
import { CalendarClock, Check, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABELS,
  budgetSummary,
  emptyExpense,
  expenseTotal,
  localToday,
  newId,
  paidOf,
  type Expense,
  type ExpenseDTO,
  type Payment,
  type PaymentMethod,
} from "../../../shared/guests";
import { formatDate } from "../../lib/format";
import { Button, Card, ConfirmDialog, Field, IconButton, Modal, cx, inputClass } from "../ui";
import { Switch } from "../manage/Toggle";
import { usePlanner } from "./store";
import { Empty, StatTile, ils, num, selectClass, smallInput } from "./bits";

/** Budget, expenses and their payment schedule (deposit, installments, balance) with what is due soon. */
export function Expenses({ go }: { go: (p: string) => void }) {
  const p = usePlanner();
  const { expenses, vendors, config: cfg } = p.data;
  const today = localToday();
  const money = useMemo(() => budgetSummary(expenses, vendors, p.stats.expected, cfg, today), [expenses, vendors, p.stats.expected, cfg, today]);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [isNew, setIsNew] = useState(false);
  const vendorName = new Map(vendors.map((v) => [v.id, v.name]));
  const setBudget = (patch: Partial<typeof cfg.budget>, msg = "נשמר") => p.saveConfig({ ...cfg, budget: { ...cfg.budget, ...patch } }, msg);
  const markPaid = (eid: string, pid: string) => {
    const e = expenses.find((x) => x.id === eid);
    if (!e) return;
    p.saveRecord("expense", { ...e, payments: e.payments.map((x) => (x.id === pid ? { ...x, paidAt: today } : x)) }, false);
  };
  const soon = [...money.overdue, ...money.due.filter((d) => d.days <= 30)];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="סך ההוצאות" value={ils(money.total)} sub={`${num(expenses.length)} הוצאות`} />
        <StatTile label="שולם" value={ils(money.paid)} tone="good" />
        <StatTile label="נשאר לשלם" value={ils(money.left)} tone={money.left ? "warn" : "good"} />
        <StatTile
          label={money.budget ? (money.overBudget ? "חריגה מהתקציב" : "נשאר בתקציב") : "תקציב"}
          value={money.budget ? ils(money.overBudget || money.budget - money.total) : "-"}
          tone={money.overBudget ? "bad" : undefined}
        />
        <StatTile label="לאורח צפוי" value={money.perGuest != null ? ils(money.perGuest) : "-"} sub={`כ-${num(p.stats.expected)} צפויים`} />
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-bold">התקציב</h2>
        <div className="flex flex-wrap gap-4">
          <MoneyInput id="b-total" label="תקציב כולל (₪)" value={cfg.budget.total} onSave={(v) => setBudget({ total: v }, "התקציב נשמר")} />
          <MoneyInput id="b-min" label="מינימום מנות שהתחייבתם לאולם" value={cfg.budget.minGuests} onSave={(v) => setBudget({ minGuests: v }, "נשמר")} hint="הוצאה במחיר לאורח תחושב לפי מספר זה אם יגיעו פחות" />
        </div>
      </Card>

      {soon.length > 0 && (
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <CalendarClock className="size-5 text-primary" aria-hidden />
            תשלומים קרובים
          </h2>
          <ul className="divide-y divide-border">
            {soon.map((d) => (
              <li key={d.payment.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-40 flex-1">
                  <p className="font-semibold">
                    {d.title}
                    {d.vendorId && vendorName.get(d.vendorId) ? ` · ${vendorName.get(d.vendorId)}` : ""}
                  </p>
                  <p className={cx("text-sm", d.days < 0 ? "font-semibold text-destructive" : "text-muted-fg")}>
                    {d.payment.label || "תשלום"} · {formatDate(d.payment.due)} · {d.days < 0 ? `באיחור של ${num(-d.days)} ימים` : d.days === 0 ? "היום" : `בעוד ${num(d.days)} ימים`}
                  </p>
                </div>
                <span className="text-lg font-bold tabular-nums">{ils(d.payment.amount)}</span>
                <Button size="sm" variant="outline" icon={<Check className="size-4" aria-hidden />} onClick={() => markPaid(d.expenseId, d.payment.id)}>
                  שולם
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => { setIsNew(true); setEditing(emptyExpense()); }}>
          הוצאה חדשה
        </Button>
        {!vendors.length && (
          <Button variant="ghost" onClick={() => go("vendors")}>
            קודם להוסיף נותני שירות
          </Button>
        )}
      </div>

      {!expenses.length ? (
        <Empty icon={<Wallet className="size-7" aria-hidden />} title="עוד אין הוצאות" text="מוסיפים כל הוצאה עם הסכום שסוכם, ומחלקים לתשלומים: מקדמה, תשלומים ויתרה, עם תאריכים. נזכיר כשמתקרב מועד." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {expenses.map((e) => (
            <li key={e.id}>
              <ExpenseCard e={e} vendor={e.vendorId ? vendorName.get(e.vendorId) : undefined} onEdit={() => { setIsNew(false); setEditing(e); }} onPaid={(pid) => markPaid(e.id, pid)} />
            </li>
          ))}
        </ul>
      )}

      {money.byCategory.length > 0 && (
        <Card>
          <h2 className="mb-1 text-lg font-bold">לפי תחום</h2>
          <p className="mb-3 text-sm text-muted-fg">אפשר לכתוב כמה תכננתם לכל תחום, ולראות מול כמה יוצא בפועל.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-start">
              <thead>
                <tr className="border-b border-border text-sm text-muted-fg">
                  <th className="py-2 text-start font-semibold">תחום</th>
                  <th className="py-2 text-start font-semibold">תכנון</th>
                  <th className="py-2 text-start font-semibold">בפועל</th>
                  <th className="py-2 text-start font-semibold">שולם</th>
                </tr>
              </thead>
              <tbody>
                {money.byCategory.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <th scope="row" className="py-2 text-start font-semibold">{c.name}</th>
                    <td className="py-2">
                      <PlannedInput
                        value={c.planned}
                        label={`תכנון - ${c.name}`}
                        onSave={(v) => {
                          const rest = cfg.budget.categories.filter((x) => x.id !== c.id);
                          setBudget({ categories: [...rest, { id: c.id, name: c.name, planned: v }] }, "נשמר");
                        }}
                      />
                    </td>
                    <td className={cx("py-2 tabular-nums", c.planned != null && c.total > c.planned && "font-bold text-destructive")}>{ils(c.total)}</td>
                    <td className="py-2 tabular-nums">{ils(c.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ExpenseEditor expense={editing} isNew={isNew} onClose={() => setEditing(null)} />
    </div>
  );
}

function ExpenseCard({ e, vendor, onEdit, onPaid }: { e: ExpenseDTO; vendor?: string; onEdit: () => void; onPaid: (pid: string) => void }) {
  const p = usePlanner();
  const total = expenseTotal(e, p.stats.expected, p.data.config.budget.minGuests);
  const paid = paidOf(e);
  const pct = total ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  return (
    <Card className="flex h-full flex-col gap-3 !p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">{e.title || "הוצאה"}</p>
          <p className="text-sm text-muted-fg">
            {[vendor, e.category && (VENDOR_CATEGORY_LABELS as Record<string, string>)[e.category], e.perGuest && `${ils(e.amount)} לאורח`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <IconButton label={`עריכת ${e.title}`} onClick={onEdit} className="hover:bg-fg/5">
          <Pencil className="size-5" aria-hidden />
        </IconButton>
      </div>
      <div>
        <p className="mb-1 flex justify-between text-sm">
          <span>
            שולם <b className="tabular-nums">{ils(paid)}</b> מתוך <b className="tabular-nums">{ils(total)}</b>
          </span>
          <span className="text-muted-fg">{pct}%</span>
        </p>
        <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {e.payments.length > 0 && (
        <ul className="space-y-1 text-sm">
          {e.payments.map((pay) => (
            <li key={pay.id} className="flex items-center gap-2">
              <span className={cx("min-w-0 flex-1 truncate", pay.paidAt && "text-muted-fg line-through")}>
                {pay.label || "תשלום"}
                {pay.due ? ` · ${formatDate(pay.due)}` : ""}
              </span>
              <span className="tabular-nums">{ils(pay.amount)}</span>
              {pay.paidAt ? (
                <Check className="size-4 text-green-600" aria-label="שולם" />
              ) : (
                <button type="button" onClick={() => onPaid(pay.id)} className="min-h-11 rounded-lg px-3 font-semibold text-primary hover:bg-primary/10">
                  שולם
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ExpenseEditor({ expense, isNew, onClose }: { expense: Expense | null; isNew: boolean; onClose: () => void }) {
  const p = usePlanner();
  const [d, setD] = useState<Expense | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (expense && expense.id !== lastId) {
    setLastId(expense.id);
    setD(structuredClone(expense));
  }
  if (!expense && lastId) setLastId(null);
  if (!d || !expense) return null;
  const set = <K extends keyof Expense>(k: K, v: Expense[K]) => setD({ ...d, [k]: v });
  const total = expenseTotal(d, p.stats.expected, p.data.config.budget.minGuests);
  const scheduled = d.payments.reduce((a, x) => a + x.amount, 0);
  const setPay = (i: number, patch: Partial<Payment>) => set("payments", d.payments.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addPay = (label: string, amount = Math.max(0, total - scheduled)) => set("payments", [...d.payments, { id: newId(), label, amount, due: null, paidAt: null, method: null }]);
  const save = async () => {
    setBusy(true);
    const ok = await p.saveRecord("expense", d, isNew);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? "הוצאה חדשה" : d.title || "הוצאה"}
      footer={
        <>
          {!isNew && (
            <Button variant="ghost" className="me-auto text-destructive" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirm(true)}>
              מחיקה
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={save} loading={busy} disabled={!d.title.trim()}>
            שמירה
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="מה" htmlFor="e-title">
            <input id="e-title" className={inputClass} value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={80} autoFocus={isNew} placeholder="למשל: אולם, צלם, שמלה" />
          </Field>
          <Field label="נותן שירות" htmlFor="e-vendor">
            <select
              id="e-vendor"
              className={selectClass}
              value={d.vendorId ?? ""}
              onChange={(e) => {
                const v = p.data.vendors.find((x) => x.id === e.target.value);
                setD({ ...d, vendorId: v?.id ?? null, category: d.category ?? v?.category ?? null, title: d.title || v?.name || "" });
              }}
            >
              <option value="">ללא</option>
              {p.data.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({VENDOR_CATEGORY_LABELS[v.category]})
                </option>
              ))}
            </select>
          </Field>
          <Field label="תחום" htmlFor="e-cat">
            <select id="e-cat" className={selectClass} value={d.category ?? ""} onChange={(e) => set("category", e.target.value || null)}>
              <option value="">לפי נותן השירות / אחר</option>
              {VENDOR_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {VENDOR_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={d.perGuest ? "מחיר לאורח (₪)" : "הסכום שסוכם (₪)"} htmlFor="e-amount" hint={d.perGuest ? `סה"כ לפי ${num(Math.max(p.stats.expected, p.data.config.budget.minGuests ?? 0))} אורחים: ${ils(total)}` : undefined}>
            <input id="e-amount" className={inputClass} inputMode="decimal" value={d.amount || ""} onChange={(e) => set("amount", Number(e.target.value.replace(/[^\d.]/g, "")) || 0)} />
          </Field>
        </div>
        <label className="inline-flex items-center gap-3 font-semibold">
          <Switch checked={d.perGuest} onChange={(v) => set("perGuest", v)} label="מחיר לאורח" />
          מחיר לאורח (אולם, קייטרינג) - הסה&quot;כ מתעדכן לפי מספר האורחים הצפוי
        </label>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-lg font-bold">תשלומים</legend>
          {d.payments.length > 0 && (
            <ul className="space-y-2">
              {d.payments.map((pay, i) => (
                <li key={pay.id} className="grid items-end gap-2 rounded-xl border border-border p-2 sm:grid-cols-[minmax(0,1fr)_7rem_9.5rem_8rem_auto_auto]">
                  <label className="flex flex-col gap-1 text-sm font-semibold">
                    שם
                    <input className={smallInput} value={pay.label} onChange={(e) => setPay(i, { label: e.target.value })} maxLength={40} placeholder="מקדמה" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-semibold">
                    סכום
                    <input className={smallInput} inputMode="decimal" value={pay.amount || ""} onChange={(e) => setPay(i, { amount: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-semibold">
                    עד תאריך
                    <input className={smallInput} type="date" value={pay.due ?? ""} onChange={(e) => setPay(i, { due: e.target.value || null })} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-semibold">
                    אמצעי
                    <select className={cx(smallInput, "pe-7")} value={pay.method ?? ""} onChange={(e) => setPay(i, { method: (e.target.value || null) as PaymentMethod | null })}>
                      <option value="">-</option>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                    <Switch checked={!!pay.paidAt} onChange={(v) => setPay(i, { paidAt: v ? localToday() : null })} label={`שולם - ${pay.label || "תשלום"}`} />
                    שולם
                  </label>
                  <IconButton label="הסרת התשלום" type="button" className="text-destructive hover:bg-destructive/10" onClick={() => set("payments", d.payments.filter((_, j) => j !== i))}>
                    <Trash2 className="size-5" aria-hidden />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          <p className={cx("text-sm", scheduled > total && total > 0 ? "font-semibold text-destructive" : "text-muted-fg")} role="status">
            בתשלומים: {ils(scheduled)} מתוך {ils(total)}
            {total - scheduled > 0 ? ` · עוד ${ils(total - scheduled)} לא חולקו לתשלומים` : scheduled > total ? " · יותר מהסכום שסוכם" : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {!d.payments.length && (
              <Button type="button" size="sm" variant="outline" icon={<Plus className="size-4" aria-hidden />} onClick={() => addPay("מקדמה", Math.round(total * 0.3))}>
                מקדמה
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" icon={<Plus className="size-4" aria-hidden />} onClick={() => addPay(d.payments.length ? "יתרה" : "תשלום")}>
              {d.payments.length ? "יתרה / תשלום נוסף" : "תשלום אחד"}
            </Button>
          </div>
        </fieldset>
        <Field label="הערות" htmlFor="e-notes">
          <textarea id="e-notes" className={cx(inputClass, "min-h-20 py-3")} value={d.notes} onChange={(e) => set("notes", e.target.value)} maxLength={1000} />
        </Field>
        <button type="submit" hidden />
      </form>
      <ConfirmDialog
        open={confirm}
        title={`למחוק את "${d.title}"?`}
        message={<p>ההוצאה ו-{num(d.payments.length)} התשלומים שלה יימחקו.</p>}
        confirmLabel="מחיקה"
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          await p.deleteRecord("expense", d.id);
          onClose();
        }}
      />
    </Modal>
  );
}

function MoneyInput({ id, label, value, onSave, hint }: { id: string; label: string; value: number | null; onSave: (v: number | null) => void; hint?: string }) {
  const [v, setV] = useState<string | null>(null);
  return (
    <div className="w-full max-w-xs">
      <Field label={label} htmlFor={id} hint={hint}>
        <input
          id={id}
          className={inputClass}
          inputMode="decimal"
          value={v ?? (value == null ? "" : String(value))}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => {
            if (v === null) return;
            const n = v.trim() === "" ? null : Number(v.replace(/[^\d.]/g, "")) || 0;
            if (n !== value) onSave(n);
            setV(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </Field>
    </div>
  );
}

function PlannedInput({ value, label, onSave }: { value: number | null; label: string; onSave: (v: number | null) => void }) {
  const [v, setV] = useState<string | null>(null);
  return (
    <input
      className="h-11 w-28 rounded-lg border border-border bg-card px-2 tabular-nums"
      inputMode="decimal"
      aria-label={label}
      value={v ?? (value == null ? "" : String(value))}
      placeholder="-"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v === null) return;
        const n = v.trim() === "" ? null : Number(v.replace(/[^\d.]/g, "")) || 0;
        if (n !== value) onSave(n);
        setV(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
