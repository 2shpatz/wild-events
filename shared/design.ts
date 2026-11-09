/**
 * The guest page layout ("flexible design"): a fixed hero (the main page) with blocks before and after it.
 * Stored as JSON in events.design; always passed through sanitizeDesign() on both write and read.
 */
import { isKnownFont } from "./fonts";

export type DateStyle = "invitation" | "line" | "numeric" | "hebrew" | "both";
export type TitleSize = "md" | "lg" | "xl";

export interface HeroDesign {
  /** Google Fonts family from FONTS; null = the theme's display font */
  titleFont: string | null;
  titleSize: TitleSize;
  /** #rrggbb or null = theme default */
  titleColor: string | null;
  /** subtitle, date, time / venue, welcome; #rrggbb or null */
  textColor: string | null;
  dateStyle: DateStyle;
  show: { header: boolean; subtitle: boolean; date: boolean; time: boolean; countdown: boolean; venue: boolean; welcome: boolean };
  /** focal point of the header image inside its frame, in % (CSS object-position); 50/50 = centered */
  headerPos: { x: number; y: number };
}

type BlockBase = { id: string; hidden?: boolean };

export type TextBlock = BlockBase & {
  type: "text";
  heading: string;
  body: string;
  align: "start" | "center";
  size: "sm" | "md" | "lg";
  color: string | null;
  card: boolean;
  /** heading font (Google Fonts family from FONTS); null = the theme's display font */
  font: string | null;
};
/** Font + color of a block's texts (headings use the font); null = the theme's defaults. */
export type BlockStyle = { font: string | null; color: string | null };
export type ImageBlock = BlockBase & BlockStyle & { type: "image"; slot: number; caption: string; shape: "wide" | "card" | "round" };
export type SingletonType = "invitation" | "details" | "featured" | "live";

/**
 * Parts of the "details" / "live" blocks that the hosts can show or hide, and the texts they can rewrite.
 * A text of null (or "" while typing) means the built-in default (DETAILS_TEXTS / LIVE_TEXTS).
 */
export const DETAILS_PARTS = ["title", "when", "where", "nav", "share", "calendar"] as const;
export type DetailsPart = (typeof DETAILS_PARTS)[number];
export const DETAILS_TEXTS = {
  title: "פרטי האירוע",
  nav: "איך מגיעים",
  /** with an address to share; without one the default is DETAILS_SHARE_NO_ADDRESS */
  share: "שיתוף הכתובת",
  calendar: "הוספה ליומן",
} as const;
export const DETAILS_SHARE_NO_ADDRESS = "שיתוף פרטי האירוע";
export type DetailsText = keyof typeof DETAILS_TEXTS;

export const LIVE_PARTS = ["title", "count", "strip", "view", "upload"] as const;
export type LivePart = (typeof LIVE_PARTS)[number];
export const LIVE_TEXTS = {
  title: "מהאלבום, בזמן אמת",
  viewTitle: "צפייה בתמונות האירוע",
  viewText: "כל התמונות של כולם, בזמן אמת",
  uploadTitle: "הוסיפו את התמונות שלכם",
  uploadText: "צילמתם? העלו לאלבום - מהגלריה או מהמצלמה",
  emptyTitle: "האלבום עוד ריק",
  emptyText: "היו הראשונים להעלות תמונה מהאירוע",
} as const;
export type LiveText = keyof typeof LIVE_TEXTS;

/** Max length of each editable heading / card text. */
export const PART_TEXT_MAX = { title: 80, nav: 60, share: 60, calendar: 60, viewTitle: 60, viewText: 120, uploadTitle: 60, uploadText: 120, emptyTitle: 60, emptyText: 120 } as const;

export type DetailsBlock = BlockBase & BlockStyle & { type: "details"; show: Record<DetailsPart, boolean>; texts: Record<DetailsText, string | null> };
export type LiveBlock = BlockBase & BlockStyle & { type: "live"; show: Record<LivePart, boolean>; texts: Record<LiveText, string | null> };
/** How the hosts' featured photos are shown: standing scrapbook (the original), a pile to flip through, carousel, floating. */
export const FEATURED_LAYOUTS = ["grid", "stack", "carousel", "floating"] as const;
export type FeaturedLayout = (typeof FEATURED_LAYOUTS)[number];
export type FeaturedBlock = BlockBase & { type: "featured"; layout: FeaturedLayout };

