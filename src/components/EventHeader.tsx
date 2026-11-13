import { useEffect, useRef, useState, type ReactNode } from "react";
import { BgLayer } from "./BgLayer";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { PublicEvent } from "../../shared/types";
import { backgroundProps } from "../lib/themes";
import { titleFontVars, useFonts } from "../lib/fonts";
import { barTextColor, headerObjectPosition, pagesTitleFont } from "../../shared/design";

export const headerImageUrl = (ev: PublicEvent) =>
  ev.headerVersion ? `/api/e/${ev.code}/asset/hd?v=${encodeURIComponent(ev.headerVersion)}` : null;

const BANNER = 112; // px of the image strip that scrolls away before the header sticks

/**
 * Header with the event's header image that accompanies guests on every event page.
 * At the top it's shown in full; while scrolling the image strip slides away and fades to ~50%,
 * then the bar sticks (sticky with a negative offset → no layout shift / scroll jitter).
 * Text stays fully opaque over a blurred, semi-transparent surface (contrast ≥ 4.5:1).
 */
export function EventHeader({
  event,
  backTo,
  backLabel = "חזרה לעמוד האירוע",
  pageTitle,
  actions,
  children,
  compact = false,
}: {
  event: PublicEvent;
  backTo?: string;
  backLabel?: string;
  pageTitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
  /** No banner strip: the bar is stuck from the start (full-screen views like the carousel, where every px counts). */
  compact?: boolean;
}) {
  const banner = compact ? 0 : BANNER;
  const ref = useRef<HTMLElement>(null);
  const [t, setT] = useState(0); // 0 = top, 1 = stuck

  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setT(banner ? Math.min(1, window.scrollY / banner) : 1));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
    };
  }, [banner]);

  // Expose the visible (stuck) height for sticky sub-headers and full-height views.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--toolbar-h", `${el.offsetHeight - banner}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, [banner]);

  const img = headerImageUrl(event);
  const bg = backgroundProps(event);
  const font = pagesTitleFont(event.design);
  useFonts(font);

  return (
    <header ref={ref} className="group/header sticky z-30 text-white" style={{ top: -banner }}>
      {/* Image layer: fades from 100% to ~50% as the header sticks; back to full on hover/focus. */}
      <div
        className="absolute inset-0 overflow-hidden transition-opacity duration-300 group-hover/header:!opacity-100 group-focus-within/header:!opacity-100"
        style={{ opacity: 1 - t * 0.5 }}
        aria-hidden
      >
        {img ? (
          <img src={img} alt="" className="size-full object-cover" style={{ objectPosition: headerObjectPosition(event.design.hero), transform: `scale(${1 + t * 0.06})` }} />
        ) : (
          <BgLayer bg={bg} className="absolute inset-0" />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/35 to-black/65" aria-hidden />
      <div
        className="absolute inset-x-0 bottom-0 backdrop-blur-md transition-colors duration-300"
        style={{ top: banner, backgroundColor: `rgb(9 9 11 / ${0.2 + t * 0.35})` }}
        aria-hidden
      />

      {/* Banner strip (scrolls away): big event title. */}
      {banner > 0 && (
      <div className="relative flex items-end px-4 pb-2" style={{ height: banner, opacity: 1 - t, ...titleFontVars(font) }}>
        <p className="mx-auto w-full max-w-[1600px] truncate font-title text-3xl drop-shadow-[0_2px_8px_rgb(0_0_0/0.5)] sm:text-4xl" style={{ color: barTextColor(event.design, "top") ?? undefined }}>
          {event.title}
        </p>
      </div>
      )}

      {/* Sticky bar. */}
      <div className="relative mx-auto flex min-h-16 max-w-[1600px] items-center gap-2 px-3 ps-[max(0.75rem,var(--music-inset,0px))] sm:px-4 sm:ps-[max(1rem,var(--music-inset,0px))]">
        {backTo && (
          <Link to={backTo} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white/15" aria-label={backLabel}>
            <ArrowRight className="size-6" aria-hidden />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold leading-tight drop-shadow">{pageTitle || event.title}</p>
          <p className="truncate text-sm text-white/80 transition-opacity duration-200" style={{ opacity: pageTitle ? Math.max(0.0001, t) : 0 }}>
            {event.title}
          </p>
        </div>
        {actions}
      </div>
      {children && <div className="relative">{children}</div>}
    </header>
  );
}
