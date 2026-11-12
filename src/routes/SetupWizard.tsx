import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Rocket,
  ShieldCheck,
  XCircle,
  Wand2,
  Terminal,
  RefreshCw,
} from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { applyTheme } from "../lib/themes";
import { Stepper } from "../components/Stepper";
import { Button, Card, CopyField, Field, Spinner, cx, inputClass, useToast } from "../components/ui";
import { HookForm, HookSteps } from "../components/admin/Updates";

interface Status {
  configured: boolean;
  unlocked: boolean;
  origin?: string;
  redirectUri?: string;
  scopes?: string[];
  clientId?: string | null;
  progress?: { v?: number; step?: number; projectId?: string; checks?: Record<string, boolean> };
  test?: { at: number; ok: boolean; result: Record<string, { ok: boolean; message?: string }> } | null;
  operator?: { name: string; email: string };
  admin?: { email: string; name: string | null } | null;
  /** How the site was installed: sites built from GitHub (and following the original repo) can update themselves. */
  install?: { source: "git" | "manual"; autoCapable: boolean; hookSet: boolean };
}

const STEPS = ["פתיחה", "חשבון חיוב", "פרויקט", "הפעלת שירותים", "מסך הסכמה", "הרשאות", "פרסום", "מפתח חיבור", "הדבקת המפתח", "בדיקה", "סיום"];

const C = "https://console.cloud.google.com";

/**
 * Google's "Authorized domains" must be a *top private domain*. workers.dev / pages.dev are public suffixes,
 * so for myapp.example.workers.dev the answer is example.workers.dev.
 */
const PUBLIC_SUFFIXES_2 = ["workers.dev", "pages.dev", "co.il", "org.il", "ac.il", "gov.il", "net.il", "co.uk", "org.uk", "com.au", "co.nz"];
function topPrivateDomain(hostname: string) {
  const parts = hostname.split(".");
  const two = parts.slice(-2).join(".");
  return PUBLIC_SUFFIXES_2.includes(two) ? parts.slice(-3).join(".") : two;
}

function OpenInGoogle({ href, children = "פתיחת הדף הזה ב-Google" }: { href: string; children?: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#1a73e8] px-6 text-lg font-bold text-white shadow-soft transition-[filter] duration-200 hover:brightness-110"
    >
      <ExternalLink className="size-5" aria-hidden />
      {children}
    </a>
  );
}

function Instructions({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 text-base leading-relaxed">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary" aria-hidden>
            {i + 1}
          </span>
          <span className="pt-0.5">{it}</span>
        </li>
      ))}
    </ol>
  );
}

/** Button label exactly as it appears in Google Cloud Console (English UI). */
const G = ({ children }: { children: ReactNode }) => (
  <bdi dir="ltr" className="rounded-md bg-[#e8f0fe] px-1.5 py-0.5 font-semibold text-[#174ea6]">
    {children}
  </bdi>
);