export type SingletonBlock = (BlockBase & { type: "invitation" }) | FeaturedBlock | DetailsBlock | LiveBlock;
export type Block = TextBlock | ImageBlock | SingletonBlock;
export type BlockType = Block["type"];

export interface EventDesign {
  v: 1;
  hero: HeroDesign;
  before: Block[];
  after: Block[];
  /** title font on the other event pages (upload, gallery); null = same as the main title */
  pagesFont: string | null;
}

export const MAX_IMAGES = 10;
export const MAX_BLOCKS = 20;
export const SINGLETONS: SingletonType[] = ["invitation", "details", "featured", "live"];
export const DATE_STYLES: DateStyle[] = ["invitation", "line", "numeric", "hebrew", "both"];

export const newBlockId = () => Math.random().toString(36).slice(2, 10);

const allOn = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, true])) as Record<K, boolean>;
const allNull = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, null])) as Record<K, null>;

/** A built-in block with everything shown and the default texts. */
export function singletonBlock(type: SingletonType, id: string): SingletonBlock {
  if (type === "details") return { id, type, show: allOn(DETAILS_PARTS), texts: allNull(Object.keys(DETAILS_TEXTS) as DetailsText[]), font: null, color: null };
  if (type === "live") return { id, type, show: allOn(LIVE_PARTS), texts: allNull(Object.keys(LIVE_TEXTS) as LiveText[]), font: null, color: null };
  if (type === "featured") return { id, type, layout: "grid" };
  return { id, type };
}

/** The text to show for an editable part: the hosts' own, or the default. */
export const partText = <T extends string>(texts: Record<T, string | null>, key: T, fallback: string) => texts[key]?.trim() || fallback;

export function defaultHero(): HeroDesign {
  return {
    titleFont: null,
    titleSize: "lg",
    titleColor: null,
    textColor: null,
    dateStyle: "invitation",
    show: { header: true, subtitle: true, date: true, time: true, countdown: true, venue: true, welcome: true },
    headerPos: { x: 50, y: 50 },
  };
}

/** CSS object-position for the header image (same focal point in every frame shape it's shown in). */
export const headerObjectPosition = (hero: HeroDesign) => `${hero.headerPos.x}% ${hero.headerPos.y}%`;

/** Same order the page had before the flexible design existed. */
export function defaultDesign(): EventDesign {
  return {
    v: 1,
    hero: defaultHero(),
    before: [],
    after: [singletonBlock("invitation", "invitation"), singletonBlock("details", "details"), singletonBlock("featured", "featured"), singletonBlock("live", "live")],
    pagesFont: null,
  };
}

export function newBlock(type: BlockType, slot = 0): Block {
  const id = newBlockId();
  if (type === "text") return { id, type, heading: "", body: "", align: "center", size: "md", color: null, card: true, font: null };
  if (type === "image") return { id, type, slot, caption: "", shape: "card", font: null, color: null };
  return singletonBlock(type, id);
}

