// Site admin: versions and updates ("עדכונים" tab, the banner above the tabs, and the Deploy Hook form that the
// setup wizard reuses). Release notes are plain text from release-notes.json: rendered as text only, never as HTML.
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  History,
  Link2,
  RefreshCw,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import type { ReleaseEntry, UpdatesInfo } from "../../../shared/types";
import { api, errorMessage } from "../../lib/api";
import { formatDate, timeAgo } from "../../lib/format";
import { CF_WORKERS_URL, REPO_URL } from "../../lib/links";
import { Button, Card, ConfirmDialog, Field, cx, inputClass, useToast } from "../ui";
import { Toggle } from "../manage/Toggle";


const V = ({ v }: { v: string }) => (
  <bdi dir="ltr" className="font-semibold">
    {v}
  </bdi>
);

// ---------------------------------------------------------------- release notes

export function ReleaseList({ releases, compact }: { releases: ReleaseEntry[]; compact?: boolean }) {
  return (
    <div className="space-y-4">
      {releases.map((r) => (
        <article key={r.version} className="space-y-2">
          <h3 className={cx("flex flex-wrap items-baseline gap-x-2 font-bold", compact ? "text-base" : "text-lg")}>
            <span>
              גרסה <V v={r.version} />
            </span>
            <span className="text-sm font-normal text-muted-fg">{formatDate(r.date)}</span>
          </h3>
          {r.notes.length > 0 && (
            <ul className="list-disc space-y-1 ps-5 leading-relaxed">
              {r.notes.map((n, i) => (
                <li key={i} dir="auto" className="whitespace-pre-line">
                  {n}
                </li>
              ))}
            </ul>
          )}
          {r.adminAction && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-amber-900">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
              <span dir="auto" className="whitespace-pre-line">
                <strong>צריך לעשות בגרסה הזו: </strong>
                {r.adminAction}
              </span>
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- banner above the tabs

/** Shown above the admin tabs (not on the updates tab itself) when the site was just updated or a new version exists. */
export function UpdateBanner({ info, onOpen, onSeen }: { info: UpdatesInfo; onOpen: () => void; onSeen: () => void }) {
  if (info.justUpdated) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 border-emerald-300 bg-emerald-50 text-emerald-950">
        <p className="flex items-center gap-2 font-medium" role="status">
          <Sparkles className="size-5 shrink-0" aria-hidden />
          <span>
            האתר עודכן לגרסה <V v={info.current.version} />
          </span>
        </p>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={onOpen}>
            מה חדש
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 min-w-11 justify-center px-0"
            onClick={onSeen}
            aria-label="סגירת ההודעה על העדכון"
            icon={<X className="size-5" aria-hidden />}
          />
        </div>
      </Card>
    );
  }
  if (info.newer.length) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 border-sky-300 bg-sky-50 text-sky-950">
        <p className="flex items-center gap-2 font-medium" role="status">
          <Download className="size-5 shrink-0" aria-hidden />
          <span>
            יצאה גרסה חדשה: <V v={info.newer[0].version} />
            {info.autoCapable && info.auto.enabled && info.auto.hook.set ? " (תותקן לבד בלילה)" : ""}
          </span>
        </p>
        <Button variant="outline" size="sm" onClick={onOpen}>
          {info.autoCapable && info.auto.hook.set ? "מה חדש" : "מה חדש ואיך מעדכנים"}
        </Button>
      </Card>
    );
  }
  return null;
}

// ---------------------------------------------------------------- Deploy Hook (also used by the setup wizard)

/** Where to create the Deploy Hook in Cloudflare (official path: Worker > Settings > Builds > Deploy Hooks). */
export function HookSteps() {
  return (
    <ol className="list-decimal space-y-2 ps-5 leading-relaxed">
      <li>
        פותחים את{" "}
        <a href={CF_WORKERS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary underline">
          Workers & Pages ב-Cloudflare
          <ExternalLink className="size-4" aria-hidden />
          <span className="sr-only">(נפתח בחלון חדש)</span>
        </a>{" "}
        ובוחרים את האתר שלכם.
      </li>
      <li>
        <span dir="ltr">Settings</span> ← <span dir="ltr">Builds</span> ← <span dir="ltr">Deploy Hooks</span>.
      </li>
      <li>
        נותנים שם, למשל <bdi className="font-mono text-sm">auto-update</bdi>. בענף בוחרים <bdi className="font-mono text-sm">main</bdi>, ולוחצים{" "}
        <bdi>Create</bdi>.
      </li>
      <li>מעתיקים את הכתובת שנוצרה ומדביקים אותה כאן.</li>
    </ol>
  );
}

/** Paste field for the Deploy Hook URL. */
export function HookForm({ onSave, submitLabel = "שמירה" }: { onSave: (url: string) => Promise<void>; submitLabel?: string }) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSave(url.trim());
          setUrl("");
        } catch (err) {
          toast(errorMessage(err), "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field
        label="כתובת ה-Deploy Hook"
        htmlFor="deploy-hook"
        hint={
          <>
            מתחילה ב-<bdi dir="ltr">https://api.cloudflare.com/</bdi>. זו כתובת סודית: מי שמחזיק בה יכול להפעיל בנייה מחדש של האתר.
          </>
        }
      >
        <input
          id="deploy-hook"
          type="url"
          dir="ltr"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          className={inputClass}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/..."
          required
        />
      </Field>
      <Button type="submit" loading={busy} disabled={!url.trim()} icon={<Link2 className="size-4" aria-hidden />}>
        {submitLabel}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- the tab

export function UpdatesTab({ info, onInfo, onSeen }: { info: UpdatesInfo; onInfo: (i: UpdatesInfo) => void; onSeen: () => Promise<void> }) {
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [seenBusy, setSeenBusy] = useState(false);
  const newest = info.newer[0];

  const check = async () => {
    setChecking(true);
    try {
      const i = await api<UpdatesInfo>("/admin/updates/check", { method: "POST" });
      onInfo(i);
      toast(i.newer.length ? `יש גרסה חדשה: ${i.newer[0].version}` : i.checkError ? "הבדיקה לא הצליחה. אפשר לנסות שוב מאוחר יותר." : "האתר מעודכן לגרסה האחרונה", i.checkError ? "error" : "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Current version */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Tag className="size-5 text-primary" aria-hidden />
              הגרסה של האתר
            </h2>
            <p className="text-3xl font-extrabold">
              <bdi dir="ltr">{info.current.version}</bdi>
            </p>
          </div>
          <Button variant="outline" loading={checking} onClick={check} icon={<RefreshCw className="size-4" aria-hidden />}>
            בדיקה עכשיו
          </Button>
        </div>
        {newest ? (
          <p className="flex items-center gap-2 rounded-xl bg-sky-50 p-3 text-sky-950">
            <Download className="size-5 shrink-0" aria-hidden />
            <span>
              יש גרסה חדשה: <V v={newest.version} />
            </span>
          </p>
        ) : info.latest ? (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-900">
            <CheckCircle2 className="size-5 shrink-0" aria-hidden />
            האתר מעודכן לגרסה האחרונה.
          </p>
        ) : null}
        <dl className="grid gap-x-6 gap-y-1 text-sm text-muted-fg sm:grid-cols-2">
          <div>
            <dt className="inline">הותקנה: </dt>
            <dd className="inline">{formatDate(info.current.builtAt)}</dd>
          </div>
          <div>
            <dt className="inline">בדיקה אחרונה לגרסה חדשה: </dt>
            <dd className="inline">{info.checkedAt ? timeAgo(info.checkedAt) : "עוד לא נבדק"}</dd>
          </div>
          <div>
            <dt className="inline">אופן ההתקנה: </dt>
            <dd className="inline">{info.source === "git" ? "מ-GitHub דרך Cloudflare" : "מהמחשב"}</dd>
          </div>
          {info.current.commit && (
            <div>
              <dt className="inline">קוד: </dt>
              <dd className="inline font-mono" dir="ltr">
                {info.current.commit}
              </dd>
            </div>
          )}
        </dl>
        {info.checkError && (
          <p className="text-sm text-amber-800">הבדיקה האחרונה לגרסה חדשה לא הצליחה. האתר ינסה שוב לבד בלילה, ואפשר גם ללחוץ "בדיקה עכשיו".</p>
        )}
        {info.schemaError && (
          <p className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-red-900">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              עדכון מבנה מסד הנתונים לא הצליח, והאתר ממשיך לעבוד עם המבנה הקודם. כדאי לפנות למפתח עם הפרטים:{" "}
              <span dir="ltr" className="break-all font-mono text-sm">
                {info.schemaError}
              </span>
            </span>
          </p>
        )}
      </Card>

      {/* What the last update brought */}
      {info.justUpdated && (
        <Card className="space-y-4 border-emerald-300">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="size-5 text-primary" aria-hidden />
            <span>
              האתר עודכן לגרסה <V v={info.current.version} />
              {info.justUpdated.from && (
                <span className="font-normal text-muted-fg">
                  {" "}
                  (מגרסה <bdi dir="ltr">{info.justUpdated.from}</bdi>)
                </span>
              )}
            </span>
          </h2>
          {info.justUpdated.releases.length ? (
            <ReleaseList releases={info.justUpdated.releases} />
          ) : (
            <p className="text-muted-fg">אין פרטים נוספים על הגרסה הזו.</p>
          )}
          <Button
            variant="outline"
            loading={seenBusy}
            onClick={async () => {
              setSeenBusy(true);
              await onSeen().finally(() => setSeenBusy(false));
            }}
          >
            הבנתי
          </Button>
        </Card>
      )}

      {/* What's new in the version(s) not installed yet */}
      {newest && (
        <Card className="space-y-4 border-sky-300">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Download className="size-5 text-primary" aria-hidden />
            {info.newer.length === 1 ? "מה חדש בגרסה הבאה" : `מה חדש ב-${info.newer.length} הגרסאות הבאות`}
          </h2>
          <ReleaseList releases={info.newer} />
        </Card>
      )}

      <HowUpdatesWork info={info} onInfo={onInfo} />

      {info.history.length > 0 && (
        <Card>
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
              <History className="size-5 text-primary" aria-hidden />
              כל הגרסאות ({info.history.length})
            </summary>
            <div className="mt-4">
              <ReleaseList releases={info.history} compact />
            </div>
          </details>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- how this site gets new versions

function HowUpdatesWork({ info, onInfo }: { info: UpdatesInfo; onInfo: (i: UpdatesInfo) => void }) {
  if (info.autoCapable) return <AutoUpdates info={info} onInfo={onInfo} />;
  if (info.source === "git") {
    return (
      <Card className="space-y-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <RefreshCw className="size-5 text-primary" aria-hidden />
          עדכונים
        </h2>
        <p>
          האתר נבנה מהעותק שלכם ב-GitHub כמו שהוא (משתנה הבנייה <span dir="ltr" className="font-mono text-sm">FOLLOW_UPSTREAM=off</span>, או גרסה נעולה ב-
          <span dir="ltr" className="font-mono text-sm">UPSTREAM_REF</span>), ולכן הוא לא מתעדכן לבד. כאן תמשיכו לראות כשיוצאת גרסה חדשה.
        </p>
      </Card>
    );
  }
  return (
    <Card className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <RefreshCw className="size-5 text-primary" aria-hidden />
        איך מעדכנים
      </h2>
      <p>האתר הותקן מהמחשב, ולכן גרסה חדשה מותקנת ידנית (כ-5 דקות):</p>
      <ol className="list-decimal space-y-2 ps-5 leading-relaxed">
        <li>
          מורידים את הקוד החדש:{" "}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
            לדף הקוד ב-GitHub
            <span className="sr-only"> (נפתח בחלון חדש)</span>
          </a>{" "}
          ← <span dir="ltr">Code</span> ← <span dir="ltr">Download ZIP</span>, ומחלצים לתיקייה חדשה.
        </li>
        <li>
          מעתיקים לתיקייה החדשה את הקובץ המוסתר <span dir="ltr" className="font-mono text-sm">.deploy-state.json</span> מהתיקייה הקודמת.
        </li>
        <li>
          פותחים טרמינל בתיקייה החדשה ומריצים <span dir="ltr" className="font-mono text-sm">npm install</span>, ואחריו{" "}
          <span dir="ltr" className="font-mono text-sm">npm run deploy</span>.
        </li>
      </ol>
      <p className="text-sm text-muted-fg">
        רוצים שהאתר יתעדכן לבד? במדריך ההתקנה יש הסבר על מעבר להתקנה דרך GitHub ו-Cloudflare. האתר, הנתונים והחיבור ל-Google נשמרים.
      </p>
    </Card>
  );
}

const WAITING: Record<NonNullable<UpdatesInfo["auto"]["waiting"]>, string> = {
  requested: "בקשת העדכון נשלחה, והאתר עובר לגרסה החדשה תוך כמה דקות. אם זה לא קרה, הוא יבקש שוב בלילה הבא.",
  stopped: "Cloudflare לא קיבלה את כתובת ה-Deploy Hook (אולי היא נמחקה). צריך ליצור חדשה ולהדביק אותה כאן.",
};

function AutoUpdates({ info, onInfo }: { info: UpdatesInfo; onInfo: (i: UpdatesInfo) => void }) {
  const toast = useToast();
  const [replacing, setReplacing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const { auto } = info;
  const newest = info.newer[0];

  const save = async (json: { hookUrl?: string | null; auto?: boolean }) => {
    onInfo(await api<UpdatesInfo>("/admin/updates/settings", { method: "PUT", json }));
  };

  let status: ReactNode = null;
  if (auto.last && (!newest || auto.last.version === newest.version)) {
    const when = timeAgo(auto.last.at);
    status = auto.last.ok ? (
      <>
        בקשת עדכון לגרסה <V v={auto.last.version} /> נשלחה {when}.
      </>
    ) : (
      <>
        בקשת העדכון {when} לא הצליחה{auto.last.error ? ` (${auto.last.error})` : ""}.
      </>
    );
  }

  return (
    <Card className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <RefreshCw className="size-5 text-primary" aria-hidden />
        עדכונים אוטומטיים
      </h2>
      <Toggle
        checked={auto.enabled}
        onChange={(v) => save({ auto: v }).then(() => toast(v ? "עדכונים אוטומטיים הופעלו" : "עדכונים אוטומטיים כובו")).catch((e) => toast(errorMessage(e), "error"))}
        label={auto.enabled ? "פעילים: גרסה חדשה מותקנת לבד" : "כבויים: גרסה חדשה תחכה ללחיצה על \"עדכון עכשיו\""}
        hint="פעם בלילה האתר בודק אם יצאה גרסה חדשה ומתקין אותה. אם אורחים העלו תמונות בשעה שלפני הבדיקה, העדכון מחכה ללילה הבא, כדי לא להפריע לאירוע."
      />

      {auto.hook.set && !replacing ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-900">
          <p className="flex items-center gap-2">
            <CheckCircle2 className="size-5 shrink-0" aria-hidden />
            <span>
              מחובר: <bdi dir="ltr">{auto.hook.masked}</bdi>
            </span>
          </p>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setReplacing(true)}>
              החלפה
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRemoving(true)} icon={<Trash2 className="size-4" aria-hidden />}>
              הסרה
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-border p-4">
          {!auto.hook.set && (
            <p className="flex items-start gap-2 text-amber-900">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
              <span>כדי שהאתר יוכל להתעדכן לבד, מחברים פעם אחת "Deploy Hook" מ-Cloudflare (כ-2 דקות):</span>
            </p>
          )}
          <HookSteps />
          <HookForm
            submitLabel="חיבור"
            onSave={async (url) => {
              await save({ hookUrl: url });
              setReplacing(false);
              toast("החיבור נשמר. מעכשיו האתר יתעדכן לבד.");
            }}
          />
          {replacing && (
            <Button variant="ghost" size="sm" onClick={() => setReplacing(false)}>
              ביטול
            </Button>
          )}
        </div>
      )}

      {status && <p className="text-sm text-muted-fg">{status}</p>}
      {newest && auto.waiting && <p className="text-sm text-amber-800">{WAITING[auto.waiting]}</p>}
      {newest && !auto.waiting && auto.enabled && auto.hook.set && (
        <p className="text-sm text-muted-fg">
          הגרסה החדשה תותקן לבד הלילה, בסביבות 3-4 לפנות בוקר. לא רוצים לחכות? אפשר ללחוץ "עדכון עכשיו".
        </p>
      )}
      {auto.last && !auto.last.ok && auto.last.attempts >= 2 && (
        <p className="text-sm text-muted-fg">
          העדכון לא מסתיים? ב-Cloudflare: האתר ← <span dir="ltr">Deployments</span> ← <span dir="ltr">View build history</span>, שם רואים למה הבנייה נכשלה.
        </p>
      )}

      {newest && auto.hook.set && (
        <Button
          loading={updating}
          icon={<Download className="size-4" aria-hidden />}
          onClick={async () => {
            setUpdating(true);
            try {
              onInfo(await api<UpdatesInfo>("/admin/updates/trigger", { method: "POST" }));
              toast("העדכון התחיל. בעוד כמה דקות האתר יעבור לגרסה החדשה.");
            } catch (e) {
              toast(errorMessage(e), "error");
            } finally {
              setUpdating(false);
            }
          }}
        >
          עדכון עכשיו לגרסה {newest.version}
        </Button>
      )}

      <ConfirmDialog
        open={removing}
        title="לנתק את העדכונים האוטומטיים?"
        message="האתר יפסיק להתעדכן לבד. תמשיכו לראות כאן כשיוצאת גרסה חדשה, ואפשר לחבר שוב בכל רגע עם Deploy Hook חדש."
        confirmLabel="ניתוק"
        onConfirm={async () => {
          try {
            await save({ hookUrl: null });
            toast("העדכונים האוטומטיים נותקו");
          } catch (e) {
            toast(errorMessage(e), "error");
          }
        }}
        onClose={() => setRemoving(false)}
      />
    </Card>
  );
}
