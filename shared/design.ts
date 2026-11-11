/**
 * The guest page layout ("flexible design"): a fixed hero (the main page) with blocks before and after it.
 * Stored as JSON in events.design; always passed through sanitizeDesign() on both write and read.
 */
import { isKnownFont } from "./fonts";
import { contrast } from "./color";

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
  /** heading font (Google Fonts family from FONTS); null = the page's "other headings" font / the theme's */
  font: string | null;
  /** font of the paragraph; null = the page's text font (EventDesign.textFont) / the body font */
  textFont: string | null;
};
/**
 * Font + color of a block's texts: `font` for its headings, `textFont` for the rest of its text;
 * null = the page's fonts (EventDesign.pagesFont / textFont), then the theme's.
 */
export type BlockStyle = { font: string | null; textFont: string | null; color: string | null };
export type ImageBlock = BlockBase & BlockStyle & { type: "image"; slot: number; caption: string; shape: "wide" | "card" | "round" };
export type SingletonType = "invitation" | "details" | "featured" | "live" | "messages";

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
  uploadText: "צילמתם? העלו לאלבום מהגלריה או מהמצלמה",
  emptyTitle: "האלבום עוד ריק",
  emptyText: "היו הראשונים להעלות תמונה מהאירוע",
} as const;
export type LiveText = keyof typeof LIVE_TEXTS;

/** WhatsApp group block: the texts around the join button (null = default). */
export const WHATSAPP_TEXTS = {
  title: "הקבוצה של האירוע",
  text: "עדכונים, תמונות והודעות - הצטרפו לקבוצת הוואטסאפ",
  button: "הצטרפות לקבוצה",
} as const;
export type WhatsAppText = keyof typeof WHATSAPP_TEXTS;

/** Message board ("לוח ברכות"): guests write messages everyone can read. */
export const MESSAGES_TEXTS = {
  title: "לוח הברכות",
  /** the button that opens the writing window */
  add: "הוספת ברכה",
  prompt: "כתבו ברכה לבעלי השמחה",
  button: "שליחה",
} as const;
export type MessagesText = keyof typeof MESSAGES_TEXTS;

/** Checklist: things left to do before the event. */
export const CHECKLIST_TEXTS = { title: "מה נשאר לעשות" } as const;
export type ChecklistText = keyof typeof CHECKLIST_TEXTS;

/** Max length of each editable heading / card text. */
export const PART_TEXT_MAX = {
  title: 80,
  nav: 60,
  share: 60,
  calendar: 60,
  viewTitle: 60,
  viewText: 120,
  uploadTitle: 60,
  uploadText: 120,
  emptyTitle: 60,
  emptyText: 120,
  text: 160,
  button: 40,
  prompt: 120,
  add: 40,
} as const;

/** Lengths of the guest-written content (server-enforced). */
export const MESSAGE_MAX = 500;
export const CHECKLIST_ITEM_MAX = 120;
export const MAX_CHECKLIST_ITEMS = 100;

/** A WhatsApp group invite link, normalized to https://chat.whatsapp.com/<code>; anything else = "". */
export function whatsappUrl(v: unknown): string {
  if (typeof v !== "string") return "";
  const m = /^(?:https?:\/\/)?chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]{10,40})(?:[/?#].*)?$/.exec(v.trim());
  return m ? `https://chat.whatsapp.com/${m[1]}` : "";
}

export type DetailsBlock = BlockBase & BlockStyle & { type: "details"; show: Record<DetailsPart, boolean>; texts: Record<DetailsText, string | null> };
export type LiveBlock = BlockBase & BlockStyle & { type: "live"; show: Record<LivePart, boolean>; texts: Record<LiveText, string | null> };
/** How the hosts' featured photos are shown: standing scrapbook (the original), a pile to flip through, carousel, floating. */
export const FEATURED_LAYOUTS = ["grid", "stack", "carousel", "floating"] as const;
export type FeaturedLayout = (typeof FEATURED_LAYOUTS)[number];
export type FeaturedBlock = BlockBase & { type: "featured"; layout: FeaturedLayout };
/** Not a singleton: a page may link several groups (e.g. one per family). */
export type WhatsAppBlock = BlockBase & BlockStyle & { type: "whatsapp"; url: string; texts: Record<WhatsAppText, string | null> };
export type MessagesBlock = BlockBase & BlockStyle & { type: "messages"; texts: Record<MessagesText, string | null> };
/**
 * Not a singleton: a page may hold several lists. The items live in the checklist_items table (list_id = the block id);
 * the hosts choose separately whether guests may tick, add and delete items.
 */
export type ChecklistBlock = BlockBase &
  BlockStyle & {
    type: "checklist";
    texts: Record<ChecklistText, string | null>;
    guestsTick: boolean;
    guestsAdd: boolean;
    guestsDelete: boolean;
    /** a quick-jump button to the list in the bottom banner (phones) */
    inBar: boolean;
  };

export type SingletonBlock = (BlockBase & { type: "invitation" }) | FeaturedBlock | DetailsBlock | LiveBlock | MessagesBlock;
export type Block = TextBlock | ImageBlock | WhatsAppBlock | ChecklistBlock | SingletonBlock;
export type BlockType = Block["type"];

/**
 * The banners that follow the guest while scrolling the home page (after the main page): the top bar and, on
 * phones, the bottom action bar. Which buttons they hold, and their text font / color
 * (null = top: the other pages' title font; bottom: the body font / both: the main title color, if readable).
 */
export interface BarsDesign {
  top: { show: boolean; avatar: boolean; view: boolean; upload: boolean; font: string | null; color: string | null };
  bottom: { show: boolean; upload: boolean; view: boolean; font: string | null; color: string | null };
}

export interface EventDesign {
  v: 1;
  hero: HeroDesign;
  bars: BarsDesign;
  before: Block[];
  after: Block[];
  /**
   * Font of the other headings: the elements' headings on the home page (unless an element has its own) and the title
   * on the other event pages (upload, gallery). null = elements: the theme's display font, other pages: the main title's.
   */
  pagesFont: string | null;
  /** Font of the elements' text (paragraphs, buttons, lists) unless an element has its own; null = the body font. */
  textFont: string | null;
  /** #rrggbb of the elements' headings / their text unless an element has its own color; null = the theme's. */
  headingsColor: string | null;
  bodyColor: string | null;
}

export const MAX_IMAGES = 10;
export const MAX_BLOCKS = 20;
export const SINGLETONS: SingletonType[] = ["invitation", "details", "featured", "live", "messages"];
export const DATE_STYLES: DateStyle[] = ["invitation", "line", "numeric", "hebrew", "both"];

export const newBlockId = () => Math.random().toString(36).slice(2, 10);

const allOn = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, true])) as Record<K, boolean>;
const allNull = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, null])) as Record<K, null>;

