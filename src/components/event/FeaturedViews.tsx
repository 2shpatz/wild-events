import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { FeaturedLayout } from "../../../shared/design";
import type { PublicEvent } from "../../../shared/types";
import { Reveal } from "../Reveal";
import { cx } from "../ui";

export const featuredUrl = (code: string, f: { slot: number; v: string }) => `/api/e/${code}/asset/f${f.slot}?v=${encodeURIComponent(f.v)}`;

type Props = { event: PublicEvent; dark: boolean };

const ROT = [-3, 2.5, -1.5, 3, -2.5, 1.5];
const alt = (i: number) => `תמונה מבעלי השמחה ${i + 1}`;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The hosts' featured photos in the layout they picked (design: featured block `layout`). */
export function FeaturedPhotos({ event, dark, layout }: Props & { layout: FeaturedLayout }) {
  if (layout === "stack") return <StackView event={event} dark={dark} />;
  if (layout === "carousel") return <CarouselView event={event} dark={dark} />;
  if (layout === "floating") return <FloatingView event={event} dark={dark} />;
  return <GridView event={event} dark={dark} />;
}

/** A white photo-paper frame around a featured photo. */
function Polaroid({ src, i, dark, className, style }: { src: string; i: number; dark: boolean; className?: string; style?: CSSProperties }) {
  return (
    <figure className={cx("overflow-hidden rounded-2xl p-2 shadow-[0_20px_50px_rgb(0_0_0/0.35)]", dark ? "bg-white/90" : "bg-white", className)} style={style}>
      <img src={src} alt={alt(i)} loading="lazy" decoding="async" draggable={false} className="pointer-events-none aspect-[4/5] w-full select-none rounded-xl object-cover" />
    </figure>
  );
}

/** "עומדות" (the original): a staggered scrapbook, each photo revealed as it scrolls in. */
function GridView({ event, dark }: Props) {
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
          <Polaroid src={featuredUrl(event.code, f)} i={i} dark={dark} className="transition-transform duration-500 hover:rotate-0" style={{ rotate: `${ROT[i % ROT.length]}deg` }} />
        </Reveal>
      ))}
    </ul>
  );
}

const navBtn = (dark: boolean) =>
  cx(
    "inline-flex size-12 shrink-0 items-center justify-center rounded-full transition-[background-color,opacity] duration-200 disabled:opacity-35",
    dark ? "bg-white/15 text-white hover:bg-white/25" : "bg-card text-fg shadow-soft hover:bg-primary/10",
  );

/**
 * "ערמה לדפדוף": a pile of photos; swipe the top one aside (or tap it / use the buttons) to bring up the next.
 * The swiped photo slides back under the pile, so the pile never runs out.
 */
