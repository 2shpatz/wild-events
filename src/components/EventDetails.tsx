import { CalendarDays, CalendarPlus, Copy, Download, Map, MapPin, MapPinned, Navigation, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import type { PublicEvent } from "../../shared/types";
import { countdown, destination, googleCalendarUrl, hasCalendar, icsFile, navLinks, shareText, whenText } from "../lib/eventInfo";
import { WhatsAppIcon } from "./QRShare";
import { cx, useToast } from "./ui";
import { isAndroid } from "../lib/device";

export const hasDetails = (ev: PublicEvent) => !!(ev.date || ev.time || ev.venueName || ev.venueAddress);

/**
 * "פרטי האירוע": when + where, one-tap navigation (Waze / Google Maps / Apple Maps - not on Android),
 * sharing the address with the links, and add-to-calendar. Links only - no embedded map / third-party scripts.
 */
export function EventDetails({ event, dark }: { event: PublicEvent; dark: boolean }) {
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
      <dl className="space-y-4">
        {when && (
          <Row icon={<CalendarDays className="size-6" aria-hidden />} label="מתי">
            <span className="font-semibold">{when}</span>
            {soon && <span className={cx("ms-2 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold", dark ? "bg-white/20" : "bg-accent text-on-accent")}>{soon}</span>}
          </Row>
        )}
        {(event.venueName || event.venueAddress) && (
          <Row icon={<MapPin className="size-6" aria-hidden />} label="איפה">
            {event.venueName && <span className="block font-semibold">{event.venueName}</span>}
            {event.venueAddress && <span className="block opacity-85">{event.venueAddress}</span>}
          </Row>
        )}
      </dl>

      {links && (
        <div className="space-y-3">
          <h3 className="text-lg font-bold">איך מגיעים</h3>
          <div className={cx("grid grid-cols-2 gap-3", !isAndroid && "sm:grid-cols-3")}>
            <a
              href={links.waze}
              target="_blank"
              rel="noopener noreferrer"
              className={cx(!isAndroid && "col-span-2 sm:col-span-1", "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#33CCFF] px-4 text-base font-bold text-[#08303d] shadow-soft transition-[filter] duration-200 hover:brightness-105")}
            >
              <Navigation className="size-5" aria-hidden />
              Waze
            </a>
            <a href={links.google} target="_blank" rel="noopener noreferrer" className={btn}>
              <MapPinned className="size-5 shrink-0" aria-hidden />
              Google Maps
            </a>
            {!isAndroid && (
              <a href={links.apple} target="_blank" rel="noopener noreferrer" className={btn}>
                <Map className="size-5 shrink-0" aria-hidden />
                Apple Maps
              </a>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-lg font-bold">{links ? "שיתוף הכתובת" : "שיתוף פרטי האירוע"}</h3>
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

      {hasCalendar(event) && soon !== null && (
        <div className="space-y-3">
          <h3 className="text-lg font-bold">הוספה ליומן</h3>
          <div className="grid grid-cols-2 gap-3">
            {gcal && (
              <a href={gcal} target="_blank" rel="noopener noreferrer" className={btn}>
                <CalendarPlus className="size-5 shrink-0" aria-hidden />
                Google
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

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-current/10">{icon}</span>
      <div className="min-w-0 text-lg leading-snug">
        <dt className="sr-only">{label}</dt>
        <dd>{children}</dd>
      </div>
    </div>
  );
}
