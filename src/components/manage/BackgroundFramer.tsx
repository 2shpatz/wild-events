import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronDown, Crosshair, Eye, Minus, Monitor, Move, Plus, Smartphone } from "lucide-react";
import { MAX_BG_ZOOM, type BgPos } from "../../../shared/types";
import { Button, IconButton, Segmented, cx } from "../ui";

const clampPct = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
const clampZoom = (n: number) => Math.round(Math.min(MAX_BG_ZOOM, Math.max(1, n)) * 100) / 100;
export const CENTERED: BgPos = { x: 50, y: 50, zoom: 1 };

/**
 * "תצוגה מקדימה וכיוון הרקע": the background alone (no page content), framed like on the guest page - the same tall
 * parallax layer - on a phone or a computer. Drag the picture (or use the arrow keys) to choose what shows, and zoom in.
 * Collapsed by default (show / hide).
 */
export function BackgroundFramer({
  bg,
  custom,
  value,
  onChange,
}: {
  /** class + style of the background layer, at the current framing */
  bg: { className: string; style: CSSProperties };
  /** an uploaded photo (shown under the same dark scrim as on the guest page) */
  custom: boolean;
  value: BgPos;
  onChange: (p: BgPos) => void;
}) {
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<"phone" | "desktop">("phone");
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; start: BgPos; w: number; h: number } | null>(null);
  const panel = useId();
  const hint = useId();
  const changed = value.x !== 50 || value.y !== 50 || value.zoom !== 1;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: value, w: r.width, h: r.height };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // Moving the picture right shows more of its left side → the focal point moves left (smaller %).
    onChange({ ...d.start, x: clampPct(d.start.x - ((e.clientX - d.x) / d.w) * 100), y: clampPct(d.start.y - ((e.clientY - d.y) / d.h) * 100) });
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    // Arrows move the picture in the arrow's (visual) direction, regardless of RTL; + / - zoom.
    const moves: Record<string, BgPos> = {
      ArrowLeft: { ...value, x: clampPct(value.x + step) },
      ArrowRight: { ...value, x: clampPct(value.x - step) },
      ArrowUp: { ...value, y: clampPct(value.y + step) },
      ArrowDown: { ...value, y: clampPct(value.y - step) },
      "+": { ...value, zoom: clampZoom(value.zoom + 0.1) },
      "=": { ...value, zoom: clampZoom(value.zoom + 0.1) },
      "-": { ...value, zoom: clampZoom(value.zoom - 0.1) },
    };
    const next = moves[e.key];
    if (!next) return;
    e.preventDefault();
    onChange(next);
  };

  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panel}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-start transition-colors duration-200 hover:bg-fg/5 sm:px-4"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Eye className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">תצוגה מקדימה וכיוון הרקע</span>
          <span className="block truncate text-sm text-muted-fg">{changed ? `מכוון לפי בחירתכם · זום x${value.zoom.toFixed(1)}` : "ממורכז, בלי זום"}</span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-primary">{open ? "הסתרה" : "הצגה"}</span>
        <ChevronDown className={cx("size-5 shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div id={panel} className="space-y-4 border-t border-border px-3 pb-4 pt-4 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p id={hint} className="flex items-start gap-2 text-sm text-muted-fg">
              <Move className="mt-0.5 size-4 shrink-0" aria-hidden />
              גררו את התמונה כדי לבחור מה האורחים יראו. אפשר גם עם מקשי החצים.
            </p>
            <Segmented
              label="מכשיר לתצוגה המקדימה"
              value={device}
              onChange={setDevice}
              options={[
                { value: "phone", label: "טלפון", icon: <Smartphone className="size-4" aria-hidden /> },
                { value: "desktop", label: "מחשב", icon: <Monitor className="size-4" aria-hidden /> },
              ]}
            />
          </div>

          <div className="flex justify-center">
            <div
              role="group"
              tabIndex={0}
              aria-label="כיוון תמונת הרקע"
              aria-describedby={hint}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              onKeyDown={onKeyDown}
              className={cx(
                "relative touch-none select-none overflow-hidden bg-zinc-900 outline-none transition-shadow duration-200 focus-visible:ring-4 focus-visible:ring-primary/60",
                device === "phone" ? "aspect-[390/844] w-full max-w-[15rem] rounded-[1.75rem] ring-[6px] ring-zinc-900" : "aspect-[16/10] w-full rounded-xl ring-4 ring-zinc-800",
                dragging ? "cursor-grabbing" : "cursor-grab",
              )}
            >
              {/* Same layer as the guest page: 175% tall (parallax room), starting a bit above the top. */}
              <div className={cx("pointer-events-none absolute inset-x-0 -top-[5%] h-[175%]", bg.className)} style={bg.style} aria-hidden />
              {custom && <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/70" aria-hidden />}
              {!dragging && (
                <span className="pointer-events-none absolute bottom-3 start-3 inline-flex items-center gap-1 rounded-full bg-zinc-950/65 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm" aria-hidden>
                  <Move className="size-3.5" />
                  גררו לכיוון
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor={`${panel}-zoom`} className="font-semibold">
              זום
            </label>
            {/* Zoom reads left to right like the slider itself: - on the left, + on the right. */}
            <div dir="ltr" className="flex min-w-0 flex-1 items-center gap-3">
              <IconButton label="הקטנת הזום" onClick={() => onChange({ ...value, zoom: clampZoom(value.zoom - 0.1) })} disabled={value.zoom <= 1} className="border border-border bg-card disabled:opacity-40">
                <Minus className="size-5" aria-hidden />
              </IconButton>
              <input
                id={`${panel}-zoom`}
                type="range"
                min={1}
                max={MAX_BG_ZOOM}
                step={0.05}
                value={value.zoom}
                onChange={(e) => onChange({ ...value, zoom: clampZoom(Number(e.target.value)) })}
                aria-valuetext={`זום פי ${value.zoom.toFixed(1)}`}
                className="h-11 min-w-32 flex-1 accent-primary"
              />
              <IconButton label="הגדלת הזום" onClick={() => onChange({ ...value, zoom: clampZoom(value.zoom + 0.1) })} disabled={value.zoom >= MAX_BG_ZOOM} className="border border-border bg-card disabled:opacity-40">
                <Plus className="size-5" aria-hidden />
              </IconButton>
              <span className="w-12 text-center text-sm font-semibold tabular-nums text-muted-fg">x{value.zoom.toFixed(1)}</span>
            </div>
          </div>

          <Button variant="outline" disabled={!changed} icon={<Crosshair className="size-4" aria-hidden />} onClick={() => onChange(CENTERED)}>
            מרכוז ובלי זום
          </Button>
          <p className="sr-only" aria-live="polite">
            {dragging ? "" : `מיקום הרקע: ${Math.round(value.x)}% לרוחב, ${Math.round(value.y)}% לגובה, זום פי ${value.zoom.toFixed(1)}`}
          </p>
        </div>
      )}
    </div>
  );
}
