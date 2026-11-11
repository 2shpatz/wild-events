export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "ללא הגבלה";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(n < 10 * 1024 ** 3 ? 1 : 0)} GB`;
}

const timeFmt = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayFmt = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long" });
const dateFmt = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric" });

export const formatTime = (ms: number) => timeFmt.format(ms);
export const formatDay = (ms: number) => dayFmt.format(ms);
export function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dateFmt.format(d);
}

export function plural(n: number, one: string, many: string) {
  return n === 1 ? one : `${n.toLocaleString("he-IL")} ${many}`;
}

export function eventUrl(code: string) {
  return `${location.origin}/${code}`;
}

const relFmt = new Intl.RelativeTimeFormat("he", { numeric: "auto" });

/** "לפני 5 דקות", "אתמול", ...; older than a week = the date. */
export function timeAgo(ms: number, now = Date.now()) {
  const s = Math.round((ms - now) / 1000);
  // ICU writes single units in Hebrew as "לפני דקה (1)"; drop the "(1)".
  const rel = (v: number, u: Intl.RelativeTimeFormatUnit) => relFmt.format(v, u).replace(/\s*\(1\)/, "");
  if (s > -45) return "עכשיו";
  if (s > -3600) return rel(Math.round(s / 60), "minute");
  if (s > -86_400) return rel(Math.round(s / 3600), "hour");
  if (s > -7 * 86_400) return rel(Math.round(s / 86_400), "day");
  return dateFmt.format(ms);
}
