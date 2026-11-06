import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ChevronLeft, ChevronRight, Maximize, Minimize, Pause, Play, QrCode } from "lucide-react";
import type { ViewProps } from "./types";
import { fullUrl } from "../../lib/media";
import { IconButton, cx } from "../ui";
import { eventUrl, formatTime } from "../../lib/format";

const INTERVAL = 6500;
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * "Live screen" for the venue: fullscreen, auto-advancing, new uploads jump the queue.
 * Has pause/prev/next controls (ux: Auto-Rotating Content Controls) and an optional "scan to upload" QR.
 */
export function Slideshow({ items, fresh, albumName, onNeedUrl, eventCode }: ViewProps) {
  const root = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(!reduced());
  const [hovering, setHovering] = useState(false);
  const [full, setFull] = useState(false);
  const [showQr, setShowQr] = useState(true);
  const [qr, setQr] = useState<string | null>(null);
  const [layers, setLayers] = useState<[string | null, string | null]>([null, null]);
  const [front, setFront] = useState(0);
  const seenFresh = useRef(new Set<string>());

  useEffect(() => {
    QRCode.toDataURL(eventUrl(eventCode), { width: 320, margin: 1 }).then(setQr);
  }, [eventCode]);

  const next = useCallback(() => {
    // New uploads first.
    const freshIdx = items.findIndex((m) => fresh.has(m.id) && !seenFresh.current.has(m.id));
    if (freshIdx >= 0) {
      seenFresh.current.add(items[freshIdx].id);
      setIndex(freshIdx);
    } else setIndex((i) => (items.length ? (i + 1) % items.length : 0));
  }, [items, fresh]);

  const prev = () => setIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0));

  useEffect(() => {
    if (!playing || hovering || items.length < 2) return;
    const t = setTimeout(next, INTERVAL);
    return () => clearTimeout(t);
  }, [playing, hovering, index, next, items.length]);

  // Make sure current + upcoming have URLs; crossfade between two layers.
  const m = items[index];
  useEffect(() => {
    if (!m) return;
    const upcoming = [index, index + 1, index + 2].map((i) => items[i % items.length]?.id).filter(Boolean) as string[];
    onNeedUrl(upcoming);
    const src = m.kind === "photo" ? fullUrl(m) : m.url ? `${m.url}=w1920-h1080` : null;
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      setLayers((l) => {
        const n: [string | null, string | null] = [...l];
        n[1 - front] = src;
        return n;
      });
      setFront((f) => 1 - f);
    };
    img.src = src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id, m?.url]);

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.current?.requestFullscreen?.().catch(() => {});
  };

  return (
    <div
      ref={root}
      className="relative h-[calc(100dvh-var(--toolbar-h,64px))] min-h-[420px] overflow-hidden bg-black text-white [&:fullscreen]:h-dvh"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      aria-roledescription="מצגת"
      aria-label="מצגת תמונות"
    >
      {layers.map((src, i) =>
        src ? (
          <div key={i} className={cx("absolute inset-0 transition-opacity duration-1000", i === front ? "opacity-100" : "opacity-0")} aria-hidden={i !== front}>
            <img src={src} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-2xl" aria-hidden />
            <img
              src={src}
              alt={i === front && m ? `תמונה של ${albumName(m.album)}` : ""}
              className={cx("absolute inset-0 size-full object-contain", i === front && playing && !reduced() && "animate-[kenburns_7s_ease-out_both]")}
            />
          </div>
        ) : null,
      )}
      <style>{`@keyframes kenburns{from{transform:scale(1)}to{transform:scale(1.06)}}`}</style>

      {m && (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/75 to-transparent p-5 pt-16" aria-live="polite">
          <div>
            <p className="text-xl font-bold drop-shadow">{albumName(m.album)}</p>
            <p className="text-white/80">{formatTime(m.takenAt)}</p>
          </div>
          {showQr && qr && (
            <div className="flex items-center gap-3 rounded-2xl bg-white p-2 pe-4 text-zinc-900 shadow-lift">
              <img src={qr} alt="קוד QR להעלאת תמונות" className="size-20 sm:size-28" />
              <span className="max-w-28 text-sm font-bold leading-snug sm:text-base">סרקו והעלו את התמונות שלכם</span>
            </div>
          )}
        </div>
      )}

      <div className="absolute end-3 top-3 flex gap-2">
        <IconButton label={playing ? "השהיה" : "הפעלה"} onClick={() => setPlaying((p) => !p)} className="bg-black/50 hover:bg-black/70">
          {playing ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
        </IconButton>
        <IconButton label="הקודם" onClick={prev} className="bg-black/50 hover:bg-black/70">
          <ChevronRight className="size-5" aria-hidden />
        </IconButton>
        <IconButton label="הבא" onClick={next} className="bg-black/50 hover:bg-black/70">
          <ChevronLeft className="size-5" aria-hidden />
        </IconButton>
        <IconButton label={showQr ? "הסתרת קוד QR" : "הצגת קוד QR"} aria-pressed={showQr} onClick={() => setShowQr((s) => !s)} className="bg-black/50 hover:bg-black/70">
          <QrCode className="size-5" aria-hidden />
        </IconButton>
        <IconButton label={full ? "יציאה ממסך מלא" : "מסך מלא"} onClick={toggleFull} className="bg-black/50 hover:bg-black/70">
          {full ? <Minimize className="size-5" aria-hidden /> : <Maximize className="size-5" aria-hidden />}
        </IconButton>
      </div>
      <span className="sr-only" aria-live="polite">
        {index + 1} מתוך {items.length}
      </span>
    </div>
  );
}
