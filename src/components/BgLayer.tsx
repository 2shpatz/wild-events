import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import type { BgPhoto } from "../lib/themes";
import { cx } from "./ui";

type Bg = { className: string; style: CSSProperties; fill: CSSProperties | null; photo: BgPhoto | null };

// Natural sizes of the background pictures (each loaded once per page).
const sizes = new Map<string, { w: number; h: number }>();
function useNaturalSize(src: string | null) {
  const [size, setSize] = useState(() => (src ? (sizes.get(src) ?? null) : null));
  useEffect(() => {
    if (!src) return setSize(null);
    const known = sizes.get(src);
    if (known) return setSize(known);
    let live = true;
    const img = new Image();
    img.onload = () => {
      const s = { w: img.naturalWidth, h: img.naturalHeight };
      sizes.set(src, s);
      if (live) setSize(s);
    };
    img.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  return size;
}

/** The layer's own size, its offset inside the clipping container, and that container's height (what can be seen). */
function useBox(el: HTMLDivElement | null) {
  const [box, setBox] = useState<{ w: number; h: number; top: number; view: number } | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const parent = el.offsetParent as HTMLElement | null;
      setBox({ w: el.offsetWidth, h: el.offsetHeight, top: el.offsetTop, view: parent?.clientHeight ?? el.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.offsetParent) ro.observe(el.offsetParent);
    return () => ro.disconnect();
  }, [el]);
  return box;
}

/**
 * The event background as a layer. Photos are sized and placed from the picture's real proportions: "cover" times
 * the zoom, the focal point kept at the same spot (like CSS percent positioning). `shift` is the parallax the page
 * asks for (px, usually negative while scrolling down); it is limited so the visible area never passes the picture's
 * edge. When the picture can't cover what's visible (zoomed out), a blurred copy fills behind it.
 */
export function BgLayer({ bg, className, shift = 0 }: { bg: Bg; className?: string; shift?: number }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const box = useBox(el);
  const natural = useNaturalSize(bg.photo?.src ?? null);

  let photoStyle: CSSProperties = {};
  let move = shift;
  let needFill = false;
  if (bg.photo && box && natural && box.w && box.h) {
    const { x, y, zoom } = bg.photo.pos;
    const scale = Math.max(box.w / natural.w, box.h / natural.h) * zoom;
    const rw = natural.w * scale;
    const rh = natural.h * scale;
    const left = (box.w - rw) * (x / 100);
    const top = (box.h - rh) * (y / 100);
    const size = `${rw.toFixed(1)}px ${rh.toFixed(1)}px`;
    const at = `${left.toFixed(1)}px ${top.toFixed(1)}px`;
    photoStyle =
      bg.photo.layers === 2
        ? { backgroundSize: `100% 100%, ${size}`, backgroundPosition: `0 0, ${at}`, backgroundRepeat: "no-repeat" }
        : { backgroundSize: size, backgroundPosition: at, backgroundRepeat: "no-repeat" };
    // The picture's vertical span inside the layer (the layer clips it), and the range of shifts that keep the
    // visible window [-(top + shift), -(top + shift) + view] inside it.
    const spanTop = Math.max(0, top);
    const spanBottom = Math.min(box.h, top + rh);
    const hi = -box.top - spanTop;
    const lo = box.view - box.top - spanBottom;
    move = lo > hi ? hi : Math.min(hi, Math.max(lo, shift));
    needFill = rw < box.w - 0.5 || spanBottom - spanTop < box.view - 0.5;
  }
  const transform = move ? `translate3d(0, ${move.toFixed(1)}px, 0)` : undefined;

  return (
    <>
      {needFill && bg.fill && (
        <div aria-hidden className={cx(className, bg.className, "scale-110 blur-2xl")} style={{ ...bg.fill, transform }} />
      )}
      <div ref={setEl} aria-hidden className={cx(className, bg.className)} style={{ ...bg.style, ...photoStyle, transform }} />
    </>
  );
}
