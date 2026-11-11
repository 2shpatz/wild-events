import { useId, useState } from "react";
import { ChevronDown, Palette } from "lucide-react";
import { fontByFamily } from "../../../../shared/fonts";
import { cx } from "../../ui";
import { ColorField } from "./ColorField";
import { FontPicker } from "./FontPicker";

/**
 * "גופן וצבע" of a block, collapsed by default (the font list is long) with a one-line summary of the current
 * choice, so the editing panel stays short until the hosts actually want to restyle the element.
 */
export function BlockStyleFields({
  font,
  color,
  onFont,
  onColor,
  textFont,
  onTextFont,
  fontLabel,
  colorLabel,
  sample,
  against,
  hebrewOnly,
  onHebrewOnly,
  defaultFontName = "גופן ערכת הנושא",
}: {
  font: string | null;
  color: string | null;
  onFont: (f: string | null) => void;
  onColor: (c: string | null) => void;
  /** the font of the element's other text (omit for elements without body text) */
  textFont?: string | null;
  onTextFont?: (f: string | null) => void;
  fontLabel: string;
  colorLabel: string;
  /** text to preview the fonts with (the block's heading) */
  sample: string;
  /** approximate color behind the block's text (contrast hints) */
  against: string;
  hebrewOnly: boolean;
  onHebrewOnly: (v: boolean) => void;
  /** what "no font chosen" means here (shown in the summary) */
  defaultFontName?: string;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const name = (f: string | null | undefined, fallback: string) => (f ? (fontByFamily(f)?.family ?? f) : fallback);
  const fontName = onTextFont && textFont ? `${name(font, defaultFontName)} + ${name(textFont, "")}` : name(font, defaultFontName);
  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panel}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-start transition-colors duration-200 hover:bg-fg/5 sm:px-4"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Palette className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">גופן וצבע</span>
          <span className="flex items-center gap-1.5 text-sm text-muted-fg">
            <span className="truncate">{fontName}</span>
            <span aria-hidden>·</span>
            {color ? (
              <>
                <span className="inline-block size-3.5 shrink-0 rounded-full ring-1 ring-border" style={{ backgroundColor: color }} aria-hidden />
                <span>צבע שבחרתם</span>
              </>
            ) : (
              <span>צבע ברירת המחדל</span>
            )}
          </span>
        </span>
        <ChevronDown className={cx("size-5 shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={panel} className="space-y-6 border-t border-border px-3 pb-4 pt-4 sm:px-4">
          <FontPicker label={fontLabel} value={font} onChange={onFont} hebrewOnly={hebrewOnly} onHebrewOnly={onHebrewOnly} sample={sample} />
          {onTextFont && (
            <FontPicker label="גופן הטקסט" value={textFont ?? null} onChange={onTextFont} hebrewOnly={hebrewOnly} onHebrewOnly={onHebrewOnly} sample="טקסט לדוגמה, כמו בפסקה" />
          )}
          <ColorField label={colorLabel} value={color} onChange={onColor} against={against} />
        </div>
      )}
    </div>
  );
}
