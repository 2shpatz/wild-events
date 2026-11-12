import { Link, matchPath, useLocation } from "react-router-dom";
import { cx } from "./ui";

/** The developer's site. Shown on every page as "פותח ע"י ShpatzAppZ". */
export const DEVELOPER_URL = "https://ohad-shpindel.shpatzappz.link";

/** First path segments that are app pages, not event codes. */
const APP_PAGES = new Set(["login", "setup", "dashboard", "admin", "share", "privacy", "terms", "e"]);

type Tone = "light" | "dark";

const SAFE_PAD = "pb-[max(0.5rem,env(safe-area-inset-bottom))]";

function footerVariant(pathname: string): { tone: Tone; extra: string } {
  const gallery = matchPath("/:code/gallery", pathname);
  if (gallery && !APP_PAGES.has(gallery.params.code!)) {
    // Dark gallery canvas; leave room for the floating "העלאה" button.
    return { tone: "dark", extra: "bg-canvas pb-28" };
  }
  if (matchPath("/:code/upload", pathname)) {
    // The selected-files bar is fixed to the bottom; keep the footer above it.
    return { tone: "light", extra: "bg-bg pb-44" };
  }
  const home = matchPath("/:code", pathname);
  if (home && !APP_PAGES.has(home.params.code!)) {
    // The event page has a photo / gradient background; a solid dark band keeps the text readable.
    return { tone: "dark", extra: `bg-zinc-950/85 backdrop-blur-md ${SAFE_PAD}` };
  }
  return { tone: "light", extra: `bg-bg ${SAFE_PAD}` };
}

/**
 * Global footer (skill: touch targets >= 44px, contrast >= 4.5:1, fixed bars must not cover content).
 * Rendered once in main.tsx after the routes, so it sits at the bottom of every page.
 */
export function SiteFooter() {
  const { pathname } = useLocation();
  const { tone, extra } = footerVariant(pathname);
  const dark = tone === "dark";
  const link = cx(
    "inline-flex min-h-11 items-center rounded-lg px-2 underline-offset-4 transition-colors duration-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2",
    dark ? "hover:text-white focus-visible:outline-white" : "hover:text-fg focus-visible:outline-primary",
  );
  return (
    <footer
      className={cx(
        "relative border-t px-4 pt-2 text-sm",
        dark ? "border-white/10 text-white/80" : "border-border text-muted-fg",
        extra,
      )}
    >
      {/* Mobile: two lines (legal links, then the attribution). sm+: one line. */}
      <nav aria-label="קישורים בתחתית העמוד" className="mx-auto flex max-w-3xl flex-col items-center sm:flex-row sm:justify-center sm:gap-3">
        <span className="flex items-center gap-3">
          <Link to="/privacy" className={link}>
            מדיניות פרטיות
          </Link>
          <span aria-hidden className="opacity-50">
            ·
          </span>
          <Link to="/terms" className={link}>
            תנאי שימוש
          </Link>
        </span>
        <span aria-hidden className="hidden opacity-50 sm:inline">
          ·
        </span>
        <span className="inline-flex items-center">
          פותח ע"י
          <a
            href={DEVELOPER_URL}
            target="_blank"
            rel="noopener"
            aria-label="אתר המפתח - ShpatzAppZ (נפתח בחלון חדש)"
            className={cx(link, "font-semibold", dark ? "text-white" : "text-fg")}
          >
            <bdi dir="ltr">ShpatzAppZ</bdi>
          </a>
        </span>
      </nav>
    </footer>
  );
}
