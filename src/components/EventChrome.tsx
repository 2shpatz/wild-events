import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarHeart, SearchX } from "lucide-react";
import type { PublicEvent } from "../../shared/types";
import { backgroundProps, isDarkBackground } from "../lib/themes";
import { cx, Spinner } from "./ui";
import { ApiError, errorMessage } from "../lib/api";
import { formatDate } from "../lib/format";
import { titleFontVars, useFonts } from "../lib/fonts";
import { pagesTitleFont } from "../../shared/design";

export function EventBackdrop({ event, children, className }: { event: PublicEvent; children: ReactNode; className?: string }) {
  const bg = backgroundProps(event);
  const dark = isDarkBackground(event.background, event.theme);
  return (
    <div className={cx("relative min-h-dvh overflow-hidden", dark ? "text-white" : "text-fg", className)}>
      <div className={cx("absolute inset-0 -z-10", bg.className)} style={bg.style} aria-hidden />
      {event.background === "custom" && (
        // Scrim keeps text contrast >= 4.5:1 over any photo.
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/55 via-black/35 to-black/75" aria-hidden />
      )}
      {children}
    </div>
  );
}

export function EventTitle({ event, size = "lg" }: { event: PublicEvent; size?: "lg" | "md" }) {
  const font = pagesTitleFont(event.design);
  useFonts(font);
  return (
    <div className="text-center" style={titleFontVars(font)}>
      <h1
        className={cx(
          "font-title leading-tight [text-wrap:balance]",
          size === "lg" ? "text-5xl sm:text-6xl" : "text-3xl sm:text-4xl",
        )}
      >
        {event.title}
      </h1>
      {event.subtitle && <p className="mt-2 text-lg opacity-90 [text-wrap:balance]">{event.subtitle}</p>}
      {event.date && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-base opacity-85">
          <CalendarHeart className="size-4" aria-hidden />
          {formatDate(event.date)}
        </p>
      )}
    </div>
  );
}

export function EventStatus({ error, loading }: { error: unknown; loading?: boolean }) {
  if (!error) return loading ? <Spinner className="min-h-dvh" /> : null;
  const notFound = error instanceof ApiError && error.status === 404;
  // The site admin archived the event owner's account.
  const unavailable = error instanceof ApiError && error.status === 410;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <SearchX className="size-14 text-muted-fg" aria-hidden />
      <h1 className="text-2xl font-bold">{notFound ? "האירוע לא נמצא" : unavailable ? "האירוע לא זמין כרגע" : "משהו השתבש"}</h1>
      <p className="max-w-sm text-muted-fg">{unavailable ? "אפשר לפנות לבעלי האירוע כדי לברר." : errorMessage(error)}</p>
      <Link to="/" className="font-semibold text-primary underline">
        לעמוד הראשי
      </Link>
    </main>
  );
}
