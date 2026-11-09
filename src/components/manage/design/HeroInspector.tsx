import { Wand2 } from "lucide-react";
import type { DateStyle, EventDesign, HeroDesign, TitleSize } from "../../../../shared/design";
import { DATE_STYLES } from "../../../../shared/design";
import type { ManageEvent } from "../../../../shared/types";
import { DATE_STYLE_LABELS, dateSample, parseLocalDate } from "../../../lib/dateStyles";
import { Button, Field, Segmented, cx, inputClass } from "../../ui";
import { headerImageUrl } from "../../EventHeader";
import { Toggle } from "../Toggle";
import { ColorField } from "./ColorField";
import { FontPicker } from "./FontPicker";
import { HeaderFramer } from "./HeaderFramer";
import type { DraftAction } from "./draft";

const SIZES: { value: TitleSize; label: string }[] = [
  { value: "md", label: "בינונית" },
  { value: "lg", label: "גדולה" },
  { value: "xl", label: "ענקית" },
];

/** Editing the main page (the hero): title font / size / colors, date style, what to show, other pages' font. */
export function HeroInspector({
  event,
  design,
  dispatch,
  against,
  hebrewOnly,
  onHebrewOnly,
  onTune,
  onGoSettings,
  subtitle,
  onSubtitle,
}: {
  event: ManageEvent;
  design: EventDesign;
  dispatch: (a: DraftAction) => void;
  /** approximate color behind the hero text (for contrast hints) */
  against: string;
  hebrewOnly: boolean;
  onHebrewOnly: (v: boolean) => void;
  /** mobile: open full-screen font tuning over the live page */
  onTune: () => void;
  onGoSettings: () => void;
  /** the subtitle text (part of the editor's draft, saved together with the design) */
  subtitle: string;
  onSubtitle: (v: string) => void;
}) {
  const hero = design.hero;
  const set = (patch: Partial<HeroDesign>) => dispatch({ type: "hero", patch });
  const show = (patch: Partial<HeroDesign["show"]>) => dispatch({ type: "show", patch });
  const sampleDate = parseLocalDate(event.date) ?? new Date();
  const headerSrc = headerImageUrl(event);
  return (
    <div className="space-y-7">
      <p className="text-sm text-muted-fg">
        העמוד הראשי קבוע במקומו. כאן משנים איך הוא נראה ואת שורת המשנה. את שם האירוע והתאריך עורכים ב
        <button type="button" onClick={onGoSettings} className="ms-1 inline font-semibold text-primary underline underline-offset-4">
          הגדרות
        </button>
        . את תמונת הכותרת והברכה מעלים בכרטיס "עמוד הכניסה לאורחים".
      </p>

      <Field
        label="שורת משנה"
        htmlFor="hero-subtitle"
        hint={hero.show.subtitle ? "מופיעה מתחת לשם האירוע" : 'שורת המשנה מוסתרת כרגע - אפשר להציג אותה ב"מה מופיע בעמוד הראשי"'}
      >
        <input id="hero-subtitle" className={inputClass} value={subtitle} onChange={(e) => onSubtitle(e.target.value)} placeholder="למשל: מתחתנים!" maxLength={120} />
      </Field>

      <section className="space-y-3" aria-labelledby="hero-header-title">
        <h4 id="hero-header-title" className="font-semibold">
          תמונת הכותרת
        </h4>
        {!headerSrc ? (
          <p className="text-sm text-muted-fg">עדיין אין תמונת כותרת. מעלים אותה בכרטיס "עמוד הכניסה לאורחים" שמתחת לעיצוב.</p>
        ) : !hero.show.header ? (
          <p className="text-sm text-muted-fg">תמונת הכותרת מוסתרת כרגע. אפשר להציג אותה ב"מה מופיע בעמוד הראשי".</p>
        ) : (
          <HeaderFramer src={headerSrc} value={hero.headerPos} onChange={(p) => set({ headerPos: p })} />
        )}
      </section>

      <div className="space-y-3">
        <FontPicker label="גופן הכותרת" value={hero.titleFont} onChange={(f) => set({ titleFont: f })} hebrewOnly={hebrewOnly} onHebrewOnly={onHebrewOnly} sample={event.title} />
        <Button variant="outline" className="w-full lg:hidden" icon={<Wand2 className="size-4" aria-hidden />} onClick={onTune}>
          לדפדף בגופנים על הדף עצמו
        </Button>
      </div>

      <div className="space-y-2">
        <p className="font-semibold">גודל הכותרת</p>
        <Segmented label="גודל הכותרת" value={hero.titleSize} onChange={(v) => set({ titleSize: v })} options={SIZES} />
      </div>

      <ColorField label="צבע הכותרת" value={hero.titleColor} onChange={(c) => set({ titleColor: c })} against={against} large />
      <ColorField label="צבע הטקסטים (שורת משנה, תאריך, ברכה)" value={hero.textColor} onChange={(c) => set({ textColor: c })} against={against} />

      <fieldset>
        <legend className="mb-2 font-semibold">תצוגת התאריך</legend>
        {!event.date && <p className="mb-2 text-sm text-muted-fg">עדיין לא נקבע תאריך - הדוגמאות מוצגות עם התאריך של היום.</p>}
        <div role="radiogroup" aria-label="תצוגת התאריך" className="grid gap-2 sm:grid-cols-2">
          {DATE_STYLES.map((s: DateStyle) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={hero.dateStyle === s}
              onClick={() => set({ dateStyle: s })}
              className={cx(
                "flex min-h-14 flex-col items-start justify-center rounded-xl border-2 px-3 py-2 text-start transition-colors duration-200",
                hero.dateStyle === s ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
              )}
            >
              <span className="font-semibold">{DATE_STYLE_LABELS[s]}</span>
              <span className="text-sm text-muted-fg">{dateSample(s, sampleDate)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="divide-y divide-border">
        <legend className="mb-1 font-semibold">מה מופיע בעמוד הראשי</legend>
        <Toggle checked={hero.show.header} onChange={(v) => show({ header: v })} label="תמונת הכותרת" />
        <Toggle checked={hero.show.subtitle} onChange={(v) => show({ subtitle: v })} label="שורת משנה" />
        <Toggle checked={hero.show.date} onChange={(v) => show({ date: v })} label="תאריך" />
        <Toggle checked={hero.show.info} onChange={(v) => show({ info: v })} label="שעה, ספירה לאחור ומקום" />
        <Toggle checked={hero.show.welcome} onChange={(v) => show({ welcome: v })} label="הברכה שלכם" />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 font-semibold">הכותרת בשאר העמודים (העלאה, אלבום)</legend>
        <Segmented
          label="הכותרת בשאר העמודים"
          value={design.pagesFont === null ? "same" : "other"}
          onChange={(v) => dispatch({ type: "pagesFont", font: v === "same" ? null : hero.titleFont ?? "Bellefair" })}
          options={[
            { value: "same", label: "כמו בעמוד הראשי" },
            { value: "other", label: "גופן אחר" },
          ]}
        />
        {design.pagesFont !== null && (
          <FontPicker
            label="גופן לשאר העמודים"
            value={design.pagesFont}
            onChange={(f) => dispatch({ type: "pagesFont", font: f ?? null })}
            hebrewOnly={hebrewOnly}
            onHebrewOnly={onHebrewOnly}
            sample={event.title}
          />
        )}
      </fieldset>
    </div>
  );
}
