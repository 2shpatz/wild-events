import { useEffect, useState } from "react";
import { AlertTriangle, Check, ExternalLink, HardDrive, Link2, RefreshCw, ShieldCheck, Sparkles, Unlink, UserPlus } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { formatBytes } from "../lib/format";
import type { Quality, StorageAccountDTO, StorageInfo } from "../../shared/types";
import { Button, ConfirmDialog, IconButton, LinkButton, cx, useToast } from "./ui";
import { UnverifiedGuide } from "./UnverifiedGuide";

/** Average stored size of one photo, for "room for about N photos". */
const PHOTO_BYTES: Record<Quality, number> = { compressed: 700_000, original: 3_500_000 };
const LOW_FREE = 0.05;
export const GOOGLE_SIGNUP = "https://accounts.google.com/signup";

export const connectHref = (next: string, hint?: string | null) =>
  `/api/auth/login?mode=storage&next=${encodeURIComponent(next)}${hint ? `&hint=${encodeURIComponent(hint)}` : ""}`;

const free = (s: StorageInfo | null) => (s && s.limit !== null ? Math.max(0, s.limit - s.usage) : null);

/**
 * Choose the Google account that will hold an event's photos: the owner's own account (with a loud red
 * warning) or a dedicated account they connect (recommended, with a link to create one).
 */