function StackView({ event, dark }: Props) {
  const n = event.featured.length;
  const [order, setOrder] = useState(() => event.featured.map((_, i) => i));
  const [drag, setDrag] = useState<{ id: number; x0: number; dx: number } | null>(null);
  const [out, setOut] = useState<1 | -1 | null>(null);
  const timer = useRef(0);

  // The photos changed (added / removed): start the pile over.
  useEffect(() => setOrder(event.featured.map((_, i) => i)), [n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);

  const next = (dir: 1 | -1 = 1) => {
    if (n < 2 || out) return;
    if (reducedMotion()) return setOrder((o) => [...o.slice(1), o[0]]);
    setOut(dir);
    timer.current = window.setTimeout(() => {
      setOrder((o) => [...o.slice(1), o[0]]);
      setOut(null);
    }, 260);
  };
  const prev = () => n > 1 && !out && setOrder((o) => [o[o.length - 1], ...o.slice(0, -1)]);

  const onDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (n < 2 || out) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: e.pointerId, x0: e.clientX, dx: 0 });
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>) => drag?.id === e.pointerId && setDrag({ ...drag, dx: e.clientX - drag.x0 });
  const onUp = (e: PointerEvent<HTMLButtonElement>) => {
    if (drag?.id !== e.pointerId) return;
    const { dx } = drag;
    setDrag(null);
    // A real swipe flings the photo off that side; a tap (no movement) also flips to the next one.
    if (Math.abs(dx) > 70) next(dx > 0 ? 1 : -1);
    else if (Math.abs(dx) < 6) next(1);
  };

  const top = order[0];
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="relative mx-auto aspect-[4/5] w-[min(78vw,20rem)]" role="group" aria-roledescription="ערמת תמונות" aria-label={`תמונות מבעלי השמחה, ${n} תמונות`}>
        {order
          .map((idx, depth) => ({ idx, depth }))
          .reverse()
          .map(({ idx, depth }) => {
            const f = event.featured[idx];
            const isTop = depth === 0;
            const d = Math.min(depth, 3);
            let transform = `translate3d(${d * 7}px, ${d * 9}px, 0) rotate(${ROT[idx % ROT.length] * (d ? 1.4 : 0.4)}deg) scale(${1 - d * 0.04})`;
            if (isTop && drag) transform = `translate3d(${drag.dx}px, 0, 0) rotate(${drag.dx / 18}deg)`;
            if (isTop && out) transform = `translate3d(${out * 130}%, -4%, 0) rotate(${out * 18}deg)`;
            return (
              <button
                key={f.slot}
                type="button"
                tabIndex={isTop ? 0 : -1}
                aria-hidden={!isTop}
                aria-label={isTop ? `${alt(idx)} - הקישו לתמונה הבאה` : undefined}
                disabled={!isTop}
                onClick={(e) => e.detail === 0 && next(1) /* keyboard Enter / Space (pointer taps are handled on pointerup) */}
                onPointerDown={isTop ? onDown : undefined}
                onPointerMove={isTop ? onMove : undefined}
                onPointerUp={isTop ? onUp : undefined}
                onPointerCancel={() => setDrag(null)}
                className={cx(
                  "absolute inset-0 block touch-pan-y select-none rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-accent",
                  isTop ? "cursor-grab active:cursor-grabbing" : "pointer-events-none",
                  !drag || !isTop ? "transition-transform duration-300 ease-out" : "",
                  depth > 3 && "opacity-0",
                )}
                style={{ transform, zIndex: n - depth }}
              >
                <Polaroid src={featuredUrl(event.code, f)} i={idx} dark={dark} className="h-full" />
              </button>
            );
          })}
      </div>
      {n > 1 && (
        <div className="mt-8 flex items-center justify-center gap-4">
          <button type="button" onClick={prev} className={navBtn(dark)} aria-label="התמונה הקודמת">
            <ChevronRight className="size-6" aria-hidden />
          </button>
          <span className="min-w-14 text-center font-semibold opacity-85" aria-live="polite">
            {top + 1} / {n}
          </span>
          <button type="button" onClick={() => next(1)} className={navBtn(dark)} aria-label="התמונה הבאה">
            <ChevronLeft className="size-6" aria-hidden />
          </button>
        </div>
      )}
      {n > 1 && <p className="mt-3 text-center text-sm opacity-75">החליקו את התמונה הצידה או הקישו עליה</p>}
    </div>
  );
}

