import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Crosshair, Move } from "lucide-react";
import type { HeroDesign } from "../../../../shared/design";
import { Button, cx } from "../../ui";

type Pos = HeroDesign["headerPos"];

/** Same frame shapes as the guest page hero (EventHero): phone 3:2, desktop 21:9. */
const FRAMES = [
  { id: "phone", label: "בטלפון", aspect: "aspect-[3/2]" },
  { id: "desktop", label: "במחשב", aspect: "aspect-[21/9]" },
] as const;

const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;

/**
 * Choosing which part of the header image shows inside the hero's wide frame: drag the picture
 * (or use the arrow keys) and the focal point is stored as an object-position in %.
 */
export function HeaderFramer({ src, value, onChange }: { src: string; value: Pos; onChange: (p: Pos) => void }) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; start: Pos; over: { x: number; y: number } } | null>(null);
  const pending = useRef<Pos | null>(null);
  const raf = useRef(0);
  const centered = value.x === 50 && value.y === 50;

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Coalesce drag updates to one per frame (each one re-renders the live preview).
  const emit = (p: Pos) => {
    pending.current = p;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      if (pending.current) onChange(pending.current);
    });
  };

  /** How many px the cropped image overflows the frame on each axis (0 = that axis can't move). */
  const overflow = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    if (!natural) return { x: 0, y: 0 };
    const scale = Math.max(r.width / natural.w, r.height / natural.h);
    return { x: natural.w * scale - r.width, y: natural.h * scale - r.height };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: value, over: overflow(e.currentTarget) };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // Moving the picture right shows more of its left side → the focal point moves left (smaller %).
    const x = d.over.x > 0 ? clamp(d.start.x - ((e.clientX - d.x) / d.over.x) * 100) : d.start.x;
    const y = d.over.y > 0 ? clamp(d.start.y - ((e.clientY - d.y) / d.over.y) * 100) : d.start.y;
    emit({ x, y });
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    // Arrows move the picture in the arrow's (visual) direction, regardless of RTL.
    const moves: Record<string, Pos> = {
      ArrowLeft: { x: clamp(value.x + step), y: value.y },
      ArrowRight: { x: clamp(value.x - step), y: value.y },
      ArrowUp: { x: value.x, y: clamp(value.y + step) },
      ArrowDown: { x: value.x, y: clamp(value.y - step) },
    };
    const next = moves[e.key];
    if (!next) return;
    e.preventDefault();
    onChange(next);
  };

  const objectPosition = `${value.x}% ${value.y}%`;

  return (
    <div className="space-y-3">
      <p id="header-framer-hint" className="flex items-start gap-2 text-sm text-muted-fg">
        <Move className="mt-0.5 size-4 shrink-0" aria-hidden />
        גררו את התמונה בתוך המסגרת כדי לבחור מה האורחים יראו. אפשר גם עם מקשי החצים.
      </p>
      <div className="grid gap-4">
        {FRAMES.map((f) => (
          <figure key={f.id} className="space-y-1.5">
            <figcaption className="text-sm font-semibold">{f.label}</figcaption>
            <div
              role="group"
              tabIndex={0}
              aria-label={`כיוון תמונת הכותרת ${f.label}`}
              aria-describedby="header-framer-hint"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              onKeyDown={onKeyDown}
              className={cx(
                "relative w-full touch-none select-none overflow-hidden rounded-2xl bg-fg/5 ring-1 ring-border outline-none transition-shadow duration-200 focus-visible:ring-4 focus-visible:ring-primary/60",
                f.aspect,
                dragging ? "cursor-grabbing" : "cursor-grab",
              )}
            >
              <img
                src={src}
                alt=""
                draggable={false}
                onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                className="pointer-events-none size-full object-cover"
                style={{ objectPosition }}
              />
              {!dragging && (
                <span className="pointer-events-none absolute bottom-2 start-2 inline-flex items-center gap-1 rounded-full bg-zinc-950/65 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm" aria-hidden>
                  <Move className="size-3.5" />
                  גררו לכיוון
                </span>
              )}
            </div>
          </figure>
        ))}
      </div>
      <Button variant="outline" disabled={centered} icon={<Crosshair className="size-4" aria-hidden />} onClick={() => onChange({ x: 50, y: 50 })}>
        מרכוז התמונה
      </Button>
      <p className="sr-only" aria-live="polite">
        {dragging ? "" : `מיקום התמונה: ${Math.round(value.x)}% לרוחב, ${Math.round(value.y)}% לגובה`}
      </p>
    </div>
  );
}