/** A built-in block with everything shown and the default texts. */
export function singletonBlock(type: SingletonType, id: string): SingletonBlock {
  if (type === "details") return { id, type, show: allOn(DETAILS_PARTS), texts: allNull(Object.keys(DETAILS_TEXTS) as DetailsText[]), font: null, textFont: null, color: null };
  if (type === "live") return { id, type, show: allOn(LIVE_PARTS), texts: allNull(Object.keys(LIVE_TEXTS) as LiveText[]), font: null, textFont: null, color: null };
  if (type === "featured") return { id, type, layout: "grid" };
  if (type === "messages") return { id, type, texts: allNull(Object.keys(MESSAGES_TEXTS) as MessagesText[]), font: null, textFont: null, color: null };
  return { id, type };
}

/** The text to show for an editable part: the hosts' own, or the default. */
export const partText = <T extends string>(texts: Record<T, string | null>, key: T, fallback: string) => texts[key]?.trim() || fallback;

export function defaultBars(): BarsDesign {
  return {
    top: { show: true, avatar: true, view: true, upload: true, font: null, color: null },
    bottom: { show: true, upload: true, view: true, font: null, color: null },
  };
}

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

/** The banners over the header image are always dark (image dimmed + dark blur); about this color behind the title. */
export const BAR_BACKDROP = "#18181b";

/**
 * Title color in the scroll banners: the main title's color when it stays readable on the dark banner
 * (large text, 3:1), otherwise null = white.
 */
export const barTitleColor = (hero: HeroDesign) => (hero.titleColor && contrast(hero.titleColor, BAR_BACKDROP) >= 3 ? hero.titleColor : null);

/** Text color of a scroll banner: the hosts' own choice, else the main title color when readable, else null = white. */
export const barTextColor = (d: EventDesign, which: keyof BarsDesign) => d.bars[which].color ?? barTitleColor(d.hero);

/** CSS object-position for the header image (same focal point in every frame shape it's shown in). */
export const headerObjectPosition = (hero: HeroDesign) => `${hero.headerPos.x}% ${hero.headerPos.y}%`;

/** Same order the page had before the flexible design existed. */
export function defaultDesign(): EventDesign {
  return {
    v: 1,
    hero: defaultHero(),
    bars: defaultBars(),
    before: [],
    after: [singletonBlock("invitation", "invitation"), singletonBlock("details", "details"), singletonBlock("featured", "featured"), singletonBlock("live", "live")],
    pagesFont: null,
    textFont: null,
    headingsColor: null,
    bodyColor: null,
  };
}

