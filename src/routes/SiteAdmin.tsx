import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  Check,
  ChevronDown,
  ExternalLink,
  Hourglass,
  Images,
  LayoutDashboard,
  Mail,
  MailCheck,
  MailWarning,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
  FolderOpen,
} from "lucide-react";
import { useMe } from "../lib/session";
import { api, errorMessage } from "../lib/api";
import { applyTheme } from "../lib/themes";
import { formatDate } from "../lib/format";
import { Button, Card, ConfirmDialog, Field, LinkButton, Modal, Spinner, cx, inputClass, useToast } from "../components/ui";
import { Toggle } from "../components/manage/Toggle";
import type { AdminOverview, MailOutcome, MemberDTO, MemberEventDTO } from "../../shared/types";

type Tab = "users" | "waitlist" | "archive" | "settings";
const TABS: Tab[] = ["users", "waitlist", "archive", "settings"];

const dateFmt = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", year: "numeric" });
const fmt = (ms: number | null | undefined) => (ms ? dateFmt.format(ms) : "");
const num = (n: number) => n.toLocaleString("he-IL");

const MAIL_ERRORS: Record<NonNullable<MailOutcome["mailError"]>, string> = {
  not_connected: "שליחת מיילים עוד לא חוברה (בלשונית הגדרות).",
  api_disabled: "ה-Gmail API כבוי בפרויקט ב-Google Cloud (הסבר בלשונית הגדרות).",
  reauth: "צריך לחבר מחדש את שליחת המיילים (בלשונית הגדרות).",
  error: "Google לא הצליחה לשלוח את המייל. אפשר לנסות שוב.",
};

/** One toast that reports both the action and whether its email went out. */
function useOutcome() {
  const toast = useToast();
  return useCallback(
    (done: string, r: MailOutcome, mailedText = "ונשלח מייל") => {
      if (r.mailed === undefined) toast(done);
      else if (r.mailed) toast(`${done} ${mailedText}`);
      else toast(`${done}, אבל המייל לא נשלח: ${MAIL_ERRORS[r.mailError || "error"]}`, "info");
    },
    [toast],
  );
}

