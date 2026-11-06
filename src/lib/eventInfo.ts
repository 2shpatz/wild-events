import type { PublicEvent } from "../../shared/types";
import { eventUrl, formatDate } from "./format";

/** What the navigation apps should search for: the address, or the venue name when there's no address. */
export function destination(ev: Pick<PublicEvent, "venueName" | "venueAddress">) {
  return (ev.venueAddress || ev.venueName || "").trim();
}

export function navLinks(dest: string) {
  const q = encodeURIComponent(dest);
  return {
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    apple: `https://maps.apple.com/?daddr=${q}`,
  };
}

function parseDate(iso: string | null) {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

/** Static countdown text before the event ("בעוד 15 ימים" / "מחר" / "היום!"), null otherwise. */
export function countdown(iso: string | null, now = new Date()) {
  const d = parseDate(iso);
  if (!d) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return "היום!";
  if (days === 1) return "מחר";
  if (days === 2) return "בעוד יומיים";
  return `בעוד ${days.toLocaleString("he-IL")} ימים`;
}

/** "יום שישי, 20 בנובמבר 2026 · 19:30" */
export function whenText(ev: Pick<PublicEvent, "date" | "time">) {
  const d = parseDate(ev.date);
  const day = d ? new Intl.DateTimeFormat("he-IL", { weekday: "long" }).format(d) + ", " + formatDate(ev.date) : "";
  return [day, ev.time ? `בשעה ${ev.time}` : ""].filter(Boolean).join(" ");
}

export function shareText(ev: PublicEvent) {
  const dest = destination(ev);
  const links = dest ? navLinks(dest) : null;
  return [
    ev.title,
    whenText(ev),
    [ev.venueName, ev.venueAddress].filter(Boolean).join(", "),
    links && `ניווט ב-Waze: ${links.waze}`,
    links && `Google Maps: ${links.google}`,
    `תמונות מהאירוע: ${eventUrl(ev.code)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ------------------------------------------------------------------ calendar

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const ymdhm = (d: Date) => `${ymd(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const EVENT_HOURS = 4;

/** Start/end in "floating" local form (interpreted in Asia/Jerusalem), or all-day when there's no time. */
function range(ev: Pick<PublicEvent, "date" | "time">) {
  const d = parseDate(ev.date);
  if (!d) return null;
  const t = ev.time ? /^(\d{2}):(\d{2})$/.exec(ev.time) : null;
  if (!t) {
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    return { allDay: true, start: ymd(d), end: ymd(next) };
  }
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +t[1], +t[2]);
  const end = new Date(start.getTime() + EVENT_HOURS * 3_600_000);
  return { allDay: false, start: ymdhm(start), end: ymdhm(end) };
}

export const hasCalendar = (ev: Pick<PublicEvent, "date">) => !!parseDate(ev.date);

export function googleCalendarUrl(ev: PublicEvent) {
  const r = range(ev);
  if (!r) return null;
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${r.start}/${r.end}`,
    details: `מעלים תמונות מהאירוע וצופים בכולן: ${eventUrl(ev.code)}`,
  });
  if (!r.allDay) p.set("ctz", "Asia/Jerusalem");
  const loc = [ev.venueName, ev.venueAddress].filter(Boolean).join(", ");
  if (loc) p.set("location", loc);
  return `https://calendar.google.com/calendar/render?${p}`;
}

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function icsFile(ev: PublicEvent) {
  const r = range(ev);
  if (!r) return null;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const loc = [ev.venueName, ev.venueAddress].filter(Boolean).join(", ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Eirua Parua//Event//HE",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${ev.id}@${location.hostname}`,
    `DTSTAMP:${stamp}`,
    r.allDay ? `DTSTART;VALUE=DATE:${r.start}` : `DTSTART;TZID=Asia/Jerusalem:${r.start}`,
    r.allDay ? `DTEND;VALUE=DATE:${r.end}` : `DTEND;TZID=Asia/Jerusalem:${r.end}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    loc && `LOCATION:${icsEscape(loc)}`,
    `DESCRIPTION:${icsEscape(`תמונות מהאירוע: ${eventUrl(ev.code)}`)}`,
    `URL:${eventUrl(ev.code)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n") + "\r\n";
}