export function newBlock(type: BlockType, slot = 0): Block {
  const id = newBlockId();
  if (type === "text") return { id, type, heading: "", body: "", align: "center", size: "md", color: null, card: true, font: null, textFont: null };
  if (type === "image") return { id, type, slot, caption: "", shape: "card", font: null, textFont: null, color: null };
  if (type === "whatsapp") return { id, type, url: "", texts: allNull(Object.keys(WHATSAPP_TEXTS) as WhatsAppText[]), font: null, textFont: null, color: null };
  if (type === "checklist")
    return { id, type, texts: allNull(Object.keys(CHECKLIST_TEXTS) as ChecklistText[]), guestsTick: false, guestsAdd: false, guestsDelete: false, inBar: false, font: null, textFont: null, color: null };
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
/** Editable texts of a block: each known key, trimmed to its max length; "" = null (the default). */
const partTexts = <K extends keyof typeof PART_TEXT_MAX>(v: unknown, keys: readonly K[]) => {
  const t = obj(v);
  return Object.fromEntries(keys.map((k) => [k, text(t[k], PART_TEXT_MAX[k]) || null])) as Record<K, string | null>;
};

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
      textFont: font(b.textFont),
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
      textFont: font(b.textFont),
      color: color(b.color),
      ...hidden,
    };
  } else if (b.type === "whatsapp") {
    out = {
      id,
      type: "whatsapp",
      url: whatsappUrl(b.url),
      texts: partTexts(b.texts, Object.keys(WHATSAPP_TEXTS) as WhatsAppText[]),
      font: font(b.font),
      textFont: font(b.textFont),
      color: color(b.color),
      ...hidden,
    };
  } else if (b.type === "checklist") {
    // "guestsEdit" was one switch for both adding and deleting; older designs keep its value for each.
    const edit = bool(b.guestsEdit, false);
    out = {
      id,
      type: "checklist",
      texts: partTexts(b.texts, Object.keys(CHECKLIST_TEXTS) as ChecklistText[]),
      guestsTick: bool(b.guestsTick, false),
      guestsAdd: bool(b.guestsAdd, edit),
      guestsDelete: bool(b.guestsDelete, edit),
      inBar: bool(b.inBar, false),
      font: font(b.font),
      textFont: font(b.textFont),
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
        textFont: font(b.textFont),
        color: color(b.color),
      } as DetailsBlock | LiveBlock;
    }
    if (out.type === "messages") out = { ...out, texts: partTexts(b.texts, Object.keys(MESSAGES_TEXTS) as MessagesText[]), font: font(b.font), textFont: font(b.textFont), color: color(b.color) };

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
  return { v: 1, hero: sanitizeHero(d.hero), bars: sanitizeBars(d.bars, obj(obj(d.hero).show).bar), before, after, pagesFont: font(d.pagesFont), textFont: font(d.textFont), headingsColor: color(d.headingsColor), bodyColor: color(d.bodyColor) };
}

/** `legacyTopShow`: the top banner switch used to live at hero.show.bar. */
function sanitizeBars(input: unknown, legacyTopShow: unknown): BarsDesign {
  const b = obj(input);
  const t = obj(b.top);
  const m = obj(b.bottom);
  return {
    top: {
      show: bool(t.show, bool(legacyTopShow, true)),
      avatar: bool(t.avatar, true),
      view: bool(t.view, true),
      upload: bool(t.upload, true),
      font: font(t.font),
      color: color(t.color),
    },
    bottom: { show: bool(m.show, true), upload: bool(m.upload, true), view: bool(m.view, true), font: font(m.font), color: color(m.color) },
  };
}

export function parseDesign(json: string | null | undefined): EventDesign {
  if (!json) return defaultDesign();
  try {
    return sanitizeDesign(JSON.parse(json));
  } catch {
    return defaultDesign();
  }
}

/** Fonts the blocks and banners use (to load them on the guest page). */
export const blockFonts = (d: EventDesign) => [
  ...[...d.before, ...d.after].flatMap((b) => [..."font" in b && b.font ? [b.font] : [], ..."textFont" in b && b.textFont ? [b.textFont] : []]),
  ...[d.pagesFont, d.textFont].filter((f): f is string => !!f),
  ...[d.bars.top.font, d.bars.bottom.font].filter((f): f is string => !!f),
];

/** Fonts used for ordinary text (also need their regular weight). */
export const textFonts = (d: EventDesign) => [
  ...[...d.before, ...d.after].flatMap((b) => ("textFont" in b && b.textFont ? [b.textFont] : [])),
  ...(d.textFont ? [d.textFont] : []),
];

/** Image slots referenced by the design (everything else under kind 'i*' is an orphan). */
export const usedImageSlots = (d: EventDesign) =>
  [...d.before, ...d.after].flatMap((b) => (b.type === "image" ? [b.slot] : []));

/** Ids of the page's checklists, in page order (hidden ones too - their items are kept). */
export const checklistIds = (d: EventDesign) => [...d.before, ...d.after].flatMap((b) => (b.type === "checklist" ? [b.id] : []));

/** The visible (not hidden) block of a type, if the page has one - used by the server to check what guests may do. */
export function visibleBlock<T extends Block["type"]>(d: EventDesign, type: T): Extract<Block, { type: T }> | null {
  return ([...d.before, ...d.after].find((b) => b.type === type && !b.hidden) as Extract<Block, { type: T }> | undefined) ?? null;
}

/** Font for the title on the non-home event pages. */
export const pagesTitleFont = (d: EventDesign) => d.pagesFont ?? d.hero.titleFont;
