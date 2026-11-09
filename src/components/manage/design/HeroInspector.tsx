import { useRef, useState } from "react";
import { ImageUp, Trash2, Wand2 } from "lucide-react";
import type { DateStyle, EventDesign, HeroDesign, TitleSize } from "../../../../shared/design";
import { DATE_STYLES } from "../../../../shared/design";
import type { ManageEvent } from "../../../../shared/types";
import { DATE_STYLE_LABELS, dateSample, parseLocalDate } from "../../../lib/dateStyles";
import { Button, Field, Segmented, cx, inputClass } from "../../ui";
import { useAssetActions } from "../useAssetActions";
import { ColorField } from "./ColorField";
import { FontPicker } from "./FontPicker";
import { HeaderFramer } from "./HeaderFramer";
import { PartCard } from "./PartsFields";
import type { DraftAction } from "./draft";

const SIZES: { value: TitleSize; label: string }[] = [
  { value: "md", label: "בינונית" },
  { value: "lg", label: "גדולה" },
  { value: "xl", label: "ענקית" },
];

/** Texts of the main page that live on the event (not in the design JSON) but are edited in the same draft. */
export type HeroTexts = { subtitle: string; welcome: string };

const preview = (s: string, max = 60) => {
  const line = s.trim().replace(/\s+/g, " ");
  return line.length > max ? `"${line.slice(0, max)}…"` : `"${line}"`;
};

/**
 * Editing the main page (the hero): what shows (with the subtitle / welcome texts), the header image and how it's
 * framed, title font / size / colors, date style, other pages' font.
 */
export function HeroInspector({
  event,
  design,
  dispatch,
  against,
  hebrewOnly,
  onHebrewOnly,
  onTune,
  onGoSettings,
  onChanged,
  texts,
  onTexts,
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
  /** reload the event (after the header image was uploaded / removed - those save right away) */
  onChanged: () => void;
  texts: HeroTexts;
  onTexts: (patch: Partial<HeroTexts>) => void;
}) {
  const hero = design.hero;
  const set = (patch: Partial<HeroDesign>) => dispatch({ type: "hero", patch });
  const show = (patch: Partial<HeroDesign["show"]>) => dispatch({ type: "show", patch });
  const sampleDate = parseLocalDate(event.date) ?? new Date();
  const noSettings = (what: string) => `עדיין לא נקבע ${what} - מוסיפים בהגדרות`;
  return (
    <div className="space-y-7">
      <p className="text-sm text-muted-fg">
        העמוד הראשי קבוע במקומו. כאן בוחרים מה מופיע בו, עורכים את שורת המשנה והברכה (בכפתור העיפרון) ומשנים איך הוא נראה. את שם האירוע, התאריך, השעה והמקום עורכים ב
        <button type="button" onClick={onGoSettings} className="ms-1 inline font-semibold text-primary underline underline-offset-4">
          הגדרות
        </button>
        .
      </p>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">מה מופיע בעמוד הראשי</legend>
        <PartCard
          label="תמונת הכותרת"
          hint={event.headerVersion ? "לחצו על העיפרון כדי להחליף את התמונה או לכוון אותה" : "עדיין אין תמונה - לחצו על העיפרון כדי להעלות"}
          checked={hero.show.header}
          onChange={(v) => show({ header: v })}
        >
          <HeaderImageFields event={event} onChanged={onChanged} pos={hero.headerPos} onPos={(p) => set({ headerPos: p })} />
        </PartCard>
        <PartCard label="שורת משנה" hint={texts.subtitle.trim() ? preview(texts.subtitle) : "עדיין ריקה - לחצו על העיפרון כדי לכתוב"} checked={hero.show.subtitle} onChange={(v) => show({ subtitle: v })}>
          <Field label="טקסט שורת המשנה" htmlFor="hero-subtitle" hint="מופיעה מתחת לשם האירוע">
            <input id="hero-subtitle" className={inputClass} value={texts.subtitle} onChange={(e) => onTexts({ subtitle: e.target.value })} placeholder="למשל: מתחתנים!" maxLength={120} />
          </Field>
        </PartCard>
        <PartCard label="תאריך" hint={event.date ? undefined : noSettings("תאריך")} checked={hero.show.date} onChange={(v) => show({ date: v })} />
        <PartCard label="שעה" hint={event.time ? `בשעה ${event.time}` : noSettings("שעה")} checked={hero.show.time} onChange={(v) => show({ time: v })} />
        <PartCard label="ספירה לאחור" hint={'למשל "בעוד 11 ימים" - מופיעה עד יום האירוע'} checked={hero.show.countdown} onChange={(v) => show({ countdown: v })} />
        <PartCard
          label="מקום"
          hint={event.venueName || event.venueAddress ? `${event.venueName || event.venueAddress} - בלחיצה נפתחים פרטי הניווט` : noSettings("מקום")}
          checked={hero.show.venue}
          onChange={(v) => show({ venue: v })}
        />
        <PartCard label="הברכה שלכם" hint={texts.welcome.trim() ? preview(texts.welcome) : "עדיין ריקה - לחצו על העיפרון כדי לכתוב"} checked={hero.show.welcome} onChange={(v) => show({ welcome: v })}>
          <Field label="טקסט הברכה" htmlFor="hero-welcome" hint={`${texts.welcome.length}/600 · מופיעה בכרטיס מתחת לפרטים`}>
            <textarea
              id="hero-welcome"
              className={cx(inputClass, "min-h-28 py-3")}
              value={texts.welcome}
              onChange={(e) => onTexts({ welcome: e.target.value })}
              maxLength={600}
              placeholder="שמחים שבאתם לחגוג איתנו! צלמו, העלו ושתפו את הרגעים היפים."
            />
          </Field>
        </PartCard>
      </fieldset>

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

/** Upload / replace / remove the header image (saved right away) and choose how it's framed (part of the draft). */
function HeaderImageFields({ event, onChanged, pos, onPos }: { event: ManageEvent; onChanged: () => void; pos: HeroDesign["headerPos"]; onPos: (p: HeroDesign["headerPos"]) => void }) {
  const a = useAssetActions(event, onChanged);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-fg">מופיעה בראש העמוד הראשי ובראש שאר הדפים של האורחים. העלאה והסרה של התמונה נשמרות מיד.</p>
      {a.headerSrc && <HeaderFramer src={a.headerSrc} value={pos} onChange={onPos} />}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant={a.headerSrc ? "outline" : "primary"} icon={<ImageUp className="size-4" aria-hidden />} loading={busy} onClick={() => input.current?.click()}>
          {a.headerSrc ? "החלפת התמונה" : "העלאת תמונת כותרת"}
        </Button>
        {a.headerSrc && (
          <Button variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} disabled={busy} onClick={a.clearHeader}>
            הסרת התמונה
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          await a.setHeader(f);
          setBusy(false);
        }}
      />
    </div>
  );
}