export default function SiteAdmin() {
  const { me, refresh } = useMe();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get("tab") as Tab) ? (params.get("tab") as Tab) : "users";
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => applyTheme("general"), []);
  useEffect(() => {
    document.title = "ניהול האתר · אירוע פרוע";
  }, []);
  useEffect(() => {
    if (!me) return;
    if (!me.owner) navigate("/login?next=/admin", { replace: true });
    else if (!me.siteAdmin) navigate("/dashboard", { replace: true });
  }, [me, navigate]);

  const loadOverview = useCallback(() => {
    api<AdminOverview>("/admin/overview").then(setOverview).catch((e) => toast(errorMessage(e), "error"));
  }, [toast]);
  useEffect(() => {
    if (me?.siteAdmin) loadOverview();
  }, [me?.siteAdmin, loadOverview, version]);

  // Back from Google after "connect email sending".
  useEffect(() => {
    const m = params.get("mail");
    if (!m) return;
    const texts: Record<string, [string, "success" | "error"]> = {
      connected: ["שליחת המיילים חוברה בהצלחה", "success"],
      not_granted: ["לא אושרה שליחת מיילים במסך של Google. נסו שוב וסמנו את ההרשאה.", "error"],
      wrong_account: ["צריך להתחבר עם החשבון של מנהל/ת האתר.", "error"],
      denied: ["החיבור בוטל.", "error"],
    };
    const [text, kind] = texts[m] || ["החיבור לשליחת מיילים לא הצליח. נסו שוב.", "error"];
    toast(text, kind);
    const next = new URLSearchParams(params);
    next.delete("mail");
    setParams(next, { replace: true });
  }, [params, setParams, toast]);

  /** After any change: reload counts, the open list and the dashboard badge. */
  const changed = useCallback(() => {
    setVersion((v) => v + 1);
    refresh();
  }, [refresh]);

  if (!me?.siteAdmin) return <Spinner className="min-h-dvh" />;

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set("tab", t);
    setParams(next);
  };
  const counts = overview?.counts;
  const tabs: { id: Tab; label: string; icon: ReactNode; count?: number }[] = [
    { id: "users", label: "משתמשים", icon: <Users className="size-5" aria-hidden />, count: counts?.approved },
    { id: "waitlist", label: "ממתינים", icon: <Hourglass className="size-5" aria-hidden />, count: counts?.pending },
    { id: "archive", label: "ארכיון", icon: <Archive className="size-5" aria-hidden />, count: counts?.archived },
    { id: "settings", label: "הגדרות", icon: <Settings className="size-5" aria-hidden /> },
  ];

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-2 text-xl font-extrabold">
            <img src="/logo-mark.webp" alt="" className="size-9" />
            אירוע פרוע
          </Link>
          <LinkButton href="/dashboard" variant="ghost" size="sm" icon={<LayoutDashboard className="size-4" aria-hidden />}>
            האירועים שלי
          </LinkButton>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck className="size-7 text-primary" aria-hidden />
            ניהול האתר
          </h1>
          <p className="text-muted-fg">מי יכול ליצור אירועים באתר, בקשות הצטרפות והגדרות.</p>
        </div>

        {overview && !overview.mail.connected && tab !== "settings" && (
          <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-300 bg-amber-50 text-amber-900">
            <p className="flex items-center gap-2 font-medium">
              <MailWarning className="size-5 shrink-0" aria-hidden />
              שליחת מיילים עוד לא מחוברת, ולכן הזמנות והתראות לא נשלחות.
            </p>
            <Button variant="outline" size="sm" onClick={() => setTab("settings")}>
              לחיבור
            </Button>
          </Card>
        )}

        <div role="tablist" aria-label="אזורי ניהול" className="grid grid-cols-4 gap-1 rounded-2xl bg-muted p-1">
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={active}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={cx(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-sm font-semibold transition-colors duration-200 sm:flex-row sm:gap-2 sm:text-base",
                  active ? "bg-card text-fg shadow-soft" : "text-muted-fg hover:text-fg",
                )}
              >
                {t.icon}
                <span>{t.label}</span>
                {t.count !== undefined && t.count > 0 && (
                  <span
                    className={cx(
                      "absolute end-1 top-1 min-w-6 rounded-full px-1.5 text-xs leading-6 sm:static",
                      t.id === "waitlist" ? "bg-amber-500 text-white" : "bg-fg/10 text-fg",
                    )}
                  >
                    <span aria-hidden>{num(t.count)}</span>
                    <span className="sr-only">({num(t.count)})</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "users" && <UsersTab version={version} onChanged={changed} />}
          {tab === "waitlist" && <WaitlistTab version={version} onChanged={changed} overview={overview} goSettings={() => setTab("settings")} />}
          {tab === "archive" && <ArchiveTab version={version} onChanged={changed} />}
          {tab === "settings" && overview && <SettingsTab overview={overview} onChanged={changed} />}
          {tab === "settings" && !overview && <Spinner />}
        </section>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- shared bits

function useMembers(status: MemberDTO["status"], version: number) {
  const toast = useToast();
  const [members, setMembers] = useState<MemberDTO[] | null>(null);
  useEffect(() => {
    let live = true;
    api<{ members: MemberDTO[] }>(`/admin/members?status=${status}`)
      .then((r) => live && setMembers(r.members))
      .catch((e) => {
        if (live) setMembers([]);
        toast(errorMessage(e), "error");
      });
    return () => {
      live = false;
    };
  }, [status, version, toast]);
  return members;
}

function Avatar({ m }: { m: Pick<MemberDTO, "picture" | "name" | "email"> }) {
  if (m.picture) return <img src={m.picture} alt="" className="size-12 shrink-0 rounded-full" referrerPolicy="no-referrer" />;
  const letter = (m.name || m.email).trim().charAt(0).toUpperCase();
  return (
    <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-bold text-muted-fg">
      {letter}
    </span>
  );
}

function Who({ m, children }: { m: MemberDTO; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Avatar m={m} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
          <span className="truncate">{m.name || m.email}</span>
          {children}
        </p>
        {m.name && (
          <p dir="ltr" className="truncate text-start text-sm text-muted-fg">
            {m.email}
          </p>
        )}
      </div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "admin" | "warn" | "muted"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "admin" && "bg-primary text-on-primary",
        tone === "warn" && "bg-amber-100 text-amber-900",
        tone === "muted" && "bg-muted text-muted-fg",
      )}
    >
      {children}
    </span>
  );
}

