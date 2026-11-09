import type { StorageInfo } from "../../shared/types";
import { cx } from "./ui";

export type StorageLevel = "ok" | "warn" | "critical";

/** Same thresholds everywhere: amber from 80%, red from 95%. */
export function storageLevel(s: StorageInfo | null | undefined): StorageLevel {
  const pct = s?.percent ?? null;
  return pct === null ? "ok" : pct >= 0.95 ? "critical" : pct >= 0.8 ? "warn" : "ok";
}

export const freeBytes = (s: StorageInfo | null | undefined) => (s && s.limit !== null ? Math.max(0, s.limit - s.usage) : null);

/** Usage bar of one Google account. */
export function StorageBar({ storage, label, className }: { storage: StorageInfo; label: string; className?: string }) {
  const pct = storage.percent;
  const level = storageLevel(storage);
  const color = level === "critical" ? "bg-destructive" : level === "warn" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <span
      className={cx("block h-3 w-full overflow-hidden rounded-full bg-muted", className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct === null ? undefined : Math.round(pct * 100)}
      aria-label={label}
    >
      <span className={cx("block h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${Math.min(100, (pct ?? 0) * 100)}%` }} />
    </span>
  );
}