export function StorageAccountPicker({
  value,
  onChange,
  quality,
  personalAck,
  onPersonalAck,
  connectNext,
  onBeforeConnect,
  excludeId,
  neededBytes,
  label = "חשבון האחסון של האירוע",
}: {
  value: string | null;
  onChange: (id: string, account: StorageAccountDTO) => void;
  quality: Quality;
  personalAck: boolean;
  onPersonalAck: (v: boolean) => void;
  /** where Google sends the owner back after connecting an account */
  connectNext: string;
  /** e.g. save the wizard draft before leaving the page */
  onBeforeConnect?: () => Promise<void> | void;
  /** hide this account (the one the event is already in) */
  excludeId?: string;
  /** when moving an event: how much has to fit */
  neededBytes?: number;
  label?: string;
}) {
  const toast = useToast();
  const [accounts, setAccounts] = useState<StorageAccountDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [guide, setGuide] = useState<{ hint: string | null } | null>(null);
  const [disconnect, setDisconnect] = useState<StorageAccountDTO | null>(null);

  const load = async (fresh = false) => {
    setLoading(true);
    try {
      const r = await api<{ accounts: StorageAccountDTO[] }>(`/owner/accounts${fresh ? "?fresh=1" : ""}`);
      setAccounts(r.accounts);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  // Tell the parent about the chosen account once the list arrives (e.g. right after connecting it).
  useEffect(() => {
    const a = accounts?.find((x) => x.id === value);
    if (a) onChange(a.id, a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  const list = (accounts || []).filter((a) => a.id !== excludeId);
  const selected = list.find((a) => a.id === value) || null;
  const selFree = free(selected?.storage ?? null);
  const tooSmall = neededBytes !== undefined && selFree !== null && neededBytes > selFree;
  const lowFree = !!selected?.storage?.percent && 1 - selected.storage.percent < LOW_FREE;

  return (
    <div className="space-y-5">
      {/* Recommended: a fresh Google account only for this event. */}
      <section className="space-y-4 rounded-2xl border-2 border-emerald-600/40 bg-emerald-50 p-5 text-emerald-950" aria-labelledby="dedicated-title">
        <h3 id="dedicated-title" className="flex items-center gap-2 text-lg font-bold">
          <ShieldCheck className="size-6 shrink-0 text-emerald-700" aria-hidden />
          מומלץ: חשבון Google חדש רק לאירוע
        </h3>
        <ul className="list-disc space-y-1 ps-5 text-base leading-relaxed">
          <li>כל חשבון Google חדש מקבל 15GB בחינם.</li>
          <li>האורחים ממלאים את החשבון של האירוע, לא את החשבון הפרטי שלך (ה-Gmail, ה-Drive והתמונות שלך נשארים בטוחים).</li>
          <li>אחרי האירוע אפשר למסור את החשבון לזוג או לשמור אותו כארכיון.</li>
        </ul>
        <ol className="space-y-2 text-base leading-relaxed">
          <li className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white">1</span>
            <span>
              יוצרים חשבון חדש (לוקח כ-2 דקות, נפתח בלשונית חדשה). שם לדוגמה: <span dir="ltr" className="break-all">noa.itai.photos@gmail.com</span>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white">2</span>
            <span>חוזרים לכאן, לוחצים "חיבור החשבון החדש" ובוחרים בו ברשימת החשבונות של Google.</span>
          </li>
        </ol>
        <div className="flex flex-col gap-3 sm:flex-row">
          <LinkButton
            href={GOOGLE_SIGNUP}
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            icon={<UserPlus className="size-5" aria-hidden />}
            className="bg-white"
          >
            יצירת חשבון Google חדש
            <ExternalLink className="size-4" aria-hidden />
          </LinkButton>
          <Button icon={<Link2 className="size-5" aria-hidden />} onClick={() => setGuide({ hint: null })}>
            חיבור החשבון החדש
          </Button>
        </div>
      </section>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <HardDrive className="size-5" aria-hidden />
            {label}
          </h3>
          <IconButton label="רענון נתוני נפח" onClick={() => load(true)} className="hover:bg-fg/5">
            <RefreshCw className={cx("size-5", loading && "animate-spin")} aria-hidden />
          </IconButton>
        </div>

        {failed && !accounts && <p className="text-muted-fg">לא הצלחנו לטעון את רשימת החשבונות. נסו לרענן.</p>}
        {!accounts && !failed && <p className="text-muted-fg">טוען חשבונות…</p>}

        {accounts && (
          <div role="radiogroup" aria-label={label} className="grid gap-3">
            {list.map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                quality={quality}
                active={value === a.id}
                onSelect={() => a.connected && onChange(a.id, a)}
                onReconnect={() => setGuide({ hint: a.email })}
                onDisconnect={!a.personal && a.eventsCount === 0 ? () => setDisconnect(a) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {selected?.personal && (
        <div role="alert" className="space-y-4 rounded-2xl border-2 border-destructive bg-destructive/10 p-5 text-destructive">
          <p className="flex items-start gap-3 text-lg font-bold leading-snug">
            <AlertTriangle className="mt-0.5 size-7 shrink-0" aria-hidden />
            זהירות: התמונות יישמרו בחשבון הפרטי שלך
          </p>
          <p className="text-base font-semibold leading-relaxed">
            האורחים יעלו תמונות וסרטונים לחשבון ה-Google הפרטי שלך ויכולים לגמור בו את כל המקום. כשהמקום נגמר, גם Gmail ו-Drive שלך
            מפסיקים לקבל מיילים וקבצים חדשים, ואורחים לא יוכלו להעלות יותר.
          </p>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-card p-3 text-base font-bold text-destructive">
            <input
              type="checkbox"
              checked={personalAck}
              onChange={(e) => onPersonalAck(e.target.checked)}
              className="mt-0.5 size-6 shrink-0 accent-destructive"
            />
            הבנתי שהאורחים יכולים למלא את האחסון של החשבון הפרטי שלי, ובכל זאת להמשיך איתו
          </label>
        </div>
      )}

      {selected && tooSmall && (
        <p role="alert" className="flex gap-3 rounded-2xl border-2 border-destructive bg-destructive/10 p-4 font-semibold text-destructive">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          אין בחשבון הזה מספיק מקום: צריך בערך {formatBytes(neededBytes)} ונשארו רק {formatBytes(selFree)}.
        </p>
      )}
      {selected && !tooSmall && lowFree && (
        <p role="alert" className="flex gap-3 rounded-2xl bg-amber-100 p-4 font-semibold text-amber-900">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          בחשבון הזה נשאר מעט מאוד מקום. כדאי לבחור חשבון אחר או לפנות בו מקום.
        </p>
      )}
      {selected && !selected.personal && (
        <p className="text-sm text-muted-fg">כדי לראות את התמונות ישירות ב-Google Photos, נכנסים ל-Google Photos עם החשבון הזה.</p>
      )}

      <UnverifiedGuide
        open={!!guide}
        onClose={() => setGuide(null)}
        href={connectHref(connectNext, guide?.hint)}
        onGo={onBeforeConnect}
        firstStep={guide?.hint ? `בוחרים את החשבון ${guide.hint}` : 'בוחרים את החשבון החדש (אם הוא לא מופיע: "שימוש בחשבון אחר")'}
        goLabel="הבנתי, לחיבור החשבון"
      />
      <ConfirmDialog
        open={!!disconnect}
        title="לנתק את החשבון?"
        message={<p>האתר יפסיק לגשת לחשבון {disconnect?.email}. התמונות שכבר נמצאות בו לא יימחקו. אפשר לחבר אותו שוב בכל זמן.</p>}
        confirmLabel="ניתוק"
        onClose={() => setDisconnect(null)}
        onConfirm={async () => {
          try {
            await api(`/owner/accounts/${disconnect!.id}`, { method: "DELETE" });
            await load();
          } catch (e) {
            toast(errorMessage(e), "error");
          }
        }}
      />
    </div>
  );
}

function AccountCard({
  account: a,
  quality,
  active,
  onSelect,
  onReconnect,
  onDisconnect,
}: {
  account: StorageAccountDTO;
  quality: Quality;
  active: boolean;
  onSelect: () => void;
  onReconnect: () => void;
  onDisconnect?: () => void;
}) {
  const s = a.storage;
  const pct = s?.percent ?? null;
  const left = free(s);
  const level = pct === null ? "ok" : pct >= 0.95 ? "critical" : pct >= 0.8 ? "warn" : "ok";
  const bar = level === "critical" ? "bg-destructive" : level === "warn" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div
      className={cx(
        "relative min-w-0 rounded-2xl border-2 bg-card transition-[border-color,box-shadow] duration-200",
        active ? (a.personal ? "border-destructive shadow-lift" : "border-primary shadow-lift") : "border-border",
        !a.connected && "opacity-90",
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={active}
        aria-disabled={!a.connected}
        onClick={onSelect}
        className={cx("flex w-full flex-col gap-3 rounded-2xl p-4 text-start", a.connected ? "hover:bg-fg/[0.03]" : "cursor-not-allowed")}
      >
        <span className="flex items-center gap-3 pe-8">
          {a.picture ? (
            <img src={a.picture} alt="" referrerPolicy="no-referrer" className="size-11 shrink-0 rounded-full bg-muted" />
          ) : (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-bold" aria-hidden>
              {(a.name || a.email || "?").slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-bold" dir="ltr">
              {a.email}
            </span>
            <span className="mt-1 flex flex-wrap gap-1.5">
              {a.personal ? (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">החשבון הפרטי שלך</span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  <Sparkles className="size-3" aria-hidden />
                  חשבון ייעודי
                </span>
              )}
              {a.eventsCount > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-fg">
                  {a.eventsCount === 1 ? "אירוע אחד שמור כאן" : `${a.eventsCount} אירועים שמורים כאן`}
                </span>
              )}
            </span>
          </span>
        </span>

        {!a.connected ? (
          <span className="font-semibold text-destructive">החיבור לחשבון הזה פג. צריך לחבר אותו מחדש כדי להשתמש בו.</span>
        ) : s ? (
          <span className="block space-y-1.5">
            <span
              className="block h-3 w-full overflow-hidden rounded-full bg-muted"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct === null ? undefined : Math.round(pct * 100)}
              aria-label={`שימוש באחסון של ${a.email}`}
            >
              <span className={cx("block h-full rounded-full transition-[width] duration-500", bar)} style={{ width: `${Math.min(100, (pct ?? 0) * 100)}%` }} />
            </span>
            <span className="block text-base">
              {left === null ? (
                <>ללא מגבלת נפח · בשימוש {formatBytes(s.usage)}</>
              ) : (
                <>
                  נשארו <strong>{formatBytes(left)}</strong> מתוך {formatBytes(s.limit)} · מקום לבערך{" "}
                  <strong>{Math.floor(left / PHOTO_BYTES[quality]).toLocaleString("he-IL")}</strong> תמונות
                </>
              )}
            </span>
          </span>
        ) : (
          <span className="text-muted-fg">לא הצלחנו לקרוא כרגע את נתוני הנפח.</span>
        )}
      </button>
      {active && <Check className="pointer-events-none absolute end-4 top-4 size-6 rounded-full bg-primary p-1 text-on-primary" aria-hidden />}
      {(!a.connected || onDisconnect) && (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {!a.connected && (
            <Button size="sm" onClick={onReconnect} icon={<Link2 className="size-4" aria-hidden />}>
              חיבור מחדש
            </Button>
          )}
          {onDisconnect && (
            <Button size="sm" variant="ghost" onClick={onDisconnect} icon={<Unlink className="size-4" aria-hidden />}>
              ניתוק החשבון
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
