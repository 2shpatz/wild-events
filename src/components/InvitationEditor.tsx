import { useRef } from "react";
import { ImagePlus, Trash2, ImageUp, Mail } from "lucide-react";
import { MAX_FEATURED } from "../../shared/types";
import { Button, Field, cx, inputClass } from "./ui";

export interface Slot {
  slot: number;
  src: string;
}

/**
 * Owner controls for the invitation-style guest entrance:
 * header image (follows guests across pages), the invitation image, up to 6 featured photos, and a welcome message.
 */
export function InvitationEditor({
  header,
  onHeader,
  onClearHeader,
  invitation,
  onInvitation,
  onClearInvitation,
  featured,
  onAddFeatured,
  onRemoveFeatured,
  welcome,
  onWelcome,
}: {
  header: string | null;
  onHeader: (f: File) => void;
  onClearHeader: () => void;
  invitation: string | null;
  onInvitation: (f: File) => void;
  onClearInvitation: () => void;
  featured: Slot[];
  onAddFeatured: (files: File[]) => void;
  onRemoveFeatured: (slot: number) => void;
  welcome: string;
  onWelcome: (v: string) => void;
}) {
  const headerInput = useRef<HTMLInputElement>(null);
  const featInput = useRef<HTMLInputElement>(null);
  const invInput = useRef<HTMLInputElement>(null);
  const free = MAX_FEATURED - featured.length;
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="font-semibold">תמונת כותרת</p>
        <p className="text-sm text-muted-fg">מופיעה בראש כל הדפים של האורחים. כשגוללים היא נעשית שקופה למחצה ונשארת למעלה. מתאימה למשל תמונת זוג או לוגו.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => headerInput.current?.click()}
            className={cx(
              "relative flex h-28 w-full max-w-sm items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-cover bg-center font-semibold transition-colors",
              header ? "border-primary" : "border-border hover:border-primary/50",
            )}
            style={header ? { backgroundImage: `url(${header})` } : undefined}
            aria-label={header ? "החלפת תמונת הכותרת" : "הוספת תמונת כותרת"}
          >
            {!header && (
              <span className="flex items-center gap-2 text-muted-fg">
                <ImageUp className="size-5" aria-hidden />
                הוספת תמונת כותרת
              </span>
            )}
          </button>
          {header && (
            <Button variant="ghost" size="sm" onClick={onClearHeader} icon={<Trash2 className="size-4" aria-hidden />}>
              הסרה
            </Button>
          )}
        </div>
        <input ref={headerInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) onHeader(f); e.target.value = ""; }} />
      </div>

      <div className="space-y-2">
        <p className="font-semibold">תמונת ההזמנה</p>
        <p className="text-sm text-muted-fg">ההזמנה שלכם (צילום או קובץ תמונה). מופיעה לאורחים מעל פרטי האירוע, ואפשר להגדיל אותה במסך מלא.</p>
        <div className="flex flex-wrap items-end gap-3">
          <button
            onClick={() => invInput.current?.click()}
            className={cx(
              "relative flex w-40 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed font-semibold transition-colors",
              invitation ? "border-primary bg-muted" : "aspect-[3/4] border-border hover:border-primary/50",
            )}
            aria-label={invitation ? "החלפת תמונת ההזמנה" : "הוספת תמונת ההזמנה"}
          >
            {invitation ? (
              <img src={invitation} alt="" className="block h-auto max-h-56 w-full object-contain" />
            ) : (
              <span className="flex flex-col items-center gap-2 px-2 text-center text-sm text-muted-fg">
                <Mail className="size-6" aria-hidden />
                הוספת תמונת ההזמנה
              </span>
            )}
          </button>
          {invitation && (
            <Button variant="ghost" size="sm" onClick={onClearInvitation} icon={<Trash2 className="size-4" aria-hidden />}>
              הסרה
            </Button>
          )}
        </div>
        <input ref={invInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) onInvitation(f); e.target.value = ""; }} />
      </div>

      <div className="space-y-2">
        <p className="font-semibold">תמונות מייצגות (עד {MAX_FEATURED})</p>
        <p className="text-sm text-muted-fg">התמונות האלה מופיעות בדף הכניסה עם אפקטים בזמן הגלילה, ממש כמו בהזמנה.</p>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {featured.map((f) => (
            <li key={f.slot} className="relative aspect-[4/5] overflow-hidden rounded-xl bg-muted">
              <img src={f.src} alt="" className="size-full object-cover" />
              <button
                onClick={() => onRemoveFeatured(f.slot)}
                aria-label="הסרת התמונה"
                className="absolute end-1 top-1 inline-flex size-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
          {free > 0 && (
            <li>
              <button
                onClick={() => featInput.current?.click()}
                className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-muted-fg hover:border-primary/50"
              >
                <ImagePlus className="size-6" aria-hidden />
                הוספה
              </button>
            </li>
          )}
        </ul>
        <input
          ref={featInput}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const files = Array.from(e.target.files || []).slice(0, free);
            if (files.length) onAddFeatured(files);
            e.target.value = "";
          }}
        />
      </div>

      <Field label="ברכה לאורחים (לא חובה)" htmlFor="inv-welcome" hint="מופיעה בדף הכניסה, מתחת לכותרת">
        <textarea
          id="inv-welcome"
          className={cx(inputClass, "min-h-28 py-3")}
          value={welcome}
          onChange={(e) => onWelcome(e.target.value)}
          maxLength={600}
          placeholder="שמחים שבאתם לחגוג איתנו! צלמו, העלו ושתפו את הרגעים היפים."
        />
      </Field>
    </div>
  );
}
