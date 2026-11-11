import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageUp, Trash2, Wand2 } from "lucide-react";
import type { DateStyle, EventDesign, HeroDesign, TitleSize } from "../../../../shared/design";
import { BAR_BACKDROP, DATE_STYLES, barTitleColor, type BarsDesign } from "../../../../shared/design";
import type { ManageEvent } from "../../../../shared/types";
import { DATE_STYLE_LABELS, dateSample, parseLocalDate } from "../../../lib/dateStyles";
import { Button, Field, Segmented, cx, inputClass } from "../../ui";
import { useAssetActions } from "../useAssetActions";
import { ColorField } from "./ColorField";
import { FontPicker } from "./FontPicker";
import { HeaderFramer } from "./HeaderFramer";
import { PartCard } from "./PartsFields";
import { BlockStyleFields } from "./BlockStyleFields";
import { Toggle } from "../Toggle";
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
        <PartCard part="header"
          label="תמונת הכותרת"
          hint={event.headerVersion ? "לחצו על העיפרון כדי להחליף את התמונה או לכוון אותה" : "עדיין אין תמונה - לחצו על העיפרון כדי להעלות"}
          checked={hero.show.header}
          onChange={(v) => show({ header: v })}
        >
          <HeaderImageFields event={event} onChanged={onChanged} pos={hero.headerPos} onPos={(p) => set({ headerPos: p })} />
        </PartCard>
        <PartCard part="subtitle" label="שורת משנה" hint={texts.subtitle.trim() ? preview(texts.subtitle) : "עדיין ריקה - לחצו על העיפרון כדי לכתוב"} checked={hero.show.subtitle} onChange={(v) => show({ subtitle: v })}>
          <Field label="טקסט שורת המשנה" htmlFor="hero-subtitle" hint="מופיעה מתחת לשם האירוע">
            <input id="hero-subtitle" className={inputClass} value={texts.subtitle} onChange={(e) => onTexts({ subtitle: e.target.value })} placeholder="למשל: מתחתנים!" maxLength={120} />
          </Field>
        </PartCard>
        <PartCard part="date"
          label="תאריך"
          hint={`${event.date ? "" : `${noSettings("תאריך")} · `}תצוגה: ${DATE_STYLE_LABELS[hero.dateStyle]}`}
          checked={hero.show.date}
          onChange={(v) => show({ date: v })}
        >
          <DateStyleStepper value={hero.dateStyle} onChange={(dateStyle) => set({ dateStyle })} sample={sampleDate} noDate={!event.date} />
        </PartCard>
        <PartCard part="time" label="שעה" hint={event.time ? `בשעה ${event.time}` : noSettings("שעה")} checked={hero.show.time} onChange={(v) => show({ time: v })} />
        <PartCard part="countdown" label="ספירה לאחור" hint={'למשל "בעוד 11 ימים" - מופיעה עד יום האירוע'} checked={hero.show.countdown} onChange={(v) => show({ countdown: v })} />
        <PartCard part="venue"
          label="מקום"
          hint={event.venueName || event.venueAddress ? `${event.venueName || event.venueAddress} - בלחיצה נפתחים פרטי הניווט` : noSettings("מקום")}
          checked={hero.show.venue}
          onChange={(v) => show({ venue: v })}
        />
        <PartCard part="welcome" label="הברכה שלכם" hint={texts.welcome.trim() ? preview(texts.welcome) : "עדיין ריקה - לחצו על העיפרון כדי לכתוב"} checked={hero.show.welcome} onChange={(v) => show({ welcome: v })}>
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
        <BarCards design={design} dispatch={dispatch} hebrewOnly={hebrewOnly} onHebrewOnly={onHebrewOnly} sample={event.title} />
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

/** Flip through the date styles one at a time (prev / next + arrow keys) - much shorter than listing them all. */
function DateStyleStepper({ value, onChange, sample, noDate }: { value: DateStyle; onChange: (s: DateStyle) => void; sample: Date; noDate: boolean }) {
  const pos = Math.max(0, DATE_STYLES.indexOf(value));
  const go = (dir: 1 | -1) => onChange(DATE_STYLES[(pos + dir + DATE_STYLES.length) % DATE_STYLES.length]);
  const btn = "inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-fg transition-colors duration-200 hover:bg-primary/15";
  return (
    <div className="space-y-2">
      <p className="font-semibold">תצוגת התאריך</p>
      <div
        className="flex items-center gap-2"
        role="group"
        aria-label="תצוגת התאריך"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") (e.preventDefault(), go(1));
          if (e.key === "ArrowRight") (e.preventDefault(), go(-1));
        }}
      >
        <button type="button" className={btn} onClick={() => go(-1)} aria-label="התצוגה הקודמת">
          <ChevronRight className="size-6" aria-hidden />
        </button>
        {/* Fixed height so flipping never shifts the layout. */}
        <div className="flex min-h-20 min-w-0 flex-1 flex-col items-center justify-center rounded-2xl border border-border bg-bg px-3 py-2 text-center" aria-live="polite">
          <span className="font-semibold">{DATE_STYLE_LABELS[value]}</span>
          <span className="text-muted-fg">{dateSample(value, sample)}</span>
          <span className="text-xs text-muted-fg">
            {pos + 1}/{DATE_STYLES.length}
          </span>
        </div>
        <button type="button" className={btn} onClick={() => go(1)} aria-label="התצוגה הבאה">
          <ChevronLeft className="size-6" aria-hidden />
        </button>
      </div>
      {noDate && <p className="text-sm text-muted-fg">עדיין לא נקבע תאריך - הדוגמה מוצגת עם התאריך של היום.</p>}
    </div>
  );
}

