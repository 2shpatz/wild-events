import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { useEvent } from "../lib/session";
import { api, errorMessage } from "../lib/api";
import { EventBackdrop, EventStatus, EventTitle } from "../components/EventChrome";
import { Button, Card, Field, inputClass } from "../components/ui";
import { GoogleButton } from "../components/GoogleButton";

export default function AdminLogin() {
  const { code = "" } = useParams();
  const { event, error } = useEvent(code);
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (event?.canManage) navigate(`/${code}/manage`, { replace: true });
  }, [event, code, navigate]);

  if (!event) return <EventStatus error={error} loading />;

  return (
    <EventBackdrop event={event}>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
        <EventTitle event={event} size="md" />
        <Card className="space-y-5 text-fg">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <KeyRound className="size-5" aria-hidden />
            כניסה לניהול האירוע
          </h2>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErr(null);
              try {
                await api(`/e/${code}/admin/login`, { method: "POST", json: { password } });
                navigate(`/${code}/manage`);
              } catch (e) {
                setErr(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="סיסמת ניהול" htmlFor="admin-pass" error={err} hint="את הסיסמה מקבלים מבעל האירוע">
              <input id="admin-pass" type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!password}>
              כניסה
            </Button>
          </form>
          <div className="relative py-1 text-center text-sm text-muted-fg">
            <span className="bg-card px-3">או, לבעל האירוע</span>
          </div>
          <GoogleButton href={`/api/auth/login?next=${encodeURIComponent(`/${code}/manage`)}`} />
        </Card>
        <Link to={`/${code}`} className="text-center font-semibold underline underline-offset-4">
          חזרה לעמוד האירוע
        </Link>
      </main>
    </EventBackdrop>
  );
}
