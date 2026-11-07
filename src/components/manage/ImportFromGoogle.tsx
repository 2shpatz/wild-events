import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CloudDownload,
  ExternalLink,
  FolderHeart,
  Images,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { api, errorMessage } from "../../lib/api";
import { formatBytes, formatDay, formatTime } from "../../lib/format";
import type { ImportJobDTO, ManageAlbum, StorageInfo } from "../../../shared/types";
import { StepDot } from "../Stepper";
import { Button, Card, Field, cx, inputClass, useToast } from "../ui";

const jobKey = (code: string) => `lea:import:${code}`;

type Mode = "own" | "shared" | "photos";

const LINK_HOSTS = ["photos.app.goo.gl", "photos.google.com", "goo.gl"];

function isAlbumLink(v: string) {
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" && LINK_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

function syncedLabel(ms: number) {
  if (!ms) return "העדכון הראשון עוד לא הסתיים";
  const sameDay = new Date(ms).toDateString() === new Date().toDateString();
  return `עודכן ${sameDay ? "היום" : formatDay(ms)} ב-${formatTime(ms)}`;
}

/**
 * Bring photos that are already in Google Photos into the event, via the official Google Photos Picker:
 * - link a whole album (the owner's own, or one shared with them) and re-sync it later (only new items are copied);
 * - or pick individual photos into an existing event album.
 * Google's API can't read albums this app didn't create, so items are copied and syncing is on demand.
 */
export function ImportFromGoogle({
  code,
  albums,
  quality,
  onImported,
}: {
  code: string;
  albums: ManageAlbum[];
  quality: "compressed" | "original";
  onImported: () => void;
}) {
  const toast = useToast();
  const managed = albums.filter((a) => a.kind !== "guest");
  const linked = albums.filter((a) => a.link);
  const [mode, setMode] = useState<Mode | null>(null);
  const [target, setTarget] = useState<string>(managed.find((a) => a.kind === "host")?.id || "new");
  const [newName, setNewName] = useState("צלם האירוע");
  const [albumName, setAlbumName] = useState("");
  const [link, setLink] = useState("");
  const [linkTouched, setLinkTouched] = useState(false);
  const [linkOpened, setLinkOpened] = useState(false);
  const [job, setJob] = useState<ImportJobDTO | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const running = useRef(false);
  const onImportedRef = useRef(onImported);
  onImportedRef.current = onImported;

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
        const j = await api<ImportJobDTO>(`/e/${code}/import/${job.id}`);
        setJob(j);
        if (j.status === "done") onImportedRef.current(); // nothing new to copy: the sync time changed
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [job?.status, job?.id, code]);

  useEffect(() => {
    if (job?.status === "listed" && !storage) api<StorageInfo>(`/e/${code}/manage/storage`).then(setStorage).catch(() => {});
  }, [job?.status, storage, code]);

  const choose = (m: Mode) => {
    setMode(m);
    setAlbumName(m === "shared" ? "אלבום משותף" : "");
  };

  const startPicking = async (body: Record<string, unknown>, key: string) => {
    // Open the window synchronously (popup blockers), then point it at the picker.
    const win = window.open("about:blank", "_blank");
    setBusy(key);
    try {
      const j = await api<ImportJobDTO>(`/e/${code}/import`, { method: "POST", json: body });
      localStorage.setItem(jobKey(code), j.id);
      setJob(j);
      if (body.newAlbumName) onImported(); // the new album shows up in the lists right away
      const uri = `${j.pickerUri}/autoclose`;
      if (win) win.location.href = uri;
      else window.location.href = uri;
    } catch (e) {
      win?.close();
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
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
        toast(`הסתיים: ${j.done.toLocaleString("he-IL")} פריטים נוספו לאירוע`);
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
    setMode(null);
    setLink("");
    setLinkTouched(false);
    setLinkOpened(false);
  };

  const remaining = storage?.limit ? storage.limit - storage.usage : null;
  const toImport = job ? job.total - job.already : 0;
  const processed = job ? job.done + job.failed : 0;
  const jobAlbum = job ? albums.find((a) => a.id === job.albumId) : undefined;
  const linkOk = isAlbumLink(link);
  const linkError = linkTouched && link.trim() && !linkOk ? "הקישור צריך להתחיל ב-https://photos.app.goo.gl/ או ב-https://photos.google.com/" : null;

  const pickButton = (
    <Button
      size="lg"
      variant="accent"
      loading={busy === "new-link"}
      disabled={!albumName.trim() || (mode === "shared" && !linkOk)}
      onClick={() =>
        startPicking({ newAlbumName: albumName.trim(), link: { sourceUrl: mode === "shared" ? link.trim() : null } }, "new-link")
      }
      icon={<ExternalLink className="size-5" aria-hidden />}
    >
      בחירת האלבום ב-Google Photos
    </Button>
  );

  const nameField = (
    <Field label="איך לקרוא לאלבום באירוע?" htmlFor="link-name" hint="האורחים יראו את השם הזה. למשל: צלם האירוע, החינה, תמונות מהחברים">
      <input id="link-name" className={inputClass} value={albumName} onChange={(e) => setAlbumName(e.target.value)} maxLength={40} />
    </Field>
  );

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CloudDownload className="size-6" aria-hidden />
          </span>
          <div className="space-y-1">
            <h2 className="text-xl font-bold">אלבומים ותמונות מ-Google Photos</h2>
            <p className="text-muted-fg">
              מחברים לאירוע אלבום שכבר קיים ב-Google Photos: אלבום שלכם, או אלבום ששיתפו איתכם בקישור (למשל הצלם). התמונות מועתקות לאירוע, וכשמתווספות לאלבום
              תמונות חדשות לוחצים "עדכון" כדי להביא רק את החדשות.
            </p>
          </div>
        </div>

        {/* ------------------------------------------------ choose what to add */}
        {!job && (
          <>
            <fieldset className="space-y-3">
              <legend className="mb-2 font-semibold">מה רוצים להוסיף?</legend>
              {(
                [
                  { m: "own", icon: <FolderHeart className="size-5" />, title: "אלבום מהחשבון שלי", desc: "אלבום שיצרתם בעצמכם ב-Google Photos" },
                  { m: "shared", icon: <Link2 className="size-5" />, title: "אלבום ששיתפו איתי בקישור", desc: "קיבלתם קישור לאלבום, למשל מהצלם או מחברים" },
                  { m: "photos", icon: <Images className="size-5" />, title: "תמונות בודדות", desc: "בוחרים תמונות מסוימות ומכניסים אותן לאלבום באירוע" },
                ] as const
              ).map((o) => (
                <label
                  key={o.m}
                  className={cx(
                    "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition-colors duration-200",
                    mode === o.m ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                  )}
                >
                  <input type="radio" name="import-mode" checked={mode === o.m} onChange={() => choose(o.m)} className="size-5 shrink-0 accent-[var(--primary)]" />
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary" aria-hidden>
                    {o.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{o.title}</span>
                    <span className="block text-sm text-muted-fg">{o.desc}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {mode === "own" && (
              <ol className="space-y-5 border-t border-border pt-5">
                <li className="flex gap-3">
                  <StepDot n={1} done={!!albumName.trim()} />
                  <div className="min-w-0 flex-1">{nameField}</div>
                </li>
                <li className="flex gap-3">
                  <StepDot n={2} done={false} />
                  <div className="min-w-0 flex-1 space-y-3">
                    <p className="font-semibold">בוחרים את האלבום בחלון של Google</p>
                    {pickButton}
                  </div>
                </li>
              </ol>
            )}

            {mode === "shared" && (
              <ol className="space-y-5 border-t border-border pt-5">
                <li className="flex gap-3">
                  <StepDot n={1} done={linkOk} />
                  <div className="min-w-0 flex-1 space-y-3">
                    <Field label="מדביקים את הקישור לאלבום" htmlFor="link-url" error={linkError} hint="הקישור שקיבלתם בוואטסאפ או במייל">
                      <input
                        id="link-url"
                        type="url"
                        inputMode="url"
                        dir="ltr"
                        autoComplete="off"
                        placeholder="https://photos.app.goo.gl/…"
                        className={cx(inputClass, linkError && "border-destructive")}
                        value={link}
                        onChange={(e) => {
                          setLink(e.target.value);
                          setLinkOpened(false);
                        }}
                        onBlur={() => setLinkTouched(true)}
                        aria-invalid={!!linkError || undefined}
                      />
                    </Field>
                  </div>
                </li>
                <li className="flex gap-3">
                  <StepDot n={2} done={linkOpened} />
                  <div className="min-w-0 flex-1 space-y-3">
                    <p className="font-semibold">מצטרפים לאלבום ב-Google Photos</p>
                    <p className="text-muted-fg">
                      בדף שנפתח לוחצים על <strong className="text-fg">הצטרפות</strong> (Join). ככה האלבום מופיע גם בחשבון שלכם ואפשר לבחור אותו. אין כפתור כזה? כנראה
                      שכבר הצטרפתם, וממשיכים.
                    </p>
                    <Button
                      variant="outline"
                      disabled={!linkOk}
                      onClick={() => {
                        window.open(link.trim(), "_blank", "noopener");
                        setLinkOpened(true);
                      }}
                      icon={<ExternalLink className="size-4" aria-hidden />}
                    >
                      פתיחת האלבום
                    </Button>
                  </div>
                </li>
                <li className="flex gap-3">
                  <StepDot n={3} done={!!albumName.trim()} />
                  <div className="min-w-0 flex-1">{nameField}</div>
                </li>
                <li className="flex gap-3">
                  <StepDot n={4} done={false} />
                  <div className="min-w-0 flex-1 space-y-3">
                    <p className="font-semibold">בוחרים את האלבום בחלון של Google</p>
                    {pickButton}
                  </div>
                </li>
              </ol>
            )}

            {mode === "photos" && (
              <div className="space-y-4 border-t border-border pt-5">
                <fieldset className="space-y-3">
                  <legend className="mb-2 font-semibold">לאיזה אלבום באירוע להכניס?</legend>
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
                <Button
                  size="lg"
                  variant="accent"
                  loading={busy === "photos"}
                  disabled={target === "new" && !newName.trim()}
                  onClick={() => startPicking(target === "new" ? { newAlbumName: newName } : { albumId: target }, "photos")}
                  icon={<ExternalLink className="size-5" aria-hidden />}
                >
                  פתיחת Google Photos לבחירה
                </Button>
              </div>
            )}

            {mode && (
              <p className="text-sm text-muted-fg">
                הפריטים מועתקים לאלבום האירוע ב-Google, ולכן תופסים מקום נוסף בחשבון ({quality === "original" ? "איכות מקורית" : "איכות דחוסה, לפי הגדרות האירוע"}).
              </p>
            )}
          </>
        )}

        {/* ------------------------------------------------ job progress */}
        {job?.status === "picking" && (
          <div className="space-y-4 rounded-2xl bg-muted p-5" aria-live="polite">
            <p className="flex items-center gap-2 text-lg font-semibold">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              מחכים שתסיימו לבחור ב-Google Photos…
            </p>
            {job.linked ? (
              <ol className="list-inside list-decimal space-y-1 text-base">
                <li>
                  בחלון של Google עוברים ל<strong>אלבומים</strong> (Albums) ופותחים את האלבום
                  {jobAlbum?.link?.syncedAt ? <> שקישרתם ל"{jobAlbum.name}"</> : <> שרוצים לחבר</>}.
                </li>
                <li>
                  לוחצים <strong>בחירת הכל</strong> (Select all). מה שכבר נמצא באירוע ידולג.
                </li>
                <li>
                  לוחצים <strong>Done</strong> למעלה וחוזרים לכאן.
                </li>
              </ol>
            ) : (
              <ol className="list-inside list-decimal space-y-1 text-base">
                <li>בחלון של Google מסמנים את התמונות והסרטונים (עד 2,000 בכל פעם).</li>
                <li>
                  לוחצים על <strong>Done</strong> למעלה.
                </li>
                <li>חוזרים לכאן - הייבוא יתחיל אחרי אישור.</li>
              </ol>
            )}
            {job.linked && <p className="text-sm text-muted-fg">אפשר לבחור עד 2,000 פריטים בכל פעם. באלבום גדול יותר מעדכנים שוב, וכל פעם נכנסים הפריטים הבאים.</p>}
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
                ההעתקה תתפוס בערך {formatBytes(job.estBytes)} נוספים בחשבון Google שלך
                {remaining !== null && <> · נשארו לך {formatBytes(remaining)}</>}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {toImport > 0 ? (
                <Button size="lg" variant="accent" onClick={() => run(job)}>
                  העתקה של {toImport.toLocaleString("he-IL")} פריטים לאירוע
                </Button>
              ) : (
                <p className="font-semibold">אין מה להעתיק - הכל כבר באירוע.</p>
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
                להמשיך את ההעתקה
              </Button>
            )}
          </div>
        )}

        {job && ["done", "error", "cancelled"].includes(job.status) && (
          <div className={cx("space-y-3 rounded-2xl p-5", job.status === "done" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900")}>
            <p className="flex items-center gap-2 text-lg font-bold">
              {job.status === "done" ? <CheckCircle2 className="size-5" aria-hidden /> : <AlertTriangle className="size-5" aria-hidden />}
              {job.status === "done" ? (job.linked ? "האלבום מעודכן" : "הייבוא הסתיים") : job.status === "cancelled" ? "בוטל" : "ההעתקה נעצרה"}
            </p>
            <p>
              נוספו {job.done.toLocaleString("he-IL")} פריטים
              {job.already > 0 && <> · {job.already.toLocaleString("he-IL")} כבר היו באירוע</>}
              {job.failed > 0 && <> · {job.failed.toLocaleString("he-IL")} לא הצליחו (אפשר לנסות שוב)</>}
            </p>
            {job.status === "done" && job.linked && <p>כשיתווספו לאלבום תמונות חדשות ב-Google Photos, לוחצים "עדכון" ברשימת האלבומים המקושרים.</p>}
            {job.status === "error" && <p className="text-sm">ייתכן שחלון הבחירה של Google פג. אפשר פשוט להתחיל שוב - מה שכבר הועתק ידולג.</p>}
            <Button variant="outline" onClick={reset}>
              סגירה
            </Button>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------ linked albums */}
      {linked.length > 0 && (
        <section aria-labelledby="linked-title" className="space-y-3">
          <h2 id="linked-title" className="text-lg font-bold">
            אלבומים מקושרים
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {linked.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary" aria-hidden>
                  <Link2 className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{a.name}</p>
                  <p className="text-sm text-muted-fg">
                    {a.count.toLocaleString("he-IL")} פריטים · {syncedLabel(a.link!.syncedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {a.link!.sourceUrl && (
                    <a
                      href={a.link!.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex size-11 items-center justify-center rounded-full text-muted-fg transition-colors duration-200 hover:bg-fg/5 hover:text-fg"
                      aria-label={`פתיחת האלבום ${a.name} ב-Google Photos`}
                      title="פתיחה ב-Google Photos"
                    >
                      <ExternalLink className="size-5" aria-hidden />
                    </a>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!job || (!!busy && busy !== a.id)}
                    loading={busy === a.id}
                    onClick={() => startPicking({ albumId: a.id }, a.id)}
                    icon={<RefreshCw className="size-4" aria-hidden />}
                    aria-label={`עדכון תמונות חדשות באלבום ${a.name}`}
                  >
                    עדכון
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-fg">"עדכון" פותח שוב את החלון של Google. בוחרים שם את אותו אלבום, ורק התמונות החדשות מועתקות.</p>
        </section>
      )}
    </div>
  );
}
