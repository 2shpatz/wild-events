import { useEffect, useState } from "react";
import { AlertTriangle, Check, Gem, Sparkles } from "lucide-react";
import type { Quality, StorageInfo } from "../../shared/types";
import { api } from "../lib/api";
import { formatBytes } from "../lib/format";
import { Button, Field, Modal, cx, inputClass } from "./ui";

// Rough per-guest averages for the estimate (photos + some video).
const PER_GUEST = { compressed: 26 * 1024 * 1024, original: 130 * 1024 * 1024 };

/**
 * Compressed (default) vs. original. Picking "original" opens a warning with a concrete storage estimate
 * and only takes effect after explicit confirmation.
 */
export function QualityPicker({
  value,
  onChange,
  storageEndpoint = "/owner/storage",
}: {
  value: Quality;
  onChange: (q: Quality) => void;
  storageEndpoint?: string;
}) {
  const [warn, setWarn] = useState(false);
  const [guests, setGuests] = useState(150);
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  useEffect(() => {
    if (warn && !storage) api<StorageInfo>(storageEndpoint).then(setStorage).catch(() => {});
  }, [warn, storage, storageEndpoint]);

  const estOriginal = guests * PER_GUEST.original;
  const estCompressed = guests * PER_GUEST.compressed;
  const remaining = storage?.limit ? storage.limit - storage.usage : null;
  const exceeds = remaining !== null && estOriginal > remaining;

  const options = [
    {
      value: "compressed" as Quality,
      title: "דחוסה",
      badge: "מומלץ",
      icon: <Sparkles className="size-6" aria-hidden />,
      text: "התמונות נשמרות באיכות גבוהה (2560 פיקסלים) - נראות מצוין במסך ובהדפסה רגילה. חוסך הרבה מקום, וההעלאה מהירה יותר לאורחים.",
    },
    {
      value: "original" as Quality,
      title: "מקורית",
      badge: null,
      icon: <Gem className="size-6" aria-hidden />,
      text: "כל קובץ נשמר בדיוק כפי שצולם. מתאים להגדלות ענק - אבל תופס בערך פי 3-5 יותר מקום ב-Google.",
    },
  ];

  return (
    <>
      <div role="radiogroup" aria-label="איכות העלאה" className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              role="radio"
              aria-checked={active}
              onClick={() => (o.value === "original" && value !== "original" ? setWarn(true) : onChange(o.value))}
              className={cx(
                "relative flex flex-col gap-2 rounded-2xl border-2 p-5 text-start transition-[border-color,box-shadow] duration-200",
                active ? "border-primary shadow-lift" : "border-border hover:border-primary/50",
              )}
            >
              <span className="flex items-center gap-2 text-xl font-bold">
                {o.icon}
                {o.title}
                {o.badge && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">{o.badge}</span>}
              </span>
              <span className="text-base leading-relaxed text-muted-fg">{o.text}</span>
              {active && <Check className="absolute end-4 top-4 size-6 rounded-full bg-primary p-1 text-on-primary" aria-hidden />}
            </button>
          );
        })}
      </div>

      <Modal
        open={warn}
        onClose={() => setWarn(false)}
        title={
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-6 text-amber-600" aria-hidden />
            איכות מקורית תופסת הרבה מקום
          </span>
        }
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setWarn(false);
                onChange("original");
              }}
            >
              הבנתי, עבור למקורית
            </Button>
            <Button variant="primary" onClick={() => setWarn(false)} autoFocus>
              חזרה לדחוסה
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-base leading-relaxed">
          <p>
            באיכות מקורית כל תמונה וסרטון נשמרים בגודל המלא שלהם בחשבון Google שלך. זה תופס <strong>פי 3-5 יותר מקום</strong> מאשר
            באיכות דחוסה.
          </p>
          <Field label="בערך כמה אורחים יעלו תמונות?" htmlFor="guest-estimate">
            <input
              id="guest-estimate"
              type="number"
              inputMode="numeric"
              min={1}
              max={5000}
              className={inputClass}
              value={guests}
              onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">
              <p className="text-sm font-semibold">דחוסה</p>
              <p className="text-2xl font-bold">~{formatBytes(estCompressed)}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4 text-amber-900">
              <p className="text-sm font-semibold">מקורית</p>
              <p className="text-2xl font-bold">~{formatBytes(estOriginal)}</p>
            </div>
          </div>
          {storage && (
            <p className={cx("rounded-2xl p-4 font-semibold", exceeds ? "bg-destructive/10 text-destructive" : "bg-muted")}>
              {remaining === null
                ? "בחשבון שלך אין מגבלת נפח."
                : exceeds
                  ? `נשארו לך רק ${formatBytes(remaining)} - כנראה שזה לא יספיק לאיכות מקורית.`
                  : `נשארו לך ${formatBytes(remaining)} בחשבון Google.`}
            </p>
          )}
          <p className="text-sm text-muted-fg">ההערכה מבוססת על ממוצע של כ-20 תמונות וחצי סרטון לאורח. אפשר לשנות את ההגדרה בכל רגע.</p>
        </div>
      </Modal>
    </>
  );
}
