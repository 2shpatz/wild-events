import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import type { ViewProps } from "./types";
import { MediaImg } from "./MediaImg";
import { IconButton } from "../ui";
import { formatTime } from "../../lib/format";

/**
 * Swipeable carousel (native scroll-snap). RTL: "next" is on the left.
 * Prev/next buttons + keyboard + thumbnails expose every slide without dragging (ux: Dragging Movements).
 */
export function Carousel({ items, albumName, onOpen, onNeedUrl }: ViewProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const thumbs = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(Number((e.target as HTMLElement).dataset.index));
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-index]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  useEffect(() => {
    thumbs.current?.querySelector<HTMLElement>(`[data-thumb="${current}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [current]);

  const go = (i: number) => {
    const idx = Math.max(0, Math.min(items.length - 1, i));
    scroller.current?.querySelector<HTMLElement>(`[data-index="${idx}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  };

  return (
    <div
      className="flex h-[calc(100dvh-var(--toolbar-h,64px))] min-h-[480px] flex-col"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(current + 1);
        if (e.key === "ArrowRight") go(current - 1);
      }}
    >
      <div className="relative flex-1">
        <div
          ref={scroller}
          className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
          tabIndex={0}
          aria-roledescription="קרוסלה"
          aria-label="קרוסלת תמונות"
        >
          {items.map((m, i) => (
            <div
              key={m.id}
              data-index={i}
              className="relative flex h-full w-full shrink-0 snap-center items-center justify-center px-2 py-4 sm:px-16"
              aria-roledescription="שקופית"
              aria-label={`${i + 1} מתוך ${items.length}`}
            >
              {Math.abs(i - current) <= 4 ? (
                <button onClick={() => onOpen(i)} className="group relative size-full" aria-label={`הגדלת תמונה ${i + 1}`}>
                  <MediaImg m={m} width={1400} fit="contain" eager={Math.abs(i - current) <= 1} onNeedUrl={onNeedUrl} className="size-full rounded-2xl bg-transparent" />
                  <Maximize2 className="absolute end-3 top-3 size-9 rounded-full bg-black/50 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </button>
              ) : (
                <div className="size-full" />
              )}
            </div>
          ))}
        </div>
        <IconButton
          label="הקודם"
          onClick={() => go(current - 1)}
          disabled={current === 0}
          className="absolute start-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 disabled:opacity-30"
        >
          <ChevronRight className="size-6" aria-hidden />
        </IconButton>
        <IconButton
          label="הבא"
          onClick={() => go(current + 1)}
          disabled={current >= items.length - 1}
          className="absolute end-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 disabled:opacity-30"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </IconButton>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 text-sm text-white/80" aria-live="polite">
        <span>
          {items[current] && (
            <>
              {albumName(items[current].album)} · {formatTime(items[current].takenAt)}
            </>
          )}
        </span>
        <span>
          {current + 1} / {items.length}
        </span>
      </div>
      <div ref={thumbs} className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 py-3">
        {items.map((m, i) => (
          <button
            key={m.id}
            data-thumb={i}
            onClick={() => go(i)}
            aria-label={`מעבר לתמונה ${i + 1}`}
            aria-current={i === current}
            className={`size-14 shrink-0 overflow-hidden rounded-lg transition-[opacity,outline] duration-200 ${i === current ? "opacity-100 outline outline-2 outline-white" : "opacity-55 hover:opacity-90"}`}
          >
            {Math.abs(i - current) <= 25 ? <MediaImg m={m} width={120} onNeedUrl={onNeedUrl} className="size-full" /> : <div className="size-full bg-white/5" />}
          </button>
        ))}
      </div>
    </div>
  );
}
