import { useEffect, useMemo, useRef, useState } from "react";
import type { ViewProps } from "./types";
import { MediaImg } from "./MediaImg";
import { thumbUrl } from "../../lib/media";

const TILE_W = 260;
/** Each half of the flip (edge-on, then back), ms. */
const HALF_FLIP_MS = 220;

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

  // Each flip: pick the next photo, load it in the background, and only then turn the tile. The swap happens when
  // the tile is edge-on (90deg), so the second half of the turn already shows the new photo.
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;
  const midFlip = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (items.length <= count || reduced()) return;
    let alive = true;
    let busy = false;
    let fallback = 0;
    const nextIndex = () => {
      const used = new Set(tilesRef.current);
      const freshIdx = items.findIndex((m, i) => fresh.has(m.id) && !used.has(i));
      if (freshIdx >= 0) return freshIdx;
      let idx = cursor.current % items.length;
      let guard = 0;
      while (used.has(idx) && guard++ < items.length) idx = (idx + 1) % items.length;
      return idx;
    };
    const tick = async () => {
      if (busy || document.hidden) return;
      const idx = nextIndex();
      const m = items[idx];
      const src = m && thumbUrl(m, TILE_W);
      if (!m || !src || m.processing) {
        if (m) onNeedUrl([m.id]);
        cursor.current = idx + 1;
        return;
      }
      busy = true;
      try {
        const img = new Image();
        img.src = src;
        await img.decode();
      } catch {
        // Expired / broken URL: ask for a fresh one and try another photo next time.
        onNeedUrl([m.id], true);
        cursor.current = idx + 1;
        busy = false;
        return;
      }
      if (!alive) return;
      if (!fresh.has(m.id)) cursor.current = idx + 1;
      const slot = Math.floor(Math.random() * count);
      const swap = () => {
        if (!midFlip.current) return;
        midFlip.current = null;
        clearTimeout(fallback);
        if (!alive) return;
        setTiles((prev) => {
          if (prev.includes(idx)) return prev;
          const next = [...prev];
          next[slot] = idx;
          return next;
        });
        setFlipping(null);
        busy = false;
      };
      midFlip.current = swap;
      setFlipping(slot);
      fallback = window.setTimeout(swap, HALF_FLIP_MS + 80);
    };
    const t = setInterval(tick, 2200);
    return () => {
      alive = false;
      midFlip.current = null;
      clearInterval(t);
      clearTimeout(fallback);
      setFlipping(null); // a flip cut short (live update / unmount) must not leave a tile edge-on
    };
  }, [items, fresh, count, onNeedUrl]);

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
              className="size-full transition-transform [backface-visibility:hidden]"
              style={{
                transform: flipping === slot ? "rotateY(90deg)" : "rotateY(0deg)",
                transitionDuration: `${HALF_FLIP_MS}ms`,
                // into the turn accelerates, out of it settles
                transitionTimingFunction: flipping === slot ? "cubic-bezier(0.55, 0, 1, 0.45)" : "cubic-bezier(0, 0.55, 0.45, 1)",
              }}
              onTransitionEnd={(e) => {
                if (e.target === e.currentTarget && e.propertyName === "transform" && flipping === slot) midFlip.current?.();
              }}
            >
              <MediaImg m={m} width={TILE_W} onNeedUrl={onNeedUrl} className="size-full" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
