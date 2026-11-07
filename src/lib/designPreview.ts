import { useEffect, useState } from "react";
import type { EventDesign } from "../../shared/design";
import type { PublicEvent } from "../../shared/types";

/**
 * Live preview of the guest page inside the design editor: the manage page embeds `/<code>?preview=design`
 * in an iframe and streams the unsaved draft to it with postMessage (same origin only).
 *   parent → iframe: design:draft {event, design, selected} · design:focus {id}
 *   iframe → parent: design:ready · design:select {id}
 */
export type PreviewMsg =
  | { type: "design:draft"; event: PublicEvent; design: EventDesign; selected: string | null }
  | { type: "design:focus"; id: string }
  | { type: "design:ready" }
  | { type: "design:select"; id: string };

export const PREVIEW_PARAM = "preview";
export const isPreviewFrame = () =>
  typeof window !== "undefined" && window.parent !== window && new URLSearchParams(location.search).get(PREVIEW_PARAM) === "design";

export const postToParent = (msg: PreviewMsg) => window.parent.postMessage(msg, location.origin);

/** Inside the preview iframe: the latest draft from the editor (null until the first message). */
export function usePreviewDraft() {
  const active = isPreviewFrame();
  const [draft, setDraft] = useState<{ event: PublicEvent; design: EventDesign; selected: string | null } | null>(null);
  useEffect(() => {
    if (!active) return;
    const on = (e: MessageEvent<PreviewMsg>) => {
      if (e.origin !== location.origin || e.source !== window.parent) return;
      const m = e.data;
      if (m?.type === "design:draft") setDraft({ event: m.event, design: m.design, selected: m.selected });
      if (m?.type === "design:focus") {
        const el = document.querySelector(`[data-block-id="${CSS.escape(m.id)}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: m.id === "hero" ? "start" : "center" });
      }
    };
    window.addEventListener("message", on);
    postToParent({ type: "design:ready" });
    return () => window.removeEventListener("message", on);
  }, [active]);
  return { active, draft };
}
