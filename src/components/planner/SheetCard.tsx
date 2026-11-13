import { useState } from "react";
import { AlertTriangle, ExternalLink, FileSpreadsheet, Loader2, RefreshCw, Unlink } from "lucide-react";
import { timeAgo } from "../../lib/format";
import { Button, Card, ConfirmDialog, cx } from "../ui";
import { sheetError, usePlanner } from "./store";
import { num } from "./bits";

/** One line above the planner pages: the sheet's sync state, with "sync now" and a link to open it. */
export function SheetStatus({ compact }: { compact?: boolean }) {
  const p = usePlanner();
  const s = p.data.sheet;
  if (!s) return null;
  const err = s.error || p.syncState === "error";
  return (
    <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-1.5 text-sm", err ? "border-amber-500/50 bg-amber-500/10" : "border-border bg-card", compact && "mb-4")} role="status">
      {p.syncState === "syncing" ? <Loader2 className="size-4 animate-spin text-muted-fg" aria-hidden /> : err ? <AlertTriangle className="size-4 text-amber-600" aria-hidden /> : <FileSpreadsheet className="size-4 text-green-700" aria-hidden />}
      <span className="min-w-0 flex-1">
        {p.syncState === "syncing" ? "מסנכרן עם Google Sheets..." : s.error ? sheetError(s.error) : s.syncedAt ? `מסונכרן עם Google Sheets · ${timeAgo(s.syncedAt)}` : "Google Sheets מחובר"}
      </span>
      <button type="button" onClick={() => p.sync()} disabled={p.syncState === "syncing"} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-semibold hover:bg-fg/5 disabled:opacity-50">
        <RefreshCw className="size-3.5" aria-hidden />
        סנכרון עכשיו
      </button>
      {s.url && (
        <a href={s.url} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-semibold text-fg no-underline hover:bg-fg/5">
          <ExternalLink className="size-3.5" aria-hidden />
          פתיחה
        </a>
      )}
    </div>
  );
}

/** Settings: connect / sync / open / stop the Google Sheet, and decide about rows deleted in the sheet. */
export function SheetCard() {
  const p = usePlanner();
  const s = p.data.sheet;
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const run = async (o: Parameters<typeof p.sync>[0]) => {
    setBusy(true);
    await p.sync(o);
    setBusy(false);
  };
  return (
    <Card>
      <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
        <FileSpreadsheet className="size-5 text-green-700" aria-hidden />
        Google Sheets
      </h2>
      {!s ? (
        <div className="space-y-3">
          <p className="text-muted-fg">
            ניצור גיליון בחשבון ה-Google של האירוע ונסנכרן אותו לשני הכיוונים: שינויים כאן מופיעים בגיליון, ושינויים בגיליון (כולל שורות ועמודות חדשות) מופיעים כאן. נותני השירות וההוצאות מופיעים בלשוניות נוספות לקריאה בלבד.
          </p>
          {p.data.sheet === null && (
            <Button onClick={() => run({ create: true })} loading={busy} icon={<FileSpreadsheet className="size-4" aria-hidden />}>
              יצירת גיליון וסנכרון
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <SheetStatus />
          {s.pendingDeletes > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3">
              <p className="font-semibold">
                {num(s.pendingDeletes)} שורות נמחקו מהגיליון בבת אחת. כדי למנוע טעות החזרנו אותן לגיליון. למחוק אותן גם כאן?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="danger" loading={busy} onClick={() => run({ confirmDeletes: true })}>
                  כן, למחוק {num(s.pendingDeletes)} הזמנות
                </Button>
                <Button size="sm" variant="outline" loading={busy} onClick={() => run({ keepDeleted: true })}>
                  לא, להשאיר
                </Button>
              </div>
            </div>
          )}
          {s.error === "sheet_no_ids" && (
            <div className="space-y-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3">
              <p className="font-semibold">לכתוב את לשונית המוזמנים מחדש לפי האתר? שינויים שנעשו בגיליון מאז הסנכרון האחרון יאבדו.</p>
              <Button size="sm" variant="outline" loading={busy} onClick={() => run({ overwrite: true })}>
                כתיבה מחדש מהאתר
              </Button>
            </div>
          )}
          <ul className="list-disc space-y-1 ps-5 text-sm text-muted-fg">
            <li>אפשר לסדר מחדש עמודות ולהוסיף עמודות משלכם. עמודה חדשה תופיע גם כאן.</li>
            <li>לא משנים את העמודה המוסתרת &quot;מזהה&quot; (A): כך אנחנו יודעים איזו שורה היא איזו הזמנה.</li>
            <li>כדי להסתיר עמודה מכבים אותה כאן בהגדרות (עמודה שנמחקה בגיליון תחזור בסנכרון הבא).</li>
            <li>הסנכרון רץ כשהעמוד פתוח, כמה שניות אחרי כל שינוי, וגם כל רבע שעה ברקע.</li>
          </ul>
          <Button variant="ghost" className="text-destructive" icon={<Unlink className="size-4" aria-hidden />} onClick={() => setConfirm(true)}>
            הפסקת הסנכרון
          </Button>
          <ConfirmDialog
            open={confirm}
            title="להפסיק את הסנכרון עם הגיליון?"
            message={<p>הגיליון יישאר ב-Google Drive כמו שהוא, אבל שינויים כבר לא יעברו בינו לבין האתר. אפשר ליצור גיליון חדש בכל רגע.</p>}
            confirmLabel="הפסקת הסנכרון"
            onClose={() => setConfirm(false)}
            onConfirm={p.unlinkSheet}
          />
        </div>
      )}
    </Card>
  );
}
