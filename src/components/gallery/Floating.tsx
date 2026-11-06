import { useEffect, useMemo, useRef, useState } from "react";
import type { ViewProps } from "./types";
import { MediaImg } from "./MediaImg";
import { aspect } from "../../lib/media";

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

/** "Floating" photos - polaroids drifting over the canvas; tap to enlarge. Parallax only on decorative layers. */
export function Floating({ items, fresh, albumName, onOpen, onNeedUrl }: ViewProps) {
  const count = Math.min(items.length, window.innerWidth < 640 ? 6 : window.innerWidth < 1100 ? 10 : 13);
  const slots = useMemo(() => makeSlots(count), [count]);
  const [shown, setShown] = useState<number[]>(() => items.slice(0, count).map((_, i) => i));
  const cursor = useRef(count);
  const bgRef = useRef<HTMLDivElement>(null);

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
    if (items.length <= count || reduced()) return;
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
  }, [items, fresh, count]);

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
    <div className="relative h-[calc(100dvh-var(--toolbar-h,64px))] min-h-[480px] overflow-hidden">
      <div ref={bgRef} className="pointer-events-none absolute -inset-10 transition-transform duration-700 ease-out" aria-hidden>
        <div className="absolute start-[10%] top-[15%] size-72 rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute end-[12%] top-[45%] size-80 rounded-full bg-accent/25 blur-3xl" />
        <div className="absolute bottom-[5%] start-[40%] size-64 rounded-full bg-white/10 blur-3xl" />
      </div>
      {shown.map((idx, s) => {
        const m = items[idx];
        const slot = slots[s];
        if (!m || !slot) return null;
        const ar = aspect(m);
        const w = ar >= 1 ? card * 1.15 : card;
        return (
          <button
            key={`${s}-${m.id}`}
            onClick={() => onOpen(idx)}
            aria-label={`הגדלת תמונה של ${albumName(m.album)}`}
            className="animate-pop-in absolute -translate-x-1/2 -translate-y-1/2 focus-visible:z-20 hover:z-20"
            style={{ left: `${slot.x}%`, top: `${slot.y}%`, width: w }}
          >
            <div
              className="rounded-md bg-white p-2 pb-7 shadow-[0_18px_40px_rgb(0_0_0/0.45)] transition-transform duration-300 hover:scale-105 motion-safe:animate-[float-y_var(--dur)_ease-in-out_infinite]"
              style={{ ["--rot" as string]: `${slot.rot}deg`, ["--dur" as string]: `${slot.dur}s`, animationDelay: `${slot.delay}s`, transform: `rotate(${slot.rot}deg)` }}
            >
              <div style={{ aspectRatio: `${ar}` }}>
                <MediaImg m={m} width={card * 1.2} onNeedUrl={onNeedUrl} eager className="size-full rounded-sm" alt="" />
              </div>
              <span className="absolute inset-x-2 bottom-1.5 truncate text-center text-xs font-semibold text-zinc-700">{albumName(m.album)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
