import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EventDesign } from "../../../../shared/design";
import type { PublicEvent } from "../../../../shared/types";
import { PREVIEW_PARAM, type PreviewMsg } from "../../../lib/designPreview";
import { cx } from "../../ui";

export type Device = "phone" | "desktop";
const SIZES: Record<Device, { w: number; h: number }> = {
  phone: { w: 390, h: 844 },
  desktop: { w: 1280, h: 800 },
};

/**
 * The real guest page in an iframe (so the page's own breakpoints and fixed bars behave like on the device),
 * scaled to fit. The unsaved draft is streamed in with postMessage; clicks inside report back a selection.
 */
export function DesignPreview({
  event,
  design,
  selected,
  focus,
  device,
  fill,
  onSelect,
}: {
  event: PublicEvent;
  design: EventDesign;
  selected: string | null;
  /** scroll the preview to this element (changes with a counter so the same id can be re-focused) */
  focus: { id: string; n: number } | null;
  device: Device;
  /** fill the container's height (mobile tuning mode) instead of a fixed max height */
  fill?: boolean;
  onSelect: (id: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [avail, setAvail] = useState({ w: 0, h: 0 });
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const on = (e: MessageEvent<PreviewMsg>) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === "design:ready") setReady(true);
      if (e.data?.type === "design:select") onSelectRef.current(e.data.id);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);

  const post = (m: PreviewMsg) => frame.current?.contentWindow?.postMessage(m, location.origin);

  useEffect(() => {
    if (ready) post({ type: "design:draft", event, design, selected });
  }, [ready, event, design, selected]);

  useEffect(() => {
    if (ready && focus) post({ type: "design:focus", id: focus.id });
  }, [ready, focus]);

  const size = SIZES[device];
  const maxH = fill ? avail.h : window.innerHeight * 0.78;
  const scale = avail.w ? Math.min(1, avail.w / size.w, (maxH || size.h) / size.h) : 0;
  const phone = device === "phone";

  return (
    <div ref={box} className={cx("flex w-full justify-center", fill ? "h-full items-center" : "items-start")}>
      <div
        className={cx("relative shrink-0 overflow-hidden bg-zinc-900 shadow-lift", phone ? "rounded-[2rem] ring-[6px] ring-zinc-900" : "rounded-xl ring-4 ring-zinc-800")}
        style={{ width: size.w * scale, height: size.h * scale, visibility: scale ? "visible" : "hidden" }}
      >
        <iframe
          ref={frame}
          src={`/${event.code}?${PREVIEW_PARAM}=design`}
          title="תצוגה מקדימה של עמוד האורחים"
          className="absolute left-0 top-0 origin-top-left border-0 bg-white"
          style={{ width: size.w, height: size.h, transform: `scale(${scale})` }}
        />
        {!ready && <div className="skeleton absolute inset-0" aria-hidden />}
      </div>
    </div>
  );
}
