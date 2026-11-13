import { useEffect, useRef, useState } from "react";
import { Check, ImageIcon, ImageOff } from "lucide-react";
import { Link } from "react-router-dom";
import { headerObjectPosition } from "../../../shared/design";
import type { ManageEvent, ShareImage } from "../../../shared/types";
import { headerImageUrl } from "../EventHeader";
import { cx } from "../ui";
import { putHeaderShare } from "./useAssetActions";
import { SHARE_LOGO } from "../../../shared/linkPreview";

/** What the link preview actually shows: the header image only when there is one. */
export const effectiveShareImage = (event: ManageEvent): ShareImage => (event.headerVersion && event.shareImage === "header" ? "header" : "logo");

/**
 * The picture in the preview of the event link (WhatsApp, Facebook...): the main page's header image or the site logo.
 * Saves on pick. Also makes the small preview copy of a header image uploaded before this existed.
 */
export function ShareImagePicker({ event, onPick }: { event: ManageEvent; onPick: (v: ShareImage) => Promise<void> }) {
  const header = headerImageUrl(event);
  const saved = effectiveShareImage(event);
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved]);

  const backfilled = useRef<string | null>(null);
  useEffect(() => {
    if (!header || event.headerShareReady || backfilled.current === event.headerVersion) return;
    backfilled.current = event.headerVersion;
    fetch(header)
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => putHeaderShare(event.code, event.headerVersion!, b))
      .catch(() => {});
  }, [header, event.code, event.headerVersion, event.headerShareReady]);

  const pick = async (v: ShareImage) => {
    if (v === value) return;
    setValue(v);
    await onPick(v);
  };

  const options: { id: ShareImage; title: string; disabled: boolean; thumb: React.ReactNode }[] = [
    {
      id: "header",
      title: "תמונת הכותרת",
      disabled: !header,
      thumb: header ? (
        <img src={header} alt="" className="size-full object-cover" style={{ objectPosition: headerObjectPosition(event.design.hero) }} />
      ) : (
        <span className="flex size-full items-center justify-center text-muted-fg">
          <ImageOff className="size-8" aria-hidden />
        </span>
      ),
    },
    {
      id: "logo",
      title: "הלוגו של האתר",
      disabled: false,
      thumb: <img src={SHARE_LOGO.path} alt="" className="size-full bg-white object-contain p-2" />,
    },
  ];

  return (
    <section className="mt-2 flex flex-col gap-3 border-t border-border pt-5" aria-labelledby="share-image-title">
      <h3 id="share-image-title" className="flex items-center gap-2 text-lg font-bold">
        <ImageIcon className="size-5" aria-hidden />
        התמונה שמופיעה עם הקישור
      </h3>
      <p id="share-image-hint" className="text-sm text-muted-fg">
        כששולחים את הקישור בוואטסאפ או ברשתות, זו התמונה שתופיע מעליו.
      </p>
      <div role="radiogroup" aria-labelledby="share-image-title" aria-describedby="share-image-hint" className="grid grid-cols-2 gap-3">
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={o.disabled}
              onClick={() => pick(o.id)}
              className={cx(
                "relative flex flex-col overflow-hidden rounded-2xl border-2 text-start transition-[border-color,box-shadow] duration-200 disabled:cursor-not-allowed disabled:opacity-60",
                active ? "border-primary shadow-lift" : "border-border enabled:hover:border-primary/50",
              )}
            >
              <span className="block aspect-[1.91/1] w-full shrink-0 overflow-hidden bg-muted">{o.thumb}</span>
              <span className="flex min-h-12 items-center gap-2 px-3 py-2 font-semibold">
                <span
                  className={cx(
                    "inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                    active ? "border-primary bg-primary text-on-primary" : "border-border",
                  )}
                  aria-hidden
                >
                  {active && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                {o.title}
              </span>
            </button>
          );
        })}
      </div>
      {!header && (
        <p className="text-sm text-muted-fg">
          עוד אין תמונת כותרת.{" "}
          <Link to="?tab=design" replace className="font-semibold text-fg underline underline-offset-4">
            מוסיפים אותה בלשונית עיצוב
          </Link>
        </p>
      )}
      <p className="text-sm text-muted-fg">שינוי התמונה יופיע בהודעות חדשות. הודעות שכבר נשלחו בוואטסאפ ממשיכות להראות את התמונה הקודמת.</p>
    </section>
  );
}
