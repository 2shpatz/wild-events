import { useEffect, useState, type KeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";
import { DATE_STYLES, type DateStyle } from "../../../shared/design";
import { DATE_STYLE_LABELS, dateSample } from "../../lib/dateStyles";
import { fontWeight, loadFont } from "../../lib/fonts";
import { cx } from "../ui";
import hosts640 from "../../assets/albums/hosts-640.webp";
import photographer320 from "../../assets/albums/photographer-320.webp";
import guest320 from "../../assets/albums/guest-320.webp";
import friends320 from "../../assets/albums/friends-320.webp";

const TITLE = "דנה ויואב";
/** A few of the Hebrew title fonts from shared/fonts.ts, picked to show the range. */
const DEMO_FONTS = [
  "Gveret Levin",
  "Suez One",
  "Karantina",
  "Amatic SC",
  "Rubik Moonrocks",
  "Frank Ruhl Libre",
  "Solitreo",
  "Playpen Sans Hebrew",
  "Rubik Doodle Shadow",
  "Bellefair",
];
const COLORS: { value: string | null; label: string; swatch: string }[] = [
  { value: null, label: "צבע ערכת הנושא", swatch: "var(--color-fg)" },
  { value: "#6d28d9", label: "סגול", swatch: "#6d28d9" },
  { value: "#be123c", label: "בורדו", swatch: "#be123c" },
  { value: "#b45309", label: "זהב", swatch: "#b45309" },
];
const DEMO_DATE = new Date(2027, 5, 17);

/**
 * Interactive mini version of the flexible design editor on the site home: the visitor flips title fonts
 * with the arrows (or keyboard), picks a date style and a title color, and the phone preview updates live.
 * Nothing autoplays; every control is a real button (44px) with a Hebrew label.
 */
export function GuestPageDemo() {
  const [fontIdx, setFontIdx] = useState(0);
  const [dateStyle, setDateStyle] = useState<DateStyle>("invitation");
  const [color, setColor] = useState<string | null>(null);
  const font = DEMO_FONTS[fontIdx];
  const n = DEMO_FONTS.length;

  // Only the title's glyphs are fetched; the neighbours are preloaded so the arrows feel instant.
  useEffect(() => {
    for (const d of [0, 1, -1]) loadFont(DEMO_FONTS[(fontIdx + d + n) % n], TITLE);
  }, [fontIdx, n]);

  const step = (d: 1 | -1) => setFontIdx((i) => (i + d + n) % n);
  const onKey = (e: KeyboardEvent) => {
    // RTL: left = next, right = previous
    if (e.key === "ArrowLeft") step(1);
    else if (e.key === "ArrowRight") step(-1);
    else return;
    e.preventDefault();
  };

  const arrow =
    "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-[filter] duration-200 hover:brightness-110 focus-visible:outline-offset-2";

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr] lg:grid-cols-1">
      {/* Phone preview */}
      <div className="mx-auto w-full max-w-[18.5rem] sm:w-[18.5rem] rounded-[2.6rem] bg-zinc-900 p-2.5 shadow-lift">
        <div className="overflow-hidden rounded-[2.1rem] bg-card text-fg">
          <img src={hosts640} alt="" width={640} height={480} loading="lazy" decoding="async" className="aspect-[16/10] w-full object-cover object-top" />
          <div className="space-y-2 px-4 pb-4 pt-3 text-center">
            <p className="text-sm font-semibold text-muted-fg">מתחתנים!</p>
            <p className="flex min-h-[5.5rem] items-center justify-center text-[2.6rem] leading-tight [text-wrap:balance]">
              <span style={{ fontFamily: `"${font}", var(--font-display), sans-serif`, fontWeight: fontWeight(font), color: color ?? undefined }}>{TITLE}</span>
            </p>
            <p className="font-semibold" style={{ color: color ?? undefined }}>
              {dateSample(dateStyle, DEMO_DATE)}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 rounded-xl bg-muted px-3 py-2 text-sm text-muted-fg">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                19:30
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                הגן של סבתא
              </span>
            </div>
            <div className="pt-1 text-start">
              <p className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-bold">
                <span className="size-2 rounded-full bg-red-500 motion-safe:animate-pulse" aria-hidden />
                אלבום בזמן אמת
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {[photographer320, guest320, friends320].map((src) => (
                  <img key={src} src={src} alt="" width={320} height={240} loading="lazy" decoding="async" className="aspect-square w-full rounded-lg object-cover" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls: the same three choices the real editor starts with */}
      <div className="space-y-5 rounded-3xl bg-card/90 p-5 shadow-soft">
        <p className="text-sm font-semibold text-primary">נסו בעצמכם</p>

        <div className="space-y-2">
          <p id="demo-font" className="font-bold">
            גופן הכותרת
          </p>
          <div role="group" aria-labelledby="demo-font" onKeyDown={onKey} className="flex items-center justify-between gap-2 rounded-2xl bg-muted p-1.5">
            <button type="button" className={arrow} onClick={() => step(-1)} aria-label="הגופן הקודם">
              <ChevronRight className="size-5" aria-hidden />
            </button>
            <span className="min-w-0 truncate text-center font-semibold" aria-live="polite">
              <bdi>{font}</bdi>
              <span className="sr-only">
                , גופן {fontIdx + 1} מתוך {n}
              </span>
            </span>
            <button type="button" className={arrow} onClick={() => step(1)} aria-label="הגופן הבא">
              <ChevronLeft className="size-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p id="demo-date" className="inline-flex items-center gap-1.5 font-bold">
            <CalendarDays className="size-4" aria-hidden />
            איך יוצג התאריך
          </p>
          <div role="group" aria-labelledby="demo-date" className="flex flex-wrap gap-2">
            {DATE_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={dateStyle === s}
                onClick={() => setDateStyle(s)}
                className={cx(
                  "min-h-11 rounded-full border-2 px-3.5 text-sm font-semibold transition-colors duration-200",
                  dateStyle === s ? "border-primary bg-primary text-on-primary" : "border-border bg-card hover:border-primary/50",
                )}
              >
                {DATE_STYLE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p id="demo-color" className="font-bold">
            צבע הכותרת
          </p>
          <div role="group" aria-labelledby="demo-color" className="flex gap-3">
            {COLORS.map((c) => (
              <button
                key={c.label}
                type="button"
                aria-pressed={color === c.value}
                aria-label={c.label}
                title={c.label}
                onClick={() => setColor(c.value)}
                className={cx(
                  "inline-flex size-11 items-center justify-center rounded-full border-2 transition-colors duration-200",
                  color === c.value ? "border-primary" : "border-transparent hover:border-border",
                )}
              >
                <span className="size-8 rounded-full ring-1 ring-black/10" style={{ background: c.swatch }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
