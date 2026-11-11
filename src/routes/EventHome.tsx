import { useEffect, useRef, useState, type RefObject } from "react";
import { Link, useParams } from "react-router-dom";
import { Camera, Images, ListChecks, Settings } from "lucide-react";
import { useEvent } from "../lib/session";
import { EventStatus } from "../components/EventChrome";
import { useScrollProgress, prefersReducedMotion } from "../components/Reveal";
import { cx } from "../components/ui";
import { headerImageUrl } from "../components/EventHeader";
import { backgroundProps, isDarkBackground } from "../lib/themes";
import { EventHero } from "../components/event/EventHero";
import { EventBlock, blockHasContent, type BlockCtx } from "../components/event/EventBlocks";
import { postToParent, usePreviewDraft } from "../lib/designPreview";
import { loadFont, loadTextFont, textFontStyle, titleFontVars } from "../lib/fonts";
import { CHECKLIST_TEXTS, barTextColor, blockFonts, textFonts, headerObjectPosition, pagesTitleFont, partText, type Block } from "../../shared/design";

/** Glyphs fetched while browsing fonts in the editor preview (title + date digits + Hebrew letters). */
const PREVIEW_GLYPHS = "0123456789.|אבגדהוזחטיכךלמםנןסעפףצץקרשת׳״";

/**
 * The event's page (skill pattern: "Event Landing"). Layout comes from the flexible design:
 *   blocks before the main page → the main page (hero: who/when/where + the hosts' welcome) → blocks after it.
 *   The default layout is: invitation image → event details → hosts' photos → the album live + Upload / View.
 *   Mobile gets a sticky bottom action bar after the hero.
 * With `?preview=design` inside the editor's iframe it renders the unsaved draft and reports clicks as selections.
 * No scroll-jacking; parallax only on the background layer; reduced motion renders the final state.
 */
