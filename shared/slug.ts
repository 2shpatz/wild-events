/** Event URL slugs: `/<slug>` on the site root. */

export const RESERVED_SLUGS = new Set([
  "e", "api", "login", "logout", "setup", "dashboard", "share", "share-target", "privacy", "terms", "assets",
  "admin", "manage", "new", "help", "about", "icon", "sw", "manifest", "static", "app", "www", "demo-site",
]);

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function isValidSlug(s: string) {
  return SLUG_RE.test(s) && !s.includes("--") && !RESERVED_SLUGS.has(s);
}

// Phrases that don't help a URL ("the wedding of", "birthday of"...).
const FILLER = [
  "החתונה של", "חתונה של", "חתונת", "יום ההולדת של", "יום הולדת של", "יום הולדת", "בר המצווה של", "בת המצווה של",
  "בר מצווה של", "בת מצווה של", "בר מצווה", "בת מצווה", "הברית של", "ברית של", "המסיבה של", "מסיבת", "האירוע של",
];

const CONS: Record<string, string> = {
  "ב": "b", "ג": "g", "ד": "d", "ז": "z", "ח": "ch", "ט": "t", "כ": "k", "ך": "ch", "ל": "l", "מ": "m", "ם": "m",
  "נ": "n", "ן": "n", "ס": "s", "פ": "p", "ף": "f", "צ": "tz", "ץ": "tz", "ק": "k", "ר": "r", "ש": "sh", "ת": "t",
};

/** Rough Hebrew → Latin transliteration, tuned for names (owners can always edit the result). */
function translitWord(w: string): string {
  let out = "";
  const ch = [...w];
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    const next = ch[i + 1];
    const first = i === 0;
    const last = i === ch.length - 1;
    if (c === "ו") {
      if (next === "ו") {
        out += "v";
        i++;
      } else if (first) out += "v";
      else out += "o";
    } else if (c === "י") {
      if (next === "י") {
        out += "y";
        i++;
      } else if (first) out += "y";
      else out += last ? "i" : "i";
    } else if (c === "א" || c === "ע") {
      if (next !== "י" && next !== "ו") out += "a";
    } else if (c === "ה") {
      out += last ? (/[aeiou]$/.test(out) ? "" : "a") : first ? "h" : "a";
    } else if (CONS[c]) {
      out += CONS[c];
      // Consonant followed by consonant (no written vowel) → insert a soft "a" for readability.
      if (next && CONS[next] && !last) out += "a";
    } else if (/[a-z0-9]/i.test(c)) out += c.toLowerCase();
  }
  return out.replace(/([aeiou])\1+/g, "$1");
}

export function suggestSlug(title: string): string {
  let t = title.normalize("NFKC").trim();
  for (const f of FILLER) t = t.replace(new RegExp(`^${f}\\s*`), "");
  const words = t
    .replace(/[׳״'"`]/g, "")
    .split(/[\s\-_.,·&+/]+/)
    .filter(Boolean)
    // Hebrew "ו" (and) prefix: "ואיתי" → "itai".
    .map((w, i) => (i > 0 && /^ו[֐-׿]/.test(w) ? w.slice(1) : w))
    .filter((w) => !["של", "ו", "את", "עם", "and", "of", "the"].includes(w.toLowerCase()));
  const slug = words
    .map((w) => (/[֐-׿]/.test(w) ? translitWord(w) : w.toLowerCase().replace(/[^a-z0-9]/g, "")))
    .filter(Boolean)
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36)
    .replace(/-$/, "");
  return slug.length >= 3 ? slug : slug ? `${slug}-event` : "";
}
