import { forwardRef, type CSSProperties } from "react";
import { ChevronDown, Clock, MapPin, Quote } from "lucide-react";
import { headerObjectPosition, type HeroDesign, type TitleSize } from "../../../shared/design";
import type { PublicEvent } from "../../../shared/types";
import { Reveal } from "../Reveal";
import { cx } from "../ui";
import { headerImageUrl } from "../EventHeader";
import { countdown } from "../../lib/eventInfo";
import { EventDate } from "../../lib/dateStyles";
import { titleFontVars } from "../../lib/fonts";

const TITLE_SIZES: Record<TitleSize, string> = {
  md: "text-4xl sm:text-6xl md:text-7xl",
  lg: "text-5xl sm:text-7xl md:text-8xl",
  xl: "text-6xl sm:text-8xl md:text-9xl",
};

/**
 * The main page (fixed in the layout): header image, title, subtitle, date, time / venue, the hosts' welcome.
 * What shows and how it looks comes from the flexible design (`hero`).
 */
export const EventHero = forwardRef<
  HTMLElement,
  {
    event: PublicEvent;
    hero: HeroDesign;
    dark: boolean;
    y: number;
    vh: number;
    reduced: boolean;
    /** highlighted in the editor preview */
    selected?: boolean;
    onVenue?: () => void;
    onMore?: () => void;
  }
>(function EventHero({ event, hero, dark, y, vh, reduced, selected, onVenue, onMore }, ref) {
  const headerImg = hero.show.header ? headerImageUrl(event) : null;
  const soon = countdown(event.date);
  const text: CSSProperties | undefined = hero.textColor ? { color: hero.textColor } : undefined;
  const showTime = hero.show.time && !!event.time;
  const showCountdown = hero.show.countdown && !!soon;
  const showVenue = hero.show.venue && !!(event.venueName || event.venueAddress);
  const showInfo = showTime || showCountdown || showVenue;

  return (
    <section
      ref={ref}
      data-block-id="hero"
      data-selected={selected || undefined}
      className="relative flex min-h-dvh flex-col items-center justify-center px-6 pb-10 pt-14 text-center sm:pt-20 [@media(max-height:640px)]:pt-10"
      style={titleFontVars(hero.titleFont)}
      aria-label="האירוע"
    >
      {headerImg && (
        <Reveal variant="scale" delay={0} className="mb-6 w-full max-w-5xl [@media(max-height:640px)]:mb-4">
          {/* Wide frame with rounded corners; the image is cropped around the hosts' chosen focal point (hero.headerPos). */}
          <div className="relative aspect-[3/2] w-full overflow-hidden rounded-3xl shadow-[0_24px_60px_rgb(0_0_0/0.4)] ring-1 ring-white/30 sm:aspect-[16/9] lg:aspect-[21/9] lg:max-h-[48dvh] [@media(max-height:640px)]:aspect-[21/9]">
            <img
              src={headerImg}
              alt={`תמונת הכותרת של ${event.title}`}
              className="size-full object-cover"
              style={{
                objectPosition: headerObjectPosition(hero),
                // Gentle zoom toward the focal point while scrolling (stays inside the frame, never covers the title).
                transformOrigin: headerObjectPosition(hero),
                transform: reduced ? undefined : `scale(${1 + (Math.min(y, vh) / Math.max(vh, 1)) * 0.08})`,
              }}
            />
          </div>
        </Reveal>
      )}
      <Reveal variant="scale" delay={150}>
        <h1 className={cx("font-title leading-[1.05] [text-wrap:balance] transition-[font-family] duration-150", TITLE_SIZES[hero.titleSize])} style={hero.titleColor ? { color: hero.titleColor } : undefined}>
          {event.title}
        </h1>
      </Reveal>
      {hero.show.subtitle && event.subtitle && (
        <Reveal variant="up" delay={300}>
          <p className="mt-3 max-w-xl text-xl opacity-90 [text-wrap:balance]" style={text}>
            {event.subtitle}
          </p>
        </Reveal>
      )}
      {hero.show.date && event.date && (
        <Reveal variant="up" delay={420}>
          <EventDate iso={event.date} style={hero.dateStyle} color={hero.textColor} />
        </Reveal>
      )}
      {showInfo && (
        <Reveal variant="fade" delay={520}>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-lg" style={text}>
            {showTime && (
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Clock className="size-5" aria-hidden />
                בשעה {event.time}
              </span>
            )}
            {showCountdown && <span className={cx("rounded-full px-3 py-0.5 text-base font-bold", dark ? "bg-white/20" : "bg-accent text-on-accent")}>{soon}</span>}
            {showVenue && (
              <button type="button" onClick={onVenue} className="inline-flex min-h-11 items-center gap-1.5 font-semibold underline decoration-current/40 underline-offset-4 hover:decoration-current">
                <MapPin className="size-5" aria-hidden />
                {event.venueName || event.venueAddress}
              </button>
            )}
          </div>
        </Reveal>
      )}

      {hero.show.welcome && event.welcome && (
        <Reveal variant="up" delay={620} className="mt-7 w-full max-w-xl">
          <blockquote className={cx("relative rounded-[2rem] px-6 pb-6 pt-8 text-center backdrop-blur-md sm:px-8", dark ? "bg-white/10" : "bg-card/80 shadow-soft")} style={text}>
            <Quote className="absolute -top-4 left-1/2 size-8 -translate-x-1/2 rounded-full bg-accent p-1.5 text-on-accent" aria-hidden />
            <p className="whitespace-pre-line font-display text-xl leading-relaxed sm:text-2xl">{event.welcome}</p>
          </blockquote>
        </Reveal>
      )}

      {onMore && (
        <button onClick={onMore} className="mt-8 flex min-h-11 flex-col items-center gap-1 text-sm font-semibold opacity-80 hover:opacity-100" style={text}>
          עוד על האירוע
          <ChevronDown className="size-6 motion-safe:animate-bounce" aria-hidden />
        </button>
      )}
    </section>
  );
});
