import { CalendarDays, Copy, Download, MapPin, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import type { PublicEvent } from "../../shared/types";
import { DETAILS_SHARE_NO_ADDRESS, DETAILS_TEXTS, partText, singletonBlock, type DetailsBlock } from "../../shared/design";
import { countdown, destination, googleCalendarUrl, hasCalendar, icsFile, navLinks, shareText, whenText } from "../lib/eventInfo";
import { WhatsAppIcon } from "./QRShare";
import { AppleIcon, GoogleCalendarIcon, GoogleMapsIcon } from "./BrandIcons";
import { cx, useToast } from "./ui";
import { isAndroid } from "../lib/device";

export const hasDetails = (ev: PublicEvent) => !!(ev.date || ev.time || ev.venueName || ev.venueAddress);

const allShown = singletonBlock("details", "details") as DetailsBlock;

/** Would the details card show anything with these parts switched on? (Sharing works whenever there are details.) */
export function detailsCardHasContent(ev: PublicEvent, show: DetailsBlock["show"]) {
  if (!hasDetails(ev)) return false;
  const dest = destination(ev);
  return (
    (show.when && !!whenText(ev)) ||
    (show.where && !!(ev.venueName || ev.venueAddress)) ||
    (show.nav && !!dest) ||
    show.share ||
    (show.calendar && hasCalendar(ev) && countdown(ev.date) !== null)
  );
}

/**
 * "פרטי האירוע": when + where, one-tap navigation (Waze / Google Maps / Apple Maps - not on Android; each in its app's colors),
 * sharing the address with the links, and add-to-calendar. Links only - no embedded map / third-party scripts.
 */
export function EventDetails({ event, dark, block = allShown }: { event: PublicEvent; dark: boolean; block?: DetailsBlock }) {
  const { show, texts } = block;
  // With a chosen font the section headings use it too; otherwise they stay in the body font, bold.
  const h3 = block.font ? "font-title text-xl" : "text-lg font-bold";
  const toast = useToast();
  const dest = destination(event);
  const links = dest ? navLinks(dest) : null;
  const soon = countdown(event.date);
  const when = whenText(event);
  const text = shareText(event);
  const gcal = googleCalendarUrl(event);

  const btn = cx(
    "inline-flex min-h-12 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl px-2 text-[15px] font-semibold transition-[background-color,filter] duration-200 sm:px-4 sm:text-base",
    dark ? "border border-white/35 bg-white/10 text-white hover:bg-white/20" : "border-2 border-border bg-card text-fg hover:border-primary hover:bg-primary/5",
  );

  // App buttons in each app's own colors (like Waze and WhatsApp), the same in light and dark themes.
  const brandBtn =
    "inline-flex min-h-12 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-2 text-[15px] font-bold shadow-soft transition-[background-color,filter] duration-200 sm:px-4 sm:text-base";
  const googleBtn = cx(brandBtn, "border border-[#dadce0] bg-white text-[#3c4043] hover:bg-[#f8f9fa]");

  const shareOrCopy = async () => {
    if ("share" in navigator) {
      try {
        await navigator.share({ title: event.title, text });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("הפרטים הועתקו - אפשר להדביק בכל אפליקציה");
    } catch {
      toast("לא הצלחנו להעתיק. אפשר לשתף בוואטסאפ", "error");
    }
  };

  const downloadIcs = () => {
    const ics = icsFile(event);
    if (!ics) return;
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.code}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <div className={cx("mx-auto w-full max-w-2xl space-y-6 rounded-[2rem] p-4 backdrop-blur-md sm:p-8", dark ? "bg-white/10" : "bg-card/85 shadow-soft")}>
      {((show.when && when) || (show.where && (event.venueName || event.venueAddress))) && (
        <dl className="space-y-4">
          {show.when && when && (
            <Row part="when" icon={<CalendarDays className="size-6" aria-hidden />} label="מתי">
              <span className="font-semibold">{when}</span>
              {soon && <span className={cx("ms-2 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold", dark ? "bg-white/20" : "bg-accent text-on-accent")}>{soon}</span>}
            </Row>
          )}
          {show.where && (event.venueName || event.venueAddress) && (
            <Row part="where" icon={<MapPin className="size-6" aria-hidden />} label="איפה">
              {event.venueName && <span className="block font-semibold">{event.venueName}</span>}
              {event.venueAddress && <span className="block opacity-85">{event.venueAddress}</span>}
            </Row>
          )}
        </dl>
      )}

      {show.nav && links && (
        <div data-part="nav" className="space-y-3">
          <h3 className={h3}>{partText(texts, "nav", DETAILS_TEXTS.nav)}</h3>
          <div className={cx("grid grid-cols-2 gap-3", !isAndroid && "sm:grid-cols-3")}>
            <a
              href={links.waze}
              target="_blank"
              rel="noopener noreferrer"
              className={cx(!isAndroid && "col-span-2 sm:col-span-1", "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#33CCFF] px-4 text-base font-bold text-[#08303d] shadow-soft transition-[filter] duration-200 hover:brightness-105")}
            >
              <WazeIcon className="size-6" />
              Waze
            </a>
            <a href={links.google} target="_blank" rel="noopener noreferrer" className={googleBtn}>
              <GoogleMapsIcon className="h-6 w-5 shrink-0" />
              Google Maps
            </a>
            {!isAndroid && (
              <a
                href={links.apple}
                target="_blank"
                rel="noopener noreferrer"
                className={cx(brandBtn, "bg-black text-white hover:bg-[#1d1d1f]", dark && "ring-1 ring-white/30")}
              >
                <AppleIcon className="size-5 shrink-0 -translate-y-px" />
                Apple Maps
              </a>
            )}
          </div>
        </div>
      )}

      {show.share && (
        <div data-part="share" className="space-y-3">
          <h3 className={h3}>{partText(texts, "share", links ? DETAILS_TEXTS.share : DETAILS_SHARE_NO_ADDRESS)}</h3>
          <div className="grid grid-cols-2 gap-3">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 text-base font-bold text-[#062e16] shadow-soft transition-[filter] duration-200 hover:brightness-105"
            >
              <WhatsAppIcon className="size-5" />
              וואטסאפ
            </a>
            <button type="button" onClick={shareOrCopy} className={btn}>
              {"share" in navigator ? <Share2 className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}
              {"share" in navigator ? "שיתוף" : "העתקה"}
            </button>
          </div>
        </div>
      )}

      {show.calendar && hasCalendar(event) && soon !== null && (
        <div data-part="calendar" className="space-y-3">
          <h3 className={h3}>{partText(texts, "calendar", DETAILS_TEXTS.calendar)}</h3>
          <div className="grid grid-cols-2 gap-3">
            {gcal && (
              <a href={gcal} target="_blank" rel="noopener noreferrer" className={googleBtn}>
                <GoogleCalendarIcon className="size-6 shrink-0" />
                יומן Google
              </a>
            )}
            <button type="button" onClick={downloadIcs} className={btn}>
              <Download className="size-5 shrink-0" aria-hidden />
              יומן אחר
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, part, children }: { icon: ReactNode; label: string; part?: string; children: ReactNode }) {
  return (
    <div data-part={part} className="flex items-start gap-4">
      <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-current/10">{icon}</span>
      <div className="min-w-0 text-lg leading-snug">
        <dt className="sr-only">{label}</dt>
        <dd>{children}</dd>
      </div>
    </div>
  );
}

/** Official Waze glyph (Simple Icons, CC0). */
export function WazeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M13.218 0C9.915 0 6.835 1.49 4.723 4.148c-1.515 1.913-2.31 4.272-2.31 6.706v1.739c0 .894-.62 1.738-1.862 1.813-.298.025-.547.224-.547.522-.05.82.82 2.31 2.012 3.502.82.844 1.788 1.515 2.832 2.036a3 3 0 0 0 2.955 3.528 2.966 2.966 0 0 0 2.931-2.385h2.509c.323 1.689 2.086 2.856 3.974 2.21 1.64-.546 2.36-2.409 1.763-3.924a12.84 12.84 0 0 0 1.838-1.465 10.73 10.73 0 0 0 3.18-7.65c0-2.882-1.118-5.589-3.155-7.625A10.899 10.899 0 0 0 13.218 0zm0 1.217c2.558 0 4.967.994 6.78 2.807a9.525 9.525 0 0 1 2.807 6.78A9.526 9.526 0 0 1 20 17.585a9.647 9.647 0 0 1-6.78 2.807h-2.46a3.008 3.008 0 0 0-2.93-2.41 3.03 3.03 0 0 0-2.534 1.367v.024a8.945 8.945 0 0 1-2.41-1.788c-.844-.844-1.316-1.614-1.515-2.11a2.858 2.858 0 0 0 1.441-.846 2.959 2.959 0 0 0 .795-2.036v-1.789c0-2.11.696-4.197 2.012-5.861 1.863-2.385 4.62-3.726 7.6-3.726zm-2.41 5.986a1.192 1.192 0 0 0-1.191 1.192 1.192 1.192 0 0 0 1.192 1.193A1.192 1.192 0 0 0 12 8.395a1.192 1.192 0 0 0-1.192-1.192zm7.204 0a1.192 1.192 0 0 0-1.192 1.192 1.192 1.192 0 0 0 1.192 1.193 1.192 1.192 0 0 0 1.192-1.193 1.192 1.192 0 0 0-1.192-1.192zm-7.377 4.769a.596.596 0 0 0-.546.845 4.813 4.813 0 0 0 4.346 2.757 4.77 4.77 0 0 0 4.347-2.757.596.596 0 0 0-.547-.845h-.025a.561.561 0 0 0-.521.348 3.59 3.59 0 0 1-3.254 2.061 3.591 3.591 0 0 1-3.254-2.061.64.64 0 0 0-.546-.348z" />
    </svg>
  );
}