/**
 * The two scroll banners (top bar; bottom action bar on phones): show / hide, which buttons they hold, and their
 * text font / color. Without a color of their own they use the main title color - unless it's too dark for them.
 */
function BarCards({
  design,
  dispatch,
  hebrewOnly,
  onHebrewOnly,
  sample,
}: {
  design: EventDesign;
  dispatch: (a: DraftAction) => void;
  hebrewOnly: boolean;
  onHebrewOnly: (v: boolean) => void;
  sample: string;
}) {
  const { top, bottom } = design.bars;
  const bar = (which: keyof BarsDesign) => (patch: Partial<BarsDesign["top"] & BarsDesign["bottom"]>) => dispatch({ type: "bars", which, patch });
  const setTop = bar("top");
  const setBottom = bar("bottom");
  // The main title color can't be used on the dark banners: say so (they fall back to white).
  const titleTooDark = !!design.hero.titleColor && !barTitleColor(design.hero);
  const colorNote = (own: string | null) => (own ? "" : titleTooDark ? " · צבע הכותרת כהה מדי לבאנר, לכן הטקסט לבן" : design.hero.titleColor ? " · בצבע הכותרת" : "");
  return (
    <>
      <PartCard label="באנר עליון בגלילה" hint={`מופיע אחרי שגוללים מעבר לעמוד הראשי${colorNote(top.color)}`} checked={top.show} onChange={(v) => setTop({ show: v })}>
        <div className="divide-y divide-border">
          <Toggle checked={top.avatar} onChange={(v) => setTop({ avatar: v })} label="תמונה קטנה ליד השם" hint="מתוך תמונת הכותרת" />
          <Toggle checked={top.view} onChange={(v) => setTop({ view: v })} label="כפתור צפייה" hint="במחשב (בטלפון הכפתורים בבאנר התחתון)" />
          <Toggle checked={top.upload} onChange={(v) => setTop({ upload: v })} label="כפתור העלאה" hint="במחשב, כשההעלאות פתוחות" />
        </div>
        <BlockStyleFields
          font={top.font}
          color={top.color}
          onFont={(font) => setTop({ font })}
          onColor={(color) => setTop({ color })}
          fontLabel="גופן שם האירוע"
          colorLabel="צבע שם האירוע"
          defaultFontName="כמו בשאר העמודים"
          sample={sample}
          against={BAR_BACKDROP}
          hebrewOnly={hebrewOnly}
          onHebrewOnly={onHebrewOnly}
        />
      </PartCard>
      <PartCard
        label="באנר תחתון בטלפון"
        hint={`כפתורי העלאה ואלבום בתחתית המסך${colorNote(bottom.color)}`}
        checked={bottom.show}
        onChange={(v) => setBottom({ show: v })}
      >
        <div className="divide-y divide-border">
          <Toggle checked={bottom.upload} onChange={(v) => setBottom({ upload: v })} label="כפתור העלאת תמונות" hint="עם מסגרת בצבע הטקסט; מופיע כשההעלאות פתוחות" />
          <Toggle checked={bottom.view} onChange={(v) => setBottom({ view: v })} label="כפתור לאלבום" />
        </div>
        {!bottom.upload && !bottom.view && <p className="text-sm text-muted-fg">בלי כפתורים הבאנר התחתון לא יופיע.</p>}
        <BlockStyleFields
          font={bottom.font}
          color={bottom.color}
          onFont={(font) => setBottom({ font })}
          onColor={(color) => setBottom({ color })}
          fontLabel="גופן הכפתורים"
          colorLabel="צבע הטקסט והמסגרת"
          defaultFontName="הגופן הרגיל"
          sample="העלאת תמונות"
          against={BAR_BACKDROP}
          hebrewOnly={hebrewOnly}
          onHebrewOnly={onHebrewOnly}
        />
      </PartCard>
    </>
  );
}
