import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, Images, Lock, AlertTriangle, ChevronLeft, Info, Hourglass } from "lucide-react";
import { useMe } from "../lib/session";
import { GoogleButton } from "../components/GoogleButton";
import { Button, Card, Modal } from "../components/ui";
import { applyTheme } from "../lib/themes";

const ERRORS: Record<string, string> = {
  not_configured: "האתר עוד לא הוגדר. מפעיל האתר צריך להשלים את אשף ההגדרה.",
  denied: "ההתחברות בוטלה. אפשר לנסות שוב בכל רגע.",
  scopes: "כדי שהאתר יוכל לשמור את התמונות, צריך לסמן את כל תיבות ההרשאה במסך של Google. נסו שוב וסמנו את כולן.",
  state: "פג הזמן של ההתחברות. נסו שוב.",
  exchange: "Google לא אישרה את ההתחברות. נסו שוב.",
  invalid_client: "פרטי החיבור ל-Google שגויים. מפעיל האתר צריך לבדוק את אשף ההגדרה.",
  account_disabled: "החשבון הזה הושהה על ידי מנהל האתר. לפרטים אפשר לפנות אליו.",
  too_many: "יותר מדי ניסיונות הצטרפות מהרשת הזו. נסו שוב בעוד שעה.",
  waitlist_full: "רשימת ההמתנה מלאה כרגע. נסו שוב מאוחר יותר.",
};

export default function Login() {
  const { me } = useMe();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [guide, setGuide] = useState(false);
  const next = params.get("next") || "/dashboard";
  const err = params.get("error");
  const waitlisted = params.get("waitlist") === "1";

  useEffect(() => applyTheme("general"), []);
  useEffect(() => {
    if (me?.owner?.connected) navigate(next, { replace: true });
  }, [me, navigate, next]);

  const loginHref = `/api/auth/login?next=${encodeURIComponent(next)}`;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-preset-general-mono px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link to="/" className="inline-flex items-center gap-2 text-2xl font-extrabold">
            <img src="/logo-mark.webp" alt="" className="size-11" />
            אירוע פרוע
          </Link>
          <p className="mt-2 text-lg text-muted-fg">כניסה לבעלי אירועים</p>
        </div>

        {waitlisted ? (
          <Card className="space-y-4 text-center">
            <Hourglass className="mx-auto size-14 text-primary" aria-hidden />
            <h1 className="text-2xl font-bold">נכנסת לרשימת ההמתנה</h1>
            <p className="text-lg">הבקשה שלך התקבלה ונשלחה למנהל האתר לאישור.</p>
            <p className="text-muted-fg">ברגע שהיא תאושר יגיע אליך מייל עם קישור, ואז אפשר להתחבר ולהתחיל ליצור אירועים. אין צורך לעשות שום דבר נוסף בינתיים.</p>
            <Link to="/" className="inline-block font-semibold text-primary underline">
              לעמוד הראשי
            </Link>
          </Card>
        ) : (
          <Card className="space-y-6">
            {err && (
              <div role="alert" className="flex gap-3 rounded-2xl bg-destructive/10 p-4 text-destructive">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
                <p className="font-medium">{ERRORS[err] || "משהו השתבש בהתחברות. נסו שוב."}</p>
              </div>
            )}
            {me && !me.configured ? (
              <div className="space-y-3 text-center">
                <p className="text-lg">האתר עוד לא חובר ל-Google.</p>
                <p className="text-muted-fg">אם אתם מפעילי האתר, פתחו את קישור ההגדרה שקיבלתם בזמן ההתקנה.</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <h1 className="text-2xl font-bold">התחברות עם חשבון Google</h1>
                  <ul className="space-y-2.5 text-base">
                    <li className="flex gap-2.5">
                      <Images className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                      התמונות של האירוע יישמרו ב-Google Photos שלך - בחינם, בחשבון שלך.
                    </li>
                    <li className="flex gap-2.5">
                      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                      האתר רואה רק את התמונות שהועלו דרכו, לא את שאר התמונות שלך.
                    </li>
                    <li className="flex gap-2.5">
                      <Lock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                      האורחים לא צריכים להתחבר - רק את/ה.
                    </li>
                  </ul>
                </div>
                <Button variant="outline" size="lg" className="w-full" onClick={() => setGuide(true)} icon={<Info className="size-5" aria-hidden />}>
                  מה יקרה במסך של Google? (30 שניות)
                </Button>
                <GoogleButton href={loginHref} />
              </>
            )}
          </Card>
        )}
        <p className="text-center text-sm text-muted-fg">
          בהתחברות את/ה מסכים/ה ל<Link to="/terms" className="underline">תנאי השימוש</Link> ול
          <Link to="/privacy" className="underline">מדיניות הפרטיות</Link>.
        </p>
      </div>

      <UnverifiedGuide open={guide} onClose={() => setGuide(false)} href={loginHref} />
    </main>
  );
}

