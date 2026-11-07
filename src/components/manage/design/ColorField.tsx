import { useId } from "react";
import { AlertTriangle, Check, Pipette, RotateCcw } from "lucide-react";
import { cx } from "../../ui";

const SWATCHES = [
  { c: "#ffffff", n: "לבן" },
  { c: "#fdf2f8", n: "ורוד בהיר" },
  { c: "#fde68a", n: "זהב בהיר" },
  { c: "#a16207", n: "זהב" },
  { c: "#db2777", n: "ורוד" },
  { c: "#be123c", n: "אדום יין" },
  { c: "#7c3aed", n: "סגול" },
  { c: "#1d4ed8", n: "כחול" },
  { c: "#0f766e", n: "טורקיז" },
  { c: "#18181b", n: "שחור" },
];

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Text color: theme default, a swatch, or any color (native picker). Warns when contrast with the page
 * background is low (`against` = approximate background behind the text).
 */
export function ColorField({
  label,
  value,
  onChange,
  against,
  large,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  against: string;
  /** large text (titles) needs 3:1, body text 4.5:1 */
  large?: boolean;
}) {
  const id = useId();
  const low = value ? contrast(value, against) < (large ? 3 : 4.5) : false;
  const custom = value && !SWATCHES.some((s) => s.c === value);
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 font-semibold">{label}</legend>
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={label}>
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          onClick={() => onChange(null)}
          className={cx(
            "inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3 text-sm font-semibold transition-colors duration-200",
            value === null ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
          )}
        >
          <RotateCcw className="size-4" aria-hidden />
          ברירת מחדל
        </button>
        {SWATCHES.map((s) => (
          <button
            key={s.c}
            type="button"
            role="radio"
            aria-checked={value === s.c}
            aria-label={s.n}
            title={s.n}
            onClick={() => onChange(s.c)}
            className={cx(
              "inline-flex size-11 items-center justify-center rounded-full border-2 transition-transform duration-200 hover:scale-105",
              value === s.c ? "border-primary ring-2 ring-primary/40" : "border-border",
            )}
            style={{ backgroundColor: s.c }}
          >
            {value === s.c && <Check className="size-5" style={{ color: contrast(s.c, "#ffffff") > 3 ? "#fff" : "#18181b" }} aria-hidden />}
          </button>
        ))}
        <label
          htmlFor={id}
          className={cx(
            "relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 text-sm font-semibold transition-colors duration-200",
            custom ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
          )}
        >
          <span className="size-5 rounded-full border border-border" style={{ background: custom ? value! : "conic-gradient(#f43f5e,#f59e0b,#22c55e,#3b82f6,#a855f7,#f43f5e)" }} aria-hidden />
          <Pipette className="size-4" aria-hidden />
          צבע אחר
          <input id={id} type="color" value={value ?? "#ffffff"} onChange={(e) => onChange(e.target.value.toLowerCase())} className="absolute inset-0 size-full cursor-pointer opacity-0" />
        </label>
      </div>
      {low && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-fg" role="status">
          <AlertTriangle className="size-4 shrink-0 text-amber-500" aria-hidden />
          הצבע קרוב לצבע הרקע - ייתכן שיהיה קשה לקרוא
        </p>
      )}
    </fieldset>
  );
}
