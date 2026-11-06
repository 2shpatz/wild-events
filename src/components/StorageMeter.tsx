import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, HardDrive, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { formatBytes } from "../lib/format";
import type { StorageInfo } from "../../shared/types";
import { Card, cx, IconButton } from "./ui";

/** Always-visible storage usage for the main user (+ 80% warning) with links to the real Google Photos. */
export function StorageMeter({
  endpoint = "/owner/storage",
  originalQuality,
  googleAlbumUrl,
}: {
  endpoint?: string;
  originalQuality?: boolean;
  googleAlbumUrl?: string | null;
}) {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async (fresh = false) => {
    setBusy(true);
    try {
      setInfo(await api<StorageInfo>(`${endpoint}${fresh ? "?fresh=1" : ""}`));
      setErr(false);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load();
  }, [endpoint]);

  const pct = info?.percent ?? null;
  const level = pct === null ? "ok" : pct >= 0.95 ? "critical" : pct >= 0.8 ? "warn" : "ok";
  const barColor = level === "critical" ? "bg-destructive" : level === "warn" ? "bg-amber-500" : "bg-emerald-500";

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <HardDrive className="size-5" aria-hidden />
          נפח האחסון שלך ב-Google
        </h2>
        <IconButton label="רענון נתוני נפח" onClick={() => load(true)} className="hover:bg-fg/5">
          <RefreshCw className={cx("size-5", busy && "animate-spin")} aria-hidden />
        </IconButton>
      </div>

      {err && <p className="text-muted-fg">לא הצלחנו לקרוא את נתוני הנפח כרגע.</p>}
      {info && (
        <>
          <div
            className="h-4 w-full overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct === null ? undefined : Math.round(pct * 100)}
            aria-label="שימוש באחסון"
          >
            <div className={cx("h-full rounded-full transition-[width] duration-500", barColor)} style={{ width: `${Math.min(100, (pct ?? 0) * 100)}%` }} />
          </div>
          <p className="text-base">
            {pct === null ? (
              <>בשימוש {formatBytes(info.usage)} · ללא מגבלת נפח</>
            ) : (
              <>
                <strong>{Math.round(pct * 100)}%</strong> בשימוש · {formatBytes(info.usage)} מתוך {formatBytes(info.limit)} · נשארו{" "}
                <strong>{formatBytes((info.limit ?? 0) - info.usage)}</strong>
              </>
            )}
          </p>
        </>
      )}

      {level !== "ok" && info && (
        <div
          role="alert"
          className={cx(
            "flex gap-3 rounded-2xl p-4",
            level === "critical" ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-900",
          )}
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p className="font-bold">{level === "critical" ? "האחסון כמעט מלא!" : "האחסון שלך מעל 80%"}</p>
            <p>
              כשהאחסון יתמלא, האורחים לא יוכלו להעלות תמונות. אפשר לפנות מקום ב-Google Photos, לעבור לאיכות דחוסה, או להגדיל את
              הנפח ב-Google One.
            </p>
            <a href="https://one.google.com/storage" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline">
              ניהול נפח ב-Google One <ExternalLink className="size-4" aria-hidden />
            </a>
          </div>
        </div>
      )}

      {originalQuality && (
        <p className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
          <AlertTriangle className="size-4" aria-hidden />
          איכות מקורית פעילה · צריכת נפח גבוהה
        </p>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-base font-semibold">
        <a href="https://photos.google.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline">
          פתיחת Google Photos <ExternalLink className="size-4" aria-hidden />
        </a>
        {googleAlbumUrl && (
          <a href={googleAlbumUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline">
            אלבום האירוע ב-Google Photos <ExternalLink className="size-4" aria-hidden />
          </a>
        )}
      </div>
    </Card>
  );
}
