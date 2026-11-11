import type { BgPos, EventType, ThemeId } from "../../shared/types";

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
      { id: "karaoke-mono", label: "מיקרופון" },
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
      { id: "trip-mountains", label: "הרים בפסטל" },
      { id: "trip-clouds", label: "עננים בשקיעה" },
      { id: "trip-sky", label: "שמיים תכולים" },
      { id: "trip-hills", label: "גבעות בצבעי מים" },
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

/** Presets that are photos (they can be positioned like an uploaded picture); the rest are gradients. */
export const PHOTO_BACKGROUNDS = new Set([
  "trip-mountains",
  "trip-clouds",
  "trip-sky",
  "trip-hills",
  "party-disco",
  "karaoke-gold",
  "karaoke-mono",
  "music-notes",
  "wedding-rings",
  "wedding-white",
  "religious-synagogue",
  "religious-jerusalem",
]);

/** The background shown for an event / draft (preset id or "custom"). */
export const resolvedBackground = (background: string | null, theme: ThemeId) => background || typeInfo(theme as EventType).backgrounds[0].id;

/** Can this background be positioned (a photo)? */
export const isPhotoBackground = (background: string | null, theme: ThemeId) => {
  const id = resolvedBackground(background, theme);
  return id === "custom" || PHOTO_BACKGROUNDS.has(id);
};

/**
 * Inline style / class for an event background (preset gradient / photo or uploaded image), at its framing.
 * Zoom scales the layer around the focal point (its container clips it), so the chosen spot stays put. Below 1 the
 * picture no longer fills the screen: `fill` is then the style of a blurred copy to draw behind it (see BgLayer).
 */
export function backgroundProps(ev: { code: string; background: string | null; bgVersion: string | null; theme: ThemeId; bgPos?: BgPos }) {
  const custom = ev.background === "custom";
  const preset = resolvedBackground(ev.background, ev.theme);
  const image = custom ? { backgroundImage: `url(/api/e/${ev.code}/asset/bg?v=${encodeURIComponent(ev.bgVersion || "")})` } : {};
  const p = custom || PHOTO_BACKGROUNDS.has(preset) ? ev.bgPos : undefined;
  const at = p ? `${p.x}% ${p.y}%` : "50% 50%";
  let style: React.CSSProperties = { ...image, ...(p && (p.x !== 50 || p.y !== 50) ? { backgroundPosition: at } : {}) };
  if (p && p.zoom > 1) {
    // Zoom in: enlarge the layer around the focal point.
    style = { ...style, transform: `scale(${p.zoom})`, transformOrigin: at };
  } else if (p && p.zoom < 1) {
    // Zoom out: the layer keeps its size and the picture inside it shrinks (more of it shows). The background is a
    // tall layer, so "cover" is set by its height: the picture gets zoom x that height. Photo presets have a wash
    // gradient on top (first layer) that keeps covering everything.
    const size = `auto ${Math.round(p.zoom * 100)}%`;
    style = custom
      ? { ...style, backgroundSize: size, backgroundPosition: at, backgroundRepeat: "no-repeat" }
      : { ...style, backgroundSize: `100% 100%, ${size}`, backgroundPosition: `center, ${at}`, backgroundRepeat: "no-repeat" };
  }
  return {
    className: custom ? "bg-cover bg-center" : `bg-preset-${preset}`,
    style,
    fill: p && p.zoom < 1 ? (image as React.CSSProperties) : null,
  };
}

export function isDarkBackground(background: string | null, theme: ThemeId) {
  if (background === "custom") return true; // always shown under a dark scrim
  const id = background || typeInfo(theme as EventType).backgrounds[0].id;
  return ["wedding-gold", "party-neon", "general-night", "birthday-sunset", "party-disco", "karaoke-gold", "karaoke-mono", "religious-synagogue"].includes(id);
}
