import type { CSSProperties } from "react";
import { cx } from "./ui";

type Bg = { className: string; style: CSSProperties; fill: CSSProperties | null };

/**
 * The event background as a layer: the picture at its framing, and - when zoomed out (smaller than the screen) -
 * a blurred, enlarged copy behind it so the edges aren't empty. `className` / `style` position the layer(s).
 */
export function BgLayer({ bg, className, style }: { bg: Bg; className?: string; style?: CSSProperties }) {
  const extra = style?.transform ? ` ${style.transform}` : "";
  return (
    <>
      {bg.fill && (
        <div
          aria-hidden
          className={cx(className, bg.className, "blur-2xl")}
          style={{ ...style, ...bg.fill, transform: `${style?.transform ?? ""} scale(1.15)`.trim() }}
        />
      )}
      <div aria-hidden className={cx(className, bg.className)} style={{ ...style, ...bg.style, transform: `${extra} ${bg.style.transform ?? ""}`.trim() || undefined }} />
    </>
  );
}
