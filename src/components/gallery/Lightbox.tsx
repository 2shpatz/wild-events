import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import type { MediaDTO } from "../../../shared/types";
import { downloadUrl, fullUrl, thumbUrl, videoUrl } from "../../lib/media";
import { formatDay, formatTime } from "../../lib/format";
import { ConfirmDialog, IconButton, cx } from "../ui";

export function Lightbox({
  items,
  index,
  onIndex,
  onClose,
  albumName,
  onNeedUrl,
  canDelete,
  onDelete,
}: {
  items: MediaDTO[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  albumName: (id: string) => string;
  onNeedUrl: (ids: string[], force?: boolean) => void;
  canDelete: (m: MediaDTO) => boolean;
  onDelete: (m: MediaDTO) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const m = items[index];
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number; t: number } | null>(null);
  const [dx, setDx] = useState(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const retried = useRef<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setLoaded(false);
    if (!m) return;
    const ids = [index - 1, index, index + 1].map((i) => items[i]?.id).filter(Boolean) as string[];
    onNeedUrl(ids);
    // Preload neighbours for instant swipes.
    for (const i of [index - 1, index + 1]) {
      const n = items[i];
      if (n?.kind === "photo" && n.url) new Image().src = fullUrl(n)!;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, m?.id]);

  // RTL: the next item is on the left → ArrowLeft = next.
  const next = () => index < items.length - 1 && onIndex(index + 1);
  const prev = () => index > 0 && onIndex(index - 1);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (confirm) return;
      if (e.key === "ArrowLeft") next();
      if (e.key === "ArrowRight") prev();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  if (!m) return null;
  const src = m.kind === "photo" ? fullUrl(m) : null;
  const vsrc = m.kind === "video" && !m.processing ? videoUrl(m) : null;

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && m.kind === "photo") {
      // Two fingers → pinch zoom (no swipe while pinching).
      pinch.current = { dist: dist(), zoom };
      drag.current = null;
      setDx(0);
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, t: Date.now() };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const z = Math.max(1, Math.min(4, pinch.current.zoom * (dist() / pinch.current.dist)));
      setZoom(z);
      if (z === 1) setPan({ x: 0, y: 0 });
      return;
    }
    if (!drag.current) return;
    const ddx = e.clientX - drag.current.x;
    const ddy = e.clientY - drag.current.y;
    if (zoom > 1) setPan({ x: drag.current.px + ddx, y: drag.current.py + ddy });
    else setDx(ddx);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      drag.current = null;
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (!d || zoom > 1) return;
    const ddx = e.clientX - d.x;
    const ddy = e.clientY - d.y;
    setDx(0);
    if (Math.abs(ddx) > 60 && Math.abs(ddx) > Math.abs(ddy)) {
      // Finger moves right → reveal the item on the left (= next in RTL).
      if (ddx > 0) next();
      else prev();
    } else if (ddy > 110 && Math.abs(ddy) > Math.abs(ddx)) onClose();
  };

  const toggleZoom = (e?: React.MouseEvent) => {
    if (m.kind !== "photo") return;
    if (zoom > 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(2.2);
      if (e) {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPan({ x: (r.left + r.width / 2 - e.clientX) * 1.2, y: (r.top + r.height / 2 - e.clientY) * 1.2 });
      }
    }
  };

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!confirm) onClose();
      }}
      // Android back gesture may close the dialog directly (no cancel event) - leave the lightbox too.
      onClose={() => onClose()}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overscroll-contain bg-black/95 p-0 text-white backdrop:bg-black"
      aria-label="תצוגה מוגדלת"
    >
      <div className="relative flex h-full flex-col">
        <div className="z-10 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="min-w-0 px-2">
            <p className="truncate text-lg font-bold">{albumName(m.album)}</p>
            <p className="text-sm text-white/75">
              {formatDay(m.takenAt)} · {formatTime(m.takenAt)} · {index + 1}/{items.length}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {m.kind === "photo" && (
              <IconButton label={zoom > 1 ? "הקטנה" : "הגדלה"} onClick={() => toggleZoom()} className="hover:bg-white/15">
                {zoom > 1 ? <ZoomOut className="size-6" aria-hidden /> : <ZoomIn className="size-6" aria-hidden />}
              </IconButton>
            )}
            {downloadUrl(m) && (
              <a
                href={downloadUrl(m)!}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="פתיחה באיכות מלאה להורדה"
                title="פתיחה באיכות מלאה להורדה"
                className="inline-flex size-11 items-center justify-center rounded-full hover:bg-white/15"
              >
                <Download className="size-6" aria-hidden />
              </a>
            )}
            {canDelete(m) && (
              <IconButton label="מחיקה" onClick={() => setConfirm(true)} className="hover:bg-red-500/30">
                <Trash2 className="size-6" aria-hidden />
              </IconButton>
            )}
            <IconButton label="סגירה" onClick={onClose} className="hover:bg-white/15" autoFocus>
              <X className="size-7" aria-hidden />
            </IconButton>
          </div>
        </div>

        <div
          className="relative flex flex-1 touch-none items-center justify-center overflow-hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            pinch.current = null;
            drag.current = null;
            setDx(0);
          }}
          onDoubleClick={toggleZoom}
          onWheel={(e) => {
            if (m.kind !== "photo") return;
            setZoom((z) => Math.max(1, Math.min(4, z - e.deltaY / 400)));
          }}
        >
          {m.kind === "photo" ? (
            <>
              {!loaded && m.url && (
                <img src={thumbUrl(m, 480)!} alt="" aria-hidden className="absolute max-h-full max-w-full scale-100 object-contain blur-sm" />
              )}
              {src ? (
                <img
                  key={m.id}
                  src={src}
                  alt={`תמונה של ${albumName(m.album)}`}
                  draggable={false}
                  onLoad={() => setLoaded(true)}
                  onError={() => {
                    if (retried.current !== m.id) {
                      retried.current = m.id;
                      onNeedUrl([m.id], true);
                    }
                  }}
                  className={cx("relative max-h-full max-w-full select-none object-contain", !drag.current && "transition-transform duration-200")}
                  style={{ transform: `translate3d(${pan.x + dx}px, ${pan.y}px, 0) scale(${zoom})` }}
                />
              ) : (
                <Loader2 className="size-10 animate-spin text-white/70" aria-label="טוען" />
              )}
            </>
          ) : vsrc ? (
            <video key={m.id} src={vsrc} poster={thumbUrl(m, 1280) || undefined} controls playsInline autoPlay className="max-h-full max-w-full" />
          ) : (
            <div className="flex flex-col items-center gap-3 text-white/80">
              <Loader2 className="size-10 animate-spin" aria-hidden />
              <p>Google עדיין מעבדת את הסרטון. הוא יופיע כאן בעוד כמה דקות.</p>
            </div>
          )}

          <IconButton
            label="הקודם"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            disabled={index === 0}
            className="absolute start-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 disabled:opacity-25"
          >
            <ChevronRight className="size-7" aria-hidden />
          </IconButton>
          <IconButton
            label="הבא"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            disabled={index >= items.length - 1}
            className="absolute end-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 disabled:opacity-25"
          >
            <ChevronLeft className="size-7" aria-hidden />
          </IconButton>
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        title={m.kind === "video" ? "למחוק את הסרטון?" : "למחוק את התמונה?"}
        message={
          <p>
            הפריט יוסר מהאלבום של <strong>{albumName(m.album)}</strong> ולא יוצג יותר לאף אחד באתר. הקובץ עצמו נשאר בחשבון Google Photos של
            בעל האירוע, ושם אפשר למחוק אותו לצמיתות.
          </p>
        }
        confirmLabel="כן, למחוק"
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          await onDelete(m);
          if (items.length <= 1) onClose();
          else if (index >= items.length - 1) onIndex(index - 1);
        }}
      />
    </dialog>
  );
}
