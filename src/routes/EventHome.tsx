import { useEffect, useRef, useState, type RefObject } from "react";
import { Link, useParams } from "react-router-dom";
import { Camera, Images, Settings, Radio, Lock, ChevronDown, Clock, MapPin, Play, Quote, X, ZoomIn } from "lucide-react";
import { useEvent } from "../lib/session";
import { EventStatus } from "../components/EventChrome";
import { Reveal, useScrollProgress, prefersReducedMotion } from "../components/Reveal";
import { cx } from "../components/ui";
import { headerImageUrl } from "../components/EventHeader";
import { backgroundProps, isDarkBackground } from "../lib/themes";
import { formatDate } from "../lib/format";
import { countdown } from "../lib/eventInfo";
import { api } from "../lib/api";
import { thumbUrl } from "../lib/media";
import { EventDetails, hasDetails } from "../components/EventDetails";
import type { MediaDTO, PublicEvent } from "../../shared/types";

const featuredUrl = (code: string, f: { slot: number; v: string }) => `/api/e/${code}/asset/f${f.slot}?v=${encodeURIComponent(f.v)}`;

/**
 * The event's page (skill pattern: "Event Landing"): the hero carries who/when/where + the hosts' welcome message.
 *   Then: the invitation image → event details (navigation, share address, calendar) → hosts' photos
 *   → the album live, closing with the two big Upload / View actions.
 *   Mobile gets a sticky bottom action bar after the hero.
 * No scroll-jacking; parallax only on the background layer; reduced motion renders the final state.
 */
