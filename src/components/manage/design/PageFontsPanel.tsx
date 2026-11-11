import { useId, useState } from "react";
import { ChevronDown, Type } from "lucide-react";
import type { EventDesign } from "../../../../shared/design";
import { fontByFamily } from "../../../../shared/fonts";
import { Segmented, cx } from "../../ui";
import type { DraftAction } from "./draft";
import { FontPicker } from "./FontPicker";
import { ColorField } from "./ColorField";

/**
 * The page-wide fonts and colors: the other headings (elements + the upload / gallery pages' title font) and the
 * elements' text. Collapsed by default, with a one-line summary of the current choice.
 */
export function PageFontsPanel({
  design,
  dispatch,
  hebrewOnly,
  onHebrewOnly,
  against,
}: {
  design: EventDesign;
  dispatch: (a: DraftAction) => void;
  hebrewOnly: boolean;
  onHebrewOnly: (v: boolean) => void;
  /** approximate color behind the elements' text (contrast hints) */
  against: string;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const name = (f: string | null) => (f ? (fontByFamily(f)?.family ?? f) : "ברירת מחדל");
  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panel}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-start transition-colors duration-200 hover:bg-fg/5 sm:px-4"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Type className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">גופנים וצבעים לשאר העמוד</span>
          <span className="flex items-center gap-1.5 truncate text-sm text-muted-fg">
            <span className="truncate">
              כותרות: {name(design.pagesFont)} · טקסט: {name(design.textFont)}
            </span>
            {[design.headingsColor, design.bodyColor].map(
              (c, i) => c && <span key={i} className="inline-block size-3.5 shrink-0 rounded-full ring-1 ring-border" style={{ backgroundColor: c }} aria-hidden />,
            )}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-primary">{open ? "הסתרה" : "הצגה"}</span>
        <ChevronDown className={cx("size-5 shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={panel} className="space-y-6 border-t border-border px-3 pb-4 pt-4 sm:px-4">
          <fieldset className="space-y-3">
            <legend className="mb-1 font-semibold">גופן שאר הכותרות</legend>
            <p className="text-sm text-muted-fg">הכותרות של האלמנטים בעמוד (פרטי האירוע, לוח הברכות, הרשימות...), והגופן גם לכותרת בעמודי ההעלאה והאלבום. אלמנט שבחרתם לו גופן או צבע משלו שומר עליהם.</p>
            <Segmented
              label="גופן שאר הכותרות"
              value={design.pagesFont === null ? "same" : "other"}
              onChange={(v) => dispatch({ type: "pagesFont", font: v === "same" ? null : design.hero.titleFont ?? "Bellefair" })}
              options={[
                { value: "same", label: "ברירת מחדל" },
                { value: "other", label: "גופן אחר" },
              ]}
            />
            {design.pagesFont !== null && (
              <FontPicker
                label="הגופן לשאר הכותרות"
                value={design.pagesFont}
                onChange={(f) => dispatch({ type: "pagesFont", font: f ?? null })}
                hebrewOnly={hebrewOnly}
                onHebrewOnly={onHebrewOnly}
                sample="פרטי האירוע"
              />
            )}
            <ColorField
              label="צבע שאר הכותרות (בעמוד הראשי)"
              value={design.headingsColor}
              onChange={(c) => dispatch({ type: "pageColors", patch: { headingsColor: c } })}
              against={against}
              large
            />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 font-semibold">גופן הטקסט באלמנטים</legend>
            <p className="text-sm text-muted-fg">הפסקאות, הרשימות והכפתורים שבתוך האלמנטים. אלמנט שבחרתם לו גופן טקסט או צבע משלו שומר עליהם.</p>
            <Segmented
              label="גופן הטקסט"
              value={design.textFont === null ? "same" : "other"}
              onChange={(v) => dispatch({ type: "textFont", font: v === "same" ? null : "Rubik" })}
              options={[
                { value: "same", label: "ברירת מחדל" },
                { value: "other", label: "גופן אחר" },
              ]}
            />
            {design.textFont !== null && (
              <FontPicker
                label="הגופן לטקסט"
                value={design.textFont}
                onChange={(f) => dispatch({ type: "textFont", font: f ?? null })}
                hebrewOnly={hebrewOnly}
                onHebrewOnly={onHebrewOnly}
                sample="טקסט לדוגמה, כמו בפסקה"
              />
            )}
            <ColorField
              label="צבע הטקסט באלמנטים"
              value={design.bodyColor}
              onChange={(c) => dispatch({ type: "pageColors", patch: { bodyColor: c } })}
              against={against}
            />
          </fieldset>
        </div>
      )}
    </div>
  );
}
