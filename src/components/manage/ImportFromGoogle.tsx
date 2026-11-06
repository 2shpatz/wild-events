import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CloudDownload, ExternalLink, Loader2, AlertTriangle, RotateCcw } from "lucide-react";
import { api, errorMessage } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import type { AlbumDTO, ImportJobDTO, StorageInfo } from "../../../shared/types";
import { Button, Card, Field, cx, inputClass, useToast } from "../ui";

const jobKey = (code: string) => `lea:import:${code}`;

/**
 * Import photos that are already in Google Photos (e.g. ones the owner uploaded directly) via the official
 * Google Photos Picker. Items are copied into the event album; the browser drives the copy loop.
 */
export function ImportFromGoogle({
  code,
  albums,
  quality,
  onImported,
}: {
  code: string;
  albums: AlbumDTO[];
  quality: "compressed" | "original";
  onImported: () => void;
}) {
  const toast = useToast();
  const managed = albums.filter((a) => a.kind !== "guest");
  const [target, setTarget] = useState<string>(managed.find((a) => a.kind === "host")?.id || "new");
  const [newName, setNewName] = useState("צלם האירוע");
  const [job, setJob] = useState<ImportJobDTO | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  // Resume a job after reload.
  useEffect(() => {
    const id = localStorage.getItem(jobKey(code));
    if (id) api<ImportJobDTO>(`/e/${code}/import/${id}`).then(setJob).catch(() => localStorage.removeItem(jobKey(code)));
  }, [code]);

  // Poll while the user is picking in Google Photos.
  useEffect(() => {
    if (job?.status !== "picking") return;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        setJob(await api<ImportJobDTO>(`/e/${code}/import/${job.id}`));
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [job?.status, job?.id, code]);

  useEffect(() => {
    if (job?.status === "listed" && !storage) api<StorageInfo>(`/e/${code}/manage/storage`).then(setStorage).catch(() => {});
  }, [job?.status, storage, code]);

  const startPicking = async () => {
    // Open the window synchronously (popup blockers), then point it at the picker.
    const win = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const j = await api<ImportJobDTO>(`/e/${code}/import`, {
        method: "POST",
        json: target === "new" ? { newAlbumName: newName } : { albumId: target },
      });
      localStorage.setItem(jobKey(code), j.id);
      setJob(j);
      const uri = `${j.pickerUri}/autoclose`;
      if (win) win.location.href = uri;
      else window.location.href = uri;
    } catch (e) {
      win?.close();
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const run = async (initial: ImportJobDTO) => {
    if (running.current) return;
    running.current = true;
    const lock: { current: WakeLockSentinel | null } = { current: null };
    navigator.wakeLock?.request("screen").then((l) => (lock.current = l)).catch(() => {});
    try {
      let j = initial.status === "listed" ? await api<ImportJobDTO>(`/e/${code}/import/${initial.id}/start`, { method: "POST" }) : initial;
      setJob(j);
      let errors = 0;
      while (j.status === "running") {
        try {
          j = await api<ImportJobDTO>(`/e/${code}/import/${j.id}/next`, { method: "POST" });
          setJob(j);
          errors = 0;
        } catch (e) {
          if (++errors >= 5) throw e;
          await new Promise((r) => setTimeout(r, 2000 * errors));
        }
      }
      if (j.status === "done") {
        toast(`הייבוא הסתיים: ${j.done.toLocaleString("he-IL")} פריטים נוספו לאירוע`);
        onImported();
      }
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      running.current = false;
      lock.current?.release().catch(() => {});
    }
  };

  const reset = async () => {
    if (job && !["done", "cancelled", "error"].includes(job.status)) {
      await api(`/e/${code}/import/${job.id}`, { method: "DELETE" }).catch(() => {});
    }
    localStorage.removeItem(jobKey(code));
    setJob(null);
    setStorage(null);
  };

  const remaining = storage?.limit ? storage.limit - storage.usage : null;
  const toImport = job ? job.total - job.already : 0;
  const processed = job ? job.done + job.failed : 0;

  return (
    <Card className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <CloudDownload className="size-6" aria-hidden />
        </span>
        <div>
          <h2 className="text-xl font-bold">ייבוא תמונות שכבר נמצאות ב-Google Photos</h2>
          <p className="text-muted-fg">
            למשל תמונות שהעליתם ישירות לאפליקציית Google Photos, או תמונות של הצלם. בוחרים אותן בחלון הרשמי של Google, והן נכנסות לאירוע.
          </p>
        </div>
      </div>

      {!job && (
        <>
          <fieldset className="space-y-3">
            <legend className="mb-2 font-semibold">לאיזה אלבום להכניס?</legend>
            {managed.map((a) => (
              <label key={a.id} className={cx("flex min-h-12 items-center gap-3 rounded-xl border-2 px-4", target === a.id ? "border-primary" : "border-border")}>
                <input type="radio" name="import-target" checked={target === a.id} onChange={() => setTarget(a.id)} className="size-5 accent-[var(--primary)]" />
                {a.name}
              </label>
            ))}
            <label className={cx("flex min-h-12 items-center gap-3 rounded-xl border-2 px-4", target === "new" ? "border-primary" : "border-border")}>
              <input type="radio" name="import-target" checked={target === "new"} onChange={() => setTarget("new")} className="size-5 accent-[var(--primary)]" />
              אלבום חדש
            </label>
            {target === "new" && (
              <Field label="שם האלבום החדש" htmlFor="import-new">
                <input id="import-new" className={inputClass} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} />
              </Field>
            )}
          </fieldset>
          <p className="text-sm text-muted-fg">
            הפריטים מועתקים לאלבום האירוע ב-Google, ולכן תופסים מקום נוסף בחשבון ({quality === "original" ? "איכות מקורית" : "איכות דחוסה, לפי הגדרות האירוע"}).
          </p>
          <Button size="lg" variant="accent" loading={busy} onClick={startPicking} icon={<ExternalLink className="size-5" aria-hidden />}>
            פתיחת Google Photos לבחירה
          </Button>
        </>
      )}

      {job?.status === "picking" && (
        <div className="space-y-4 rounded-2xl bg-muted p-5" aria-live="polite">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            מחכים שתסיימו לבחור ב-Google Photos…
          </p>
          <ol className="list-inside list-decimal space-y-1 text-base">
            <li>בחלון של Google מסמנים את התמונות והסרטונים (עד 2,000 בכל פעם).</li>
            <li>לוחצים על <strong>Done</strong> למעלה.</li>
            <li>חוזרים לכאן - הייבוא יתחיל אחרי אישור.</li>
          </ol>
          <div className="flex flex-wrap gap-3">
            {job.pickerUri && (
              <Button variant="outline" onClick={() => window.open(`${job.pickerUri}/autoclose`, "_blank")} icon={<ExternalLink className="size-4" aria-hidden />}>
                פתיחה מחדש של החלון
              </Button>
            )}
            <Button variant="ghost" onClick={reset}>
              ביטול
            </Button>
          </div>
        </div>
      )}

      {job?.status === "listed" && (
        <div className="space-y-4 rounded-2xl bg-muted p-5">
          <p className="text-lg">
            נבחרו <strong>{job.total.toLocaleString("he-IL")}</strong> פריטים
            {job.already > 0 && <> · {job.already.toLocaleString("he-IL")} מהם כבר נמצאים באירוע וידולגו</>}.
          </p>
          {toImport > 0 && (
            <p className={cx("rounded-xl p-3 font-semibold", remaining !== null && job.estBytes > remaining ? "bg-destructive/10 text-destructive" : "bg-card")}>
              הייבוא יתפוס בערך {formatBytes(job.estBytes)} נוספים בחשבון Google שלך
              {remaining !== null && <> · נשארו לך {formatBytes(remaining)}</>}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {toImport > 0 ? (
              <Button size="lg" variant="accent" onClick={() => run(job)}>
                התחלת ייבוא של {toImport.toLocaleString("he-IL")} פריטים
              </Button>
            ) : (
              <p className="font-semibold">אין מה לייבא - הכל כבר באירוע.</p>
            )}
            <Button variant="ghost" onClick={reset}>
              ביטול
            </Button>
          </div>
        </div>
      )}

      {job?.status === "running" && (
        <div className="space-y-3 rounded-2xl bg-muted p-5" aria-live="polite">
          <p className="text-lg font-semibold">
            מעתיקים… {processed.toLocaleString("he-IL")} מתוך {toImport.toLocaleString("he-IL")}
          </p>
          <div className="h-3 overflow-hidden rounded-full bg-card" aria-hidden>
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${toImport ? (processed / toImport) * 100 : 0}%` }} />
          </div>
          <p className="text-muted-fg">השאירו את הדף פתוח עד הסוף. אם הוא נסגר - חוזרים לכאן וממשיכים מאותה נקודה.</p>
          {!running.current && (
            <Button onClick={() => run(job)} icon={<RotateCcw className="size-4" aria-hidden />}>
              להמשיך את הייבוא
            </Button>
          )}
        </div>
      )}

      {job && ["done", "error", "cancelled"].includes(job.status) && (
        <div className={cx("space-y-3 rounded-2xl p-5", job.status === "done" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900")}>
          <p className="flex items-center gap-2 text-lg font-bold">
            {job.status === "done" ? <CheckCircle2 className="size-5" aria-hidden /> : <AlertTriangle className="size-5" aria-hidden />}
            {job.status === "done" ? "הייבוא הסתיים" : job.status === "cancelled" ? "הייבוא בוטל" : "הייבוא נעצר"}
          </p>
          <p>
            נוספו {job.done.toLocaleString("he-IL")} פריטים
            {job.already > 0 && <> · {job.already.toLocaleString("he-IL")} כבר היו באירוע</>}
            {job.failed > 0 && <> · {job.failed.toLocaleString("he-IL")} לא הצליחו (אפשר לנסות לייבא אותם שוב)</>}
          </p>
          {job.status === "error" && <p className="text-sm">ייתכן שחלון הבחירה של Google פג. אפשר פשוט להתחיל ייבוא חדש - מה שכבר יובא ידולג.</p>}
          <Button variant="outline" onClick={reset}>
            ייבוא נוסף
          </Button>
        </div>
      )}
    </Card>
  );
}
