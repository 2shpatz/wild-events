import { useId, useState } from "react";
import { ChevronDown, Type } from "lucide-react";
import type { EventDesign } from "../../../../shared/design";
import { fontByFamily } from "../../../../shared/fonts";
import { Segmented, cx } from "../../ui";
import type { DraftAction } from "./draft";
import { FontPicker } from "./FontPicker";

/**
 * The page-wide fonts: the other headings (elements + the upload / gallery pages) and the elements' text.
 * Collapsed by default, with a one-line summary of the current choice.
 */
export function PageFontsPanel({
  design,
  dispatch,
  hebrewOnly,
  onHebrewOnly,
}: {
  design: EventDesign;
  dispatch: (a: DraftAction) => void;
  hebrewOnly: boolean;
  onHebrewOnly: (v: boolean) => void;
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
          <span className="block font-semibold">גופנים לשאר העמוד</span>
          <span className="block truncate text-sm text-muted-fg">
            כותרות: {name(design.pagesFont)} · טקסט: {name(design.textFont)}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-primary">{open ? "הסתרה" : "הצגה"}</span>
        <ChevronDown className={cx("size-5 shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={panel} className="space-y-6 border-t border-border px-3 pb-4 pt-4 sm:px-4">
          <fieldset className="space-y-3">
            <legend className="mb-1 font-semibold">גופן שאר הכותרות</legend>
            <p className="text-sm text-muted-fg">הכותרות של האלמנטים בעמוד (פרטי האירוע, לוח הברכות, הרשימות...) והכותרת בעמודי ההעלאה והאלבום. אלמנט שבחרתם לו גופן משלו שומר עליו.</p>
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
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 font-semibold">גופן הטקסט באלמנטים</legend>
            <p className="text-sm text-muted-fg">הפסקאות, הרשימות והכפתורים שבתוך האלמנטים. אלמנט שבחרתם לו גופן טקסט משלו שומר עליו.</p>
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
          </fieldset>
        </div>
      )}
    </div>
  );
}
