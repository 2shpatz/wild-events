import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, Images, Lock, AlertTriangle, Info, Hourglass } from "lucide-react";
import { useMe } from "../lib/session";
import { GoogleButton } from "../components/GoogleButton";
import { Button, Card } from "../components/ui";
import { UnverifiedGuide } from "../components/UnverifiedGuide";
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
