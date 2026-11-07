import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Save, Trash2 } from "lucide-react";
import type { ManageEvent, Quality, ViewMode, ViewOrder } from "../../../shared/types";
import { api, errorMessage } from "../../lib/api";
import { QualityPicker } from "../QualityPicker";
import { SlugField, type SlugState } from "../SlugField";
import { TimeField } from "../TimeField";
import { Button, Card, ConfirmDialog, Field, inputClass, useToast } from "../ui";
import { Toggle } from "./Toggle";
import { useManagePatch } from "./useManagePatch";

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
  const [slug, setSlug] = useState(event.code);
  const [slugState, setSlugState] = useState<SlugState>("ok");
  const [confirmSlug, setConfirmSlug] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmNoPass, setConfirmNoPass] = useState(false);

  const patch = useManagePatch(event, onChanged);

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
        <h2 className="text-xl font-bold">כתובת האתר URL</h2>
        <SlugField value={slug} onChange={setSlug} onState={setSlugState} current={event.code} />
        <Button disabled={slug === event.code || slugState !== "ok"} icon={<Save className="size-4" aria-hidden />} onClick={() => setConfirmSlug(true)}>
          שינוי הכתובת
        </Button>
      </Card>

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