/** "קרוסלה": swipe sideways (native scroll-snap); buttons and dots expose every photo without dragging. RTL: next is on the left. */
function CarouselView({ event, dark }: Props) {
  const n = event.featured.length;
  const scroller = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; left: number } | null>(null);
  const raf = useRef(0);

  /** The photo whose center is closest to the strip's center (works in RTL and while dragging). */
  const nearest = () => {
    const root = scroller.current;
    if (!root) return 0;
    const r = root.getBoundingClientRect();
    const mid = r.left + r.width / 2;
    let best = 0;
    let dist = Infinity;
    root.querySelectorAll<HTMLElement>("[data-index]").forEach((el) => {
      const e = el.getBoundingClientRect();
      const d = Math.abs(e.left + e.width / 2 - mid);
      if (d < dist) (dist = d), (best = Number(el.dataset.index));
    });
    return best;
  };
  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => setCurrent(nearest()));
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Mouse: drag the strip like a finger would (touch already swipes natively); on release snap to the nearest photo.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !scroller.current) return;
    drag.current = { id: e.pointerId, x: e.clientX, left: scroller.current.scrollLeft };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !scroller.current) return;
    scroller.current.scrollLeft = d.left - (e.clientX - d.x);
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    requestAnimationFrame(() => go(nearest()));
  };

  const go = (i: number) => {
    const idx = Math.max(0, Math.min(n - 1, i));
    const root = scroller.current;
    const el = root?.querySelector<HTMLElement>(`[data-index="${idx}"]`);
    if (!root || !el) return;
    // Scroll only the strip (scrollIntoView would also scroll the page), by on-screen distance - correct in RTL too.
    const r = root.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    root.scrollBy({ left: e.left + e.width / 2 - (r.left + r.width / 2), behavior: reducedMotion() ? "auto" : "smooth" });
  };

  return (
    <Reveal variant="up" className="mx-auto w-full max-w-5xl">
      <div
        ref={scroller}
        tabIndex={0}
        aria-roledescription="קרוסלה"
        aria-label="תמונות מבעלי השמחה"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") (e.preventDefault(), go(current + 1));
          if (e.key === "ArrowRight") (e.preventDefault(), go(current - 1));
        }}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className={cx(
          "no-scrollbar -mx-5 flex select-none gap-4 overflow-x-auto px-[11vw] py-6 outline-none focus-visible:ring-4 focus-visible:ring-accent sm:mx-0 sm:px-[calc(50%-10rem)]",
          // Snapping is paused while the mouse drags, or the strip would fight the pointer.
          dragging ? "cursor-grabbing snap-none" : "cursor-grab snap-x snap-mandatory",
        )}
      >
        {event.featured.map((f, i) => (
          <div
            key={f.slot}
            data-index={i}
            aria-roledescription="שקופית"
            aria-label={`${i + 1} מתוך ${n}`}
            className={cx("w-[78vw] max-w-[20rem] shrink-0 snap-center transition-[transform,opacity] duration-300", i === current ? "scale-100 opacity-100" : "scale-[0.92] opacity-60")}
          >
            <Polaroid src={featuredUrl(event.code, f)} i={i} dark={dark} style={{ rotate: `${ROT[i % ROT.length] * 0.5}deg` }} />
          </div>
        ))}
      </div>
      {n > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button type="button" onClick={() => go(current - 1)} disabled={current === 0} className={navBtn(dark)} aria-label="התמונה הקודמת">
            <ChevronRight className="size-6" aria-hidden />
          </button>
          <div className="flex items-center">
            {event.featured.map((f, i) => (
              <button key={f.slot} type="button" onClick={() => go(i)} aria-label={`מעבר לתמונה ${i + 1}`} aria-current={i === current} className="inline-flex size-8 items-center justify-center">
                <span className={cx("block rounded-full transition-[width,background-color] duration-300", i === current ? "h-2.5 w-6 bg-current" : "size-2.5 bg-current/35")} />
              </button>
            ))}
          </div>
          <button type="button" onClick={() => go(current + 1)} disabled={current >= n - 1} className={navBtn(dark)} aria-label="התמונה הבאה">
            <ChevronLeft className="size-6" aria-hidden />
          </button>
        </div>
      )}
    </Reveal>
  );
}

/**
 * Spread n cards over `cols` columns, with a fixed (per index) jitter so the layout doesn't jump between renders.
 * x is measured from the left, but the first photo goes on the right (the page reads right to left).
 */
function slots(n: number, cols: number) {
  const rows = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const lastRow = r === rows - 1 ? n - r * cols : cols; // center a short last row
    const jx = ((i * 37) % 11) - 5;
    const jy = ((i * 53) % 9) - 4;
    return { x: 100 - ((c + 0.5) / lastRow) * 100 + jx * (1 / cols), y: ((r + 0.5) / rows) * 100 + jy * (2 / rows) };
  });
}

