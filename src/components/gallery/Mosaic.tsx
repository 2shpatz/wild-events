import { useEffect, useMemo, useRef, useState } from "react";
import type { ViewProps } from "./types";
import { MediaImg } from "./MediaImg";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function gridSize() {
  const w = window.innerWidth;
  const h = window.innerHeight - 64;
  const cols = w < 640 ? 3 : w < 1024 ? 5 : 7;
  const cell = w / cols;
  return { cols, rows: Math.max(3, Math.ceil(h / cell)) };
}

/** Living photo wall: a dense grid where random tiles flip to other photos every couple of seconds. */
export function Mosaic({ items, fresh, albumName, onOpen, onNeedUrl }: ViewProps) {
  const [{ cols, rows }, setSize] = useState(gridSize);
  const count = Math.min(items.length, cols * rows);
  const [tiles, setTiles] = useState<number[]>(() => Array.from({ length: count }, (_, i) => i));
  const [flipping, setFlipping] = useState<number | null>(null);
  const cursor = useRef(count);

  useEffect(() => {
    const on = () => setSize(gridSize());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  useEffect(() => {
    setTiles((prev) => {
      const out = prev.filter((i) => i < items.length).slice(0, count);
      const used = new Set(out);
      for (let i = 0; out.length < count && i < items.length; i++) if (!used.has(i)) out.push(i), used.add(i);
      return out;
    });
  }, [items.length, count]);

  useEffect(() => {
    if (items.length <= count || reduced()) return;
    const t = setInterval(() => {
      const slot = Math.floor(Math.random() * count);
      setFlipping(slot);
      setTimeout(() => {
        setTiles((prev) => {
          const used = new Set(prev);
          const freshIdx = items.findIndex((m, i) => fresh.has(m.id) && !used.has(i));
          let idx = freshIdx;
          if (idx < 0) {
            idx = cursor.current % items.length;
            let guard = 0;
            while (used.has(idx) && guard++ < items.length) idx = (idx + 1) % items.length;
            cursor.current = idx + 1;
          }
          const next = [...prev];
          next[slot] = idx;
          return next;
        });
        setFlipping(null);
      }, 350);
    }, 2200);
    return () => clearInterval(t);
  }, [items, fresh, count]);

  const style = useMemo(() => ({ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }), [cols]);
  return (
    <div className="grid gap-0.5 pb-20" style={style}>
      {tiles.map((idx, slot) => {
        const m = items[idx];
        if (!m) return null;
        return (
          <button
            key={slot}
            onClick={() => onOpen(idx)}
            aria-label={`הגדלת תמונה של ${albumName(m.album)}`}
            className="aspect-square overflow-hidden [perspective:800px]"
          >
            <div
              className="size-full transition-transform duration-300 ease-in-out [backface-visibility:hidden]"
              style={{ transform: flipping === slot ? "rotateY(90deg)" : "rotateY(0deg)" }}
            >
              <MediaImg m={m} width={260} onNeedUrl={onNeedUrl} className="size-full" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