export default function EventHome() {
  const { code } = useParams();
  const { event: fetched, error } = useEvent(code);
  const preview = usePreviewDraft();
  const { progress, y } = useScrollProgress();
  const choice = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const revealZone = useRef<HTMLDivElement>(null);
  const choiceVisible = useInView(choice);
  const event = preview.draft?.event ?? fetched;
  const design = preview.draft?.design ?? event?.design;

  const titleFont = design?.hero.titleFont;
  const barFont = design ? (design.bars.top.font ?? pagesTitleFont(design)) : null;
  useEffect(() => {
    if (!event) return;
    for (const f of [titleFont, barFont]) loadFont(f, preview.active ? event.title + PREVIEW_GLYPHS : undefined);
  }, [titleFont, barFont, event, preview.active]);
  // Fonts chosen for blocks (their headings say anything, so the full family is loaded).
  const blockFontsKey = design ? blockFonts(design).join("|") : "";
  const textFontsKey = design ? textFonts(design).join("|") : "";
  useEffect(() => {
    for (const f of blockFontsKey.split("|")) if (f) loadFont(f);
    for (const f of textFontsKey.split("|")) if (f) loadTextFont(f);
  }, [blockFontsKey, textFontsKey]);

  if (!event || !design) return <EventStatus error={error} loading />;

  const dark = isDarkBackground(event.background, event.theme);
  const bg = backgroundProps(event);
  const reduced = prefersReducedMotion();
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  // Background drifts slower than content and the scrim deepens as you scroll (readability further down).
  const parallax = reduced ? 0 : Math.min(y, vh * 2) * -0.18;
  // Optional "reveal" zone after the last block: scrolling into it fades out the scrim / readability gradient and
  // fades in the whole (uncropped) background picture, with the bars out of the way. 0 = not reached, 1 = page end.
  const zone = event.bgReveal ? revealZone.current : null;
  const reveal = zone ? Math.min(1, Math.max(0, (y + vh - zone.offsetTop) / (zone.offsetHeight || vh))) : 0;
  const scrim = Math.min(0.55, (y / vh) * 0.45) * (1 - reveal);
  const headerImg = headerImageUrl(event);
  const heroTop = hero.current?.offsetTop ?? 0;
  const pastHero = y > heroTop + vh * 0.75;
  const barShown = pastHero && reveal < 0.35;
  // Each banner can be switched off (and its buttons chosen) in the design.
  const { top, bottom } = design.bars;
  const topShown = barShown && top.show;
  const bottomUpload = bottom.upload && event.uploadsOpen;
  // Elements the hosts put in the bottom banner as quick jumps (checklists), in page order.
  const jumps = [...design.before, ...design.after].filter(
    (b): b is Extract<Block, { type: "checklist" }> => b.type === "checklist" && b.inBar && !b.hidden && (preview.active || blockHasContent(b, event)),
  );
  const bottomShown = barShown && !choiceVisible && bottom.show && (bottomUpload || bottom.view || jumps.length > 0);
  const topColor = barTextColor(design, "top") ?? undefined;
  const bottomColor = barTextColor(design, "bottom");
  const scrollTo = (el: Element | null) => el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  const canManage = event.canManage && !preview.active;
  const selected = preview.draft?.selected ?? null;

  const visible = (list: Block[]) => list.filter((b) => !b.hidden && (preview.active || blockHasContent(b, event)));
  const before = visible(design.before);
  const after = visible(design.after);
  const ctx: BlockCtx = { event, dark, preview: preview.active, choiceRef: choice };
  // The page's fonts for the elements' other headings and their text (an element's own choice wins - it is set deeper).
  const pageFonts = {
    display: "contents",
    ...titleFontVars(design.pagesFont),
    ...textFontStyle(design.textFont),
    ...(design.bodyColor ? { color: design.bodyColor } : {}),
    ...(design.headingsColor ? { ["--title-color" as string]: design.headingsColor } : {}),
  } as React.CSSProperties;
  const renderBlocks = (list: Block[]) => (
    <div style={pageFonts} data-headings-color={design.headingsColor ? "" : undefined}>
      {list.map((b) => (
        <div key={b.id} data-block-id={b.id} data-selected={selected === b.id || undefined}>
          <EventBlock block={b} ctx={ctx} />
        </div>
      ))}
    </div>
  );

  // Editor preview: every click selects the block under it instead of navigating / opening things -
  // except inside [data-preview-interactive] (e.g. the featured photos' carousel arrows), which also keeps working.
  const onClickCapture = preview.active
    ? (e: React.MouseEvent) => {
        if (!(e.target as HTMLElement).closest("[data-preview-interactive]")) {
          e.preventDefault();
          e.stopPropagation();
        }
        const id = (e.target as HTMLElement).closest<HTMLElement>("[data-block-id]")?.dataset.blockId;
        if (id) postToParent({ type: "design:select", id });
      }
    : undefined;

  return (
    <div
      className={cx("relative min-h-dvh overflow-x-clip", dark ? "text-white" : "text-fg")}
      data-preview={preview.active || undefined}
      onClickCapture={onClickCapture}
    >
      {/* Scroll progress indicator. */}
      <div className="fixed inset-x-0 top-0 z-40 h-1 bg-transparent" aria-hidden>
        <div className="h-full origin-right bg-accent transition-transform duration-100" style={{ transform: `scaleX(${progress})` }} />
      </div>

      {/* Header bar that accompanies the guest once past the hero: header image at ~50%, blurred. On mobile the actions live in the bottom bar. */}
      <div
        className={cx(
          "fixed inset-x-0 top-0 z-30 overflow-hidden text-white transition-[transform,opacity] duration-300",
          topShown ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0",
        )}
        aria-hidden={!topShown}
      >
        <div className="absolute inset-0" aria-hidden>
          {headerImg ? <img src={headerImg} alt="" className="size-full object-cover opacity-50" style={{ objectPosition: headerObjectPosition(design.hero) }} /> : <div className={cx("size-full opacity-50", bg.className)} style={bg.style} />}
          <div className="absolute inset-0 bg-zinc-950/45 backdrop-blur-md" />
        </div>
        <div className="relative mx-auto flex min-h-16 max-w-5xl items-center gap-2 px-4 ps-[max(1rem,var(--music-inset,0px))] pt-[env(safe-area-inset-top)]" style={titleFontVars(barFont)}>
          {top.avatar && headerImg && <img src={headerImg} alt="" className="size-10 shrink-0 rounded-full object-cover ring-2 ring-white/70" style={{ objectPosition: headerObjectPosition(design.hero) }} />}
          <p className="min-w-0 flex-1 truncate font-title text-xl" style={{ color: topColor }}>
            {event.title}
          </p>
          {top.view && (
            <Link to={`/${event.code}/gallery`} tabIndex={topShown ? 0 : -1} className="hidden min-h-10 items-center gap-1.5 rounded-full bg-white/15 px-3 text-sm font-semibold hover:bg-white/25 sm:inline-flex">
              <Images className="size-4" aria-hidden />
              צפייה
            </Link>
          )}
          {top.upload && event.uploadsOpen && (
            <Link to={`/${event.code}/upload`} tabIndex={topShown ? 0 : -1} className="hidden min-h-10 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-semibold text-on-accent hover:brightness-110 sm:inline-flex">
              <Camera className="size-4" aria-hidden />
              העלאה
            </Link>
          )}
          {canManage && (
            <Link to={`/${event.code}/manage`} tabIndex={topShown ? 0 : -1} aria-label="ניהול האירוע" className="inline-flex size-10 items-center justify-center rounded-full hover:bg-white/15">
              <Settings className="size-5" aria-hidden />
            </Link>
          )}
        </div>
      </div>

      {/* Mobile: sticky primary actions in the thumb zone (hidden while the big Upload / View cards are on screen).
          Both buttons share one glass style; upload is marked by a frame in the banner's text color. */}
      <nav
        aria-label="פעולות מהירות"
        className={cx(
          "fixed inset-x-0 bottom-0 z-30 border-t border-white/15 bg-zinc-950/70 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-[transform,opacity] duration-300 sm:hidden",
          bottomShown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0",
        )}
        style={{ ...titleFontVars(bottom.font), color: bottomColor ?? "#ffffff" }}
        aria-hidden={!bottomShown}
      >
        {jumps.length > 0 && (
          <div className={cx("no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4", (bottomUpload || bottom.view) && "mb-2.5")}>
            {jumps.map((b) => (
              <button
                key={b.id}
                type="button"
                tabIndex={bottomShown ? 0 : -1}
                onClick={() => scrollTo(document.querySelector(`[data-block-id="${b.id}"]`))}
                className="inline-flex min-h-11 max-w-[70%] shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-semibold transition-colors duration-200 hover:bg-white/25"
              >
                <ListChecks className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{partText(b.texts, "title", CHECKLIST_TEXTS.title)}</span>
              </button>
            ))}
          </div>
        )}
        <div className={cx("grid gap-3", bottomUpload && bottom.view ? "grid-cols-2" : "grid-cols-1", !bottomUpload && !bottom.view && "hidden")}>
          {bottomUpload && (
            <Link
              to={`/${event.code}/upload`}
              tabIndex={bottomShown ? 0 : -1}
              className={cx("inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border-2 border-current bg-white/15 px-2 text-[15px] min-[400px]:text-base", bottom.font ? "font-title text-lg" : "font-bold")}
            >
              <Camera className="size-5" aria-hidden />
              העלאת תמונות
            </Link>
          )}
          {bottom.view && (
            <Link
              to={`/${event.code}/gallery`}
              tabIndex={bottomShown ? 0 : -1}
              className={cx("inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border-2 border-transparent bg-white/15 px-2 text-[15px] min-[400px]:text-base", bottom.font ? "font-title text-lg" : "font-bold")}
            >
              <Images className="size-5" aria-hidden />
              לאלבום
            </Link>
          )}
        </div>
      </nav>

      {/* Fixed, clipped background layer (parallax = decorative layer only). */}
      <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className={cx("absolute inset-x-0 -top-[5%] h-[175%]", bg.className)} style={{ ...bg.style, transform: `translate3d(0, ${parallax}px, 0) ${bg.style.transform ?? ""}` }} />
        {event.background === "custom" && <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/70" style={{ opacity: 1 - reveal }} />}
        <div className="absolute inset-0 bg-black transition-opacity duration-150" style={{ opacity: dark ? scrim : scrim * 0.25 }} />
        {event.bgReveal && event.background === "custom" && reveal > 0 && (
          // The whole picture (contain), over a blurred copy of the cropped background.
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xl" style={{ opacity: reveal }}>
            <div
              className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] top-[max(0.75rem,env(safe-area-inset-top))] bg-contain bg-center bg-no-repeat sm:inset-x-8 sm:bottom-8 sm:top-8"
              style={{ backgroundImage: bg.style.backgroundImage }}
            />
          </div>
        )}
      </div>

      {/* Floating "manage" for hosts: at the top, or all the way down when the top banner (which holds it) is off. */}
      {canManage && (!pastHero || !top.show) && (
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

      {renderBlocks(before)}

      {/* The main page: who, when, where + the hosts' welcome (fixed in the layout, styled by the design). */}
      <EventHero
        ref={hero}
        event={event}
        hero={design.hero}
        dark={dark}
        y={y}
        vh={vh}
        reduced={reduced}
        selected={selected === "hero"}
        onVenue={() => scrollTo(document.getElementById("event-details"))}
        onMore={after.length ? () => scrollTo(hero.current?.nextElementSibling ?? null) : undefined}
      />

      {renderBlocks(after)}

      {!event.canManage && (
        <p className="pb-16 text-center">
          <Link to={`/${event.code}/admin`} className="inline-flex min-h-11 items-center text-sm underline-offset-4 opacity-75 hover:underline hover:opacity-100">
            מנהלים את האירוע? כניסה לניהול
          </Link>
        </p>
      )}

      {/* Empty scroll space at the very end (when enabled) that reveals the background picture. */}
      {event.bgReveal && <div ref={revealZone} aria-hidden className="h-[100dvh]" />}
    </div>
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
