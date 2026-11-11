import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ImageUp, X } from "lucide-react";
import type { EventType } from "../../shared/types";
import { EVENT_TYPES } from "../lib/themes";
import { Button, IconButton, cx } from "./ui";
import { prefersReducedMotion } from "./Reveal";

/**
 * Background picker. Order: "my photo" + the event type's presets first, then everything else.
 * Phones: one big background at a time in a sideways-scrolling strip (swipe, or the arrow buttons); larger screens: a grid.
 */
export function BackgroundPicker({
  type,
  value,
  customPreview,
  onPreset,
  onCustom,
  onClearCustom,
}: {
  type: EventType;
  value: string | null;
  customPreview: string | null;
  onPreset: (id: string) => void;
  onCustom: (file: File) => void;
  onClearCustom: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const mine = EVENT_TYPES.find((t) => t.id === type)?.backgrounds ?? [];
  const others = EVENT_TYPES.flatMap((t) => t.backgrounds).filter((b, i, arr) => !mine.some((m) => m.id === b.id) && arr.findIndex((x) => x.id === b.id) === i);
  const all = [...mine, ...others];
  const count = all.length + 1; // + "my photo"

  // One slide's step in the strip (slide width + gap); the strip's padding centers slide 0 at scroll 0.
  const step = () => {
    const first = strip.current?.firstElementChild as HTMLElement | null;
    return first ? first.offsetWidth + 12 : 0;
  };
  // Which slide is in view (phones), for the counter and the arrows.
  const onScroll = () => {
    const w = step();
    if (w) setCurrent(Math.min(count - 1, Math.round(Math.abs(strip.current!.scrollLeft) / w)));
  };
  /** Center slide i (RTL: the strip scrolls toward negative scrollLeft). */
  const center = (i: number, smooth: boolean) => {
    const box = strip.current;
    const w = step();
    if (!box || !w) return;
    const rtl = getComputedStyle(box).direction === "rtl";
    const at = Math.max(0, Math.min(count - 1, i)) * w;
    box.scrollTo({ left: rtl ? -at : at, behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto" });
  };
  const go = (i: number) => center(i, true);
  // Start the strip at the chosen background (phones; the grid on larger screens doesn't scroll).
  useEffect(() => {
    const i = value === "custom" ? 0 : all.findIndex((b) => b.id === value) + 1;
    const raf = requestAnimationFrame(() => center(i, false));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const slide = "relative shrink-0 snap-center overflow-hidden rounded-2xl border-2 w-[84%] aspect-[4/5] sm:w-auto sm:aspect-[4/3] sm:rounded-xl";
  const check = "absolute end-2 top-2 size-7 rounded-full bg-primary p-1 text-on-primary sm:end-1.5 sm:top-1.5 sm:size-6";
  return (
    <div className="space-y-3">
      <div
        ref={strip}
        onScroll={onScroll}
        role="radiogroup"
        aria-label="רקע"
        className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[8%] pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-2 sm:overflow-visible sm:px-0 sm:pb-0"
      >
        <button
          type="button"
          role="radio"
          aria-checked={value === "custom"}
          onClick={() => input.current?.click()}
          className={cx(
            slide,
            "flex flex-col items-center justify-center gap-1 border-dashed bg-card bg-cover bg-center text-base font-semibold transition-[border-color] sm:text-sm",
            value === "custom" ? "border-primary" : "border-border hover:border-primary/40",
          )}
          style={customPreview ? { backgroundImage: `url(${customPreview})` } : undefined}
        >
          {customPreview ? (
            <span className="absolute bottom-2 start-2 rounded-md bg-white/85 px-2 py-0.5 text-sm font-semibold text-zinc-900 sm:text-xs">תמונה שלי</span>
          ) : (
            <>
              <ImageUp className="size-8 sm:size-6" aria-hidden />
              תמונה שלי
            </>
          )}
          {value === "custom" && <Check className={check} aria-hidden />}
        </button>
        {all.map((b) => {
          const active = value === b.id;
          return (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onPreset(b.id)}
              className={cx(slide, "flex items-end p-2 text-start transition-[border-color] duration-200", `bg-preset-${b.id}`, active ? "border-primary" : "border-transparent hover:border-primary/40")}
            >
              <span className="rounded-md bg-white/85 px-2 py-0.5 text-sm font-semibold text-zinc-900 sm:px-1.5 sm:text-xs">{b.label}</span>
              {active && <Check className={check} aria-hidden />}
            </button>
          );
        })}
      </div>
      {/* Phones: arrows + "3 / 20" (swiping also works; the arrows keep it usable without it). */}
      <div className="flex items-center justify-center gap-3 sm:hidden">
        <IconButton label="הרקע הקודם" onClick={() => go(current - 1)} disabled={current === 0} className="border border-border bg-card disabled:opacity-40">
          <ChevronRight className="size-5" aria-hidden />
        </IconButton>
        <span className="min-w-16 text-center text-sm font-semibold text-muted-fg" aria-live="polite">
          {current + 1} / {count}
        </span>
        <IconButton label="הרקע הבא" onClick={() => go(current + 1)} disabled={current === count - 1} className="border border-border bg-card disabled:opacity-40">
          <ChevronLeft className="size-5" aria-hidden />
        </IconButton>
      </div>
      {value === "custom" && customPreview && (
        <Button variant="ghost" size="sm" onClick={onClearCustom} icon={<X className="size-4" aria-hidden />}>
          הסרת התמונה שלי
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onCustom(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Compress a background image client-side (≤1920px JPEG) so it can live in D1 and load fast. */
export async function compressBackground(file: File, maxEdge = 1920): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  for (const q of [0.82, 0.7, 0.55]) {
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", q));
    if (blob.size < 850 * 1024) return blob;
  }
  throw new Error("too_large");
}
