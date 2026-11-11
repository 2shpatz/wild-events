import { useEffect, useState } from "react";

/** How long the quick undo stays offered after a delete. */
const UNDO_SHOW_MS = 10_000;

/** The latest deleted item - only it can be undone - forgotten after a few seconds (the undo icon is quick, not permanent). */
export function useLastDeleted<T>() {
  const [item, setItem] = useState<T | null>(null);
  useEffect(() => {
    if (item === null) return;
    const t = setTimeout(() => setItem(null), UNDO_SHOW_MS);
    return () => clearTimeout(t);
  }, [item]);
  return [item, setItem] as const;
}
