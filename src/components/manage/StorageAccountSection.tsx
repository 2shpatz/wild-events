import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, ExternalLink, Info, Loader2, PauseCircle } from "lucide-react";
import { api, ApiError, errorMessage } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import type { ManageEvent, MigrationDTO, MigrationEstimate, StorageAccountDTO } from "../../../shared/types";
import { StorageMeter } from "../StorageMeter";
import { StorageAccountPicker } from "../StorageAccountPicker";
import { Button, Modal, cx, useToast } from "../ui";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const seenKey = (id: string) => `migration-seen:${id}`;

/**
 * Manage page: which Google account holds the event, its storage, and (owner only) moving the event
 * to another account. The copy loop lives here (not in the dialog) so closing the dialog keeps it going.
 */
export function StorageAccountSection({ event, onChanged }: { event: ManageEvent; onChanged: () => void }) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [preselect, setPreselect] = useState<string | null>(null);
  const [job, setJob] = useState<MigrationDTO | null>(event.migration);
  const [running, setRunning] = useState(false);
  const [loopError, setLoopError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [, setSeen] = useState(0);
  const stop = useRef(false);
  const code = event.code;
  const manageNext = `/${code}/manage`;

  useEffect(() => {
    if (!running) setJob(event.migration);
  }, [event.migration, running]);

  // Back from Google: connected a new account to move to, or reconnected the event's account.
  useEffect(() => {
    const connected = params.get("connected");
    const self = params.get("account") === "self";
    const err = params.get("account_error");
    if (!connected && !self && !err) return;
    const migrate = params.get("migrate") === "1";
    const tab = params.get("tab");
    setParams(tab ? { tab } : {}, { replace: true });
    if (err) toast("לא הצלחנו לחבר את החשבון. אפשר לנסות שוב.", "error");
    else if (migrate) {
      if (connected) setPreselect(connected);
      if (self) toast("זה החשבון שאיתו נכנסת לאתר. הוא מופיע ברשימה בשם \"החשבון הפרטי שלך\".", "info");
      setOpen(true);
    } else {
      toast("החשבון חובר מחדש", "success");
      onChanged();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loop = useCallback(
    async (j: MigrationDTO) => {
      stop.current = false;
      setRunning(true);
      setLoopError(null);
      let current = j;
      let failures = 0;
      try {
        while (!stop.current && current.status === "running") {
          try {
            const r = await api<MigrationDTO & { waiting?: boolean }>(`/e/${code}/migrate/${current.id}/next`, { method: "POST" });
            current = r;
            setJob(r);
            setWaiting(!!r.waiting && r.remaining === 0);
            failures = 0;
            if (r.waiting) await sleep(4000);
          } catch (e) {
            failures++;
            if (failures >= 5) {
              setLoopError(errorMessage(e));
              return;
            }
            await sleep(2000 * failures);
          }
        }
      } finally {
        setRunning(false);
        if (current.status !== "running") onChanged();
      }
    },
    [code, onChanged],
  );

  useEffect(() => () => void (stop.current = true), []);

  const start = async (to: string) => {
    const j = await api<MigrationDTO>(`/e/${code}/migrate`, { method: "POST", json: { to } });
    setJob(j);
    onChanged();
    loop(j);
  };

  const cancel = async () => {
    if (!job) return;
    stop.current = true;
    try {
      setJob(await api<MigrationDTO>(`/e/${code}/migrate/${job.id}/cancel`, { method: "POST" }));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    onChanged();
  };

  const isRunning = job?.status === "running";
  const total = job ? job.done + job.remaining : 0;
  const pct = job && total ? Math.round((job.done / total) * 100) : 0;
  const showResult = job && !isRunning && !localStorage.getItem(seenKey(job.id));
  const dismiss = () => {
    if (job) localStorage.setItem(seenKey(job.id), "1");
    setSeen((n) => n + 1);
  };

  return (
    <>
      <StorageMeter
        endpoint={`/e/${code}/manage/storage`}
        originalQuality={event.quality === "original"}
        googleAlbumUrl={event.googleAlbumUrl}
        account={event.storageAccount}
        reconnectNext={event.isOwner ? manageNext : undefined}
        footer={
          event.isOwner && (
            <div className="space-y-3 border-t border-border pt-4">
              {isRunning ? (
                <MoveProgress job={job!} pct={pct} running={running} waiting={waiting} error={loopError} onResume={() => loop(job!)} onCancel={cancel} onOpen={() => setOpen(true)} />
              ) : (
                <>
                  {showResult && <MoveResult job={job!} onDismiss={dismiss} />}
                  <Button variant="outline" size="sm" icon={<ArrowLeftRight className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
                    העברת האירוע לחשבון Google אחר
                  </Button>
                </>
              )}
            </div>
          )
        }
      />
      {event.isOwner && (
        <MoveDialog
          open={open}
          onClose={() => setOpen(false)}
          event={event}
          preselect={preselect}
          job={isRunning ? job : null}
          pct={pct}
          onStart={async (to) => {
            await start(to);
          }}
          onCancel={cancel}
          connectNext={`${manageNext}?migrate=1`}
        />
      )}
    </>
  );
}

function MoveProgress({
  job,
  pct,
  running,
  waiting,
  error,
  onResume,
  onCancel,
  onOpen,
}: {
  job: MigrationDTO;
  pct: number;
  running: boolean;
  waiting: boolean;
  error: string | null;
  onResume: () => void;
  onCancel: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl bg-muted p-4" role="status" aria-live="polite">
      <p className="flex items-center gap-2 font-bold">
        {running ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <PauseCircle className="size-5 text-amber-600" aria-hidden />}
        {!running ? "ההעברה נעצרה באמצע" : waiting ? "כמעט סיימנו - מחכים שהעלאה אחרונה של אורח תסתיים…" : "מעבירים את התמונות לחשבון החדש…"}
      </p>
      <ProgressBar pct={pct} />
      <p className="text-sm">
        הועברו {job.done.toLocaleString("he-IL")} מתוך {(job.done + job.remaining).toLocaleString("he-IL")}
        {job.toEmail && (
          <>
            {" "}
            · אל <span dir="ltr">{job.toEmail}</span>
          </>
        )}
      </p>
      {running ? (
        <p className="text-sm font-semibold">השאירו את הדף פתוח עד הסוף. האורחים יכולים לצפות בתמונות, אבל ההעלאות סגורות בינתיים.</p>
      ) : (
        <p className="text-sm font-semibold">
          {error ? `${error} ` : ""}ההעלאות של האורחים עדיין סגורות. ממשיכים מאותה נקודה, בלי להעתיק שוב את מה שכבר עבר.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!running && (
          <Button size="sm" onClick={onResume}>
            להמשיך את ההעברה
          </Button>
        )}
        {running && (
          <Button size="sm" variant="ghost" onClick={onOpen}>
            פרטים
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onCancel}>
          לעצור ולפתוח את ההעלאות
        </Button>
      </div>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-card" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="התקדמות ההעברה">
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

function OldCopiesNote({ url }: { url: string | null }) {
  return (
    <div className="space-y-1">
      <p>
        <strong>התמונות הישנות נשארו גם בחשבון הקודם</strong> ותופסות שם מקום. Google לא מאפשרת לאתרים למחוק תמונות, אז את זה עושים לבד:
        נכנסים ל-Google Photos עם החשבון הקודם, פותחים את אלבומי האירוע, בוחרים את התמונות ומוחקים.
      </p>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline">
          האלבום הישן ב-Google Photos <ExternalLink className="size-4" aria-hidden />
        </a>
      )}
    </div>
  );
}

function MoveResult({ job, onDismiss }: { job: MigrationDTO; onDismiss: () => void }) {
  const ok = job.status === "done";
  const msg =
    job.status === "done"
      ? "האירוע עבר לחשבון החדש. תמונות חדשות נשמרות בו מעכשיו, וההעלאות נפתחו שוב."
      : job.status === "cancelled"
        ? "ההעברה נעצרה. ההעלאות נפתחו שוב. מה שכבר הועבר נשאר בחשבון החדש וממשיך להופיע באתר."
        : job.error === "storage_full"
          ? "ההעברה נעצרה כי נגמר המקום בחשבון החדש. ההעלאות נפתחו שוב. אפשר לפנות מקום ולהתחיל שוב, ההעברה תמשיך מאותה נקודה."
          : job.error === "reauth"
            ? "ההעברה נעצרה כי החיבור לאחד החשבונות פג. ההעלאות נפתחו שוב. אחרי חיבור מחדש אפשר להתחיל שוב."
            : "ההעברה נעצרה בגלל תקלה. ההעלאות נפתחו שוב. אפשר להתחיל שוב והיא תמשיך מאותה נקודה.";
  return (
    <div role="status" className={cx("space-y-3 rounded-2xl p-4", ok ? "bg-emerald-50 text-emerald-950" : "bg-amber-50 text-amber-950")}>
      <p className="flex items-start gap-2 font-bold">
        {ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />}
        {msg}
      </p>
      {job.failed > 0 && (
        <p className="text-sm">
          {job.failed.toLocaleString("he-IL")} פריטים לא הצליחו לעבור. הם עדיין מוצגים באתר מהחשבון הקודם, ואפשר לנסות להעביר שוב.
        </p>
      )}
      {ok && <OldCopiesNote url={job.oldAlbumUrl} />}
      <Button size="sm" variant="ghost" onClick={onDismiss}>
        הבנתי
      </Button>
    </div>
  );
}

function MoveDialog({
  open,
  onClose,
  event,
  preselect,
  job,
  pct,
  onStart,
  onCancel,
  connectNext,
}: {
  open: boolean;
  onClose: () => void;
  event: ManageEvent;
  preselect: string | null;
  job: MigrationDTO | null;
  pct: number;
  onStart: (to: string) => Promise<void>;
  onCancel: () => void;
  connectNext: string;
}) {
  const toast = useToast();
  const [target, setTarget] = useState<StorageAccountDTO | null>(null);
  const [targetId, setTargetId] = useState<string | null>(preselect);
  const [ack, setAck] = useState(false);
  const [est, setEst] = useState<(MigrationEstimate & { free: number | null }) | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (preselect) setTargetId(preselect);
  }, [preselect]);

  useEffect(() => {
    setEst(null);
    if (!targetId || !open) return;
    let live = true;
    api<MigrationEstimate & { free: number | null }>(`/e/${event.code}/migrate/estimate?to=${encodeURIComponent(targetId)}`)
      .then((r) => live && setEst(r))
      .catch((e) => live && !(e instanceof ApiError && e.code === "bad_account") && toast(errorMessage(e), "error"));
    return () => {
      live = false;
    };
  }, [targetId, open, event.code, toast]);

  const tooSmall = !!est && est.free !== null && est.bytes > est.free;
  const canStart = !!target && !!est && !tooSmall && (!target.personal || ack);

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      size="lg"
      title={job ? "מעבירים את האירוע" : "העברת האירוע לחשבון Google אחר"}
      footer={
        job ? (
          <>
            <Button variant="ghost" onClick={onCancel}>
              לעצור את ההעברה
            </Button>
            <Button onClick={onClose}>סגירה (ההעברה ממשיכה)</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              ביטול
            </Button>
            <Button
              variant="accent"
              loading={busy}
              disabled={!canStart}
              onClick={async () => {
                setBusy(true);
                try {
                  await onStart(target!.id);
                } catch (e) {
                  toast(errorMessage(e), "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              להתחיל את ההעברה
            </Button>
          </>
        )
      }
    >
      {job ? (
        <div className="space-y-4 text-base leading-relaxed" role="status" aria-live="polite">
          <ProgressBar pct={pct} />
          <p className="font-semibold">
            הועברו {job.done.toLocaleString("he-IL")} מתוך {(job.done + job.remaining).toLocaleString("he-IL")} ({pct}%)
          </p>
          <p>השאירו את הדף הזה פתוח עד שההעברה מסתיימת. אם הוא נסגר, בכניסה הבאה אפשר להמשיך מאותה נקודה.</p>
          <p className="rounded-2xl bg-muted p-4">
            בינתיים האורחים רואים את כל התמונות כרגיל, ובמקום כפתור ההעלאה מופיעה הודעה שהאתר בתחזוקה קצרה.
          </p>
        </div>
      ) : (
        <div className="space-y-5 text-base leading-relaxed">
          <div className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-amber-950">
            <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
            <ul className="list-disc space-y-1 ps-4">
              <li>כל התמונות, הסרטונים והשירים יועתקו לחשבון החדש. האלבומים, האורחים, הקישור וה-QR נשארים בדיוק אותו דבר.</li>
              <li>בזמן ההעברה ההעלאות של האורחים סגורות (הם יראו "האתר בתחזוקה קצרה"). עדיף לא לעשות את זה באמצע האירוע.</li>
              <li>צריך להשאיר את הדף פתוח עד הסוף. אירוע גדול יכול לקחת עד שעה.</li>
              <li>העותקים בחשבון הקודם לא נמחקים (Google לא מאפשרת), כדי לפנות שם מקום מוחקים אותם ידנית אחרי ההעברה.</li>
            </ul>
          </div>

          {est && (
            <p className="rounded-2xl bg-muted p-4 font-semibold">
              יועברו {est.items.toLocaleString("he-IL")} תמונות וסרטונים{est.tracks ? ` ו-${est.tracks} שירים` : ""}, בערך {formatBytes(est.bytes)}.
              {est.free !== null && <> בחשבון שנבחר פנויים {formatBytes(est.free)}.</>}
            </p>
          )}

          <StorageAccountPicker
            value={targetId}
            onChange={(id, a) => {
              setTargetId(id);
              setTarget(a);
              if (!a.personal) setAck(false);
            }}
            quality={event.quality}
            personalAck={ack}
            onPersonalAck={setAck}
            connectNext={connectNext}
            excludeId={event.storageAccount.id}
            neededBytes={est?.bytes}
            label="לאיזה חשבון להעביר?"
          />
        </div>
      )}
    </Modal>
  );
}
