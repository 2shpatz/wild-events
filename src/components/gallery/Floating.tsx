import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import type { ViewProps } from "./types";
import { MediaImg } from "./MediaImg";
import { aspect } from "../../lib/media";
import { cx } from "../ui";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Slot {
  x: number; // % from inline-start
  y: number; // % from top
  rot: number;
  dur: number;
  delay: number;
}

function makeSlots(n: number): Slot[] {
  const cols = n <= 7 ? 2 : n <= 10 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const slots: Slot[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    slots.push({
      x: Math.min(78, Math.max(22, ((c + 0.5) / cols) * 100 + (Math.random() - 0.5) * (30 / cols))),
      y: Math.min(85, Math.max(15, ((r + 0.5) / rows) * 100 + (Math.random() - 0.5) * (24 / rows))),
      rot: (Math.random() - 0.5) * 12,
      dur: 6 + Math.random() * 5,
      delay: -Math.random() * 6,
    });
  }
  return slots;
}

/**
 * "Floating" photos - polaroids drifting over the canvas. Parallax only on decorative layers.
 * Tap a photo: it comes to the front, straightened and enlarged to fit the screen (like the featured photos'
 * floating layout); tap it again, tap around it or press Esc to put it back. The expand button opens the full viewer.
 */
export function Floating({ items, fresh, albumName, onOpen, onNeedUrl }: ViewProps) {
  const count = Math.min(items.length, window.innerWidth < 640 ? 6 : window.innerWidth < 1100 ? 10 : 13);
  const slots = useMemo(() => makeSlots(count), [count]);
  const [shown, setShown] = useState<number[]>(() => items.slice(0, count).map((_, i) => i));
  const cursor = useRef(count);
  const rootRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  /** Id of the enlarged photo (by id: live uploads shift the list indices under it). */
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Esc puts the photo back (capture + stop, so it doesn't also leave the gallery's full-screen mode).
  useEffect(() => {
    if (zoomed === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setZoomed(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoomed]);

  // Keep shown indices valid when the list changes; bring fresh items in first.
  useEffect(() => {
    setShown((prev) => {
      const valid = prev.filter((i) => i < items.length).slice(0, count);
      const set = new Set(valid);
      for (let i = 0; valid.length < count && i < items.length; i++) if (!set.has(i)) valid.push(i), set.add(i);
      return valid;
    });
  }, [items.length, count]);

  // Rotate one photo every few seconds.
  useEffect(() => {
    if (items.length <= count || reduced() || zoomed !== null) return;
    const t = setInterval(() => {
      setShown((prev) => {
        const next = [...prev];
        const freshIdx = items.findIndex((m, i) => fresh.has(m.id) && !prev.includes(i));
        let idx = freshIdx;
        if (idx < 0) {
          idx = cursor.current % items.length;
          let guard = 0;
          while (prev.includes(idx) && guard++ < items.length) idx = (idx + 1) % items.length;
          cursor.current = idx + 1;
        }
        next[Math.floor(Math.random() * next.length)] = idx;
        return next;
      });
    }, 4500);
    return () => clearInterval(t);
  }, [items, fresh, count, zoomed]);

  // The enlarged photo left the screen (deleted, or the list changed): nothing is enlarged anymore.
  useEffect(() => {
    if (zoomed !== null && !shown.some((i) => items[i]?.id === zoomed)) setZoomed(null);
  }, [zoomed, shown, items]);

  // Decorative parallax (background blobs only).
  useEffect(() => {
    if (reduced()) return;
    const on = (e: PointerEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 30;
      const y = (e.clientY / window.innerHeight - 0.5) * 30;
      if (bgRef.current) bgRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };
    window.addEventListener("pointermove", on);
    return () => window.removeEventListener("pointermove", on);
  }, []);

  const card = window.innerWidth < 640 ? Math.round(window.innerWidth * 0.36) : 210;
  return (
    <div ref={rootRef} className="relative min-h-0 flex-1 overflow-hidden">
      <div ref={bgRef} className="pointer-events-none absolute -inset-10 transition-transform duration-700 ease-out" aria-hidden>
        <div className="absolute start-[10%] top-[15%] size-72 rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute end-[12%] top-[45%] size-80 rounded-full bg-accent/25 blur-3xl" />
        <div className="absolute bottom-[5%] start-[40%] size-64 rounded-full bg-white/10 blur-3xl" />
      </div>
      {/* Backdrop while a photo is enlarged: a tap anywhere around it puts it back. */}
      <div
        aria-hidden
        onClick={() => setZoomed(null)}
        className={cx("absolute inset-0 z-20 bg-black/45 backdrop-blur-[3px] transition-opacity duration-300", zoomed === null ? "pointer-events-none opacity-0" : "opacity-100")}
      />
      {shown.map((idx, s) => {
        const m = items[idx];
        const slot = slots[s];
        if (!m || !slot) return null;
        const ar = aspect(m);
        const w = ar >= 1 ? card * 1.15 : card;
        const z = zoomed === m.id;
        // Enlarged: the biggest size that fits the screen (or smaller, on a phone on its side) (frame: 8px padding around, 28px label strip below).
        const h = (w - 16) / ar + 36;
        const scale = z && box.w ? Math.min((box.w * 0.9) / w, (box.h * 0.86) / h) : 1;
        return (
          <div
            key={`${s}-${m.id}`}
            className={cx(
              "animate-pop-in absolute -translate-x-1/2 -translate-y-1/2 motion-safe:transition-[left,top,scale] motion-safe:duration-500 motion-safe:ease-out",
              z ? "z-30" : "focus-within:z-10 hover:z-10",
            )}
            style={{ left: z ? "50%" : `${slot.x}%`, top: z ? "50%" : `${slot.y}%`, width: w, scale: z ? String(scale) : undefined }}
          >
            <button
              type="button"
              onClick={() => setZoomed(z ? null : m.id)}
              aria-pressed={z}
              aria-label={z ? `תמונה של ${albumName(m.album)} - הקישו להחזרה למקומה` : `הגדלת תמונה של ${albumName(m.album)}`}
              className={cx("block w-full rounded-md outline-none focus-visible:ring-4 focus-visible:ring-accent", z ? "cursor-zoom-out" : "cursor-zoom-in")}
            >
              <div
                className={cx(
                  "relative rounded-md bg-white p-2 pb-7 shadow-[0_18px_40px_rgb(0_0_0/0.45)] transition-transform duration-500",
                  !z && "hover:scale-105 motion-safe:animate-[float-y_var(--dur)_ease-in-out_infinite]",
                )}
                style={{ ["--rot" as string]: `${slot.rot}deg`, ["--dur" as string]: `${slot.dur}s`, animationDelay: `${slot.delay}s`, transform: `rotate(${z ? 0 : slot.rot}deg)` }}
              >
                <div style={{ aspectRatio: `${ar}` }}>
                  {/* Sharper image while enlarged (the small one stays on screen until it has loaded). */}
                  <MediaImg m={m} width={Math.round(z ? (w - 16) * scale : card * 1.2)} onNeedUrl={onNeedUrl} eager className="size-full rounded-sm" alt="" />
                </div>
                <span className="absolute inset-x-2 bottom-1.5 truncate text-center text-xs font-semibold text-zinc-700">{albumName(m.album)}</span>
              </div>
            </button>
            {z && (
              // Counter-scaled so it stays a normal 44px button on the enlarged photo.
              <button
                type="button"
                onClick={() => {
                  setZoomed(null);
                  onOpen(idx);
                }}
                aria-label="צפייה מלאה בתמונה"
                autoFocus
                className="animate-pop-in absolute end-1 top-1 inline-flex size-11 origin-top-right items-center justify-center rounded-full bg-black/60 text-white shadow-lift backdrop-blur transition-colors hover:bg-black/80 focus-visible:ring-4 focus-visible:ring-accent rtl:origin-top-left"
                style={{ scale: String(1 / scale) }}
              >
                <Maximize2 className="size-5" aria-hidden />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
