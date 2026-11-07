import { forwardRef, type CSSProperties } from "react";
import { ChevronDown, Clock, MapPin, Quote } from "lucide-react";
import type { HeroDesign, TitleSize } from "../../../shared/design";
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
  const showInfo = hero.show.info && (event.time || soon || event.venueName || event.venueAddress);

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
        <Reveal variant="scale" delay={0}>
          <img
            src={headerImg}
            alt={`תמונת הכותרת של ${event.title}`}
            className="mx-auto mb-4 size-24 rounded-full object-cover [@media(max-height:640px)]:mb-3 [@media(max-height:640px)]:size-16 shadow-[0_20px_60px_rgb(0_0_0/0.45)] ring-4 ring-white/75 sm:size-40"
            style={{ transform: reduced ? undefined : `translate3d(0, ${Math.min(y, vh) * 0.12}px, 0)` }}
          />
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
            {event.time && (
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Clock className="size-5" aria-hidden />
                בשעה {event.time}
              </span>
            )}
            {soon && <span className={cx("rounded-full px-3 py-0.5 text-base font-bold", dark ? "bg-white/20" : "bg-accent text-on-accent")}>{soon}</span>}
            {(event.venueName || event.venueAddress) && (
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
