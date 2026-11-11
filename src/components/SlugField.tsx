import { useEffect, useState } from "react";
import { CheckCircle2, Link2, Loader2, XCircle } from "lucide-react";
import { api } from "../lib/api";
import { isValidSlug } from "../../shared/slug";
import { cx } from "./ui";

export type SlugState = "idle" | "checking" | "ok" | "taken" | "format";

/**
 * The event's own address (site.dev/<slug>). Live availability check; when taken, offers a free variant.
 * `current` = the event's existing slug (counts as available when editing).
 */
export function SlugField({
  value,
  onChange,
  onState,
  current,
}: {
  value: string;
  onChange: (v: string) => void;
  onState?: (s: SlugState) => void;
  current?: string;
}) {
  const [state, setState] = useState<SlugState>("idle");
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    const set = (s: SlugState) => {
      setState(s);
      onState?.(s);
    };
    setSuggestion(null);
    if (!value) return set("idle");
    if (value === current) return set("ok");
    if (!isValidSlug(value)) return set("format");
    set("checking");
    const t = setTimeout(async () => {
      const r = await api<{ available: boolean; reason?: string; suggestion?: string }>(`/owner/code-available?code=${encodeURIComponent(value)}`).catch(
        () => null,
      );
      if (!r) return set("idle");
      if (r.available) return set("ok");
      setSuggestion(r.suggestion ?? null);
      set(r.reason === "format" ? "format" : "taken");
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, current]);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="ev-slug" className="font-semibold">
        כתובת האירוע
      </label>
      <div
        dir="ltr"
        className={cx(
          "overflow-hidden rounded-xl border bg-card transition-shadow focus-within:ring-4",
          state === "taken" || state === "format" ? "border-destructive focus-within:ring-destructive/20" : "border-border focus-within:border-primary focus-within:ring-primary/20",
        )}
      >
        {/* The site address on its own line, so the part the hosts type gets the whole row and is easy to read. */}
        <div className="flex items-center gap-1.5 break-all bg-muted px-3 py-1.5 text-sm text-muted-fg">
          <Link2 className="size-4 shrink-0" aria-hidden />
          <span>{location.host}/</span>
        </div>
        <div className="flex min-h-12 items-stretch">
          <input
            id="ev-slug"
            // the whole box shows the focus ring (focus-within); the global :focus-visible outline would double it
            style={{ outline: "none" }}
            className="min-w-0 flex-1 bg-transparent px-3 text-lg font-semibold tracking-wide text-fg placeholder:font-normal placeholder:text-muted-fg/70 focus:outline-none focus-visible:outline-none"
            value={value}
            onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40))}
            placeholder="noa-itai"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            aria-describedby="ev-slug-status"
          />
          <span className="flex w-11 shrink-0 items-center justify-center" aria-hidden>
            {state === "checking" && <Loader2 className="size-5 animate-spin text-muted-fg" />}
            {state === "ok" && <CheckCircle2 className="size-5 text-emerald-600" />}
            {(state === "taken" || state === "format") && <XCircle className="size-5 text-destructive" />}
          </span>
        </div>
      </div>
      <p id="ev-slug-status" className={cx("text-sm", state === "taken" || state === "format" ? "font-medium text-destructive" : "text-muted-fg")} aria-live="polite">
        {state === "taken" ? (
          <>
            הכתובת הזו כבר תפוסה.
            {suggestion && (
              <>
                {" "}
                <button type="button" className="font-semibold text-primary underline" onClick={() => onChange(suggestion)}>
                  להשתמש ב-<bdi dir="ltr">{suggestion}</bdi>
                </button>
              </>
            )}
          </>
        ) : state === "format" ? (
          "רק אותיות באנגלית, ספרות ומקף (3-40 תווים). חלק מהמילים שמורות לאתר."
        ) : state === "ok" ? (
          "הכתובת פנויה. זה הקישור שהאורחים יקבלו."
        ) : (
          "נוצרת אוטומטית משם האירוע. אפשר לשנות."
        )}
      </p>
    </div>
  );
}