function Stats({ m }: { m: MemberDTO }) {
  const items = [
    { icon: <CalendarDays className="size-4" aria-hidden />, n: m.events, label: "אירועים" },
    { icon: <FolderOpen className="size-4" aria-hidden />, n: m.albums, label: "אלבומים" },
    { icon: <Images className="size-4" aria-hidden />, n: m.photos, label: "תמונות וסרטונים" },
  ];
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((s) => (
        <div key={s.label} className="rounded-xl bg-muted px-3 py-2">
          <dt className="flex items-center gap-1.5 text-xs text-muted-fg">
            {s.icon}
            {s.label}
          </dt>
          <dd className="text-xl font-bold tabular-nums">{num(s.n)}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="text-muted-fg">{icon}</span>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="max-w-sm text-muted-fg">{text}</p>
    </Card>
  );
}

function NotifyCheck({ checked, onChange, text }: { checked: boolean; onChange: (v: boolean) => void; text: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-muted px-4 py-2 font-medium">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 shrink-0 accent-primary" />
      {text}
    </label>
  );
}

/** Confirm dialog for archive / restore / permanent delete, with "email the user about it". */
type MemberAction = "archive" | "restore" | "delete";
function MemberActionDialog({
  target,
  onClose,
  onDone,
}: {
  target: { m: MemberDTO; action: MemberAction } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const outcome = useOutcome();
  const [notify, setNotify] = useState(true);
  useEffect(() => {
    if (target) setNotify(true);
  }, [target]);
  if (!target) return null;
  const { m, action } = target;
  const who = m.name || m.email;
  const owns = m.events === 1 ? "אירוע אחד" : `${num(m.events)} אירועים`;
  const cfg = {
    archive: {
      title: `להעביר את ${who} לארכיון?`,
      label: "העברה לארכיון",
      danger: true,
      body: (
        <ul className="list-disc space-y-1.5 ps-5">
          <li>הוא/היא לא יוכל/תוכל להתחבר לאתר, וינותק/תנותק מיד.</li>
          <li>דפי האירועים שלו/ה ({owns}) יפסיקו להיות זמינים לאורחים.</li>
          <li>שום דבר לא נמחק: אפשר להחזיר מהארכיון בכל רגע, והכל יחזור כמו שהיה.</li>
        </ul>
      ),
      notifyText: "לשלוח לו/ה מייל שהחשבון הושהה",
      done: "החשבון הועבר לארכיון",
    },
    restore: {
      title: `להחזיר את ${who} מהארכיון?`,
      label: "החזרה",
      danger: false,
      body: <p>הוא/היא יוכל/תוכל להתחבר שוב, ודפי האירועים שלו/ה ({owns}) יחזרו להיות זמינים לאורחים.</p>,
      notifyText: "לשלוח לו/ה מייל שהחשבון חזר לפעול",
      done: "החשבון הוחזר",
    },
    delete: {
      title: `למחוק את ${who} לצמיתות?`,
      label: "מחיקה לצמיתות",
      danger: true,
      body: (
        <ul className="list-disc space-y-1.5 ps-5">
          <li>
            <strong>אי אפשר לבטל את זה.</strong> החשבון, דפי האירועים ({owns}), האלבומים וההגדרות שלהם יימחקו מהאתר.
          </li>
          <li>התמונות והסרטונים עצמם נשארים ב-Google Photos של המשתמש/ת. האתר לא מוחק אותם.</li>
          <li>אם הוא/היא ינסה/תנסה להתחבר שוב בעתיד, זה ייחשב כמשתמש/ת חדש/ה.</li>
        </ul>
      ),
      notifyText: "לשלוח לו/ה מייל שהחשבון נמחק",
      done: "החשבון נמחק",
    },
  }[action];
  return (
    <ConfirmDialog
      open
      title={cfg.title}
      danger={cfg.danger}
      confirmLabel={cfg.label}
      requireText={action === "delete" ? m.email : undefined}
      message={
        <>
          {cfg.body}
          <NotifyCheck checked={notify} onChange={setNotify} text={cfg.notifyText} />
        </>
      }
      onClose={onClose}
      onConfirm={async () => {
        try {
          const r = await api<MailOutcome>(`/admin/members/${action}`, { method: "POST", json: { email: m.email, notify } });
          outcome(cfg.done, r);
          onDone();
        } catch (e) {
          toast(errorMessage(e), "error");
        }
      }}
    />
  );
}

// ---------------------------------------------------------------- users

function UsersTab({ version, onChanged }: { version: number; onChanged: () => void }) {
  const members = useMembers("approved", version);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<{ m: MemberDTO; action: MemberAction } | null>(null);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!members || !s) return members;
    return members.filter((m) => m.email.includes(s) || (m.name || "").toLowerCase().includes(s));
  }, [members, q]);

  return (
    <div className="space-y-5">
      <AddMemberForm onAdded={onChanged} />
      {members === null ? (
        <Spinner />
      ) : (
        <>
          {members.length > 4 && (
            <div className="relative">
              <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-fg" aria-hidden />
              <input
                type="search"
                aria-label="חיפוש משתמש לפי שם או מייל"
                placeholder="חיפוש לפי שם או מייל"
                className={cx(inputClass, "ps-12")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          )}
          <p className="text-sm text-muted-fg" role="status">
            {shown && shown.length !== members.length ? `נמצאו ${num(shown.length)} מתוך ${num(members.length)} משתמשים` : `${num(members.length)} משתמשים מורשים`}
          </p>
          <ul className="grid gap-4 lg:grid-cols-2">
            {shown!.map((m) => (
              <li key={m.email}>
                <MemberCard m={m} onArchive={() => setTarget({ m, action: "archive" })} />
              </li>
            ))}
          </ul>
        </>
      )}
      <MemberActionDialog target={target} onClose={() => setTarget(null)} onDone={onChanged} />
    </div>
  );
}

