import { useEffect, useMemo, useState } from "react";
import type { MediaDTO } from "../../../shared/types";
import { aspect } from "../../lib/media";
import { formatDay, formatTime } from "../../lib/format";
import { MediaImg } from "./MediaImg";
import type { ViewProps } from "./types";

function useColumns() {
  const calc = () => (window.innerWidth >= 1280 ? 5 : window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 3 : 2);
  const [cols, setCols] = useState(calc);
  useEffect(() => {
    const on = () => setCols(calc());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return cols;
}

/** Shortest-column distribution keeps reading order roughly left→right (RTL: right→left) by rows. */
function distribute(items: { m: MediaDTO; index: number }[], cols: number) {
  const columns: { m: MediaDTO; index: number }[][] = Array.from({ length: cols }, () => []);
  const heights = new Array(cols).fill(0);
  for (const it of items) {
    let c = 0;
    for (let i = 1; i < cols; i++) if (heights[i] < heights[c] - 0.01) c = i;
    columns[c].push(it);
    heights[c] += 1 / aspect(it.m);
  }
  return columns;
}

function hourKey(ms: number) {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

export function Masonry({ items, fresh, albumName, onOpen, onNeedUrl, groupBy }: ViewProps) {
  const cols = useColumns();
  const groups = useMemo(() => {
    const indexed = items.map((m, index) => ({ m, index }));
    if (groupBy !== "hour") return [{ key: "all", label: null as string | null, items: indexed }];
    const out: { key: string; label: string | null; items: typeof indexed }[] = [];
    let lastDay = "";
    for (const it of indexed) {
      const k = hourKey(it.m.takenAt);
      const g = out[out.length - 1];
      if (g && g.key === String(k)) g.items.push(it);
      else {
        const day = formatDay(k);
        out.push({ key: String(k), label: `${day !== lastDay ? `${day} · ` : ""}${formatTime(k)}`, items: [it] });
        lastDay = day;
      }
    }
    return out;
  }, [items, groupBy]);

  return (
    <div className="space-y-6 px-2 pb-24 sm:px-4">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label || "כל התמונות"}>
          {g.label && (
            <h2 className="sticky top-[var(--toolbar-h,0px)] z-10 -mx-2 mb-2 bg-canvas/85 px-3 py-2 text-base font-bold text-white/90 backdrop-blur-md sm:-mx-4 sm:px-5">
              {g.label}
              <span className="ms-2 text-sm font-normal text-white/60">{g.items.length}</span>
            </h2>
          )}
          <div className="flex gap-2">
            {distribute(g.items, cols).map((col, ci) => (
              <div key={ci} className="flex min-w-0 flex-1 flex-col gap-2">
                {col.map(({ m, index }) => (
                  <button
                    key={m.id}
                    onClick={() => onOpen(index)}
                    className={`group relative block w-full overflow-hidden rounded-xl text-start [content-visibility:auto] focus-visible:outline-white ${fresh.has(m.id) ? "animate-pop-in" : ""}`}
                    style={{ aspectRatio: `${aspect(m)}`, containIntrinsicSize: `auto 240px` }}
                    aria-label={`${m.kind === "video" ? "סרטון" : "תמונה"} של ${albumName(m.album)}, ${formatTime(m.takenAt)}`}
                  >
                    <MediaImg m={m} width={Math.ceil(Math.min(window.innerWidth, 1600) / cols)} onNeedUrl={onNeedUrl} className="size-full" imgClassName="transition-transform duration-500 group-hover:scale-[1.03]" />
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 text-sm font-medium text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                      {albumName(m.album)}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
