import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, RotateCcw, Save, Trash2 } from "lucide-react";
import type { EventType, ManageEvent, Quality, ViewMode, ViewOrder } from "../../../shared/types";
import { api, errorMessage } from "../../lib/api";
import { EVENT_TYPES } from "../../lib/themes";
import { BackgroundPicker, compressBackground } from "../ThemePicker";
import { QualityPicker } from "../QualityPicker";
import { InvitationEditor } from "../InvitationEditor";
import { SlugField, type SlugState } from "../SlugField";
import { MAX_FEATURED } from "../../../shared/types";
import { TimeField } from "../TimeField";
import { Button, Card, ConfirmDialog, Field, inputClass, useToast } from "../ui";

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="text-sm text-muted-fg">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-8 w-14 rounded-full bg-muted transition-colors duration-200 peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-ring" />
        <span className="absolute start-1 top-1 size-6 rounded-full bg-white shadow transition-transform duration-200 peer-checked:-translate-x-6" />
      </span>
    </label>
  );
}

/** Design settings (event type + background) are edited as a local draft and only sent on "Save". */
function DesignCard({ event, onChanged }: { event: ManageEvent; onChanged: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<EventType>(event.type);
  const [background, setBackground] = useState<string | null>(event.background);
  const [file, setFile] = useState<File | null>(null);
  const [removeCustom, setRemoveCustom] = useState(false);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setType(event.type);
    setBackground(event.background);
    setFile(null);
    setRemoveCustom(false);
  };
  // Re-sync the draft once the saved values come back from the server.
  useEffect(reset, [event.type, event.background, event.bgVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!file) return setFilePreview(null);
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const savedCustom = event.background === "custom" && !removeCustom ? `/api/e/${event.code}/asset/bg?v=${encodeURIComponent(event.bgVersion || "")}` : null;
  const info = EVENT_TYPES.find((t) => t.id === type)!;
  const dirty = type !== event.type || background !== event.background || !!file || removeCustom;

  const save = async () => {
    setBusy(true);
    try {
      if (removeCustom && event.background === "custom") await api(`/e/${event.code}/manage/background`, { method: "DELETE" });
      if (file) {
        const blob = await compressBackground(file);
        await api(`/e/${event.code}/manage/background`, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
      }
      if (type !== event.type || background !== (file ? "custom" : event.background)) {
        await api(`/e/${event.code}/manage`, { method: "PATCH", json: { type, theme: info.theme, background } });
      }
      toast("העיצוב נשמר");
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setBusy(false);
  };

  return (
    <Card className="space-y-5">
      <h2 className="text-xl font-bold">עיצוב</h2>
      <div role="radiogroup" aria-label="סוג האירוע" className="flex flex-wrap gap-2">
        {EVENT_TYPES.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={type === t.id}
            onClick={() => {
              if (t.id === type) return;
              setType(t.id as EventType);
              setBackground(null);
              setFile(null);
            }}
            data-theme={t.theme}
            className={`min-h-11 rounded-xl border-2 px-4 font-semibold transition-colors ${type === t.id ? "border-primary bg-primary text-on-primary" : "border-border bg-bg text-fg hover:border-primary/50"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <BackgroundPicker
        type={type}
        value={background ?? info.backgrounds[0].id}
        customPreview={filePreview ?? savedCustom}
        onPreset={(id) => {
          setBackground(id);
          setFile(null);
        }}
        onCustom={(f) => {
          setFile(f);
          setBackground("custom");
        }}
        onClearCustom={() => {
          if (file) setFile(null);
          else setRemoveCustom(true);
          setBackground(null);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!dirty} loading={busy} icon={<Save className="size-4" aria-hidden />} onClick={save}>
          שמירת העיצוב
        </Button>
        {dirty && !busy && (
          <>
            <Button variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={reset}>
              ביטול השינויים
            </Button>
            <span role="status" className="text-sm text-muted-fg">
              יש שינויים שלא נשמרו
            </span>
          </>
        )}
      </div>
    </Card>
  );
}

export function SettingsForm({ event, onChanged }: { event: ManageEvent; onChanged: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState(event.title);
  const [subtitle, setSubtitle] = useState(event.subtitle || "");
  const [date, setDate] = useState(event.date || "");
  const [time, setTime] = useState(event.time || "");
  const [venueName, setVenueName] = useState(event.venueName || "");
  const [venueAddress, setVenueAddress] = useState(event.venueAddress || "");
  const [password, setPassword] = useState("");
  const [welcome, setWelcome] = useState(event.welcome || "");
  const [slug, setSlug] = useState(event.code);
  const [slugState, setSlugState] = useState<SlugState>("ok");
  const [confirmSlug, setConfirmSlug] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmNoPass, setConfirmNoPass] = useState(false);

  const patch = async (body: Record<string, unknown>, msg = "נשמר") => {
    try {
      await api(`/e/${event.code}/manage`, { method: "PATCH", json: body });
      toast(msg);
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const dirty =
    title !== event.title ||
    subtitle !== (event.subtitle || "") ||
    date !== (event.date || "") ||
    time !== (event.time || "") ||
    venueName !== (event.venueName || "") ||
    venueAddress !== (event.venueAddress || "");

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <h2 className="text-xl font-bold">פרטי האירוע</h2>
        <Field label="שם האירוע" htmlFor="s-title">
          <input id="s-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </Field>
        <Field label="שורת משנה" htmlFor="s-sub">
          <input id="s-sub" className={inputClass} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={120} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="תאריך" htmlFor="s-date">
            <input id="s-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="שעה" htmlFor="s-time">
            <TimeField id="s-time" value={time} onChange={setTime} />
          </Field>
        </div>
        <Field label="שם המקום" htmlFor="s-venue">
          <input id="s-venue" className={inputClass} value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="למשל: אולמי הגן" maxLength={80} />
        </Field>
        <Field label="כתובת" htmlFor="s-addr" hint="מופיעה לאורחים בעמוד האירוע עם כפתורי ניווט ושיתוף">
          <input id="s-addr" className={inputClass} value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} placeholder="למשל: הרצל 10, תל אביב" maxLength={160} autoComplete="street-address" />
        </Field>
        <Button
          disabled={!dirty || !title.trim()}
          loading={busy}
          icon={<Save className="size-4" aria-hidden />}
          onClick={async () => {
            setBusy(true);
            await patch({ title, subtitle, date, time, venueName, venueAddress });
            setBusy(false);
          }}
        >
          שמירת הפרטים
        </Button>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl font-bold">כתובת האירוע</h2>
        <SlugField value={slug} onChange={setSlug} onState={setSlugState} current={event.code} />
        <Button disabled={slug === event.code || slugState !== "ok"} icon={<Save className="size-4" aria-hidden />} onClick={() => setConfirmSlug(true)}>
          שינוי הכתובת
        </Button>
      </Card>

      <Card className="space-y-5">
        <h2 className="text-xl font-bold">עמוד הכניסה לאורחים</h2>
        <InvitationEditor
          header={event.headerVersion ? `/api/e/${event.code}/asset/hd?v=${encodeURIComponent(event.headerVersion)}` : null}
          onHeader={async (f) => {
            try {
              const blob = await compressBackground(f, 1600);
              await api(`/e/${event.code}/manage/header`, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
              toast("תמונת הכותרת עודכנה");
              onChanged();
            } catch (e) {
              toast(errorMessage(e), "error");
            }
          }}
          onClearHeader={async () => {
            await api(`/e/${event.code}/manage/header`, { method: "DELETE" }).catch(() => {});
            onChanged();
          }}
          invitation={event.invitationVersion ? `/api/e/${event.code}/asset/inv?v=${encodeURIComponent(event.invitationVersion)}` : null}
          onInvitation={async (f) => {
            try {
              // Larger edge than other assets: invitations carry small text that must stay readable when zoomed.
              const blob = await compressBackground(f, 2200);
              await api(`/e/${event.code}/manage/invitation`, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
              toast("תמונת ההזמנה עודכנה");
              onChanged();
            } catch (e) {
              toast(errorMessage(e), "error");
            }
          }}
          onClearInvitation={async () => {
            await api(`/e/${event.code}/manage/invitation`, { method: "DELETE" }).catch(() => {});
            onChanged();
          }}
          featured={event.featured.map((f) => ({ slot: f.slot, src: `/api/e/${event.code}/asset/f${f.slot}?v=${encodeURIComponent(f.v)}` }))}
          onAddFeatured={async (files) => {
            const used = new Set(event.featured.map((f) => f.slot));
            const free = Array.from({ length: MAX_FEATURED }, (_, i) => i).filter((i) => !used.has(i));
            try {
              for (let i = 0; i < files.length && i < free.length; i++) {
                const blob = await compressBackground(files[i], 1600);
                await api(`/e/${event.code}/manage/featured/${free[i]}`, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
              }
              toast("התמונות נוספו לדף הכניסה");
            } catch (e) {
              toast(errorMessage(e), "error");
            }
            onChanged();
          }}
          onRemoveFeatured={async (slot) => {
            await api(`/e/${event.code}/manage/featured/${slot}`, { method: "DELETE" }).catch(() => {});
            onChanged();
          }}
          welcome={welcome}
          onWelcome={setWelcome}
        />
        <Button disabled={welcome === (event.welcome || "")} icon={<Save className="size-4" aria-hidden />} onClick={() => patch({ welcome }, "הברכה נשמרה")}>
          שמירת הברכה
        </Button>
      </Card>

      <DesignCard event={event} onChanged={onChanged} />

      <Card className="space-y-4">
        <h2 className="text-xl font-bold">איכות העלאה</h2>
        <QualityPicker value={event.quality} onChange={(q: Quality) => patch({ quality: q }, q === "original" ? "עברתם לאיכות מקורית" : "עברתם לאיכות דחוסה")} storageEndpoint={`/e/${event.code}/manage/storage`} />
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl font-bold">אורחים וצפייה</h2>
        <Toggle checked={event.uploadsOpen} onChange={(v) => patch({ uploadsOpen: v }, v ? "ההעלאות פתוחות" : "ההעלאות נסגרו")} label="האורחים יכולים להעלות" hint="אחרי האירוע אפשר לסגור את ההעלאות ולהשאיר רק צפייה" />
        <Toggle checked={event.keepGps} onChange={(v) => patch({ keepGps: v })} label="לשמור מיקום GPS בתמונות דחוסות" hint="כבוי כברירת מחדל, לשמירה על פרטיות האורחים" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="סדר ברירת מחדל בגלריה" htmlFor="s-order">
            <select id="s-order" className={inputClass} value={event.defaultOrder} onChange={(e) => patch({ defaultOrder: e.target.value as ViewOrder })}>
              <option value="mixed">הכל מעורבב</option>
              <option value="timeline">ציר זמן</option>
              <option value="albums">לפי אלבום</option>
            </select>
          </Field>
          <Field label="תצוגת ברירת מחדל" htmlFor="s-view">
            <select id="s-view" className={inputClass} value={event.defaultView} onChange={(e) => patch({ defaultView: e.target.value as ViewMode })}>
              <option value="masonry">גלילה קלאסית</option>
              <option value="floating">מרחפות</option>
              <option value="carousel">קרוסלה</option>
              <option value="slideshow">מצגת לייב</option>
              <option value="mosaic">קיר פסיפס</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <KeyRound className="size-5" aria-hidden />
          סיסמת ניהול לשותפים
        </h2>
        <p className="text-muted-fg">
          מי שיש לו את הסיסמה נכנס דרך "כניסה לניהול" בעמוד האירוע ויכול לנהל אותו בלי חשבון Google.{" "}
          {event.hasPassword ? <strong>כרגע מוגדרת סיסמה.</strong> : <strong>כרגע אין סיסמה.</strong>}
        </p>
        <Field label={event.hasPassword ? "סיסמה חדשה" : "סיסמה"} htmlFor="s-pass" hint="לפחות 4 תווים">
          <input id="s-pass" type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={password.length < 4}
            onClick={async () => {
              await patch({ adminPassword: password }, "הסיסמה נשמרה");
              setPassword("");
            }}
          >
            שמירת הסיסמה
          </Button>
          {event.hasPassword && (
            <Button variant="ghost" onClick={() => setConfirmNoPass(true)}>
              ביטול הסיסמה
            </Button>
          )}
        </div>
      </Card>

      {event.isOwner && (
        <Card className="space-y-3 border-destructive/40">
          <h2 className="text-xl font-bold text-destructive">מחיקת האירוע</h2>
          <p className="text-muted-fg">האירוע והקישור שלו יפסיקו לעבוד. התמונות עצמן יישארו בחשבון Google Photos שלך.</p>
          <Button variant="danger" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirmDelete(true)}>
            מחיקת האירוע
          </Button>
        </Card>
      )}

      <ConfirmDialog
        open={confirmSlug}
        title="לשנות את כתובת האירוע?"
        message={
          <>
            <p>
              הכתובת החדשה תהיה <bdi dir="ltr" className="font-semibold">{location.host}/{slug}</bdi>.
            </p>
            <p className="text-muted-fg">
              הקישור הישן (<bdi dir="ltr">{location.host}/{event.code}</bdi>) וקודי QR שכבר נשלחו או הודפסו יפסיקו לעבוד. כדאי לשלוח לאורחים את הקישור החדש.
            </p>
          </>
        }
        confirmLabel="כן, לשנות"
        onClose={() => setConfirmSlug(false)}
        onConfirm={async () => {
          try {
            const r = await api<{ code: string }>(`/e/${event.code}/manage`, { method: "PATCH", json: { code: slug } });
            toast("הכתובת עודכנה");
            navigate(`/${r.code}/manage?tab=settings`, { replace: true });
          } catch (e) {
            toast(errorMessage(e), "error");
          }
        }}
      />
      <ConfirmDialog
        open={confirmNoPass}
        title="לבטל את סיסמת הניהול?"
        message={<p>מי שנכנס עם הסיסמה לא יוכל יותר לנהל את האירוע (חיבורים קיימים יישארו פעילים עד שיפוגו).</p>}
        confirmLabel="ביטול הסיסמה"
        onClose={() => setConfirmNoPass(false)}
        onConfirm={() => patch({ adminPassword: null }, "הסיסמה בוטלה")}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="למחוק את האירוע?"
        requireText={event.title}
        message={
          <p>
            הקישור והקוד <strong dir="ltr">{event.code}</strong> יפסיקו לעבוד, והאורחים לא יוכלו לצפות או להעלות. {event.mediaCount.toLocaleString("he-IL")} הפריטים יישארו
            בחשבון Google Photos שלך.
          </p>
        }
        confirmLabel="מחיקת האירוע לצמיתות"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await api(`/e/${event.code}/manage`, { method: "DELETE" });
            toast("האירוע נמחק");
            navigate("/dashboard");
          } catch (e) {
            toast(errorMessage(e), "error");
          }
        }}
      />
    </div>
  );
}
