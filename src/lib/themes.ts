import type { EventType, ThemeId } from "../../shared/types";

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
    ],
  },
  {
    id: "family",
    label: "בר/בת מצווה · ברית · משפחתי",
    description: "סגול חם וכתום, מכובד",
    theme: "family",
    backgrounds: [
      { id: "family-lavender", label: "לבנדר" },
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

/** Inline style / class for an event background (preset gradient or uploaded image). */
export function backgroundProps(ev: { code: string; background: string | null; bgVersion: string | null; theme: ThemeId }) {
  if (ev.background === "custom") {
    return {
      className: "bg-cover bg-center",
      style: { backgroundImage: `url(/api/e/${ev.code}/asset/bg?v=${encodeURIComponent(ev.bgVersion || "")})` },
    };
  }
  const preset = ev.background || typeInfo(ev.theme as EventType).backgrounds[0].id;
  return { className: `bg-preset-${preset}`, style: {} as React.CSSProperties };
}

export function isDarkBackground(background: string | null, theme: ThemeId) {
  if (background === "custom") return true; // always shown under a dark scrim
  const id = background || typeInfo(theme as EventType).backgrounds[0].id;
  return ["wedding-gold", "party-neon", "general-night", "birthday-sunset"].includes(id);
}
