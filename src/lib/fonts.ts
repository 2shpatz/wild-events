import type React from "react";
import { useEffect } from "react";
import { fontByFamily } from "../../shared/fonts";

const loaded = new Set<string>();

function cssUrl(family: string, text?: string) {
  const f = fontByFamily(family);
  const name = encodeURIComponent(family).replace(/%20/g, "+");
  const weight = f && f.w !== 400 ? `:wght@${f.w}` : "";
  const subset = text ? `&text=${encodeURIComponent(text)}` : "";
  return `https://fonts.googleapis.com/css2?family=${name}${weight}${subset}&display=swap`;
}

/**
 * Injects the Google Fonts stylesheet for a family once.
 * With `text`, only those glyphs are fetched (tiny and fast - used while browsing fonts);
 * the full family is loaded separately once a font is in real use.
 */
export function loadFont(family: string | null | undefined, text?: string) {
  if (!family || !fontByFamily(family) || typeof document === "undefined") return;
  const key = text ? `${family}|${text}` : family;
  if (loaded.has(key) || loaded.has(family)) return;
  loaded.add(key);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = cssUrl(family, text);
  document.head.appendChild(link);
}

/**
 * A font used for ordinary text: besides the weight the list picks for headings, also fetch the regular weight
 * (a family without one just keeps the heading weight - Google answers that request with an error, which is harmless).
 */
export function loadTextFont(family: string | null | undefined) {
  loadFont(family);
  const f = fontByFamily(family);
  if (!f || f.w === 400 || typeof document === "undefined" || loaded.has(`${f.family}|400`)) return;
  loaded.add(`${f.family}|400`);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, "+")}:wght@400&display=swap`;
  document.head.appendChild(link);
}

/** Loads the given families (full) while the component is mounted. */
export function useFonts(...families: (string | null | undefined)[]) {
  const key = families.filter(Boolean).join("|");
  useEffect(() => {
    for (const f of key.split("|")) if (f) loadFont(f);
  }, [key]);
}

/** Font for ordinary text (paragraphs, lists, buttons) - inherited by everything inside; null = the body font. */
export function textFontStyle(family: string | null | undefined): React.CSSProperties | undefined {
  const f = fontByFamily(family);
  return f ? { fontFamily: `"${f.family}", "Heebo", system-ui, sans-serif` } : undefined;
}

/** Weight the title should use with this font (fonts are loaded in that weight only). */
export const fontWeight = (family: string | null | undefined) => fontByFamily(family)?.w ?? undefined;

/** CSS variables that switch `.font-title` elements to a chosen font (no-op for null = theme font). */
export function titleFontVars(family: string | null | undefined): React.CSSProperties | undefined {
  const f = fontByFamily(family);
  if (!f) return undefined;
  return { ["--title-font" as string]: `"${f.family}", var(--font-display), "Heebo", sans-serif`, ["--title-weight" as string]: String(f.w) } as React.CSSProperties;
}
