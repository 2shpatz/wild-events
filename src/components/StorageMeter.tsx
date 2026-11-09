import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ExternalLink, HardDrive, Link2, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { formatBytes } from "../lib/format";
import type { StorageAccountRef, StorageInfo } from "../../shared/types";
import { Card, cx, IconButton, LinkButton } from "./ui";
import { connectHref } from "./StorageAccountPicker";

/** Always-visible storage usage for the main user (+ 80% warning) with links to the real Google Photos. */
export function StorageMeter({
  endpoint = "/owner/storage",
  originalQuality,
  googleAlbumUrl,
  account,
  reconnectNext,
  footer,
}: {
  endpoint?: string;
  originalQuality?: boolean;
  googleAlbumUrl?: string | null;
  /** the Google account this meter is about (default: the owner's own) */
  account?: StorageAccountRef;
  /** owner only: where to come back after reconnecting an expired account */
  reconnectNext?: string;
  footer?: ReactNode;
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
  }, [endpoint, account?.id]);

  const acct = info?.account ?? account;
  const dedicated = acct && !acct.personal;
  const disconnected = acct?.connected === false || (err && account?.connected === false);

  const pct = info?.percent ?? null;
  const level = pct === null ? "ok" : pct >= 0.95 ? "critical" : pct >= 0.8 ? "warn" : "ok";
  const barColor = level === "critical" ? "bg-destructive" : level === "warn" ? "bg-amber-500" : "bg-emerald-500";

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <HardDrive className="size-5 shrink-0" aria-hidden />
            {dedicated ? "האחסון של חשבון האירוע ב-Google" : "נפח האחסון שלך ב-Google"}
          </h2>
          {acct?.email && (
            <p className="truncate text-sm text-muted-fg">
              התמונות נשמרות בחשבון <span dir="ltr">{acct.email}</span>
            </p>
          )}
        </div>
        <IconButton label="רענון נתוני נפח" onClick={() => load(true)} className="hover:bg-fg/5">
          <RefreshCw className={cx("size-5", busy && "animate-spin")} aria-hidden />
        </IconButton>
      </div>

      {disconnected ? (
        <div role="alert" className="space-y-3 rounded-2xl border-2 border-destructive bg-destructive/10 p-4 text-destructive">
          <p className="flex gap-2 font-bold">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
            החיבור לחשבון ה-Google של האירוע פג. עד שיחברו אותו מחדש, האורחים לא יכולים להעלות ותמונות חדשות לא יוצגו.
          </p>
          {reconnectNext && (
            <LinkButton href={connectHref(reconnectNext, acct?.email)} size="sm" icon={<Link2 className="size-4" aria-hidden />}>
              חיבור החשבון מחדש
            </LinkButton>
          )}
        </div>
      ) : (
        err && <p className="text-muted-fg">לא הצלחנו לקרוא את נתוני הנפח כרגע.</p>
      )}
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
          {dedicated ? "פתיחת Google Photos (עם החשבון של האירוע)" : "פתיחת Google Photos"} <ExternalLink className="size-4" aria-hidden />
        </a>
        {googleAlbumUrl && (
          <a href={googleAlbumUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline">
            אלבום האירוע ב-Google Photos <ExternalLink className="size-4" aria-hidden />
          </a>
        )}
      </div>
      {footer}
    </Card>
  );
}