const COLOR_RE = /^#[0-9a-f]{6}$/;
const ID_RE = /^[a-z0-9]{1,16}$/;
const color = (v: unknown) => (typeof v === "string" && COLOR_RE.test(v.toLowerCase()) ? v.toLowerCase() : null);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const text = (v: unknown, max: number, multiline = false) => {
  if (typeof v !== "string") return "";
  const s = v.normalize("NFKC").replace(/\r\n?/g, "\n");
  return (multiline ? s.replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ")).trim().slice(0, max);
};
const percent = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v)) * 10) / 10 : 50);
const font = (v: unknown) => (isKnownFont(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function sanitizeHero(input: unknown): HeroDesign {
  const h = obj(input);
  const d = defaultHero();
  const s = obj(h.show);
  return {
    titleFont: font(h.titleFont),
    titleSize: oneOf(h.titleSize, ["md", "lg", "xl"] as const, d.titleSize),
    titleColor: color(h.titleColor),
    textColor: color(h.textColor),
    dateStyle: oneOf(h.dateStyle, DATE_STYLES, d.dateStyle),
    show: {
      header: bool(s.header, true),
      subtitle: bool(s.subtitle, true),
      date: bool(s.date, true),
      // These three used to be one switch ("info"); older designs keep its value.
      time: bool(s.time, bool(s.info, true)),
      countdown: bool(s.countdown, bool(s.info, true)),
      venue: bool(s.venue, bool(s.info, true)),
      welcome: bool(s.welcome, true),
    },
    headerPos: { x: percent(obj(h.headerPos).x), y: percent(obj(h.headerPos).y) },
  };
}

function sanitizeBlock(input: unknown, seen: { ids: Set<string>; singles: Set<string>; slots: Set<number> }): Block | null {
  const b = obj(input);
  const id = typeof b.id === "string" && ID_RE.test(b.id) && !seen.ids.has(b.id) ? b.id : null;
  if (!id) return null;
  const hidden = b.hidden === true ? { hidden: true } : {};
  let out: Block | null = null;
  if (b.type === "text") {
    out = {
      id,
      type: "text",
      heading: text(b.heading, 80),
      body: text(b.body, 1000, true),
      align: oneOf(b.align, ["start", "center"] as const, "center"),
      size: oneOf(b.size, ["sm", "md", "lg"] as const, "md"),
      color: color(b.color),
      card: bool(b.card, true),
      font: font(b.font),
      ...hidden,
    };
  } else if (b.type === "image") {
    const slot = Number(b.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_IMAGES || seen.slots.has(slot)) return null;
    seen.slots.add(slot);
    out = {
      id,
      type: "image",
      slot,
      caption: text(b.caption, 160),
      shape: oneOf(b.shape, ["wide", "card", "round"] as const, "card"),
      font: font(b.font),
      color: color(b.color),
      ...hidden,
    };
  } else if (SINGLETONS.includes(b.type as SingletonType)) {
    if (seen.singles.has(b.type as string)) return null;
    seen.singles.add(b.type as string);
    const type = b.type as SingletonType;
    out = { ...singletonBlock(type, id), ...hidden };
    if (out.type === "featured") out = { ...out, layout: oneOf(b.layout, FEATURED_LAYOUTS, "grid") };
    if (out.type === "details" || out.type === "live") {
      const show = obj(b.show);
      const texts = obj(b.texts);
      const parts: readonly string[] = out.type === "details" ? DETAILS_PARTS : LIVE_PARTS;
      const keys = Object.keys(out.type === "details" ? DETAILS_TEXTS : LIVE_TEXTS) as (keyof typeof PART_TEXT_MAX)[];
      out = {
        ...out,
        show: Object.fromEntries(parts.map((k) => [k, bool(show[k], true)])),
        texts: Object.fromEntries(keys.map((k) => [k, text(texts[k], PART_TEXT_MAX[k]) || null])),
        font: font(b.font),
        color: color(b.color),
      } as DetailsBlock | LiveBlock;
    }
  }
  if (out) seen.ids.add(id);
  return out;
}

/** Strict whitelist: unknown fields are dropped, bad values fall back to defaults. Never throws. */
export function sanitizeDesign(input: unknown): EventDesign {
  const d = obj(input);
  if (d.v !== 1) return defaultDesign();
  const seen = { ids: new Set<string>(), singles: new Set<string>(), slots: new Set<number>() };
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const before: Block[] = [];
  const after: Block[] = [];
  for (const [src, dst] of [
    [list(d.before), before],
    [list(d.after), after],
  ] as const) {
    for (const raw of src) {
      if (before.length + after.length >= MAX_BLOCKS) break;
      const b = sanitizeBlock(raw, seen);
      if (b) dst.push(b);
    }
  }
  return { v: 1, hero: sanitizeHero(d.hero), before, after, pagesFont: font(d.pagesFont) };
}

export function parseDesign(json: string | null | undefined): EventDesign {
  if (!json) return defaultDesign();
  try {
    return sanitizeDesign(JSON.parse(json));
  } catch {
    return defaultDesign();
  }
}

/** Fonts the blocks use (to load them on the guest page). */
export const blockFonts = (d: EventDesign) =>
  [...d.before, ...d.after].flatMap((b) => ("font" in b && b.font ? [b.font] : []));

/** Image slots referenced by the design (everything else under kind 'i*' is an orphan). */
export const usedImageSlots = (d: EventDesign) =>
  [...d.before, ...d.after].flatMap((b) => (b.type === "image" ? [b.slot] : []));

/** Font for the title on the non-home event pages. */
export const pagesTitleFont = (d: EventDesign) => d.pagesFont ?? d.hero.titleFont;