function Done({ checked, onChange, label = "סיימתי את השלב הזה" }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className={cx("flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 font-semibold transition-colors", checked ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-border")}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-6 accent-emerald-600" />
      {label}
    </label>
  );
}

export default function SetupWizard() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState(0);
  const [projectId, setProjectId] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [tokenInput, setTokenInput] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);
  const [opName, setOpName] = useState("");
  const [opEmail, setOpEmail] = useState("");
  const [opSaved, setOpSaved] = useState(false);
  const [opBusy, setOpBusy] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  useEffect(() => applyTheme("general"), []);

  const load = async () => {
    const s = await api<Status>("/setup/status");
    setStatus(s);
    if (s.unlocked) {
      setProjectId(s.progress?.projectId || "");
      setChecks(s.progress?.checks || {});
      const tested = params.get("tested") || params.get("error");
      // v2 inserted the billing step at index 1 - shift older saved progress.
      const saved = s.progress?.step ?? 0;
      const migrated = s.progress?.v === 2 ? saved : saved >= 1 ? saved + 1 : saved;
      setStep(tested ? 9 : migrated);
      if (s.clientId) setClientId(s.clientId);
      if (s.operator?.name) {
        setOpName(s.operator.name);
        setOpEmail(s.operator.email);
        setOpSaved(true);
      }
    }
  };

  // Unlock with the one-time link (?token=...).
  useEffect(() => {
    const token = params.get("token");
    (async () => {
      if (token) {
        try {
          await api("/setup/unlock", { method: "POST", json: { token } });
          params.delete("token");
          setParams(params, { replace: true });
        } catch (e) {
          toast(errorMessage(e), "error");
        }
      }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = (patch: Partial<{ step: number; projectId: string; checks: Record<string, boolean> }>) => {
    const body = { v: 2, step, projectId, checks, ...patch };
    api("/setup/progress", { method: "POST", json: body }).catch(() => {});
  };
  const go = (n: number) => {
    setStep(n);
    save({ step: n });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const check = (k: string, v: boolean) => {
    const next = { ...checks, [k]: v };
    setChecks(next);
    save({ checks: next });
  };

  const q = projectId ? `?project=${encodeURIComponent(projectId)}` : "";
  const host = status?.origin ? topPrivateDomain(new URL(status.origin).hostname) : "";
  const done = useMemo(() => {
    const s = new Set<number>();
    STEPS.forEach((_, i) => checks[`s${i}`] && s.add(i));
    return s;
  }, [checks]);

  if (!status) return <Spinner className="min-h-dvh" />;

  if (!status.unlocked) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-preset-general-mono p-4">
        <Card className="w-full max-w-md space-y-5">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <KeyRound className="size-6" aria-hidden />
            הגדרת האתר
          </h1>
          <p className="text-muted-fg">כדי להיכנס לאשף ההגדרה צריך את הקישור (או הקוד) שהתקבל בסיום ההתקנה.</p>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/setup/unlock", { method: "POST", json: { token: tokenInput.trim() } });
                await load();
              } catch (err) {
                toast(errorMessage(err), "error");
              }
            }}
          >
            <Field label="קוד הגדרה" htmlFor="setup-token">
              <input id="setup-token" dir="ltr" className={inputClass} value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} />
            </Field>
            <Button type="submit" className="w-full" size="lg" disabled={!tokenInput.trim()}>
              כניסה
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  const nav = (canNext = true, nextLabel = "לשלב הבא") => (
    <div className="flex items-center justify-between gap-3 pt-2">
      <Button variant="ghost" size="lg" disabled={step === 0} onClick={() => go(step - 1)} icon={<ArrowRight className="size-5" aria-hidden />}>
        חזרה
      </Button>
      <Button
        size="lg"
        disabled={!canNext}
        onClick={() => {
          check(`s${step}`, true);
          go(step + 1);
        }}
      >
        {nextLabel}
        <ArrowLeft className="size-5" aria-hidden />
      </Button>
    </div>
  );

  const test = status.test;
  const errorParam = params.get("error");

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Wand2 className="size-6" aria-hidden />
          <h1 className="text-xl font-bold">אשף הגדרה חד-פעמי · חיבור ל-Google</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <Stepper steps={STEPS} current={step} done={done} />

        {step === 0 && (
          <Card className="space-y-5">
            <h2 className="text-2xl font-bold">ברוכים הבאים!</h2>
            <p className="text-lg leading-relaxed">
              כדי שהאתר יוכל לשמור תמונות ב-Google Photos, צריך לחבר אותו ל-Google <strong>פעם אחת בלבד</strong>. זה לוקח בערך 10-15 דקות, ואנחנו נלווה
              אתכם בכל לחיצה.
            </p>
            <ul className="space-y-2 text-base">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-1 size-5 shrink-0 text-emerald-600" aria-hidden />
                ההגדרה הזו נעשית רק על ידי מפעיל האתר. בעלי אירועים רק לוחצים "התחברות עם Google".
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-1 size-5 shrink-0 text-emerald-600" aria-hidden />
                הכל בחינם. Google מבקשת כרטיס אשראי רק לאימות, ולא מחייבת אותו.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-1 size-5 shrink-0 text-emerald-600" aria-hidden />
                אפשר לעצור בכל שלב ולחזור לכאן אחר כך. ההתקדמות נשמרת.
              </li>
            </ul>
            <form
              className="space-y-4 rounded-2xl border border-border p-4 sm:p-5"
              aria-labelledby="operator-title"
              onSubmit={async (e) => {
                e.preventDefault();
                setOpBusy(true);
                setOpError(null);
                try {
                  await api("/setup/operator", { method: "POST", json: { name: opName, email: opEmail } });
                  setOpSaved(true);
                  toast("פרטי המפעיל נשמרו", "success");
                } catch (err) {
                  setOpError(errorMessage(err));
                } finally {
                  setOpBusy(false);
                }
              }}
            >
              <div className="space-y-1">
                <h3 id="operator-title" className="text-lg font-bold">
                  פרטי מפעיל האתר
                </h3>
                <p className="text-base text-muted-fg">
                  אתם הבעלים והמפעילים של האתר הזה. השם והאימייל יופיעו בעמודי מדיניות הפרטיות ותנאי השימוש, כדי שבעלי אירועים ואורחים ידעו למי לפנות.
                </p>
              </div>
              <Field label="שם (שלכם או של העסק)" htmlFor="op-name">
                <input
                  id="op-name"
                  className={inputClass}
                  value={opName}
                  maxLength={80}
                  autoComplete="name"
                  onChange={(e) => {
                    setOpName(e.target.value);
                    setOpSaved(false);
                  }}
                  required
                />
              </Field>
              <Field label="אימייל ליצירת קשר" htmlFor="op-email" error={opError}>
                <input
                  id="op-email"
                  type="email"
                  dir="ltr"
                  className={cx(inputClass, "text-start")}
                  value={opEmail}
                  maxLength={120}
                  autoComplete="email"
                  onChange={(e) => {
                    setOpEmail(e.target.value);
                    setOpSaved(false);
                  }}
                  required
                />
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="outline" disabled={opBusy || opSaved}>
                  {opBusy ? "שומר..." : opSaved ? "נשמר" : "שמירה"}
                </Button>
                {opSaved && (
                  <span className="flex items-center gap-1.5 text-base font-medium text-emerald-700" role="status">
                    <CheckCircle2 className="size-5" aria-hidden />
                    מופיע בעמוד הפרטיות
                  </span>
                )}
              </div>
            </form>
            <p className="rounded-2xl bg-muted p-4 text-base">
              <strong>טיפ:</strong> פתחו את האשף הזה במחשב. כל כפתור כחול פותח את הדף הנכון ב-Google בלשונית חדשה, וחוזרים לכאן כדי להמשיך.
            </p>
            {!opSaved && <p className="text-base text-muted-fg">כדי להמשיך, מלאו ושמרו את פרטי המפעיל.</p>}
            {nav(opSaved, "בואו נתחיל")}
          </Card>
        )}

        {step === 1 && (
          <Card className="space-y-5">
            <h2 className="text-2xl font-bold">חשבון חיוב ב-Google Cloud (בלי תשלום)</h2>
            <p className="text-lg leading-relaxed">
              Google מבקשת חשבון חיוב (Billing account) כדי לפתוח פרויקט, גם אם לא משתמשים בשום דבר בתשלום. השירותים שהאתר משתמש בהם (Google Photos ו-Drive) לא
              עולים כסף.
            </p>
            <div className="space-y-2 rounded-2xl bg-muted p-4 text-base">
              <p className="font-bold">מה חשוב לדעת (לפי Google):</p>
              <ul className="list-inside list-disc space-y-1">
                <li>חשבון חדש נפתח כ-Free Trial: קרדיט של $300 ל-90 יום. לא מחייבים אוטומטית.</li>
                <li>צריך להזין כרטיס אשראי. Google עושה בדיקה זמנית של עד $1, וזה לא חיוב אמיתי.</li>
              </ul>
            </div>
            <div role="alert" className="flex gap-3 rounded-2xl bg-amber-100 p-4 text-amber-900">
              <AlertTriangle className="mt-0.5 size-6 shrink-0" aria-hidden />
              <p className="text-base">
                <strong>אחרי 90 יום:</strong> Google תבקש להפעיל חשבון מלא (<G>Activate full account</G>). חשוב ללחוץ על זה. אחרת Google סוגרת את חשבון הניסיון ועוצרת את
                הפרויקט, והאתר יפסיק לעבוד. גם בחשבון מלא, השירותים של האתר נשארים בחינם.
              </p>
            </div>
            <OpenInGoogle href={`${C}/billing/create`}>יצירת חשבון חיוב ב-Google</OpenInGoogle>
            <Instructions
              items={[
                <>
                  אם כבר יש לכם חשבון חיוב (הדף מציג אותו ברשימה), אפשר לדלג לשלב הבא.
                </>,
                <>
                  <G>Country</G>: המדינה שבה אתם גרים (למשל <G>Israel</G>). מסמנים הסכמה לתנאים ולוחצים <G>Continue</G>.
                </>,
                <>
                  <G>Account type</G>: <G>Individual</G> (חשבון פרטי).
                </>,
                <>
                  ממלאים את פרטי הכרטיס ולוחצים <G>Start free</G> (או <G>Submit</G>).
                </>,
              ]}
            />
            <details className="rounded-2xl border border-border p-4">
              <summary className="flex min-h-11 items-center gap-2 font-semibold">מומלץ: התראה במייל אם יש חיוב כלשהו</summary>
              <div className="mt-3 space-y-3">
                <Instructions
                  items={[
                    <>
                      בדף ה-Billing לוחצים בתפריט על <G>Budgets &amp; alerts</G> ואז <G>Create budget</G>.
                    </>,
                    <>
                      בשדה <G>Target amount</G> כותבים <G>1</G> (דולר אחד) ולוחצים <G>Finish</G>.
                    </>,
                    <>כך תקבלו מייל מ-Google מיד אם משהו יתחיל לעלות כסף.</>,
                  ]}
                />
                <OpenInGoogle href={`${C}/billing`}>פתיחת Billing</OpenInGoogle>
              </div>
            </details>
            <Done checked={!!checks.billing} onChange={(v) => check("billing", v)} label="יש לי חשבון חיוב" />
            {nav(!!checks.billing)}
          </Card>
        )}

        {step === 2 && (
          <Card className="space-y-5">
            <h2 className="text-2xl font-bold">יצירת פרויקט ב-Google Cloud</h2>
            <OpenInGoogle href={`${C}/projectcreate`} />
            <Instructions
              items={[
                <>נכנסים עם חשבון Google (מומלץ החשבון של מפעיל האתר).</>,
                <>
                  אם מופיע מסך תנאי שימוש, מסמנים הסכמה ולוחצים <G>Agree and continue</G>.
                </>,
                <>
                  בשדה <G>Project name</G> מדביקים את השם הזה:
                </>,
                <>
                  אם מופיע שדה <G>Billing account</G>, בוחרים את חשבון החיוב מהשלב הקודם.
                </>,
                <>
                  לוחצים <G>Create</G> ומחכים כמה שניות.
                </>,
                <>
                  מעתיקים את <G>Project ID</G> שמופיע מתחת לשם הפרויקט (או בראש הדף, ליד שם הפרויקט) ומדביקים אותו למטה.
                </>,
              ]}
            />
            <CopyField label="שם הפרויקט" value="Live Event Albums" />
            <Field label="Project ID" htmlFor="project-id" hint="נראה בערך כך: live-event-albums-123456">
              <input
                id="project-id"
                dir="ltr"
                className={inputClass}
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value.trim());
                  save({ projectId: e.target.value.trim() });
                }}
                placeholder="live-event-albums-123456"
              />
            </Field>
            <details className="rounded-2xl bg-muted p-4">
              <summary className="flex min-h-11 items-center gap-2 font-semibold">
                <Terminal className="size-4" aria-hidden />
                מתקדמים: ליצור פרויקט ולהפעיל שירותים אוטומטית
              </summary>
              <p className="mt-2 text-sm text-muted-fg">
                אם מותקן gcloud, אפשר להריץ את <code dir="ltr">scripts/google-setup.sh</code> מתיקיית הפרויקט. הסקריפט יוצר את הפרויקט ומפעיל את כל השירותים (שלבים 1-2).
                את שלבים 3-6 Google לא מאפשרת לבצע אוטומטית, ולכן ממשיכים בהם כאן.
              </p>
            </details>
            {nav(!!projectId)}
          </Card>
        )}

        {step === 3 && (
          <Card className="space-y-5">
            <h2 className="text-2xl font-bold">הפעלת 4 שירותים</h2>
            <p className="text-muted-fg">
              לכל שירות: לוחצים על הכפתור, מוודאים שלמעלה נבחר הפרויקט <bdi dir="ltr" className="font-semibold">{projectId}</bdi>, ולוחצים על הכפתור הכחול <G>Enable</G>.
            </p>
            {[
              { k: "api_photos", name: "Photos Library API", id: "photoslibrary.googleapis.com", why: "שמירת התמונות ב-Google Photos" },
              { k: "api_picker", name: "Photos Picker API", id: "photospicker.googleapis.com", why: "ייבוא תמונות שכבר נמצאות ב-Google Photos" },
              { k: "api_drive", name: "Google Drive API", id: "drive.googleapis.com", why: "הצגת נפח האחסון ואזהרת ה-80%" },
              { k: "api_gmail", name: "Gmail API", id: "gmail.googleapis.com", why: "שליחת הזמנות ועדכונים למשתמשים מה-Gmail שלך (רק מנהל/ת האתר)" },
            ].map((a) => (
              <div key={a.k} className={cx("flex flex-col gap-3 rounded-2xl border-2 p-4 sm:flex-row sm:items-center", checks[a.k] ? "border-emerald-500" : "border-border")}>
                <div className="flex-1">
                  <p className="text-lg font-bold" dir="ltr" style={{ textAlign: "right" }}>
                    {a.name}
                  </p>
                  <p className="text-sm text-muted-fg">{a.why}</p>
                </div>
                <a
                  href={`${C}/apis/library/${a.id}${q}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1a73e8] px-4 font-semibold text-white"
                >
                  <ExternalLink className="size-4" aria-hidden />
                  פתיחה
                </a>
                <label className="inline-flex min-h-11 items-center gap-2 font-semibold">
                  <input type="checkbox" checked={!!checks[a.k]} onChange={(e) => check(a.k, e.target.checked)} className="size-6 accent-emerald-600" />
                  הופעל
                </label>
              </div>
            ))}
            {nav(!!(checks.api_photos && checks.api_picker && checks.api_drive && checks.api_gmail))}
          </Card>
        )}

        {step === 4 && (
          <Card className="space-y-5">
            <h2 className="text-2xl font-bold">מסך ההסכמה (מה שבעלי האירועים יראו)</h2>
            <OpenInGoogle href={`${C}/auth/branding${q}`} />
            <Instructions
              items={[
                <>
                  אם מופיע כפתור <G>Get started</G>, לוחצים עליו.
                </>,
                <>
                  <G>App name</G>: מדביקים את שם האפליקציה (למטה). <G>User support email</G>: בוחרים את האימייל שלכם. לוחצים <G>Next</G>.
                </>,
                <>
                  <G>Audience</G>: בוחרים <G>External</G> ולוחצים <G>Next</G>.
                </>,
                <>
                  <G>Contact Information</G>: כותבים את האימייל שלכם, <G>Next</G>, מסמנים הסכמה ולוחצים <G>Create</G>.
                </>,
                <>
                  חוזרים לאותו דף (<G>Branding</G>) ומדביקים את הכתובות למטה בשדות <G>Application home page</G>, <G>Privacy policy link</G> ו-<G>Terms of service link</G>. ב-
                  <G>Authorized domains</G> לוחצים <G>Add domain</G> ומדביקים את הדומיין מלמטה, <strong>בדיוק כמו שהוא</strong>. Google דורשת את הדומיין הראשי (top private domain), ולכן הוא קצר יותר מכתובת האתר. בסוף <G>Save</G>.
                </>,
              ]}
            />
            <div role="note" className="flex gap-3 rounded-2xl bg-sky-50 p-4 text-sky-900">
              <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
              <p className="text-base">
                אם Google מציגה <G>Branding verification issues</G> (למשל "homepage is not registered to you"), זה לא חובה כרגע. האתר עובד גם בלי אימות. מוודאים רק
                ששם האפליקציה מולא, ושב-<G>Authorized domains</G> יש <strong>דומיין אחד בלבד</strong>, ואז ממשיכים לשלב הבא. לא לוחצים על <G>Verify branding</G>.
              </p>
            </div>
            <div className="grid gap-3">
              <CopyField label="App name (אם Google לא מקבלת עברית: Live Event Albums)" value="אירוע פרוע" mono={false} />
              <CopyField label="Application home page" value={status.origin || ""} />
              <CopyField label="Privacy policy link" value={`${status.origin}/privacy`} />
              <CopyField label="Terms of service link" value={`${status.origin}/terms`} />
              <CopyField label="Authorized domain" value={host} />
            </div>
            <Done checked={!!checks.branding} onChange={(v) => check("branding", v)} />
            {nav(!!checks.branding)}
          </Card>
        )}

        {step === 5 && (
          <Card className="space-y-5">
            <h2 className="text-2xl font-bold">הרשאות (Data Access)</h2>
            <OpenInGoogle href={`${C}/auth/scopes${q}`} />
            <Instructions
              items={[
                <>
                  לוחצים <G>Add or remove scopes</G>.
                </>,
                <>
                  גוללים לתחתית החלון, אל <G>Manually add scopes</G>, ומדביקים את כל הרשימה שלמטה (כפתור "העתק").
                </>,
                <>
                  לוחצים <G>Add to table</G> ואז <G>Update</G>.
                </>,
                <>
                  בסוף לוחצים <G>Save</G> בתחתית הדף.
                </>,
              ]}
            />
            <CopyField label="Scopes (כל הרשימה)" value={(status.scopes || []).join(",")} />
            <Done checked={!!checks.scopes} onChange={(v) => check("scopes", v)} />
            {nav(!!checks.scopes)}
          </Card>
        )}

        {step === 6 && (
          <Card className="space-y-5">
            <h2 className="text-2xl font-bold">פרסום האפליקציה</h2>
            <div role="alert" className="flex gap-3 rounded-2xl bg-amber-100 p-4 text-amber-900">
              <AlertTriangle className="mt-0.5 size-6 shrink-0" aria-hidden />
              <p className="text-base font-semibold">
                חשוב מאוד! בלי השלב הזה Google מנתקת את בעלי האירועים אחרי 7 ימים, והאורחים לא יוכלו להעלות תמונות.
              </p>
            </div>
            <OpenInGoogle href={`${C}/auth/audience${q}`} />
            <Instructions
              items={[
                <>
                  תחת <G>Publishing status</G> לוחצים על <G>Publish app</G>.
                </>,
                <>
                  בחלון שנפתח לוחצים <G>Confirm</G>. הסטטוס צריך להשתנות ל-<G>In production</G>.
                </>,
                <>
                  אם Google כותבת שהאפליקציה דורשת אימות (verification), זה תקין. היא תעבוד גם בלי אימות, ובעלי האירועים יראו מסך אזהרה עם מדריך שהכנו להם.
                </>,
              ]}
            />
            <Done checked={!!checks.publish} onChange={(v) => check("publish", v)} label="הסטטוס הוא In production" />
            {nav(!!checks.publish)}
          </Card>
        )}

        {step === 7 && (
          <Card className="space-y-5">
            <h2 className="text-2xl font-bold">יצירת מפתח חיבור (OAuth Client)</h2>
            <OpenInGoogle href={`${C}/auth/clients/create${q}`} />
            <Instructions
              items={[
                <>
                  <G>Application type</G>: בוחרים <G>Web application</G>.
                </>,
                <>
                  <G>Name</G>: אפשר להשאיר את ברירת המחדל.
                </>,
                <>
                  תחת <G>Authorized JavaScript origins</G> לוחצים <G>Add URI</G> ומדביקים את הכתובת הראשונה.
                </>,
                <>
                  תחת <G>Authorized redirect URIs</G> לוחצים <G>Add URI</G> ומדביקים את הכתובת השנייה, <strong>בדיוק כמו שהיא</strong>.
                </>,
                <>
                  לוחצים <G>Create</G>. נפתח חלון עם <G>Client ID</G> ו-<G>Client secret</G>. <strong>השאירו אותו פתוח</strong> ועברו לשלב הבא.
                </>,
              ]}
            />
            <div className="grid gap-3">
              <CopyField label="Authorized JavaScript origin" value={status.origin || ""} />
              <CopyField label="Authorized redirect URI" value={status.redirectUri || ""} />
            </div>
            <Done checked={!!checks.client} onChange={(v) => check("client", v)} />
            {nav(!!checks.client)}
          </Card>
        )}

        {step === 8 && (
          <Card className="space-y-5">
            <h2 className="text-2xl font-bold">מדביקים את המפתח כאן</h2>
            <p className="text-muted-fg">מעתיקים מהחלון של Google את שני הערכים. הם נשמרים מוצפנים, ורק השרת של האתר יכול לקרוא אותם.</p>
            {status.configured && <p className="rounded-2xl bg-emerald-50 p-3 font-semibold text-emerald-900">מפתח כבר שמור. אפשר להחליף אותו או לדלג לבדיקה.</p>}
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setCredError(null);
                try {
                  await api("/setup/credentials", { method: "POST", json: { clientId, clientSecret } });
                  setClientSecret("");
                  await load();
                  check("s8", true);
                  go(9);
                } catch (err) {
                  setCredError(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="Client ID" htmlFor="client-id" hint="מסתיים ב-apps.googleusercontent.com">
                <input id="client-id" dir="ltr" className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Client secret" htmlFor="client-secret" error={credError} hint="מתחיל בדרך כלל ב-GOCSPX-">
                <input id="client-secret" dir="ltr" type="password" className={inputClass} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" />
              </Field>
              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" size="lg" type="button" onClick={() => go(7)} icon={<ArrowRight className="size-5" aria-hidden />}>
                  חזרה
                </Button>
                <div className="flex gap-2">
                  {status.configured && (
                    <Button variant="outline" size="lg" type="button" onClick={() => go(9)}>
                      דילוג לבדיקה
                    </Button>
                  )}
                  <Button size="lg" type="submit" loading={busy} disabled={!clientId || !clientSecret}>
                    שמירה והמשך
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        )}

        {step === 9 && (
          <Card className="space-y-5">
            <h2 className="text-2xl font-bold">בדיקת חיבור</h2>
            <p className="text-muted-fg">
              לוחצים על הכפתור ומתחברים עם חשבון ה-Google שלכם. החשבון הזה יהיה גם <strong>מנהל/ת האתר</strong>: מי שמאשר משתמשים חדשים ומנהל אותם. אם מופיע "Google hasn't verified this app", לוחצים <G>Advanced</G> ואז <G>Go to … (unsafe)</G>,
              ומסמנים את כל ההרשאות.
            </p>
            {errorParam && (
              <div role="alert" className="flex gap-3 rounded-2xl bg-destructive/10 p-4 text-destructive">
                <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
                <p>
                  {errorParam === "scopes"
                    ? "לא סומנו כל ההרשאות במסך של Google. נסו שוב וסמנו את כל התיבות. אם חלק מהתיבות לא הופיעו, חזרו לשלב 4."
                    : errorParam === "invalid_client"
                      ? "Google לא מזהה את המפתח. חזרו לשלב 7 והדביקו שוב את Client ID ו-Client secret."
                      : "ההתחברות לא הושלמה. נסו שוב."}
                </p>
              </div>
            )}
            {test && (
              <ul className="space-y-2">
                {[
                  { k: "photos", name: "שמירה ב-Google Photos", fix: 2 },
                  { k: "picker", name: "ייבוא מ-Google Photos", fix: 2 },
                  { k: "drive", name: "נתוני נפח אחסון", fix: 2 },
                ].map((r) => {
                  const res = test.result[r.k];
                  return (
                    <li key={r.k} className={cx("flex items-start gap-3 rounded-2xl p-4", res?.ok ? "bg-emerald-50 text-emerald-900" : "bg-destructive/10 text-destructive")}>
                      {res?.ok ? <CheckCircle2 className="size-6 shrink-0" aria-hidden /> : <XCircle className="size-6 shrink-0" aria-hidden />}
                      <div className="min-w-0">
                        <p className="font-bold">{r.name}</p>
                        {!res?.ok && (
                          <>
                            <p className="text-sm">כנראה שהשירות לא הופעל. חזרו לשלב 2, ודאו שלחצתם Enable, חכו דקה ובדקו שוב.</p>
                            {res?.message && (
                              <p dir="ltr" className="mt-1 truncate text-xs opacity-70">
                                {res.message}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="rounded-2xl bg-muted p-4 text-sm">
              אם Google הציגה את השגיאה <bdi dir="ltr">redirect_uri_mismatch</bdi>, חזרו לשלב 6 וודאו שהכתובת <bdi dir="ltr">{status.redirectUri}</bdi> הודבקה בדיוק (בלי רווחים או
              לוכסן בסוף). שינויים אצל Google יכולים לקחת כמה דקות.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="ghost" size="lg" onClick={() => go(8)} icon={<ArrowRight className="size-5" aria-hidden />}>
                חזרה
              </Button>
              <div className="flex gap-2">
                <a href="/api/auth/login?mode=test" className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-primary px-6 text-lg font-bold text-on-primary">
                  <ShieldCheck className="size-5" aria-hidden />
                  {test ? "בדיקה חוזרת" : "בדיקת חיבור"}
                </a>
                {test?.ok && (
                  <Button
                    size="lg"
                    variant="accent"
                    onClick={() => {
                      check("s9", true);
                      go(10);
                    }}
                  >
                    הכל עובד, להמשך
                    <ArrowLeft className="size-5" aria-hidden />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}

        {step === 10 && (
          <Card className="space-y-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <Rocket className="size-14 text-emerald-600" aria-hidden />
              <h2 className="text-3xl font-bold">האתר מוכן!</h2>
              <p className="max-w-md text-lg text-muted-fg">מעכשיו בעלי אירועים שתאשרו יכולים להיכנס עם Google, ליצור אירוע ולשלוח QR לאורחים.</p>
              <a href="/dashboard" className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-accent px-6 text-lg font-bold text-on-accent">
                ליצירת האירוע הראשון
                <ArrowLeft className="size-5" aria-hidden />
              </a>
            </div>
            <div className="space-y-3 rounded-2xl bg-muted p-5">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <ShieldCheck className="size-5" aria-hidden />
                ניהול האתר
              </h3>
              {status.admin ? (
                <p>
                  מנהל/ת האתר: <bdi dir="ltr" className="font-semibold">{status.admin.email}</bdi>. בלוח הניהול מאשרים משתמשים חדשים, מוסיפים משתמשים ומחברים שליחת מיילים.
                </p>
              ) : (
                <p>עוד לא הוגדר/ה מנהל/ת לאתר. מתחברים עם חשבון ה-Google שלכם כדי לנהל מי יכול להשתמש באתר.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {status.admin && (
                  <a href="/admin" className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-5 font-bold text-on-primary">
                    ללוח ניהול האתר
                  </a>
                )}
                <a
                  href="/api/auth/login?mode=claim"
                  className={cx(
                    "inline-flex min-h-12 items-center gap-2 rounded-2xl px-5 font-bold",
                    status.admin ? "border-2 border-primary text-fg" : "bg-primary text-on-primary",
                  )}
                >
                  {status.admin ? "העברת הניהול לחשבון אחר" : "כניסה כמנהל/ת האתר"}
                </a>
              </div>
            </div>
            {status.install?.autoCapable && (
              <div className="space-y-3 rounded-2xl bg-muted p-5">
                <h3 className="flex items-center gap-2 text-lg font-bold">
                  <RefreshCw className="size-5" aria-hidden />
                  עדכונים אוטומטיים
                </h3>
                {status.install.hookSet ? (
                  <p className="flex items-center gap-2 text-emerald-900">
                    <CheckCircle2 className="size-5 shrink-0" aria-hidden />
                    מחובר. כשתצא גרסה חדשה, האתר יתעדכן לבד בלילה שאחרי (לא בזמן שאורחים מעלים תמונות).
                  </p>
                ) : (
                  <>
                    <p>
                      האתר הותקן מ-GitHub, ולכן הוא יכול להתעדכן לבד בכל פעם שיוצאת גרסה חדשה. נשאר רק לחבר פעם אחת "Deploy Hook" מ-Cloudflare (כ-2
                      דקות, אפשר גם אחר כך מלוח ניהול האתר, בלשונית עדכונים):
                    </p>
                    <HookSteps />
                    <HookForm
                      submitLabel="חיבור עדכונים אוטומטיים"
                      onSave={async (url) => {
                        await api("/setup/update-hook", { method: "PUT", json: { hookUrl: url } });
                        toast("החיבור נשמר. מעכשיו האתר יתעדכן לבד.");
                        await load();
                      }}
                    />
                  </>
                )}
              </div>
            )}
            <details className="rounded-2xl border border-border p-4">
              <summary className="flex min-h-11 items-center gap-2 text-lg font-semibold">
                <ShieldCheck className="size-5" aria-hidden />
                לא חובה: הסרת מסך האזהרה של Google (אימות האפליקציה)
              </summary>
              <div className="mt-3 space-y-3 text-base">
                <p className="text-muted-fg">
                  עד שהאפליקציה מאומתת, בעלי אירועים רואים מסך "unverified app", ויש מגבלה של 100 בעלי אירועים (אורחים לא נספרים). האימות חינמי ולוקח בדרך כלל כמה ימים עד כמה שבועות.
                </p>
                <ul className="list-inside list-disc space-y-1">
                  <li>דומיין משלכם שמחובר ל-Cloudflare (מומלץ). כתובת workers.dev לא תמיד מתקבלת.</li>
                  <li>עמודי פרטיות ותנאי שימוש כבר קיימים באתר.</li>
                  <li>סרטון קצר (YouTube, לא רשום) שמראה התחברות והעלאת תמונה.</li>
                </ul>
                <OpenInGoogle href={`${C}/auth/verification${q}`}>פתיחת דף האימות ב-Google</OpenInGoogle>
              </div>
            </details>
          </Card>
        )}
      </main>
    </div>
  );
}
