import { memo, useEffect, useRef, useState } from "react";
import { Play, Loader2 } from "lucide-react";
import type { MediaDTO } from "../../../shared/types";
import { fullUrl, thumbUrl } from "../../lib/media";
import { cx } from "../ui";

export interface MediaImgProps {
  m: MediaDTO;
  width?: number;
  className?: string;
  imgClassName?: string;
  onNeedUrl: (ids: string[], force?: boolean) => void;
  eager?: boolean;
  fit?: "cover" | "contain";
  alt?: string;
  /** Screen-sized image (same URL as the lightbox, so opening it is instant) instead of a `width` thumbnail. */
  full?: boolean;
}

/**
 * Thumbnail that requests a fresh Google URL when it scrolls near the viewport without one
 * (or when the URL expired and the image fails). Retries once to avoid loops.
 */
export const MediaImg = memo(function MediaImg({
  m,
  width = 480,
  className,
  imgClassName,
  onNeedUrl,
  eager,
  fit = "cover",
  alt = "",
  full = false,
}: MediaImgProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!!eager);
  const [loaded, setLoaded] = useState(false);
  const retried = useRef(false);

  useEffect(() => {
    if (eager || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [eager]);

  // `eager` can turn on after mount (a carousel slide that comes next to the current one). The observer above is
  // dropped then, and a slide clipped by a horizontal scroller never "intersects" anyway - so eager always shows.
  const show = visible || !!eager;

  useEffect(() => {
    if (show && (!m.url || m.processing)) onNeedUrl([m.id]);
  }, [show, m.url, m.id, m.processing, onNeedUrl]);

  const src = show ? (full ? fullUrl(m) : thumbUrl(m, width)) : null;
  return (
    <div ref={ref} className={cx("relative overflow-hidden bg-white/5", className)}>
      {!loaded && <div className="skeleton absolute inset-0" aria-hidden />}
      {src && (
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (!retried.current) {
              retried.current = true;
              onNeedUrl([m.id], true);
            }
          }}
          className={cx(
            "size-full transition-opacity duration-300",
            fit === "cover" ? "object-cover" : "object-contain",
            loaded ? "opacity-100" : "opacity-0",
            imgClassName,
          )}
        />
      )}
      {m.kind === "video" && (
        <span className="pointer-events-none absolute end-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white">
          {m.processing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Play className="size-3.5 fill-current" aria-hidden />}
          {m.processing ? "מעבד" : "וידאו"}
        </span>
      )}
    </div>
  );
});
