import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { matchPath, useLocation } from "react-router-dom";
import { Loader2, Music2, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { useSharedEvent } from "../../lib/session";
import { isPreviewFrame } from "../../lib/designPreview";
import { cx } from "../ui";
import { next, prev, setMusic, toggle, useMusic } from "./engine";

/** First path segments that are app pages, not event codes (same list as SiteFooter). */
const APP_PAGES = new Set(["login", "setup", "dashboard", "share", "privacy", "terms", "e"]);
const GUEST_ROUTES = ["/:code", "/:code/upload", "/:code/gallery"];

function guestCode(pathname: string) {
  if (isPreviewFrame()) return null;
  for (const p of GUEST_ROUTES) {
    const m = matchPath(p, pathname);
    if (m && !APP_PAGES.has(m.params.code!)) return m.params.code!.toLowerCase();
  }
  return null;
}

// Pages can hide the button (e.g. gallery immersive mode); the music itself keeps going.
let hideCount = 0;
const hideSubs = new Set<() => void>();
const subscribeHide = (f: () => void) => {
  hideSubs.add(f);
  return () => hideSubs.delete(f);
};
export function useHideMusicPlayer(hide: boolean) {
  useEffect(() => {
    if (!hide) return;
    hideCount++;
    hideSubs.forEach((f) => f());
    return () => {
      hideCount--;
      hideSubs.forEach((f) => f());
    };
  }, [hide]);
}

/** Space the player takes at the top inline-start corner; top bars pad by it so it never covers their content. */
const INSET = "4rem";
const COLLAPSE_MS = 6000;

/**
 * Floating background-music player for the guest pages (skill: icon buttons with aria-label, aria-expanded,
 * 44px+ targets, visible focus, reduced motion). Mounted once in main.tsx so the music survives page changes.
 * Media controls keep their universal LTR order inside the RTL page.
 */
export function MusicPlayer() {
  const { pathname } = useLocation();
  const code = guestCode(pathname);
  const ev = useSharedEvent(code ?? undefined);
  const music = useMusic();
  const hidden = useSyncExternalStore(subscribeHide, () => hideCount > 0);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef(0);

  useEffect(() => {
    setMusic(code && ev ? ev.code : null, ev?.music ?? null);
  }, [code, ev]);

  const visible = !!music.code && music.tracks.length > 0 && !hidden;
  useEffect(() => {
    if (!visible) return;
    document.documentElement.style.setProperty("--music-inset", INSET);
    return () => {
      document.documentElement.style.removeProperty("--music-inset");
    };
  }, [visible]);

  // Auto-collapse after a few seconds without interaction; Escape / tapping outside collapse at once.
  const keepOpen = () => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), COLLAPSE_MS);
  };
  useEffect(() => {
    if (!open) return;
    keepOpen();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  if (!visible) return null;
  const track = music.tracks[music.index];
  const busy = music.playing || music.loading;
  const act = (f: () => void) => () => {
    f();
    keepOpen();
  };
  const btn =
    "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-white/15 active:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

  return (
    <div
      ref={root}
      className="fixed start-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-40 flex max-w-[calc(100vw-1.5rem)] items-center gap-1 rounded-full bg-zinc-950/75 p-0.5 text-white shadow-lift ring-1 ring-white/15 backdrop-blur-md"
      role="region"
      aria-label="נגן מוזיקת רקע"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "סגירת נגן המוזיקה" : `מוזיקת רקע${busy ? " - מתנגנת" : ""}. פתיחת הנגן`}
        className={cx(
          "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
          busy ? "bg-accent text-on-accent" : "hover:bg-white/15",
          music.waitingForTap && "music-hint",
        )}
      >
        {open ? (
          <X className="size-5" aria-hidden />
        ) : music.playing ? (
          <span className="music-eq" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        ) : (
          <Music2 className="size-5" aria-hidden />
        )}
      </button>

      {open && (
        <div className="music-panel flex min-w-0 items-center gap-1 pe-1" data-music-controls>
          <p className="min-w-0 max-w-44 px-1 text-sm leading-tight" aria-live="polite">
            <span dir="auto" className="block truncate text-right font-semibold">{track?.title}</span>
            {track?.artist && <span dir="auto" className="block truncate text-right text-xs text-white/75">{track.artist}</span>}
          </p>
          <div dir="ltr" className="flex shrink-0 items-center">
            <button type="button" onClick={act(prev)} className={btn} aria-label="השיר הקודם">
              <SkipBack className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={act(toggle)}
              className={cx(btn, "bg-white text-zinc-950 hover:bg-white/90 active:bg-white/80")}
              aria-label={busy ? "השהיית המוזיקה" : "הפעלת המוזיקה"}
            >
              {music.loading ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : music.playing ? (
                <Pause className="size-5" aria-hidden />
              ) : (
                <Play className="size-5" aria-hidden />
              )}
            </button>
            <button type="button" onClick={act(next)} className={btn} aria-label="השיר הבא">
              <SkipForward className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