export default function EventHome() {
  const { code } = useParams();
  const { event, error } = useEvent(code);
  const { progress, y } = useScrollProgress();
  const choice = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const details = useRef<HTMLElement>(null);
  const choiceVisible = useInView(choice);
  if (!event) return <EventStatus error={error} loading />;

  const dark = isDarkBackground(event.background, event.theme);
  const bg = backgroundProps(event);
  const reduced = prefersReducedMotion();
  const hasStory = event.featured.length > 0;
  const showDetails = hasDetails(event);
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  // Background drifts slower than content and the scrim deepens as you scroll (readability further down).
  const parallax = reduced ? 0 : Math.min(y, vh * 2) * -0.18;
  const scrim = Math.min(0.55, (y / vh) * 0.45);
  const headerImg = headerImageUrl(event);
  const invitationImg = event.invitationVersion ? `/api/e/${event.code}/asset/inv?v=${encodeURIComponent(event.invitationVersion)}` : null;
  const barShown = y > vh * 0.75;
  const soon = countdown(event.date);
  const scrollTo = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });

  return (
    <div className={cx("relative min-h-dvh overflow-x-clip", dark ? "text-white" : "text-fg")}>
      {/* Scroll progress indicator. */}
      <div className="fixed inset-x-0 top-0 z-40 h-1 bg-transparent" aria-hidden>
        <div className="h-full origin-right bg-accent transition-transform duration-100" style={{ transform: `scaleX(${progress})` }} />
      </div>

      {/* Header bar that accompanies the guest once past the hero: header image at ~50%, blurred. On mobile the actions live in the bottom bar. */}
      <div
        className={cx(
          "fixed inset-x-0 top-0 z-30 overflow-hidden text-white transition-[transform,opacity] duration-300",
          barShown ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0",
        )}
        aria-hidden={!barShown}
      >
        <div className="absolute inset-0" aria-hidden>
          {headerImg ? <img src={headerImg} alt="" className="size-full object-cover opacity-50" /> : <div className={cx("size-full opacity-50", bg.className)} style={bg.style} />}
          <div className="absolute inset-0 bg-zinc-950/45 backdrop-blur-md" />
        </div>
        <div className="relative mx-auto flex min-h-16 max-w-5xl items-center gap-2 px-4 pt-[env(safe-area-inset-top)]">
          {headerImg && <img src={headerImg} alt="" className="size-10 shrink-0 rounded-full object-cover ring-2 ring-white/70" />}
          <p className="min-w-0 flex-1 truncate font-display text-xl">{event.title}</p>
          <Link to={`/${event.code}/gallery`} tabIndex={barShown ? 0 : -1} className="hidden min-h-10 items-center gap-1.5 rounded-full bg-white/15 px-3 text-sm font-semibold hover:bg-white/25 sm:inline-flex">
            <Images className="size-4" aria-hidden />
            צפייה
          </Link>
          {event.uploadsOpen && (
            <Link to={`/${event.code}/upload`} tabIndex={barShown ? 0 : -1} className="hidden min-h-10 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-semibold text-on-accent hover:brightness-110 sm:inline-flex">
              <Camera className="size-4" aria-hidden />
              העלאה
            </Link>
          )}
          {event.canManage && (
            <Link to={`/${event.code}/manage`} tabIndex={barShown ? 0 : -1} aria-label="ניהול האירוע" className="inline-flex size-10 items-center justify-center rounded-full hover:bg-white/15">
              <Settings className="size-5" aria-hidden />
            </Link>
          )}
        </div>
      </div>

      {/* Mobile: sticky primary actions in the thumb zone (hidden while the big Upload / View cards are on screen). */}
      <nav
        aria-label="פעולות מהירות"
        className={cx(
          "fixed inset-x-0 bottom-0 z-30 border-t border-white/15 bg-zinc-950/70 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-[transform,opacity] duration-300 sm:hidden",
          barShown && !choiceVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0",
        )}
        aria-hidden={!barShown || choiceVisible}
      >
        <div className={cx("grid gap-3", event.uploadsOpen ? "grid-cols-2" : "grid-cols-1")}>
          {event.uploadsOpen && (
            <Link to={`/${event.code}/upload`} tabIndex={barShown && !choiceVisible ? 0 : -1} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl bg-accent px-2 text-[15px] font-bold text-on-accent min-[400px]:text-base">
              <Camera className="size-5" aria-hidden />
              העלאת תמונות
            </Link>
          )}
          <Link to={`/${event.code}/gallery`} tabIndex={barShown && !choiceVisible ? 0 : -1} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl bg-white/15 px-2 text-[15px] font-bold text-white min-[400px]:text-base">
            <Images className="size-5" aria-hidden />
            לאלבום
          </Link>
        </div>
      </nav>

      {/* Fixed, clipped background layer (parallax = decorative layer only). */}
      <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className={cx("absolute inset-x-0 -top-[5%] h-[175%]", bg.className)} style={{ ...bg.style, transform: `translate3d(0, ${parallax}px, 0)` }} />
        {event.background === "custom" && <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/70" />}
        <div className="absolute inset-0 bg-black transition-opacity duration-150" style={{ opacity: dark ? scrim : scrim * 0.25 }} />
      </div>

      {event.canManage && !barShown && (
        <Link
          to={`/${event.code}/manage`}
          className={cx(
            "fixed end-4 top-[max(1rem,env(safe-area-inset-top))] z-30 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold backdrop-blur-md transition-colors duration-200",
            dark ? "bg-white/15 text-white hover:bg-white/25" : "bg-card/85 text-fg shadow-soft hover:bg-card",
          )}
        >
          <Settings className="size-4" aria-hidden />
          ניהול האירוע
        </Link>
      )}

      {/* 1 - Hero: who, when, where + the main actions (photo sharing is the page's main job). */}
      <section ref={hero} className="relative flex min-h-dvh flex-col items-center justify-center px-6 pb-10 pt-14 text-center sm:pt-20 [@media(max-height:640px)]:pt-10" aria-label="האירוע">
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
          <h1 className="font-display text-5xl leading-[1.05] [text-wrap:balance] sm:text-7xl md:text-8xl">{event.title}</h1>
        </Reveal>
        {event.subtitle && (
          <Reveal variant="up" delay={300}>
            <p className="mt-3 max-w-xl text-xl opacity-90 [text-wrap:balance]">{event.subtitle}</p>
          </Reveal>
        )}
        {event.date && (
          <Reveal variant="up" delay={420}>
            <InvitationDate iso={event.date} />
          </Reveal>
        )}
        {(event.time || soon || event.venueName || event.venueAddress) && (
          <Reveal variant="fade" delay={520}>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-lg">
              {event.time && (
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <Clock className="size-5" aria-hidden />
                  בשעה {event.time}
                </span>
              )}
              {soon && <span className={cx("rounded-full px-3 py-0.5 text-base font-bold", dark ? "bg-white/20" : "bg-accent text-on-accent")}>{soon}</span>}
              {(event.venueName || event.venueAddress) && (
                <button type="button" onClick={() => scrollTo(details.current)} className="inline-flex min-h-11 items-center gap-1.5 font-semibold underline decoration-current/40 underline-offset-4 hover:decoration-current">
                  <MapPin className="size-5" aria-hidden />
                  {event.venueName || event.venueAddress}
                </button>
              )}
            </div>
          </Reveal>
        )}

        {event.welcome && (
          <Reveal variant="up" delay={620} className="mt-7 w-full max-w-xl">
            <blockquote
              className={cx(
                "relative rounded-[2rem] px-6 pb-6 pt-8 text-center backdrop-blur-md sm:px-8",
                dark ? "bg-white/10" : "bg-card/80 shadow-soft",
              )}
            >
              <Quote className="absolute -top-4 left-1/2 size-8 -translate-x-1/2 rounded-full bg-accent p-1.5 text-on-accent" aria-hidden />
              <p className="whitespace-pre-line font-display text-xl leading-relaxed sm:text-2xl">{event.welcome}</p>
            </blockquote>
          </Reveal>
        )}

        <button
          onClick={() => scrollTo(hero.current?.nextElementSibling as HTMLElement | null)}
          className="mt-8 flex flex-col items-center gap-1 text-sm font-semibold opacity-80 hover:opacity-100"
        >
          עוד על האירוע
          <ChevronDown className="size-6 motion-safe:animate-bounce" aria-hidden />
        </button>
      </section>

      {/* 2 - The invitation itself (tap to view full screen). */}
      {invitationImg && (
        <section className="relative scroll-mt-20 px-5 py-14 sm:py-20" aria-label="ההזמנה">
          <InvitationImage src={invitationImg} title={event.title} />
        </section>
      )}

      {/* 3 - Event details: when, where, navigation, share the address, add to calendar. */}
      {showDetails && (
        <section ref={details} className="relative scroll-mt-20 px-5 py-14 sm:py-20" aria-labelledby="details-title">
          <Reveal variant="up">
            <h2 id="details-title" className="mb-8 text-center font-display text-4xl sm:text-5xl">
              פרטי האירוע
            </h2>
          </Reveal>
          <Reveal variant="up" delay={120}>
            <EventDetails event={event} dark={dark} />
          </Reveal>
        </section>
      )}

      {/* 4 - The hosts' featured photos (their welcome message lives in the hero). */}
      {hasStory && (
        <section className="relative px-5 py-14 sm:py-24" aria-label="מבעלי השמחה">
          <FeaturedGallery event={event} dark={dark} />
        </section>
      )}

      {/* 5 - The album, live, closing with the two big actions. */}
      <section id="live-strip" className="relative px-5 pb-20 pt-14 sm:pt-20" aria-labelledby="live-title">
        <LiveStrip event={event} dark={dark} />

        {/* Two large, clearly separated actions (MASTER project overrides). */}
        <div ref={choice} className="mx-auto mt-10 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
          <Reveal variant="start" delay={100}>
            <Link
              to={`/${event.code}/gallery`}
              className={cx(
                "flex h-full min-h-44 flex-col items-center justify-center gap-3 rounded-[2rem] border-2 px-6 py-8 text-center backdrop-blur-md transition-[background-color,transform] duration-200 active:scale-[0.99]",
                dark ? "border-white/45 bg-white/10 hover:bg-white/20" : "border-primary bg-card/85 hover:bg-card",
              )}
            >
              <span className={cx("flex size-16 items-center justify-center rounded-2xl", dark ? "bg-white/15" : "bg-primary/10 text-primary")}>
                <Images className="size-9" aria-hidden />
              </span>
              <span className="text-2xl font-bold">צפייה בתמונות האירוע</span>
              <span className="text-base opacity-85">כל התמונות של כולם, בזמן אמת</span>
            </Link>
          </Reveal>
          <Reveal variant="end" delay={200}>
            {event.uploadsOpen ? (
              <Link
                to={`/${event.code}/upload`}
                className="flex h-full min-h-44 flex-col items-center justify-center gap-3 rounded-[2rem] bg-accent px-6 py-8 text-center text-on-accent shadow-lift transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.99]"
              >
                <span className="flex size-16 items-center justify-center rounded-2xl bg-white/20">
                  <Camera className="size-9" aria-hidden />
                </span>
                <span className="text-2xl font-bold">הוסיפו את התמונות שלכם</span>
                <span className="text-base opacity-90">צילמתם? העלו לאלבום - מהגלריה או מהמצלמה</span>
              </Link>
            ) : (
              <div className={cx("flex h-full min-h-44 flex-col items-center justify-center gap-3 rounded-[2rem] px-6 py-8 text-center", dark ? "bg-white/10" : "bg-card/80")}>
                <Lock className="size-8" aria-hidden />
                <span className="text-lg font-semibold">ההעלאות לאירוע הזה סגורות</span>
              </div>
            )}
          </Reveal>
        </div>

        {!event.canManage && (
          <p className="mt-10 text-center">
            <Link to={`/${event.code}/admin`} className="inline-flex min-h-11 items-center text-sm underline-offset-4 opacity-75 hover:underline hover:opacity-100">
              מנהלים את האירוע? כניסה לניהול
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}

/** Staggered "scrapbook" of the hosts' photos, each revealed as it scrolls in. */
function FeaturedGallery({ event, dark }: { event: PublicEvent; dark: boolean }) {
  const rot = [-3, 2.5, -1.5, 3, -2.5, 1.5];
  return (
    <ul className="mx-auto grid max-w-5xl grid-cols-2 gap-4 sm:gap-8 md:grid-cols-3">
      {event.featured.map((f, i) => (
        <Reveal
          as="li"
          key={f.slot}
          variant={i % 2 ? "end" : "start"}
          delay={(i % 3) * 120}
          className={cx(i % 3 === 1 && "md:translate-y-12", i === 0 && event.featured.length % 2 === 1 && "col-span-2 md:col-span-1")}
        >
          <figure
            className={cx("overflow-hidden rounded-2xl p-2 shadow-[0_20px_50px_rgb(0_0_0/0.35)] transition-transform duration-500 hover:rotate-0", dark ? "bg-white/90" : "bg-white")}
            style={{ rotate: `${rot[i % rot.length]}deg` }}
          >
            <img src={featuredUrl(event.code, f)} alt={`תמונה מבעלי השמחה ${i + 1}`} loading="lazy" decoding="async" className="aspect-[4/5] w-full rounded-xl object-cover" />
          </figure>
        </Reveal>
      ))}
    </ul>
  );
}

/** Invitation-style date: weekday between hairlines, then month | big day | year. */
function InvitationDate({ iso }: { iso: string }) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const weekday = new Intl.DateTimeFormat("he-IL", { weekday: "long" }).format(d);
  const month = new Intl.DateTimeFormat("he-IL", { month: "long" }).format(d);
  const rule = "h-px w-10 bg-current opacity-50 sm:w-16";
  const side = "min-w-[5rem] border-y border-current/40 py-1.5 text-base font-semibold tracking-wide sm:min-w-28 sm:py-2 sm:text-xl";
  return (
    <time dateTime={iso} aria-label={formatDate(iso)} className="mt-6 flex flex-col items-center gap-2 sm:mt-10 sm:gap-3">
      <span className="flex items-center gap-3 text-base font-semibold tracking-wide opacity-90 sm:text-lg" aria-hidden>
        <span className={rule} />
        {weekday}
        <span className={rule} />
      </span>
      <span className="flex items-center gap-4 sm:gap-6" aria-hidden>
        <span className={side}>{month}</span>
        <span className="font-display text-6xl leading-none tabular-nums [@media(max-height:640px)]:text-5xl drop-shadow-[0_6px_24px_rgb(0_0_0/0.25)] sm:text-8xl">{d.getDate()}</span>
        <span className={cx(side, "tracking-[0.2em]")}>{d.getFullYear()}</span>
      </span>
    </time>
  );
}

/** True while the element is on screen (used to hide the sticky bar over the final CTA section). */
function useInView(ref: RefObject<HTMLElement | null>) {
  const [v, setV] = useState(false);
  const el = ref.current; // null until the event has loaded and the section is mounted
  useEffect(() => {
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setV(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [el]);
  return v;
}

/** Newest photos from the album, refreshed every 30s while visible. */
function LiveStrip({ event, dark }: { event: PublicEvent; dark: boolean }) {
  const [items, setItems] = useState<MediaDTO[] | null>(null);
  useEffect(() => {
    let stop = false;
    const load = () =>
      api<{ media: MediaDTO[] }>(`/e/${event.code}/latest?n=12`)
        .then((r) => !stop && setItems(r.media))
        .catch(() => !stop && setItems((p) => p ?? []));
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [event.code]);

  const shown = (items ?? []).filter((m) => m.url);
  return (
    <div className="mx-auto max-w-4xl">
      <Reveal variant="up">
        <h2 id="live-title" className="mb-2 flex items-center justify-center gap-2 text-center font-display text-4xl sm:text-5xl">
          מהאלבום, בזמן אמת
        </h2>
        <p className="mb-8 flex items-center justify-center gap-2 text-base opacity-85" aria-live="polite">
          <Radio className="size-4 animate-pulse text-red-500" aria-hidden />
          {event.mediaCount > 0
            ? `${event.mediaCount.toLocaleString("he-IL")} תמונות וסרטונים עד עכשיו`
            : "כל תמונה שמועלית מופיעה כאן מיד"}
        </p>
      </Reveal>
      {items === null ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-6" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={cx("skeleton aspect-square rounded-xl", i >= 6 && "max-sm:hidden")} />
          ))}
        </div>
      ) : shown.length ? (
        <Reveal variant="up" delay={100}>
          <Link to={`/${event.code}/gallery`} aria-label="פתיחת אלבום האירוע" className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-6">
            {shown.map((m, i) => (
              <span key={m.id} className={cx("relative block overflow-hidden rounded-xl bg-black/20 shadow-soft", i >= 6 && "max-sm:hidden", i >= 8 && "max-md:hidden")}>
                <img src={thumbUrl(m, 240)!} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-cover transition-transform duration-500 hover:scale-105" />
                {m.kind === "video" && (
                  <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                    <span className="flex size-9 items-center justify-center rounded-full bg-black/55 text-white">
                      <Play className="size-4" />
                    </span>
                  </span>
                )}
              </span>
            ))}
          </Link>
        </Reveal>
      ) : (
        <Reveal variant="up" delay={100}>
          <div className={cx("mx-auto max-w-md rounded-[2rem] px-6 py-10 text-center backdrop-blur-md", dark ? "bg-white/10" : "bg-card/85 shadow-soft")}>
            <Camera className="mx-auto mb-3 size-10 opacity-80" aria-hidden />
            <p className="text-xl font-bold">האלבום עוד ריק</p>
            <p className="mt-1 opacity-85">היו הראשונים להעלות תמונה מהאירוע</p>
          </div>
        </Reveal>
      )}
    </div>
  );
}

/** The hosts' invitation as a paper card; tap opens it full screen (native <dialog>: Esc / back-drop / X close). */
function InvitationImage({ src, title }: { src: string; title: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Reveal variant="up" className="mx-auto w-full max-w-md">
        <button
          type="button"
          onClick={() => dlg.current?.showModal()}
          aria-label="הגדלת ההזמנה למסך מלא"
          className="group block w-full rotate-[-1.5deg] rounded-2xl bg-white p-2 shadow-[0_24px_60px_rgb(0_0_0/0.4)] transition-transform duration-300 hover:rotate-0 motion-reduce:rotate-0"
        >
          <img src={src} alt={`ההזמנה ל${title}`} loading="lazy" decoding="async" className="block h-auto w-full rounded-xl" />
        </button>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-sm font-semibold opacity-80" aria-hidden>
          <ZoomIn className="size-4" />
          הקישו להגדלה
        </p>
      </Reveal>
      <dialog
        ref={dlg}
        aria-label={`ההזמנה ל${title}`}
        onClick={(e) => e.target === e.currentTarget && dlg.current?.close()}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 backdrop:bg-black"
      >
        <div className="flex h-full items-center justify-center overflow-auto p-4" onClick={(e) => e.target === e.currentTarget && dlg.current?.close()}>
          <img src={src} alt={`ההזמנה ל${title}`} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
        <button
          type="button"
          onClick={() => dlg.current?.close()}
          aria-label="סגירה"
          autoFocus
          className="fixed end-4 top-[max(1rem,env(safe-area-inset-top))] inline-flex size-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md hover:bg-white/25"
        >
          <X className="size-6" aria-hidden />
        </button>
      </dialog>
    </>
  );
}
