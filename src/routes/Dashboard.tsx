import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarPlus, ExternalLink, Images, LogOut, QrCode, Settings, Users, AlertTriangle, ShieldCheck, Hourglass } from "lucide-react";
import { useMe } from "../lib/session";
import { api } from "../lib/api";
import { applyTheme, THEME_LABELS } from "../lib/themes";
import { formatDate } from "../lib/format";
import { StorageMeter } from "../components/StorageMeter";
import { Button, Card, LinkButton, Modal, Spinner } from "../components/ui";
import { QRShare } from "../components/QRShare";
import { GoogleButton } from "../components/GoogleButton";
import type { OwnerEventSummary } from "../../shared/types";

export default function Dashboard() {
  const { me, refresh } = useMe();
  const navigate = useNavigate();
  const [events, setEvents] = useState<OwnerEventSummary[] | null>(null);
  const [qrFor, setQrFor] = useState<OwnerEventSummary | null>(null);

  useEffect(() => applyTheme("general"), []);
  useEffect(() => {
    if (me && !me.owner) navigate("/login?next=/dashboard", { replace: true });
  }, [me, navigate]);
  useEffect(() => {
    if (me?.owner) api<{ events: OwnerEventSummary[] }>("/owner/events").then((r) => setEvents(r.events)).catch(() => setEvents([]));
  }, [me]);

  if (!me?.owner) return <Spinner className="min-h-dvh" />;

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-2 text-xl font-extrabold">
            <img src="/logo-mark.webp" alt="" className="size-9" />
            אירוע פרוע
          </Link>
          <div className="flex items-center gap-3">
            {me.siteAdmin && (
              <LinkButton href="/admin" variant="outline" size="sm" className="relative" icon={<ShieldCheck className="size-4" aria-hidden />}>
                <span className="hidden sm:inline">ניהול האתר</span>
                <span className="sm:hidden">ניהול</span>
                {me.siteAdmin.pending > 0 && (
                  <span className="absolute -end-2 -top-2 min-w-6 rounded-full bg-amber-500 px-1.5 text-center text-xs leading-6 text-white">
                    <span aria-hidden>{me.siteAdmin.pending}</span>
                    <span className="sr-only">({me.siteAdmin.pending} ממתינים לאישור)</span>
                  </span>
                )}
              </LinkButton>
            )}
            {me.owner.picture && <img src={me.owner.picture} alt="" className="size-9 rounded-full" referrerPolicy="no-referrer" />}
            <span className="hidden text-sm text-muted-fg sm:inline">{me.owner.email}</span>
            <Button
              variant="ghost"
              size="sm"
              icon={<LogOut className="size-4" aria-hidden />}
              onClick={async () => {
                await api("/auth/logout", { method: "POST" });
                await refresh();
                navigate("/");
              }}
            >
              יציאה
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {!me.owner.connected && (
          <Card className="space-y-4 border-amber-300 bg-amber-50">
            <p className="flex items-center gap-2 text-lg font-bold text-amber-900">
              <AlertTriangle className="size-5" aria-hidden />
              החיבור ל-Google פג - האורחים לא יכולים להעלות עכשיו
            </p>
            <p className="text-amber-900">זה קורה לפעמים כשמשנים סיסמה ב-Google. לחיצה אחת ומתחברים מחדש:</p>
            <div className="max-w-sm">
              <GoogleButton href="/api/auth/login?next=/dashboard" label="התחברות מחדש עם Google" />
            </div>
          </Card>
        )}

        {me.siteAdmin && me.siteAdmin.pending > 0 && (
          <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-300 bg-amber-50 text-amber-900">
            <p className="flex items-center gap-2 text-lg font-bold" role="status">
              <Hourglass className="size-5 shrink-0" aria-hidden />
              {me.siteAdmin.pending === 1 ? "משתמש/ת אחד/ת מחכה לאישור שלך" : `${me.siteAdmin.pending} משתמשים מחכים לאישור שלך`}
            </p>
            <LinkButton href="/admin?tab=waitlist" variant="primary">
              לרשימת ההמתנה
            </LinkButton>
          </Card>
        )}

        <StorageMeter />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">האירועים שלי</h1>
          <LinkButton href="/dashboard/new" variant="primary" size="lg" icon={<CalendarPlus className="size-5" aria-hidden />}>
            אירוע חדש
          </LinkButton>
        </div>

        {events === null ? (
          <Spinner />
        ) : events.length === 0 ? (
          <Card className="flex flex-col items-center gap-4 py-12 text-center">
            <CalendarPlus className="size-14 text-muted-fg" aria-hidden />
            <h2 className="text-xl font-bold">עוד אין אירועים</h2>
            <p className="max-w-sm text-muted-fg">יוצרים אירוע בכמה צעדים פשוטים ומקבלים קוד QR לשליחה לאורחים.</p>
            <LinkButton href="/dashboard/new" size="lg" icon={<CalendarPlus className="size-5" aria-hidden />}>
              יצירת האירוע הראשון
            </LinkButton>
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {events.map((ev) => (
              <li key={ev.id}>
                <Card className="flex h-full flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-xl font-bold">{ev.title}</h2>
                      <p className="text-sm text-muted-fg">
                        {THEME_LABELS[ev.type]}
                        {ev.date && <> · {formatDate(ev.date)}</>}
                      </p>
                    </div>
                    <span dir="ltr" className="rounded-lg bg-muted px-2 py-1 font-mono text-sm text-muted-fg">
                      {ev.code}
                    </span>
                  </div>
                  <p className="flex gap-4 text-base">
                    <span className="inline-flex items-center gap-1.5">
                      <Images className="size-4 text-muted-fg" aria-hidden /> {ev.mediaCount.toLocaleString("he-IL")} פריטים
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-4 text-muted-fg" aria-hidden /> {ev.albumCount.toLocaleString("he-IL")} אלבומים
                    </span>
                  </p>
                  <div className="mt-auto grid grid-cols-2 gap-2">
                    <LinkButton href={`/${ev.code}/manage`} variant="primary" icon={<Settings className="size-4" aria-hidden />}>
                      ניהול
                    </LinkButton>
                    <Button variant="outline" onClick={() => setQrFor(ev)} icon={<QrCode className="size-4" aria-hidden />}>
                      QR ושיתוף
                    </Button>
                    <LinkButton href={`/${ev.code}/gallery`} variant="ghost" icon={<Images className="size-4" aria-hidden />}>
                      לגלריה
                    </LinkButton>
                    {ev.googleAlbumUrl && (
                      <LinkButton href={ev.googleAlbumUrl} target="_blank" rel="noopener noreferrer" variant="ghost" icon={<ExternalLink className="size-4" aria-hidden />}>
                        ב-Google Photos
                      </LinkButton>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Modal open={!!qrFor} onClose={() => setQrFor(null)} title={qrFor ? `שיתוף: ${qrFor.title}` : ""}>
        {qrFor && <QRShare code={qrFor.code} title={qrFor.title} />}
      </Modal>
    </div>
  );
}