function AddMemberForm({ onAdded }: { onAdded: () => void }) {
  const outcome = useOutcome();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const r = await api<MailOutcome>("/admin/members", { method: "POST", json: { email, name } });
            outcome(`${email} נוסף/ה לרשימה`, r, "ונשלחה הזמנה במייל");
            setEmail("");
            setName("");
            onAdded();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <UserPlus className="size-5 text-primary" aria-hidden />
            הוספת משתמש/ת
          </h2>
          <p className="text-sm text-muted-fg">הכתובת של חשבון ה-Google שאיתו הם יתחברו. ישלח אליהם מייל הזמנה עם קישור לאתר.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="מייל" htmlFor="add-email" error={error}>
            <input
              id="add-email"
              type="email"
              dir="ltr"
              required
              autoComplete="off"
              inputMode="email"
              className={inputClass}
              placeholder="name@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="שם (לא חובה)" htmlFor="add-name">
            <input id="add-name" className={inputClass} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" loading={busy} icon={<Send className="size-4" aria-hidden />}>
          הוספה ושליחת הזמנה
        </Button>
      </form>
    </Card>
  );
}

function MemberCard({ m, onArchive }: { m: MemberDTO; onArchive: () => void }) {
  const toast = useToast();
  const outcome = useOutcome();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<MemberEventDTO[] | null>(null);
  const [sending, setSending] = useState(false);
  const notInvited = !m.invitedAt && (m.source === "manual" || m.source === "waitlist");

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && events === null) {
      try {
        setEvents((await api<{ events: MemberEventDTO[] }>(`/admin/members/events?email=${encodeURIComponent(m.email)}`)).events);
      } catch (e) {
        setEvents([]);
        toast(errorMessage(e), "error");
      }
    }
  };

  return (
    <Card className="flex h-full flex-col gap-4">
      <Who m={m}>
        {m.isAdmin && (
          <Badge tone="admin">
            <ShieldCheck className="size-3.5" aria-hidden />
            מנהל/ת האתר
          </Badge>
        )}
        {notInvited && <Badge tone="warn">הזמנה לא נשלחה</Badge>}
      </Who>
      <Stats m={m} />
      <p className="text-sm text-muted-fg">
        {m.approvedAt ? `מורשה מאז ${fmt(m.approvedAt)}` : "מורשה"}
        {" · "}
        {m.lastLoginAt ? `כניסה אחרונה ${fmt(m.lastLoginAt)}` : "עוד לא התחבר/ה"}
      </p>

      {open && (
        <div id={`events-${m.email}`} className="rounded-xl border border-border">
          {events === null ? (
            <Spinner label="טוען אירועים…" className="p-4" />
          ) : events.length === 0 ? (
            <p className="p-4 text-muted-fg">אין עדיין אירועים.</p>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((ev) => (
                <li key={ev.code} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <a href={`/${ev.code}`} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 font-semibold underline-offset-4 hover:underline">
                      <span className="truncate">{ev.title}</span>
                      <ExternalLink className="size-4 shrink-0 text-muted-fg" aria-hidden />
                      <span className="sr-only">(נפתח בלשונית חדשה)</span>
                    </a>
                    <p className="text-sm text-muted-fg">{ev.date ? formatDate(ev.date) : `נוצר ${fmt(ev.createdAt)}`}</p>
                  </div>
                  <p className="flex shrink-0 gap-3 text-sm">
                    <span className="inline-flex items-center gap-1" title="אלבומים">
                      <FolderOpen className="size-4 text-muted-fg" aria-hidden />
                      {num(ev.albums)}
                      <span className="sr-only">אלבומים</span>
                    </span>
                    <span className="inline-flex items-center gap-1" title="תמונות וסרטונים">
                      <Images className="size-4 text-muted-fg" aria-hidden />
                      {num(ev.photos)}
                      <span className="sr-only">תמונות וסרטונים</span>
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={`events-${m.email}`}
          disabled={m.events === 0}
          icon={<ChevronDown className={cx("size-4 transition-transform duration-200", open && "rotate-180")} aria-hidden />}
        >
          {m.events === 0 ? "אין אירועים" : open ? "הסתרת האירועים" : "האירועים שלו/ה"}
        </Button>
        {!m.isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            loading={sending}
            icon={<Mail className="size-4" aria-hidden />}
            onClick={async () => {
              setSending(true);
              try {
                outcome("ההזמנה", await api<MailOutcome>("/admin/members/invite", { method: "POST", json: { email: m.email } }), "נשלחה שוב");
              } catch (e) {
                toast(errorMessage(e), "error");
              } finally {
                setSending(false);
              }
            }}
          >
            {notInvited ? "שליחת הזמנה" : "שליחת הזמנה שוב"}
          </Button>
        )}
        {!m.isAdmin && (
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onArchive} icon={<Archive className="size-4" aria-hidden />}>
            העברה לארכיון
          </Button>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- waitlist

function WaitlistTab({
  version,
  onChanged,
  overview,
  goSettings,
}: {
  version: number;
  onChanged: () => void;
  overview: AdminOverview | null;
  goSettings: () => void;
}) {
  const members = useMembers("pending", version);
  const toast = useToast();
  const outcome = useOutcome();
  const [busy, setBusy] = useState<string | null>(null);
  const [reject, setReject] = useState<MemberDTO | null>(null);

  return (
    <div className="space-y-5">
      {overview && !overview.waitlistEnabled && (
        <Card className="flex flex-wrap items-center justify-between gap-3 bg-muted">
          <p>רשימת ההמתנה כבויה: משתמשים חדשים נכנסים מיד. בקשות שכבר כאן נשארות עד שתאשרו או תדחו אותן.</p>
          <Button variant="outline" size="sm" onClick={goSettings}>
            להגדרות
          </Button>
        </Card>
      )}
      {members === null ? (
        <Spinner />
      ) : members.length === 0 ? (
        <EmptyState
          icon={<Hourglass className="size-14" aria-hidden />}
          title="אין בקשות שממתינות"
          text="כשמישהו חדש ינסה להתחבר, הבקשה שלו תופיע כאן ותקבלו עליה מייל."
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {members.map((m) => (
            <li key={m.email}>
              <Card className="flex h-full flex-col gap-4">
                <Who m={m} />
                <p className="text-sm text-muted-fg">ביקש/ה להצטרף ב-{fmt(m.requestedAt)}</p>
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <Button
                    loading={busy === m.email}
                    disabled={!!busy}
                    icon={<Check className="size-5" aria-hidden />}
                    onClick={async () => {
                      setBusy(m.email);
                      try {
                        outcome(`${m.name || m.email} אושר/ה`, await api<MailOutcome>("/admin/members/approve", { method: "POST", json: { email: m.email } }), "ונשלחה הזמנה במייל");
                        onChanged();
                      } catch (e) {
                        toast(errorMessage(e), "error");
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    אישור
                  </Button>
                  <Button variant="outline" disabled={!!busy} onClick={() => setReject(m)} icon={<X className="size-5" aria-hidden />}>
                    דחייה
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!reject}
        title={`לדחות את הבקשה של ${reject?.name || reject?.email || ""}?`}
        confirmLabel="דחיית הבקשה"
        message={<p>הבקשה תוסר מהרשימה. לא נשלח מייל. אם הוא/היא ינסה/תנסה להתחבר שוב, תיפתח בקשה חדשה.</p>}
        onClose={() => setReject(null)}
        onConfirm={async () => {
          try {
            await api("/admin/members/reject", { method: "POST", json: { email: reject!.email } });
            toast("הבקשה נדחתה");
            onChanged();
          } catch (e) {
            toast(errorMessage(e), "error");
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- archive

function ArchiveTab({ version, onChanged }: { version: number; onChanged: () => void }) {
  const members = useMembers("archived", version);
  const [target, setTarget] = useState<{ m: MemberDTO; action: MemberAction } | null>(null);
  return (
    <div className="space-y-5">
      <p className="text-muted-fg">חשבונות בארכיון לא יכולים להתחבר, ודפי האירועים שלהם לא זמינים לאורחים. אפשר להחזיר אותם, או למחוק לצמיתות.</p>
      {members === null ? (
        <Spinner />
      ) : members.length === 0 ? (
        <EmptyState icon={<Archive className="size-14" aria-hidden />} title="הארכיון ריק" text="חשבונות שתעבירו לארכיון מלשונית המשתמשים יופיעו כאן." />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {members.map((m) => (
            <li key={m.email}>
              <Card className="flex h-full flex-col gap-4">
                <Who m={m}>
                  <Badge tone="muted">בארכיון מ-{fmt(m.archivedAt)}</Badge>
                </Who>
                <Stats m={m} />
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setTarget({ m, action: "restore" })} icon={<ArchiveRestore className="size-5" aria-hidden />}>
                    החזרה
                  </Button>
                  <Button variant="danger" onClick={() => setTarget({ m, action: "delete" })} icon={<Trash2 className="size-5" aria-hidden />}>
                    מחיקה לצמיתות
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <MemberActionDialog target={target} onClose={() => setTarget(null)} onDone={onChanged} />
    </div>
  );
}

// ---------------------------------------------------------------- settings

function SettingsTab({ overview, onChanged }: { overview: AdminOverview; onChanged: () => void }) {
  return (
    <div className="space-y-5">
      <WaitlistSetting overview={overview} onChanged={onChanged} />
      <MailSetting overview={overview} />
      <OperatorSetting overview={overview} onChanged={onChanged} />
      <Card className="space-y-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ShieldCheck className="size-5 text-primary" aria-hidden />
          מנהל/ת האתר
        </h2>
        <p>
          החשבון המנהל: <span dir="ltr" className="font-semibold">{overview.admin?.email}</span>
        </p>
        <p className="text-sm text-muted-fg">
          ניהול האתר שייך למי שמארח/ת אותו. כדי להעביר את הניהול לחשבון Google אחר: פותחים את קישור ההגדרה שקיבלתם בהתקנה (הוא מודפס גם אחרי
          npm run deploy), ובשלב האחרון לוחצים "כניסה כמנהל/ת האתר" עם החשבון החדש.
        </p>
      </Card>
    </div>
  );
}

function WaitlistSetting({ overview, onChanged }: { overview: AdminOverview; onChanged: () => void }) {
  const toast = useToast();
  const [asking, setAsking] = useState<null | boolean>(null); // the value we're asking to switch to
  const [approveAll, setApproveAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = overview.counts.pending;
  const turningOff = asking === false;

  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ approved: number; mailed: number; notMailed: number; mailError?: MailOutcome["mailError"] }>("/admin/settings/waitlist", {
        method: "PUT",
        json: { enabled: asking, approvePending: turningOff && approveAll },
      });
      if (!turningOff) toast("רשימת ההמתנה הופעלה");
      else if (!r.approved) toast("רשימת ההמתנה כובתה");
      else if (!r.notMailed) toast(`רשימת ההמתנה כובתה. ${num(r.approved)} משתמשים אושרו וקיבלו הזמנה`);
      else
        toast(
          `רשימת ההמתנה כובתה ו-${num(r.approved)} משתמשים אושרו. ${num(r.notMailed)} הזמנות לא נשלחו${r.mailError ? `: ${MAIL_ERRORS[r.mailError]}` : ""} אפשר לשלוח אותן מלשונית המשתמשים.`,
          "info",
        );
      setAsking(null);
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Hourglass className="size-5 text-primary" aria-hidden />
        רשימת המתנה
      </h2>
      <Toggle
        checked={overview.waitlistEnabled}
        onChange={(v) => {
          setApproveAll(false);
          setAsking(v);
        }}
        label={overview.waitlistEnabled ? "פעילה: משתמשים חדשים מחכים לאישור שלך" : "כבויה: כל מי שמתחבר יכול להשתמש באתר מיד"}
        hint="כשהיא פעילה, מי שמתחבר בפעם הראשונה נכנס לרשימת ההמתנה ואת/ה מקבל/ת מייל לאישור."
      />
      <Modal
        open={asking !== null}
        onClose={() => !busy && setAsking(null)}
        title={turningOff ? "לכבות את רשימת ההמתנה?" : "להפעיל את רשימת ההמתנה?"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(null)} disabled={busy} autoFocus>
              ביטול
            </Button>
            <Button loading={busy} onClick={save}>
              {turningOff ? "כיבוי רשימת ההמתנה" : "הפעלת רשימת ההמתנה"}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-base leading-relaxed">
          {turningOff ? (
            <>
              <p>
                <strong>כל מי שיתחבר עם חשבון Google יוכל ליצור אירועים מיד</strong>, בלי לחכות לאישור שלך ובלי שתקבל/י מייל.
              </p>
              <p className="text-muted-fg">משתמשים שכבר אישרת לא מושפעים. אפשר להפעיל את הרשימה שוב בכל רגע, ואפשר תמיד להעביר משתמשים לארכיון.</p>
              {pending > 0 && (
                <fieldset className="space-y-2">
                  <legend className="mb-2 font-semibold">מה לעשות עם {pending === 1 ? "הבקשה שממתינה" : `${num(pending)} הבקשות שממתינות`}?</legend>
                  <RadioRow
                    checked={!approveAll}
                    onChange={() => setApproveAll(false)}
                    title="להשאיר אותן ברשימת ההמתנה"
                    text="אפשר עדיין לאשר כל אחת ידנית. אם תפעילו שוב את הרשימה, הן יחכו שם."
                  />
                  <RadioRow
                    checked={approveAll}
                    onChange={() => setApproveAll(true)}
                    title={pending === 1 ? "לאשר אותה ולשלוח הזמנה" : `לאשר את כל ה-${num(pending)} ולשלוח להם הזמנה`}
                    text="כולם יקבלו מייל הזמנה עם קישור לאתר."
                  />
                </fieldset>
              )}
            </>
          ) : (
            <>
              <p>
                <strong>מעכשיו, מי שמתחבר בפעם הראשונה ייכנס לרשימת ההמתנה</strong>, ואת/ה תקבל/י מייל כדי לאשר או לדחות.
              </p>
              <p className="text-muted-fg">משתמשים שכבר מורשים ממשיכים להשתמש באתר כרגיל.</p>
            </>
          )}
        </div>
      </Modal>
    </Card>
  );
}

function RadioRow({ checked, onChange, title, text }: { checked: boolean; onChange: () => void; title: string; text: string }) {
  return (
    <label
      className={cx(
        "flex cursor-pointer gap-3 rounded-xl border-2 p-3 transition-colors duration-200",
        checked ? "border-primary bg-primary/5" : "border-border hover:bg-fg/5",
      )}
    >
      <input type="radio" name="pending-choice" checked={checked} onChange={onChange} className="mt-1 size-5 shrink-0 accent-primary" />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="text-sm text-muted-fg">{text}</span>
      </span>
    </label>
  );
}

function MailSetting({ overview }: { overview: AdminOverview }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const connected = overview.mail.connected;
  return (
    <Card className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Mail className="size-5 text-primary" aria-hidden />
        שליחת מיילים
      </h2>
      {connected ? (
        <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-900">
          <MailCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>
            מחובר. המיילים נשלחים מה-Gmail שלך (<span dir="ltr">{overview.mail.email}</span>), ומופיעים אצלך בתיקיית "דואר יוצא".
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-amber-900">
          <MailWarning className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>לא מחובר. בלי זה האתר לא יכול לשלוח הזמנות למשתמשים או להודיע לך על בקשות חדשות (הן עדיין יופיעו כאן).</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <LinkButton href="/api/auth/login?mode=mail" variant={connected ? "outline" : "primary"} icon={<Mail className="size-4" aria-hidden />}>
          {connected ? "חיבור מחדש" : "חיבור שליחת מיילים"}
        </LinkButton>
        {connected && (
          <Button
            variant="ghost"
            loading={busy}
            icon={<Send className="size-4" aria-hidden />}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api<MailOutcome>("/admin/mail/test", { method: "POST" });
                if (r.mailed) toast(`נשלח מייל בדיקה אל ${overview.mail.email}`);
                else toast(MAIL_ERRORS[r.mailError || "error"], "error");
              } catch (e) {
                toast(errorMessage(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            שליחת מייל בדיקה
          </Button>
        )}
      </div>
      <details className="rounded-xl border border-border p-4">
        <summary className="cursor-pointer font-semibold">פעם ראשונה? 2 הגדרות ב-Google Cloud לפני החיבור</summary>
        <ol className="mt-3 list-decimal space-y-2 ps-5">
          <li>
            להפעיל את Gmail API בפרויקט שלכם:{" "}
            <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
              לדף ההפעלה
            </a>{" "}
            ← לבחור את הפרויקט של האתר ← Enable.
          </li>
          <li>
            להוסיף את הרשאת שליחת המיילים:{" "}
            <a href="https://console.cloud.google.com/auth/scopes" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
              Data Access
            </a>{" "}
            ← Add or remove scopes ← לסמן את <span dir="ltr" className="font-mono text-sm">gmail.send</span> ← Update ← Save.
          </li>
          <li>ללחוץ כאן על "חיבור שליחת מיילים" ולאשר במסך של Google. אם מופיע "Google hasn't verified this app": Advanced ← Go to... (זה האתר שלכם).</li>
        </ol>
        <p className="mt-3 text-sm text-muted-fg">רק את/ה נותן/ת את ההרשאה הזו. המשתמשים האחרים לא מתבקשים לאשר שום דבר נוסף.</p>
      </details>
    </Card>
  );
}

function OperatorSetting({ overview, onChanged }: { overview: AdminOverview; onChanged: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(overview.operator.name);
  const [email, setEmail] = useState(overview.operator.email);
  const [busy, setBusy] = useState(false);
  const dirty = name !== overview.operator.name || email !== overview.operator.email;
  return (
    <Card>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/admin/settings/operator", { method: "PUT", json: { name, email } });
            toast("הפרטים נשמרו");
            onChanged();
          } catch (err) {
            toast(errorMessage(err), "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <h2 className="text-lg font-bold">מפעיל/ת האתר</h2>
          <p className="text-sm text-muted-fg">מוצג בדפי הפרטיות ותנאי השימוש, כדי שאורחים ידעו למי לפנות.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="שם" htmlFor="op-name">
            <input id="op-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="מייל ליצירת קשר" htmlFor="op-email">
            <input id="op-email" type="email" dir="ltr" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
        </div>
        <Button type="submit" variant="outline" loading={busy} disabled={!dirty}>
          שמירה
        </Button>
      </form>
    </Card>
  );
}
