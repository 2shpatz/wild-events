import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarPlus,
  ExternalLink,
  Images,
  LogOut,
  QrCode,
  Settings,
  Users,
  AlertTriangle,
  ShieldCheck,
  Hourglass,
  HardDrive,
  ArrowLeftRight,
  Link2,
  Sparkles,
  Download,
} from "lucide-react";
import { useMe } from "../lib/session";
import { api } from "../lib/api";
import { applyTheme, THEME_LABELS } from "../lib/themes";
import { formatBytes, formatDate } from "../lib/format";
import { Button, Card, LinkButton, Modal, Spinner, cx, useToast } from "../components/ui";
import { freeBytes, StorageBar, storageLevel } from "../components/StorageBar";
import { connectHref } from "../components/StorageAccountPicker";
import { QRShare } from "../components/QRShare";
import { GoogleButton } from "../components/GoogleButton";
import { OwnSiteNote } from "../components/OwnSiteNote";
import type { OwnerEventSummary, StorageAccountDTO } from "../../shared/types";

export default function Dashboard() {
  const { me, refresh } = useMe();
  const navigate = useNavigate();
  const [events, setEvents] = useState<OwnerEventSummary[] | null>(null);
  const [qrFor, setQrFor] = useState<OwnerEventSummary | null>(null);
  const [accounts, setAccounts] = useState<StorageAccountDTO[] | null>(null);
  const [params, setParams] = useSearchParams();
  const toast = useToast();

  useEffect(() => applyTheme("general"), []);
  useEffect(() => {
    if (me && !me.owner) navigate("/login?next=/dashboard", { replace: true });
  }, [me, navigate]);
  useEffect(() => {
    if (!me?.owner) return;
    api<{ events: OwnerEventSummary[] }>("/owner/events").then((r) => setEvents(r.events)).catch(() => setEvents([]));
    // Storage of every account the events live in (one request, cached per account on the server).
    api<{ accounts: StorageAccountDTO[] }>("/owner/accounts").then((r) => setAccounts(r.accounts)).catch(() => setAccounts([]));
  }, [me]);

  // Back from reconnecting an event's Google account.
  useEffect(() => {
    const connected = params.get("connected");
    const self = params.get("account") === "self";
    const err = params.get("account_error");
    if (!connected && !self && !err) return;
    setParams({}, { replace: true });
    toast(err ? "לא הצלחנו לחבר את החשבון. אפשר לנסות שוב." : "החשבון חובר מחדש", err ? "error" : "success");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                {me.siteAdmin.pending > 0 ? (
                  <span className="absolute -end-2 -top-2 min-w-6 rounded-full bg-amber-500 px-1.5 text-center text-xs leading-6 text-white">
                    <span aria-hidden>{me.siteAdmin.pending}</span>
                    <span className="sr-only">({me.siteAdmin.pending} ממתינים לאישור)</span>
                  </span>
                ) : (
                  me.siteAdmin.update && (
                    <span className="absolute -end-1 -top-1 size-3 rounded-full bg-sky-500 ring-2 ring-card">
                      <span className="sr-only">({me.siteAdmin.update === "updated" ? "האתר עודכן לגרסה חדשה" : "יש גרסה חדשה"})</span>
                    </span>
                  )
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

        {!me.siteAdmin && me.siteOperator && <OwnSiteNote operator={me.siteOperator} />}

        {me.siteAdmin?.update && (
          <Card
            className={cx(
              "flex flex-wrap items-center justify-between gap-3",
              me.siteAdmin.update === "updated" ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-sky-300 bg-sky-50 text-sky-950",
            )}
          >
            <p className="flex items-center gap-2 text-lg font-bold" role="status">
              {me.siteAdmin.update === "updated" ? <Sparkles className="size-5 shrink-0" aria-hidden /> : <Download className="size-5 shrink-0" aria-hidden />}
              {me.siteAdmin.update === "updated" ? "האתר עודכן לגרסה חדשה" : "יצאה גרסה חדשה של האתר"}
            </p>
            <LinkButton href="/admin?tab=updates" variant="outline">
              מה חדש
            </LinkButton>
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
                  <EventStorage event={ev} accounts={accounts} />
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
        {qrFor && <QRShare code={qrFor.code} title={qrFor.title} shareText={qrFor.shareText} />}
      </Modal>
    </div>
  );
}

/** The Google account that holds one event, and how full it is. */
function EventStorage({ event, accounts }: { event: OwnerEventSummary; accounts: StorageAccountDTO[] | null }) {
  const account = accounts?.find((a) => a.id === event.storageAccountId);
  if (!accounts) {
    return <div className="h-[4.5rem] animate-pulse rounded-2xl bg-muted" aria-label="טוען נפח אחסון" />;
  }
  if (!account) return null;
  const s = account.storage;
  const level = storageLevel(s);
  const left = freeBytes(s);
  return (
    <div
      className={cx(
        "space-y-2 rounded-2xl border p-3",
        !account.connected || level === "critical" ? "border-destructive/40 bg-destructive/5" : level === "warn" ? "border-amber-300 bg-amber-50" : "border-border bg-muted/40",
      )}
    >
      <p className="flex min-w-0 items-center gap-2 text-sm">
        <HardDrive className="size-4 shrink-0 text-muted-fg" aria-hidden />
        <span className="min-w-0 truncate font-semibold" dir="ltr">
          {account.email}
        </span>
        <span
          className={cx(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
            account.personal ? "bg-destructive/10 text-destructive" : "bg-emerald-100 text-emerald-800",
          )}
        >
          {account.personal ? "חשבון פרטי" : "חשבון ייעודי"}
        </span>
      </p>

      {event.migrating ? (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
          <ArrowLeftRight className="size-4 shrink-0" aria-hidden />
          האירוע עובר עכשיו לחשבון אחר. ההעלאות סגורות עד הסוף.
        </p>
      ) : !account.connected ? (
        <div className="space-y-2">
          <p className="flex gap-1.5 text-sm font-semibold text-destructive" role="alert">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            החיבור לחשבון פג. האורחים לא יכולים להעלות עד שמחברים אותו מחדש.
          </p>
          <LinkButton href={connectHref("/dashboard", account.email)} size="sm" icon={<Link2 className="size-4" aria-hidden />}>
            חיבור מחדש
          </LinkButton>
        </div>
      ) : s ? (
        <>
          <StorageBar storage={s} label={`שימוש באחסון של ${account.email}`} />
          <p className={cx("text-sm", level === "critical" ? "font-bold text-destructive" : level === "warn" ? "font-semibold text-amber-900" : "text-muted-fg")}>
            {left === null ? (
              <>ללא מגבלת נפח · בשימוש {formatBytes(s.usage)}</>
            ) : (
              <>
                {level === "critical" ? "כמעט מלא! " : level === "warn" ? "מעל 80% · " : ""}
                נשארו {formatBytes(left)} מתוך {formatBytes(s.limit)}
              </>
            )}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-fg">לא הצלחנו לקרוא כרגע את נתוני הנפח.</p>
      )}
    </div>
  );
}
