import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  CloudDownload,
  Copy,
  ExternalLink,
  FolderHeart,
  Images,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  UserPlus,
} from "lucide-react";
import { api, errorMessage } from "../../lib/api";
import { formatBytes, formatDay, formatTime } from "../../lib/format";
import type { ImportJobDTO, ManageAlbum, StorageAccountDTO, StorageAccountRef, StorageInfo } from "../../../shared/types";
import { StepDot } from "../Stepper";
import { connectHref } from "../StorageAccountPicker";
import { UnverifiedGuide } from "../UnverifiedGuide";
import { Button, Card, Field, LinkButton, cx, inputClass, useToast } from "../ui";

const jobKey = (code: string) => `lea:import:${code}`;
const sourceKey = (code: string) => `lea:import-source:${code}`;

/**
 * Touch devices (iPhone/Android) open the picker in the Google Photos app or a separate tab: no "/autoclose"
 * there (Google recommends it for desktop web flows only).
 */
const isTouch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
const pickerHref = (uri: string) => (isTouch() ? uri : `${uri}/autoclose`);

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
  eventAccount,
  onImported,
}: {
  code: string;
  albums: ManageAlbum[];
  quality: "compressed" | "original";
  /** the account that holds the event (the copies always go there) */
  eventAccount: StorageAccountRef;
  onImported: () => void;
}) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [accounts, setAccounts] = useState<StorageAccountDTO[] | null>(null);
  const [source, setSource] = useState<string>(() => localStorage.getItem(sourceKey(code)) || "self");
  const [guide, setGuide] = useState<{ hint: string | null } | null>(null);
  const [opened, setOpened] = useState(false);
  const [checking, setChecking] = useState(false);
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

  // The Google accounts the photos can come from.
  useEffect(() => {
    api<{ accounts: StorageAccountDTO[] }>("/owner/accounts")
      .then((r) => setAccounts(r.accounts))
      .catch(() => setAccounts([]));
  }, []);

  // Back from Google after connecting another account as the photo source.
  useEffect(() => {
    if (params.get("source") !== "1") return;
    const connected = params.get("connected");
    const self = params.get("account") === "self";
    const err = params.get("account_error");
    setParams({ tab: "import" }, { replace: true });
    if (err) toast("לא הצלחנו להתחבר לחשבון. אפשר לנסות שוב.", "error");
    else if (connected) {
      setSource(connected);
      toast("החשבון חובר ונבחר. עכשיו בוחרים מה להוסיף.", "success");
    } else if (self) {
      setSource("self");
      toast("זה החשבון שאיתו נכנסת לאתר, והוא כבר מופיע ברשימה.", "info");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(sourceKey(code), source);
  }, [source, code]);

  // A remembered account that was removed or lost its connection: back to the login account.
  useEffect(() => {
    if (accounts?.length && !accounts.some((a) => a.id === source && a.connected)) setSource("self");
  }, [accounts, source]);

  const inFlight = useRef(false);
  const check = useCallback(async () => {
    // One check at a time: coming back fires both "focus" and "visibilitychange".
    if (!job || job.status !== "picking" || inFlight.current) return;
    inFlight.current = true;
    try {
      const j = await api<ImportJobDTO>(`/e/${code}/import/${job.id}`);
      setJob(j);
      if (j.status === "done") onImportedRef.current(); // nothing new to copy: the sync time changed
      return j;
    } catch {
      return null; // keep polling
    } finally {
      inFlight.current = false;
    }
  }, [job, code]);

  // Poll while the user is picking in Google Photos, and check right away when they come back
  // (phones pause timers in background tabs).
  useEffect(() => {
    if (job?.status !== "picking") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") check();
    }, 3000);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [job?.status, check]);

  const checkNow = async () => {
    setChecking(true);
    const j = await check();
    setChecking(false);
    if (j?.status === "picking") toast('Google עוד לא קיבלה את הבחירה. בחלון של Google לוחצים "Done" (סיום) ואז חוזרים לכאן.', "info");
  };

  useEffect(() => {
    if (job?.status === "listed" && !storage) api<StorageInfo>(`/e/${code}/manage/storage`).then(setStorage).catch(() => {});
  }, [job?.status, storage, code]);

  const choose = (m: Mode) => {
    setMode(m);
    setAlbumName(m === "shared" ? "אלבום משותף" : "");
  };

  /**
   * Step 1 only creates the Google picker session. The picker itself opens from a real link the owner taps
   * on the next screen: a direct tap is what iPhones (Safari, home-screen app, Google Photos app) need.
   */
  const startPicking = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    try {
      const j = await api<ImportJobDTO>(`/e/${code}/import`, { method: "POST", json: body });
      localStorage.setItem(jobKey(code), j.id);
      setOpened(false);
      setJob(j);
      if (body.newAlbumName) onImported(); // the new album shows up in the lists right away
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async (uri: string) => {
    try {
      await navigator.clipboard.writeText(uri);
      toast("הקישור הועתק. מדביקים אותו בשורת הכתובת של הדפדפן.", "success");
    } catch {
      window.prompt("מעתיקים את הקישור:", uri);
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
    setOpened(false);
  };

  const remaining = storage?.limit ? storage.limit - storage.usage : null;
  const toImport = job ? job.total - job.already : 0;
  const processed = job ? job.done + job.failed : 0;
  const jobAlbum = job ? albums.find((a) => a.id === job.albumId) : undefined;
  const linkOk = isAlbumLink(link);
  const sameAsEvent = (id: string) => id === eventAccount.id;
  // The login account first, then the event's account, then the other connected accounts.
  const sourceList: StorageAccountDTO[] = accounts?.length
    ? [...accounts].sort((a, b) => rank(a) - rank(b))
    : [{ id: "self", email: null, name: null, picture: null, personal: true, connected: true, storage: null, eventsCount: 0 }];
  function rank(a: StorageAccountDTO) {
    return a.id === "self" ? 0 : sameAsEvent(a.id) ? 1 : 2;
  }
  const emailOf = (id: string) => accounts?.find((a) => a.id === id)?.email ?? (id === eventAccount.id ? eventAccount.email : null);
  const usable = (id: string) => !accounts?.length || accounts.some((a) => a.id === id && a.connected);
  const connectNext = `/${code}/manage?tab=import&source=1`;
  const linkError = linkTouched && link.trim() && !linkOk ? "הקישור צריך להתחיל ב-https://photos.app.goo.gl/ או ב-https://photos.google.com/" : null;

  const pickButton = (
    <Button
      size="lg"
      variant="accent"
      loading={busy === "new-link"}
      disabled={!albumName.trim() || (mode === "shared" && !linkOk)}
      onClick={() =>
        startPicking(
          { newAlbumName: albumName.trim(), link: { sourceUrl: mode === "shared" ? link.trim() : null }, sourceAccount: source },
          "new-link",
        )
      }
      icon={<ChevronLeft className="size-5" aria-hidden />}
    >
      המשך לבחירת התמונות
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
              מכניסים לאירוע תמונות שכבר נמצאות ב-Google Photos: מאלבום שלכם, מאלבום ששיתפו איתכם (למשל הצלם), או תמונות בודדות. התמונות מועתקות לאירוע.
              כשמתווספות תמונות חדשות לאלבום שחיברתם, לוחצים "עדכון" ורק החדשות נכנסות.
            </p>
          </div>
        </div>

        {/* ------------------------------------------------ choose what to add */}
        {!job && (
          <>
            {/* ------------------------------------------------ which Google account to pick from */}
            <fieldset className="space-y-3">
              <legend className="mb-1 font-semibold">מאיזה חשבון Google לוקחים את התמונות?</legend>
              <p className="text-sm text-muted-fg">
                בוחרים את החשבון שבו נמצאות התמונות. ההעתקות תמיד נשמרות בחשבון של האירוע
                {eventAccount.email && (
                  <>
                    {" "}
                    (<span dir="ltr">{eventAccount.email}</span>)
                  </>
                )}
                .
              </p>
              {!accounts && <p className="text-muted-fg">טוען חשבונות…</p>}
              {accounts &&
                sourceList.map((a) => (
                  <label
                    key={a.id}
                    className={cx(
                      "flex min-h-14 items-center gap-3 rounded-xl border-2 px-4 py-3 transition-colors duration-200",
                      !a.connected
                        ? "cursor-not-allowed border-border opacity-80"
                        : source === a.id
                          ? "cursor-pointer border-primary bg-primary/5"
                          : "cursor-pointer border-border hover:border-primary/40",
                    )}
                  >
                    <input
                      type="radio"
                      name="import-source"
                      checked={source === a.id}
                      disabled={!a.connected}
                      onChange={() => setSource(a.id)}
                      className="size-5 shrink-0 accent-[var(--primary)]"
                    />
                    {a.picture ? (
                      <img src={a.picture} alt="" referrerPolicy="no-referrer" className="size-10 shrink-0 rounded-full bg-muted" />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-bold" aria-hidden>
                        {(a.name || a.email || "?").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        {a.id === "self" ? "החשבון שאיתו נכנסת לאתר" : sameAsEvent(a.id) ? "החשבון של האירוע" : a.name || "חשבון נוסף"}
                      </span>
                      {a.email && (
                        <span className="block truncate text-sm text-muted-fg" dir="ltr">
                          {a.email}
                        </span>
                      )}
                      {a.id === "self" && sameAsEvent("self") && (
                        <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-fg">גם החשבון של האירוע</span>
                      )}
                      {!a.connected && <span className="block text-sm font-semibold text-destructive">החיבור לחשבון הזה פג</span>}
                    </span>
                    {!a.connected && (
                      <Button variant="outline" size="sm" onClick={() => setGuide({ hint: a.email })}>
                        חיבור מחדש
                      </Button>
                    )}
                  </label>
                ))}
              <button
                type="button"
                onClick={() => setGuide({ hint: null })}
                className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-border px-4 py-3 text-start transition-colors duration-200 hover:border-primary/40"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
                  <UserPlus className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">התחברות עם חשבון Google אחר</span>
                  <span className="block text-sm text-muted-fg">למשל חשבון של בן/בת הזוג או של הצלם. החשבון יישמר ברשימת החשבונות שלך באתר.</span>
                </span>
              </button>
            </fieldset>

            <fieldset className="space-y-3 border-t border-border pt-5">
              <legend className="mb-2 font-semibold">מה רוצים להוסיף?</legend>
              {(
                [
                  { m: "own", icon: <FolderHeart className="size-5" />, title: "אלבום מהחשבון שלי", desc: "אלבום שנמצא בחשבון שבחרתם. בוחרים את התמונות שבו, ואפשר לעדכן אחר כך" },
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
                    <p className="font-semibold">ממשיכים לבחירה ב-Google Photos</p>
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
                      בדף שנפתח לוחצים על <strong className="text-fg">הצטרפות</strong> (Join), כשאתם מחוברים לחשבון שבחרתם למעלה
                      {emailOf(source) && (
                        <>
                          {" "}
                          (<span dir="ltr">{emailOf(source)}</span>)
                        </>
                      )}
                      . ככה האלבום מופיע גם בחשבון הזה ואפשר לבחור ממנו. אין כפתור כזה? כנראה
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
                    <p className="font-semibold">ממשיכים לבחירה ב-Google Photos</p>
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
                    <label key={a.id} className={cx("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-4", target === a.id ? "border-primary" : "border-border")}>
                      <input type="radio" name="import-target" checked={target === a.id} onChange={() => setTarget(a.id)} className="size-5 accent-[var(--primary)]" />
                      {a.name}
                    </label>
                  ))}
                  <label className={cx("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-4", target === "new" ? "border-primary" : "border-border")}>
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
                  onClick={() =>
                    startPicking(target === "new" ? { newAlbumName: newName, sourceAccount: source } : { albumId: target, sourceAccount: source }, "photos")
                  }
                  icon={<ChevronLeft className="size-5" aria-hidden />}
                >
                  המשך לבחירת התמונות
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
        {job?.status === "picking" && job.pickerUri && (
          <div className="space-y-5 rounded-2xl bg-muted p-5">
            <div className="space-y-1">
              <p className="text-lg font-bold">{opened ? "בוחרים ב-Google Photos" : "עכשיו פותחים את Google Photos"}</p>
              {emailOf(job.source) && (
                <p className="text-base">
                  החשבון: <strong dir="ltr">{emailOf(job.source)}</strong>. אם Google מבקשת לבחור חשבון, בוחרים בו.
                </p>
              )}
            </div>

            {job.linked ? (
              <div className="space-y-3">
                <p className="rounded-xl bg-card p-3 text-base">
                  Google לא מאפשרת לאתרים לבחור אלבום שלם בלחיצה אחת, ולכן בוחרים את התמונות שבתוך האלבום. מה שכבר נמצא באירוע ידולג.
                </p>
                <ol className="space-y-2 text-base">
                  <li className="flex gap-3">
                    <StepDot n={1} done={false} />
                    <span className="pt-0.5">
                      בחלון של Google לוחצים על החיפוש <Search className="inline size-4 align-[-2px]" aria-label="זכוכית מגדלת" /> ומקלידים את שם האלבום
                      {jobAlbum?.link?.syncedAt ? <> שקישרתם ל"{jobAlbum.name}"</> : null}.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <StepDot n={2} done={false} />
                    <span className="pt-0.5">פותחים את האלבום ומסמנים את כל התמונות והסרטונים שבו.</span>
                  </li>
                  <li className="flex gap-3">
                    <StepDot n={3} done={false} />
                    <span className="pt-0.5">
                      לוחצים <strong>Done</strong> (סיום) וחוזרים לכאן.
                    </span>
                  </li>
                </ol>
                <p className="text-sm text-muted-fg">אפשר לבחור עד 2,000 פריטים בכל פעם. באלבום גדול יותר מעדכנים שוב, וכל פעם נכנסים הפריטים הבאים.</p>
              </div>
            ) : (
              <ol className="space-y-2 text-base">
                <li className="flex gap-3">
                  <StepDot n={1} done={false} />
                  <span className="pt-0.5">בחלון של Google מסמנים את התמונות והסרטונים (עד 2,000 בכל פעם).</span>
                </li>
                <li className="flex gap-3">
                  <StepDot n={2} done={false} />
                  <span className="pt-0.5">
                    לוחצים <strong>Done</strong> (סיום) וחוזרים לכאן. הייבוא יתחיל אחרי אישור.
                  </span>
                </li>
              </ol>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <LinkButton
                href={pickerHref(job.pickerUri)}
                target="_blank"
                rel="noopener"
                size="lg"
                variant={opened ? "outline" : "accent"}
                onClick={() => setOpened(true)}
                icon={<ExternalLink className="size-5" aria-hidden />}
              >
                {opened ? "פתיחה מחדש של Google Photos" : "פתיחת Google Photos"}
              </LinkButton>
              {opened && (
                <Button size="lg" variant="accent" loading={checking} onClick={checkNow} icon={<CheckCircle2 className="size-5" aria-hidden />}>
                  סיימתי לבחור
                </Button>
              )}
            </div>

            {opened && (
              <p className="flex items-center gap-2 text-muted-fg" aria-live="polite">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                מחכים שתסיימו לבחור ב-Google Photos…
              </p>
            )}

            <div className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
              <Button variant="ghost" size="sm" onClick={() => copyLink(job.pickerUri!)} icon={<Copy className="size-4" aria-hidden />}>
                החלון לא נפתח? העתקת הקישור
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
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
                  {emailOf(a.link!.sourceAccount) && (
                    <p className="truncate text-sm text-muted-fg">
                      מתוך: <span dir="ltr">{emailOf(a.link!.sourceAccount)}</span>
                    </p>
                  )}
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
                    // The account the album came from; if it was removed or disconnected, the one chosen above.
                    onClick={() =>
                      startPicking({ albumId: a.id, sourceAccount: usable(a.link!.sourceAccount) ? a.link!.sourceAccount : source }, a.id)
                    }
                    icon={<RefreshCw className="size-4" aria-hidden />}
                    aria-label={`עדכון תמונות חדשות באלבום ${a.name}`}
                  >
                    עדכון
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-fg">"עדכון" פותח שוב את Google Photos. בוחרים שם שוב את התמונות של אותו אלבום, ורק החדשות מועתקות.</p>
        </section>
      )}

      <UnverifiedGuide
        open={!!guide}
        onClose={() => setGuide(null)}
        href={connectHref(connectNext, guide?.hint)}
        firstStep={guide?.hint ? <>בוחרים את החשבון <span dir="ltr">{guide.hint}</span></> : 'בוחרים את החשבון שבו נמצאות התמונות (אם הוא לא מופיע: "שימוש בחשבון אחר")'}
      />
    </div>
  );
}
