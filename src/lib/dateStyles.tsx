import type { CSSProperties } from "react";
import type { DateStyle } from "../../shared/design";
import { cx } from "../components/ui";

/** "YYYY-MM-DD" as a local date (not UTC, so the day never shifts). */
export function parseLocalDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const LETTERS: [number, string][] = [
  [400, "ת"], [300, "ש"], [200, "ר"], [100, "ק"], [90, "צ"], [80, "פ"], [70, "ע"], [60, "ס"], [50, "נ"],
  [40, "מ"], [30, "ל"], [20, "כ"], [10, "י"], [9, "ט"], [8, "ח"], [7, "ז"], [6, "ו"], [5, "ה"], [4, "ד"], [3, "ג"], [2, "ב"], [1, "א"],
];

/** Hebrew numerals (gematria) with geresh / gershayim: 15 → ט״ו, 787 → תשפ״ז. */
export function gematria(n: number): string {
  let rest = n % 1000;
  let out = "";
  for (const [v, l] of LETTERS) {
    while (rest >= v) {
      if (rest === 15 || rest === 16) {
        out += rest === 15 ? "טו" : "טז";
        rest = 0;
        break;
      }
      out += l;
      rest -= v;
    }
  }
  return out.length === 1 ? `${out}׳` : `${out.slice(0, -1)}״${out.slice(-1)}`;
}

/** "כ״א בכסלו תשפ״ז" */
export function hebrewDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("he-IL-u-ca-hebrew", { day: "numeric", month: "long", year: "numeric" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${gematria(Number(get("day")))} ב${get("month")} ${gematria(Number(get("year")))}`;
}

export const lineDate = (d: Date) => new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
export const numericDate = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
const plainDate = (d: Date) => new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric" }).format(d);

export const DATE_STYLE_LABELS: Record<DateStyle, string> = {
  invitation: "הזמנה",
  line: "שורה",
  numeric: "מספרים",
  hebrew: "תאריך עברי",
  both: "לועזי + עברי",
};

/** Short textual sample of a style (used in the editor's options). */
export function dateSample(style: DateStyle, d: Date): string {
  switch (style) {
    case "invitation":
      return `${d.getDate()} | ${new Intl.DateTimeFormat("he-IL", { month: "long" }).format(d)}`;
    case "line":
      return lineDate(d);
    case "numeric":
      return numericDate(d);
    case "hebrew":
      return hebrewDate(d);
    case "both":
      return `${plainDate(d)} · ${hebrewDate(d)}`;
  }
}

/** The event date in the hero, in the chosen style. */
export function EventDate({ iso, style, color }: { iso: string; style: DateStyle; color?: string | null }) {
  const d = parseLocalDate(iso);
  if (!d) return null;
  const css: CSSProperties | undefined = color ? { color } : undefined;
  const label = `${lineDate(d)}, ${hebrewDate(d)}`;
  if (style === "invitation") return <InvitationDate d={d} iso={iso} style={css} />;
  const wrap = "mt-6 flex flex-col items-center gap-1 sm:mt-8";
  if (style === "line")
    return (
      <time dateTime={iso} className={cx(wrap, "text-xl font-semibold sm:text-2xl")} style={css}>
        {lineDate(d)}
      </time>
    );
  if (style === "numeric")
    return (
      <time dateTime={iso} aria-label={label} className={cx(wrap, "font-title text-5xl tracking-wide tabular-nums sm:text-7xl")} style={css}>
        <span dir="ltr">{numericDate(d)}</span>
      </time>
    );
  if (style === "hebrew")
    return (
      <time dateTime={iso} aria-label={label} className={cx(wrap)} style={css}>
        <span className="font-title text-4xl sm:text-6xl">{hebrewDate(d)}</span>
        <span className="text-base font-semibold opacity-80 sm:text-lg">{new Intl.DateTimeFormat("he-IL", { weekday: "long" }).format(d)}</span>
      </time>
    );
  return (
    <time dateTime={iso} aria-label={label} className={cx(wrap)} style={css}>
      <span className="text-base font-semibold opacity-85 sm:text-lg">{new Intl.DateTimeFormat("he-IL", { weekday: "long" }).format(d)}</span>
      <span className="font-title text-4xl sm:text-6xl">{plainDate(d)}</span>
      <span className="flex items-center gap-3 text-lg font-semibold opacity-90 sm:text-xl">
        <span className="h-px w-8 bg-current opacity-50" aria-hidden />
        {hebrewDate(d)}
        <span className="h-px w-8 bg-current opacity-50" aria-hidden />
      </span>
    </time>
  );
}

/** Invitation-style date: weekday between hairlines, then month | big day | year. */
function InvitationDate({ d, iso, style }: { d: Date; iso: string; style?: CSSProperties }) {
  const weekday = new Intl.DateTimeFormat("he-IL", { weekday: "long" }).format(d);
  const month = new Intl.DateTimeFormat("he-IL", { month: "long" }).format(d);
  const rule = "h-px w-10 bg-current opacity-50 sm:w-16";
  const side = "min-w-[5rem] border-y border-current/40 py-1.5 text-base font-semibold tracking-wide sm:min-w-28 sm:py-2 sm:text-xl";
  return (
    <time dateTime={iso} aria-label={plainDate(d)} className="mt-6 flex flex-col items-center gap-2 sm:mt-10 sm:gap-3" style={style}>
      <span className="flex items-center gap-3 text-base font-semibold tracking-wide opacity-90 sm:text-lg" aria-hidden>
        <span className={rule} />
        {weekday}
        <span className={rule} />
      </span>
      <span className="flex items-center gap-4 sm:gap-6" aria-hidden>
        <span className={side}>{month}</span>
        <span className="font-title text-6xl leading-none tabular-nums [@media(max-height:640px)]:text-5xl drop-shadow-[0_6px_24px_rgb(0_0_0/0.25)] sm:text-8xl">{d.getDate()}</span>
        <span className={cx(side, "tracking-[0.2em]")}>{d.getFullYear()}</span>
      </span>
    </time>
  );
}
