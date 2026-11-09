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
  show: { header: boolean; subtitle: boolean; date: boolean; info: boolean; welcome: boolean };
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
};
export type ImageBlock = BlockBase & { type: "image"; slot: number; caption: string; shape: "wide" | "card" | "round" };
export type SingletonType = "invitation" | "details" | "featured" | "live";

export type SingletonBlock = BlockBase & { type: SingletonType };
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

export function defaultHero(): HeroDesign {
  return {
    titleFont: null,
    titleSize: "lg",
    titleColor: null,
    textColor: null,
    dateStyle: "invitation",
    show: { header: true, subtitle: true, date: true, info: true, welcome: true },
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
    after: [
      { id: "invitation", type: "invitation" },
      { id: "details", type: "details" },
      { id: "featured", type: "featured" },
      { id: "live", type: "live" },
    ],
    pagesFont: null,
  };
}

export function newBlock(type: BlockType, slot = 0): Block {
  const id = newBlockId();
  if (type === "text") return { id, type, heading: "", body: "", align: "center", size: "md", color: null, card: true };
  if (type === "image") return { id, type, slot, caption: "", shape: "card" };
  return { id, type };
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
      info: bool(s.info, true),
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
      ...hidden,
    };
  } else if (b.type === "image") {
    const slot = Number(b.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_IMAGES || seen.slots.has(slot)) return null;
    seen.slots.add(slot);
    out = { id, type: "image", slot, caption: text(b.caption, 160), shape: oneOf(b.shape, ["wide", "card", "round"] as const, "card"), ...hidden };
  } else if (SINGLETONS.includes(b.type as SingletonType)) {
    if (seen.singles.has(b.type as string)) return null;
    seen.singles.add(b.type as string);
    out = { id, type: b.type as SingletonType, ...hidden };
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

/** Image slots referenced by the design (everything else under kind 'i*' is an orphan). */
export const usedImageSlots = (d: EventDesign) =>
  [...d.before, ...d.after].flatMap((b) => (b.type === "image" ? [b.slot] : []));

/** Font for the title on the non-home event pages. */
export const pagesTitleFont = (d: EventDesign) => d.pagesFont ?? d.hero.titleFont;
