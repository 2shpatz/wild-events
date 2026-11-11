import type { BgPos, EventType, ThemeId } from "../../shared/types";
import tripMountains from "../assets/backgrounds/trip-mountains.webp";
import tripClouds from "../assets/backgrounds/trip-clouds.webp";
import tripSky from "../assets/backgrounds/trip-sky.webp";
import tripHills from "../assets/backgrounds/trip-hills.webp";
import partyDisco from "../assets/backgrounds/party-disco.webp";
import karaokeGold from "../assets/backgrounds/karaoke-gold.webp";
import karaokeMono from "../assets/backgrounds/karaoke-mono.webp";
import musicNotes from "../assets/backgrounds/music-notes.webp";
import weddingRings from "../assets/backgrounds/wedding-rings.webp";
import weddingWhite from "../assets/backgrounds/wedding-white.webp";
import religiousSynagogue from "../assets/backgrounds/religious-synagogue.webp";
import religiousJerusalem from "../assets/backgrounds/religious-jerusalem.webp";


export interface EventTypeInfo {
  id: EventType;
  label: string;
  description: string;
  theme: ThemeId;
  backgrounds: { id: string; label: string }[];
}

export const EVENT_TYPES: EventTypeInfo[] = [
  {
    id: "wedding",
    label: "חתונה",
    description: "ורוד רומנטי וזהב, אלגנטי",
    theme: "wedding",
    backgrounds: [
      { id: "wedding-blush", label: "ורוד עדין" },
      { id: "wedding-gold", label: "בורדו וזהב" },
      { id: "wedding-rings", label: "טבעות זהב" },
      { id: "wedding-white", label: "טבעות על לבן" },
      { id: "religious-synagogue", label: "בית כנסת" },
      { id: "religious-jerusalem", label: "ירושלים" },
    ],
  },
  {
    id: "birthday",
    label: "יום הולדת",
    description: "צבעוני, שמח וחגיגי",
    theme: "birthday",
    backgrounds: [
      { id: "birthday-confetti", label: "קונפטי" },
      { id: "birthday-sunset", label: "שקיעה" },
      { id: "party-disco", label: "כדור דיסקו" },
      { id: "karaoke-gold", label: "קריוקי" },
    ],
  },
  {
    id: "family",
    label: "בר/בת מצווה · ברית · משפחתי",
    description: "סגול חם וכתום, מכובד",
    theme: "family",
    backgrounds: [
      { id: "family-lavender", label: "לבנדר" },
      { id: "religious-synagogue", label: "בית כנסת" },
      { id: "religious-jerusalem", label: "ירושלים" },
      { id: "general-mono", label: "בהיר נקי" },
    ],
  },
  {
    id: "party",
    label: "מסיבה · ערב",
    description: "כהה עם ניאון עדין",
    theme: "party",
    backgrounds: [
      { id: "party-neon", label: "ניאון" },
      { id: "party-disco", label: "כדור דיסקו" },
      { id: "karaoke-gold", label: "קריוקי" },
      { id: "karaoke-mono", label: "מיקרופון אולפן" },
      { id: "music-notes", label: "תווים" },
      { id: "general-night", label: "לילה" },
    ],
  },
  {
    id: "trip",
    label: "טיול",
    description: "פסטל רך, נופים ואוויר פתוח",
    theme: "trip",
    backgrounds: [
      { id: "trip-mountains", label: "ירח מעל ההרים" },
      { id: "trip-clouds", label: "מעל העננים" },
      { id: "trip-sky", label: "שמיים וירח" },
      { id: "trip-hills", label: "הרים בצבעי מים" },
    ],
  },
  {
    id: "general",
    label: "אירוע כללי",
    description: "מינימליסטי, התמונות במרכז",
    theme: "general",
    backgrounds: [
      { id: "general-mono", label: "בהיר נקי" },
      { id: "general-night", label: "לילה" },
      { id: "music-notes", label: "תווים" },
    ],
  },
];

export const THEME_LABELS: Record<ThemeId, string> = {
  wedding: "חתונה",
  birthday: "יום הולדת",
  family: "משפחתי",
  party: "מסיבה",
  trip: "טיול",
  general: "כללי",
};

export function typeInfo(id: EventType) {
  return EVENT_TYPES.find((t) => t.id === id) ?? EVENT_TYPES[EVENT_TYPES.length - 1];
}

export function applyTheme(theme: ThemeId | null | undefined) {
  document.documentElement.dataset.theme = theme || "general";
  const meta = document.querySelector('meta[name="theme-color"]');
  const color = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  if (meta && color) meta.setAttribute("content", color);
}

/**
 * Presets that are photos (they can be framed like an uploaded picture) → the picture's URL; the rest are gradients.
 * Their CSS class (index.css) draws a wash gradient over the picture: two background layers.
 */
export const PHOTO_BACKGROUNDS: Record<string, string> = {
  "trip-mountains": tripMountains,
  "trip-clouds": tripClouds,
  "trip-sky": tripSky,
  "trip-hills": tripHills,
  "party-disco": partyDisco,
  "karaoke-gold": karaokeGold,
  "karaoke-mono": karaokeMono,
  "music-notes": musicNotes,
  "wedding-rings": weddingRings,
  "wedding-white": weddingWhite,
  "religious-synagogue": religiousSynagogue,
  "religious-jerusalem": religiousJerusalem,
};

/** The background shown for an event / draft (preset id or "custom"). */
export const resolvedBackground = (background: string | null, theme: ThemeId) => background || typeInfo(theme as EventType).backgrounds[0].id;

/** Can this background be positioned (a photo)? */
export const isPhotoBackground = (background: string | null, theme: ThemeId) => {
  const id = resolvedBackground(background, theme);
  return id === "custom" || id in PHOTO_BACKGROUNDS;
};

/** A photo background and how it's framed: BgLayer sizes and places it from the picture's real proportions. */
export interface BgPhoto {
  src: string;
  pos: BgPos;
  /** background layers of the class: 1 (an uploaded picture) or 2 (a preset: wash gradient + picture) */
  layers: 1 | 2;
}

/**
 * Class / style of an event background (preset gradient or photo, or an uploaded image). For photos, `photo` carries
 * the framing (focal point + zoom); `fill` is the style of the blurred copy drawn behind when the picture doesn't
 * cover the screen (see BgLayer).
 */
export function backgroundProps(ev: { code: string; background: string | null; bgVersion: string | null; theme: ThemeId; bgPos?: BgPos }) {
  const custom = ev.background === "custom";
  const preset = resolvedBackground(ev.background, ev.theme);
  const customSrc = `/api/e/${ev.code}/asset/bg?v=${encodeURIComponent(ev.bgVersion || "")}`;
  const image: React.CSSProperties = custom ? { backgroundImage: `url(${customSrc})` } : {};
  const src = custom ? customSrc : PHOTO_BACKGROUNDS[preset];
  return {
    className: custom ? "bg-cover bg-center" : `bg-preset-${preset}`,
    style: image,
    fill: src ? image : null,
    photo: src ? ({ src, pos: ev.bgPos ?? { x: 50, y: 50, zoom: 1 }, layers: custom ? 1 : 2 } as BgPhoto) : null,
  };
}

export function isDarkBackground(background: string | null, theme: ThemeId) {
  if (background === "custom") return true; // always shown under a dark scrim
  const id = background || typeInfo(theme as EventType).backgrounds[0].id;
  return ["wedding-gold", "party-neon", "general-night", "birthday-sunset", "party-disco", "karaoke-gold", "karaoke-mono", "religious-synagogue"].includes(id);
}
