/** Small building blocks shared by the planner sections. */
import type { ReactNode } from "react";
import { Mail, MessageSquareText, Minus, Phone, Plus } from "lucide-react";
import { STATUSES, STATUS_LABELS, displayPhone, smsLink, telLink, waLink, waNumber, type RsvpStatus, type Tag } from "../../../shared/guests";
import { cx, inputClass } from "../ui";
import { WhatsAppIcon } from "../QRShare";

export const ils = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : `${Math.round(n).toLocaleString("he-IL")} ₪`;
export const num = (n: number) => n.toLocaleString("he-IL");

export const selectClass = cx(inputClass, "pe-10");
const smallBase = "min-h-11 rounded-lg border border-border bg-card px-3 text-base text-fg placeholder:text-muted-fg/70 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20";
export const smallInput = `${smallBase} w-full`;
/** Toolbar select: as wide as its text. */
export const smallSelect = `${smallBase} pe-8`;

/** Section title row: heading + one line + actions (wrap under on phones). */
export function SectionHeader({ title, text, actions }: { title: string; text?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {text && <p className="mt-1 max-w-2xl text-muted-fg">{text}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function TagDot({ color, className }: { color: string; className?: string }) {
  return <span className={cx("inline-block size-3 shrink-0 rounded-full", className)} style={{ background: color }} aria-hidden />;
}

export function TagChip({ tag, className }: { tag: Tag | null | undefined; className?: string }) {
  if (!tag) return <span className={cx("text-muted-fg", className)}>-</span>;
  return (
    <span className={cx("inline-flex max-w-full items-center gap-1.5 truncate", className)}>
      <TagDot color={tag.color} />
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

/** Status colors: soft tints + readable text, in light and dark themes (not color alone: always the label too). */
export const STATUS_STYLE: Record<RsvpStatus, string> = {
  pending: "bg-slate-500/15 text-fg ring-slate-500/40",
  coming: "bg-green-600/15 text-fg ring-green-600/50",
  maybe: "bg-amber-500/20 text-fg ring-amber-500/50",
  not_coming: "bg-red-600/15 text-fg ring-red-600/45",
};
export const STATUS_DOT: Record<RsvpStatus, string> = {
  pending: "bg-slate-500",
  coming: "bg-green-600",
  maybe: "bg-amber-500",
  not_coming: "bg-red-600",
};

export function StatusBadge({ status, className }: { status: RsvpStatus; className?: string }) {
  return (
    <span className={cx("inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-sm font-semibold ring-1 ring-inset", STATUS_STYLE[status], className)}>
      <span className={cx("size-2 rounded-full", STATUS_DOT[status])} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** The 4 statuses as one row of big buttons (radio group). */
export function StatusPicker({ value, onChange, label = "סטטוס", compact }: { value: RsvpStatus; onChange: (s: RsvpStatus) => void; label?: string; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("grid gap-1.5", compact ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-4")}>
      {(["coming", "maybe", "pending", "not_coming"] as RsvpStatus[]).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className={cx(
            "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold ring-1 ring-inset transition-colors duration-200",
            value === s ? cx(STATUS_STYLE[s], "ring-2") : "bg-card text-muted-fg ring-border hover:text-fg",
          )}
        >
          <span className={cx("size-2.5 rounded-full", STATUS_DOT[s])} aria-hidden />
          {STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  );
}
void STATUSES;

/** − n + with a real number field in the middle (keyboard and screen readers get a plain input). */
export function Stepper({ value, onChange, min = 0, max = 999, label, id, size = "md" }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string; id?: string; size?: "sm" | "md" }) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Number.isFinite(n) ? Math.round(n) : min)));
  const btn = cx("inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-card transition-colors duration-200 hover:bg-fg/5 disabled:opacity-40", size === "sm" ? "size-11" : "size-11");
  return (
    <div className="inline-flex items-center gap-1.5">
      <button type="button" className={btn} onClick={() => set(value - 1)} disabled={value <= min} aria-label={`פחות - ${label}`}>
        <Minus className="size-4" aria-hidden />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        aria-label={label}
        className={cx("rounded-lg border border-border bg-card text-center font-bold tabular-nums focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20", size === "sm" ? "h-11 w-12" : "h-11 w-16 text-lg")}
        value={value}
        min={min}
        max={max}
        onChange={(e) => set(Number(e.target.value))}
      />
      <button type="button" className={btn} onClick={() => set(value + 1)} disabled={value >= max} aria-label={`יותר - ${label}`}>
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** Native select of tags; `size`: "md" = form field, "sm" = 44px toolbar, "xs" = 40px table cell. */
export function TagSelect({ id, value, tags, onChange, empty = "ללא", size = "md", className, label }: { id?: string; value: string | null; tags: Tag[]; onChange: (v: string | null) => void; empty?: string; size?: "md" | "sm" | "xs"; className?: string; label?: string }) {
  const base = size === "md" ? selectClass : size === "sm" ? `${smallInput} pe-8` : "min-h-11 rounded-lg border border-border bg-card px-2 pe-7 text-sm";
  return (
    <select id={id} aria-label={label} className={cx(base, className)} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{empty}</option>
      {tags.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

const contactBtn = "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-[filter,background-color] duration-200";

/** Call / WhatsApp / SMS / email buttons for a phone and address (hidden when missing). */
export function ContactButtons({ phone, whatsapp, email, text = "", name, sms }: { phone: string; whatsapp?: string; email?: string; text?: string; name: string; sms?: boolean }) {
  const wa = whatsapp || phone;
  return (
    <div className="flex flex-wrap gap-1.5">
      {waNumber(phone) && (
        <a href={telLink(phone)} className={cx(contactBtn, "border border-border bg-card hover:bg-fg/5")} aria-label={`התקשרות ל${name} (${displayPhone(phone)})`} title={`התקשרות: ${displayPhone(phone)}`}>
          <Phone className="size-5" aria-hidden />
        </a>
      )}
      {waNumber(wa) && (
        <a href={waLink(wa, text)} target="_blank" rel="noopener" className={cx(contactBtn, "bg-[#25D366] text-[#052e16] hover:brightness-105")} aria-label={`וואטסאפ ל${name} (נפתח בחלון חדש)`} title="וואטסאפ">
          <WhatsAppIcon className="size-5" />
        </a>
      )}
      {sms && waNumber(phone) && (
        <a href={smsLink(phone, text)} className={cx(contactBtn, "border border-border bg-card hover:bg-fg/5")} aria-label={`הודעת SMS ל${name}`} title="SMS">
          <MessageSquareText className="size-5" aria-hidden />
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className={cx(contactBtn, "border border-border bg-card hover:bg-fg/5")} aria-label={`אימייל ל${name}`} title={email}>
          <Mail className="size-5" aria-hidden />
        </a>
      )}
    </div>
  );
}

/** A big number with a label (dashboard tiles). */
export function StatTile({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "warn" | "bad" | "muted"; icon?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <span className="flex items-center gap-2 text-sm font-semibold text-muted-fg">
        {icon}
        {label}
      </span>
      <span
        className={cx(
          "text-3xl font-bold tabular-nums leading-tight",
          tone === "good" && "text-green-700 [[data-theme=party]_&]:text-green-400",
          tone === "warn" && "text-amber-700 [[data-theme=party]_&]:text-amber-400",
          tone === "bad" && "text-destructive [[data-theme=party]_&]:text-red-400",
        )}
      >
        {value}
      </span>
      {sub && <span className="text-sm text-muted-fg">{sub}</span>}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</span>
      <p className="text-lg font-bold">{title}</p>
      {text && <p className="max-w-md text-muted-fg">{text}</p>}
      {action}
    </div>
  );
}

/** Downloads a text file (CSV / print) without a server round-trip. */
export function download(name: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const esc = (s: string | number | null | undefined) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Prints a document of its own (Hebrew, RTL, clean A4) in a new window: the browser's print dialog also saves it
 * as PDF. `body` is trusted HTML built with esc().
 */
export function printHtml(title: string, body: string, extraCss = "") {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Heebo, system-ui, sans-serif; color: #111; margin: 0; font-size: 12pt; line-height: 1.45; }
  h1 { font-size: 20pt; margin: 0 0 4mm; } h2 { font-size: 14pt; margin: 6mm 0 2mm; }
  table { width: 100%; border-collapse: collapse; } th, td { border-bottom: 1px solid #ccc; padding: 2mm 1.5mm; text-align: start; vertical-align: top; }
  th { background: #f1f1f4; } .muted { color: #555; } .break { break-after: page; } .avoid { break-inside: avoid; }
  ${extraCss}
</style></head><body>${body}<script>document.fonts && document.fonts.ready.then(()=>setTimeout(()=>print(),150));</script></body></html>`);
  w.document.close();
  return true;
}