/**
 * "מרחפות": photo cards drifting gently in place (still under reduced motion). Tapping a photo brings it to the
 * front, enlarged and straightened; tapping it again (or the backdrop, or Esc) sends it back to its place.
 */
function FloatingView({ event, dark }: Props) {
  const n = event.featured.length;
  const [zoomed, setZoomed] = useState<number | null>(null);
  const mobile = slots(n, Math.min(n, 2));
  const desktop = slots(n, Math.min(n, 3));
  const rowsM = Math.ceil(n / Math.min(n, 2));
  const rowsD = Math.ceil(n / Math.min(n, 3));

  useEffect(() => {
    if (zoomed === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoomed(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);
  useEffect(() => setZoomed(null), [n]);

  return (
    <Reveal variant="fade" className="mx-auto w-full max-w-5xl">
      <div
        className="relative h-[var(--h-m)] sm:h-[var(--h-d)]"
        style={{ ["--h-m" as string]: `${rowsM * 16 + 3}rem`, ["--h-d" as string]: `${rowsD * 21 + 3}rem` }}
      >
        {/* Backdrop while a photo is enlarged: a tap anywhere around it puts it back. */}
        <div
          aria-hidden
          onClick={() => setZoomed(null)}
          className={cx("absolute -inset-4 z-20 rounded-[2rem] bg-black/25 backdrop-blur-[2px] transition-opacity duration-300", zoomed === null ? "pointer-events-none opacity-0" : "opacity-100")}
        />
        {event.featured.map((f, i) => {
          const rot = ROT[i % ROT.length] * 1.6;
          const z = zoomed === i;
          // Enlarged: move the card's anchor to the center (same CSS vars for both breakpoints) and scale it up.
          const pos = z ? { m: { x: 50, y: 50 }, d: { x: 50, y: 50 } } : { m: mobile[i], d: desktop[i] };
          return (
            <button
              key={f.slot}
              type="button"
              onClick={() => setZoomed(z ? null : i)}
              aria-pressed={z}
              aria-label={z ? `${alt(i)} - הקישו להחזרה למקומה` : `${alt(i)} - הקישו להגדלה`}
              className={cx(
                "absolute left-[var(--x-m)] top-[var(--y-m)] block w-[min(36vw,11rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl outline-none [--zoom:1.9] focus-visible:ring-4 focus-visible:ring-accent sm:left-[var(--x-d)] sm:top-[var(--y-d)] sm:w-56 sm:[--zoom:1.6]",
                "motion-safe:transition-[left,top,scale] motion-safe:duration-500 motion-safe:ease-out",
                z ? "z-30 cursor-zoom-out" : "cursor-zoom-in hover:z-10",
              )}
              style={{
                ["--x-m" as string]: `${pos.m.x}%`,
                ["--y-m" as string]: `${pos.m.y}%`,
                ["--x-d" as string]: `${pos.d.x}%`,
                ["--y-d" as string]: `${pos.d.y}%`,
                scale: z ? "var(--zoom)" : undefined,
              }}
            >
              <div
                className={cx("transition-transform duration-500", !z && "motion-safe:animate-[float-y_var(--dur)_ease-in-out_infinite]")}
                style={{ ["--rot" as string]: `${rot}deg`, ["--dur" as string]: `${6 + ((i * 7) % 5)}s`, animationDelay: `${-((i * 13) % 6)}s`, transform: `rotate(${z ? 0 : rot}deg)` }}
              >
                <Polaroid src={featuredUrl(event.code, f)} i={i} dark={dark} className={cx("transition-transform duration-300", !z && "hover:scale-105")} />
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-center text-sm opacity-75">הקישו על תמונה כדי להגדיל אותה</p>
    </Reveal>
  );
}
