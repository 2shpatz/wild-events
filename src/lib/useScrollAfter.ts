import { useLayoutEffect, useRef, useState, type CSSProperties, type DependencyList } from "react";

/** How much of the next item stays visible under the last one, so it's clear the list goes on (scrolls). */
const PEEK = 24;

/**
 * A list that shows its first `n` items and scrolls inside its box beyond them. Items are the children marked with
 * `data-list-item`; the height is measured from them (any item height), and re-measured when they change size.
 * `deps`: re-measure when the items change (e.g. the loaded list).
 */
export function useScrollAfter<T extends HTMLElement>(n: number, deps: DependencyList) {
  const ref = useRef<T>(null);
  const [max, setMax] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const items = [...el.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.dataset.listItem !== undefined);
      if (items.length <= n) return setMax(null);
      const cs = getComputedStyle(el);
      const first = items[0];
      const last = items[n - 1];
      // Same offset parent for all the items, so the difference is their span inside the list.
      setMax(last.offsetTop + last.offsetHeight - first.offsetTop + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + PEEK);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, ...deps]);
  const style: CSSProperties | undefined = max !== null ? { maxHeight: max } : undefined;
  return { ref, style, scrolls: max !== null };
}
