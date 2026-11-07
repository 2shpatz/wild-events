import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Check, Search } from "lucide-react";
import { FONTS, fontByFamily, type FontDef } from "../../../../shared/fonts";
import { loadFont } from "../../../lib/fonts";
import { cx, inputClass } from "../../ui";

const CATEGORY: Record<FontDef["category"], string> = { display: "מיוחד", hand: "כתב יד", serif: "קלאסי", sans: "נקי" };

/** Fonts the arrows step through (null = the theme's font, always first). */
export function fontList(hebrewOnly: boolean, query = "") {
  const q = query.trim().toLowerCase();
  return FONTS.filter((f) => (!hebrewOnly || f.hebrew) && (!q || f.family.toLowerCase().includes(q) || CATEGORY[f.category].includes(q)));
}

export function stepFont(current: string | null, dir: 1 | -1, hebrewOnly: boolean): string | null {
  const list: (string | null)[] = [null, ...fontList(hebrewOnly).map((f) => f.family)];
  const i = Math.max(0, list.indexOf(current));
  return list[(i + dir + list.length) % list.length];
}

const fontName = (f: string | null) => f ?? "גופן ערכת הנושא";

/**
 * ◀ name ▶ - quick browsing: every press swaps the font in the live preview immediately.
 * RTL: "next" is on the left. Keyboard: ←/→ while focused.
 */
export function FontStepper({
  value,
  onChange,
  hebrewOnly,
  sample,
  dark,
}: {
  value: string | null;
  onChange: (f: string | null) => void;
  hebrewOnly: boolean;
  /** text to render the font name with (defaults to the name itself) */
  sample?: string;
  dark?: boolean;
}) {
  const list = useMemo(() => [null, ...fontList(hebrewOnly).map((f) => f.family)], [hebrewOnly]);
  const pos = Math.max(0, list.indexOf(value));
  const go = (dir: 1 | -1) => onChange(stepFont(value, dir, hebrewOnly));

  // Prefetch the neighbours (tiny glyph subsets) so stepping feels instant.
  useEffect(() => {
    for (const f of [value, stepFont(value, 1, hebrewOnly), stepFont(value, -1, hebrewOnly)]) {
      if (f) loadFont(f, (sample ?? "") + f);
    }
  }, [value, hebrewOnly, sample]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") (e.preventDefault(), go(1));
    if (e.key === "ArrowRight") (e.preventDefault(), go(-1));
  };
  const f = fontByFamily(value);
  const btn = cx(
    "inline-flex size-12 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
    dark ? "bg-white/15 text-white hover:bg-white/25" : "bg-muted text-fg hover:bg-primary/15",
  );
  return (
    <div className={cx("flex items-center gap-2", !dark && "max-sm:flex-wrap max-sm:justify-between")} onKeyDown={onKey}>
      <button type="button" className={btn} onClick={() => go(-1)} aria-label="הגופן הקודם">
        <ChevronRight className="size-6" aria-hidden />
      </button>
      {/* Fixed-height stage so stepping through fonts never shifts the layout. */}
      <div className={cx("min-w-0 flex-1 text-center", !dark && "flex min-h-36 flex-col justify-center rounded-2xl border border-border bg-card px-3 py-3 max-sm:order-first max-sm:basis-full")} aria-live="polite">
        <p
          className={cx(
            "line-clamp-2 py-1 leading-[1.15] [text-wrap:balance] transition-[font-family] duration-150",
            dark ? "text-3xl text-white" : "text-4xl sm:text-5xl",
            !f && "font-display",
          )}
          style={f ? { fontFamily: `"${f.family}", Heebo, sans-serif`, fontWeight: f.w } : undefined}
        >
          {sample || fontName(value)}
        </p>
        <p className={cx("mt-1 truncate text-sm", dark ? "text-white/75" : "text-muted-fg")}>
          {fontName(value)} · {pos + 1}/{list.length}
          {f && !f.hebrew && " · ללא עברית"}
        </p>
      </div>
      <button type="button" className={btn} onClick={() => go(1)} aria-label="הגופן הבא">
        <ChevronLeft className="size-6" aria-hidden />
      </button>
    </div>
  );
}

/** Full picker: stepper + "Hebrew only" filter + search + a list where every name is shown in its own font. */
export function FontPicker({
  label,
  value,
  onChange,
  hebrewOnly,
  onHebrewOnly,
  sample,
}: {
  label: string;
  value: string | null;
  onChange: (f: string | null) => void;
  hebrewOnly: boolean;
  onHebrewOnly: (v: boolean) => void;
  sample: string;
}) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => fontList(hebrewOnly, query), [hebrewOnly, query]);
  const id = label.replace(/\s/g, "-");
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 font-semibold">{label}</legend>
      <FontStepper value={value} onChange={onChange} hebrewOnly={hebrewOnly} sample={sample} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" aria-hidden />
          <input
            id={`${id}-q`}
            className={cx(inputClass, "min-h-11 ps-9")}
            placeholder="חיפוש גופן"
            aria-label="חיפוש גופן"
            dir="auto"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={hebrewOnly} onChange={(e) => onHebrewOnly(e.target.checked)} />
          רק גופנים עם עברית
        </label>
      </div>
      <ul className="relative max-h-80 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-border bg-bg p-1" role="listbox" aria-label={label}>
        {!query && <FontRow family={null} active={value === null} onPick={() => onChange(null)} />}
        {list.map((f) => (
          <FontRow key={f.family} family={f.family} active={value === f.family} onPick={() => onChange(f.family)} />
        ))}
        {!list.length && <li className="px-3 py-4 text-center text-sm text-muted-fg">לא נמצאו גופנים</li>}
      </ul>
    </fieldset>
  );
}

/** One font in the list; its glyphs are fetched only when it scrolls into view. */
function FontRow({ family, active, onPick }: { family: string | null; active: boolean; onPick: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  const f = fontByFamily(family);
  useEffect(() => {
    if (!family || !ref.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (loadFont(family, family + "אבגד"), io.disconnect()));
    io.observe(ref.current);
    return () => io.disconnect();
  }, [family]);
  // Keep the chosen font visible inside the list (scrolls the list only, never the page).
  useEffect(() => {
    const li = ref.current;
    const ul = li?.parentElement;
    if (!active || !li || !ul) return;
    if (li.offsetTop < ul.scrollTop || li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight) {
      ul.scrollTop = li.offsetTop - (ul.clientHeight - li.offsetHeight) / 2;
    }
  }, [active]);
  return (
    <li ref={ref} role="option" aria-selected={active}>
      <button
        type="button"
        onClick={onPick}
        className={cx(
          "flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-start transition-colors duration-150",
          active ? "bg-primary text-on-primary" : "hover:bg-fg/5",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-2xl" dir="ltr" style={f ? { fontFamily: `"${f.family}", Heebo, sans-serif`, fontWeight: f.w, textAlign: "right" } : undefined}>
          {family ?? "גופן ערכת הנושא"}
        </span>
        {f && (
          <span className={cx("shrink-0 text-xs", active ? "text-on-primary/80" : "text-muted-fg")}>
            {f.hebrew ? "עברית · " : ""}
            {CATEGORY[f.category]}
          </span>
        )}
        {active && <Check className="size-4 shrink-0" aria-hidden />}
      </button>
    </li>
  );
}