/** Illustrated walkthrough of Google's "unverified app" + consent screens, shown before redirecting. */
function UnverifiedGuide({ open, onClose, href }: { open: boolean; onClose: () => void; href: string }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="מה תראו אצל Google"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            סגירה
          </Button>
          <a href={href} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-on-primary">
            הבנתי, להתחברות
            <ChevronLeft className="size-5" aria-hidden />
          </a>
        </>
      }
    >
      <ol className="space-y-6">
        <li className="space-y-2">
          <p className="text-lg font-bold">1. בוחרים את חשבון ה-Google שבו יישמרו התמונות</p>
        </li>
        <li className="space-y-3">
          <p className="text-lg font-bold">2. אם מופיע "Google hasn't verified this app" - זה תקין</p>
          <p className="text-muted-fg">האתר חדש ועוד לא עבר את תהליך האימות של Google. לוחצים על <strong>Advanced</strong> ואז על <strong>Go to … (unsafe)</strong>.</p>
          <div dir="ltr" className="rounded-2xl border border-zinc-200 bg-white p-5 text-start font-sans text-zinc-800 shadow-soft" aria-hidden>
            <div className="mb-3 flex items-center gap-2 text-sm text-zinc-500">
              <AlertTriangle className="size-5 text-red-600" /> Google hasn&apos;t verified this app
            </div>
            <div className="mb-4 h-2 w-3/4 rounded bg-zinc-200" />
            <div className="mb-5 h-2 w-1/2 rounded bg-zinc-200" />
            <div className="flex items-center justify-between">
              <span className="relative rounded px-2 py-1 text-sm font-semibold text-blue-700 ring-4 ring-amber-400">Advanced</span>
              <span className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white">BACK TO SAFETY</span>
            </div>
            <div className="mt-4 border-t pt-3 text-sm">
              <span className="font-semibold text-zinc-600 underline ring-4 ring-amber-400">Go to live-event-albums (unsafe)</span>
            </div>
          </div>
        </li>
        <li className="space-y-3">
          <p className="text-lg font-bold">3. מסמנים את כל תיבות ההרשאה ולוחצים Continue</p>
          <p className="text-muted-fg">ההרשאות מאפשרות לאתר להעלות תמונות לחשבון שלך ולראות רק את התמונות שהוא עצמו העלה.</p>
          <div dir="ltr" className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-800 shadow-soft" aria-hidden>
            {["Add to your Google Photos library", "View photos added by this app", "Manage photos added by this app", "Select photos to import"].map((t) => (
              <div key={t} className="flex items-center gap-3 text-sm">
                <span className="flex size-5 items-center justify-center rounded bg-blue-600 text-white ring-2 ring-amber-400">✓</span>
                {t}
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <span className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white ring-4 ring-amber-400">Continue</span>
            </div>
          </div>
        </li>
      </ol>
    </Modal>
  );
}
