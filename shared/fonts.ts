/**
 * Curated Google Fonts for the event title (verified against the ui-ux-pro-max google-fonts dataset).
 * Hebrew-capable families come first; Latin-only families render Hebrew text in the fallback font.
 * `w` = the weight requested from Google Fonts (and used for the title).
 */
export type FontCategory = "display" | "hand" | "serif" | "sans";
export interface FontDef {
  family: string;
  hebrew: boolean;
  category: FontCategory;
  w: number;
}

const he = (family: string, category: FontCategory, w = 400): FontDef => ({ family, hebrew: true, category, w });
const la = (family: string, category: FontCategory, w = 400): FontDef => ({ family, hebrew: false, category, w });

export const FONTS: FontDef[] = [
  // Hebrew: elegant / festive first
  he("Bellefair", "serif"),
  he("Suez One", "serif"),
  he("Secular One", "sans"),
  he("Frank Ruhl Libre", "serif", 500),
  he("David Libre", "serif", 500),
  he("Karantina", "display", 700),
  he("Amatic SC", "hand", 700),
  he("Gveret Levin", "hand"),
  he("Solitreo", "hand"),
  he("Playpen Sans Hebrew", "hand", 600),
  he("Noto Rashi Hebrew", "serif", 600),
  he("Noto Serif Hebrew", "serif", 600),
  he("Bona Nova", "serif", 700),
  he("Cardo", "serif", 700),
  he("Libertinus Serif", "serif", 600),
  he("Tinos", "serif", 700),
  he("Fredoka", "sans", 600),
  he("Varela Round", "sans"),
  he("Rubik", "sans", 700),
  he("Heebo", "sans", 800),
  he("Assistant", "sans", 800),
  he("Alef", "sans", 700),
  he("Miriam Libre", "sans", 700),
  he("IBM Plex Sans Hebrew", "sans", 700),
  he("Noto Sans Hebrew", "sans", 800),
  he("Open Sans", "sans", 800),
  he("Arimo", "sans", 700),
  he("Lunasima", "sans", 700),
  he("Handjet", "display", 600),
  he("Rubik Moonrocks", "display"),
  he("Rubik Bubbles", "display"),
  he("Rubik Doodle Shadow", "display"),
  he("Rubik Doodle Triangles", "display"),
  he("Rubik Vinyl", "display"),
  he("Rubik Wet Paint", "display"),
  he("Rubik Spray Paint", "display"),
  he("Rubik Gemstones", "display"),
  he("Rubik Puddles", "display"),
  he("Rubik Scribble", "display"),
  he("Rubik Marker Hatch", "display"),
  he("Rubik Lines", "display"),
  he("Rubik Iso", "display"),
  he("Rubik Microbe", "display"),
  he("Rubik Beastly", "display"),
  he("Rubik Burned", "display"),
  he("Rubik Dirt", "display"),
  he("Rubik Distressed", "display"),
  he("Rubik Storm", "display"),
  he("Rubik Glitch", "display"),
  he("Rubik Glitch Pop", "display"),
  he("Rubik 80s Fade", "display"),
  he("Rubik Broken Fax", "display"),
  he("Rubik Maze", "display"),
  he("Rubik Maps", "display"),
  he("Rubik Pixels", "display"),

  // Latin-only: script / wedding
  la("Great Vibes", "hand"),
  la("Dancing Script", "hand", 600),
  la("Allura", "hand"),
  la("Parisienne", "hand"),
  la("Pinyon Script", "hand"),
  la("Italianno", "hand"),
  la("Tangerine", "hand", 700),
  la("Alex Brush", "hand"),
  la("Sacramento", "hand"),
  la("Satisfy", "hand"),
  la("Kaushan Script", "hand"),
  la("Yellowtail", "hand"),
  la("Cookie", "hand"),
  la("Courgette", "hand"),
  la("Pacifico", "hand"),
  la("Herr Von Muellerhoff", "hand"),
  la("Berkshire Swash", "hand"),
  la("Homemade Apple", "hand"),
  la("Caveat", "hand", 600),
  la("Indie Flower", "hand"),
  la("Shadows Into Light", "hand"),
  la("Gloria Hallelujah", "hand"),
  la("Permanent Marker", "hand"),
  la("Patrick Hand", "hand"),
  // Latin-only: serif / elegant display
  la("Playfair Display", "serif", 600),
  la("Cormorant Garamond", "serif", 600),
  la("Cinzel", "serif", 600),
  la("Cinzel Decorative", "display", 700),
  la("Abril Fatface", "display"),
  la("Forum", "display"),
  la("Poiret One", "display"),
  la("Aboreto", "display"),
  la("Marcellus", "serif"),
  la("Yeseva One", "display"),
  la("DM Serif Display", "serif"),
  la("Gravitas One", "display"),
  // Latin-only: party / fun display
  la("Lobster", "display"),
  la("Lobster Two", "display", 700),
  la("Righteous", "display"),
  la("Bungee", "display"),
  la("Titan One", "display"),
  la("Lilita One", "display"),
  la("Luckiest Guy", "display"),
  la("Bangers", "display"),
  la("Chelsea Market", "display"),
  la("Calistoga", "display"),
  la("Comfortaa", "display", 700),
  la("Baloo 2", "display", 700),
  la("Alfa Slab One", "display"),
  la("Black Ops One", "display"),
  la("Staatliches", "display"),
  la("Passion One", "display"),
  la("Patua One", "display"),
  la("Cabin Sketch", "display", 700),
  la("Monoton", "display"),
  la("Bebas Neue", "display"),
  la("Anton", "sans"),
  la("Oswald", "sans", 600),
  la("Montserrat", "sans", 800),
  la("Poppins", "sans", 700),
].filter((f, i, all) => all.findIndex((g) => g.family === f.family) === i);

const BY_FAMILY = new Map(FONTS.map((f) => [f.family, f]));
export const fontByFamily = (family: string | null | undefined) => (family ? BY_FAMILY.get(family) ?? null : null);
export const isKnownFont = (family: unknown): family is string => typeof family === "string" && BY_FAMILY.has(family);

/** CSS font-family stack for a chosen font (falls back to the theme's display font). */
export const fontStack = (family: string | null | undefined) =>
  family && BY_FAMILY.has(family) ? `"${family}", var(--font-display), "Heebo", sans-serif` : undefined;
