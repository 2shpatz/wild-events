import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { Link } from "react-router-dom";
import { Camera, ImageIcon, Images, Lock, Play, Radio, Wrench, X, ZoomIn } from "lucide-react";
import {
  DETAILS_TEXTS,
  LIVE_TEXTS,
  WHATSAPP_TEXTS,
  partText,
  type Block,
  type BlockStyle,
  type DetailsBlock,
  type ImageBlock,
  type LiveBlock,
  type TextBlock,
  type WhatsAppBlock,
} from "../../../shared/design";
import { titleFontVars } from "../../lib/fonts";
import type { MediaDTO, PublicEvent } from "../../../shared/types";
import { Reveal } from "../Reveal";
import { cx } from "../ui";
import { api } from "../../lib/api";
import { thumbUrl } from "../../lib/media";
import { EventDetails, detailsCardHasContent } from "../EventDetails";
import { FeaturedPhotos } from "./FeaturedViews";
import { MessageBoard } from "./MessageBoard";
import { Checklist } from "./Checklist";

export const blockImageUrl = (ev: PublicEvent, slot: number) => {
  const img = ev.images.find((i) => i.slot === slot);
  return img ? `/api/e/${ev.code}/asset/i${slot}?v=${encodeURIComponent(img.v)}` : null;
};
export const invitationUrl = (ev: PublicEvent) =>
  ev.invitationVersion ? `/api/e/${ev.code}/asset/inv?v=${encodeURIComponent(ev.invitationVersion)}` : null;

/** Does the block have something to show guests? (Empty blocks only appear in the editor preview, as placeholders.) */
export function blockHasContent(b: Block, ev: PublicEvent): boolean {
  switch (b.type) {
    case "invitation":
      return !!ev.invitationVersion;
    case "details":
      return detailsCardHasContent(ev, b.show);
    case "featured":
      return ev.featured.length > 0;
    case "live":
      return Object.values(b.show).some(Boolean);
    case "text":
      return !!(b.heading || b.body);
    case "image":
      return !!blockImageUrl(ev, b.slot);
    case "whatsapp":
      return !!b.url;
    case "messages":
      return true;
    case "checklist":
      return ev.checklistCount > 0 || b.guestsEdit;
  }
}

/** A block's own font (for its `.font-title` headings) and text color; nothing set = the theme's. */
export const blockStyle = (b: Partial<BlockStyle>): CSSProperties | undefined => {
  const st = { ...titleFontVars(b.font), ...(b.color ? { color: b.color } : {}) };
  return Object.keys(st).length ? st : undefined;
};

export interface BlockCtx {
  event: PublicEvent;
  dark: boolean;
  preview: boolean;
  /** the CTA cards of the live block (hides the mobile sticky bar while they are on screen) */
  choiceRef?: Ref<HTMLDivElement>;
}

export function EventBlock({ block, ctx }: { block: Block; ctx: BlockCtx }) {
  const { event, dark, preview } = ctx;
  if (!blockHasContent(block, event)) return preview ? <Placeholder block={block} dark={dark} /> : null;
  switch (block.type) {
    case "invitation":
      return (
        <section className="relative scroll-mt-20 px-5 py-14 sm:py-20" aria-label="ההזמנה">
          <InvitationImage src={invitationUrl(event)!} title={event.title} />
        </section>
      );
    case "details":
      return <DetailsSection block={block} event={event} dark={dark} />;
    case "featured":
      return (
        // Every layout reacts to taps (enlarge / flip / scroll), so it stays usable in the editor preview (no links inside).
        <section className="relative px-5 py-14 sm:py-24" aria-label="מבעלי השמחה" data-preview-interactive>
          <FeaturedPhotos event={event} dark={dark} layout={block.layout} />
        </section>
      );
    case "live":
      return <LiveSection block={block} event={event} dark={dark} choiceRef={ctx.choiceRef} />;
    case "text":
      return <TextSection block={block} dark={dark} />;
    case "image":
      return <ImageSection block={block} src={blockImageUrl(event, block.slot)!} title={event.title} />;
    case "whatsapp":
      return <WhatsAppSection block={block} dark={dark} />;
    case "messages":
      return <MessageBoard block={block} event={event} dark={dark} preview={preview} />;
    case "checklist":
      return <Checklist block={block} event={event} dark={dark} preview={preview} />;
  }
}

const PLACEHOLDER: Record<Block["type"], string> = {
  invitation: "כאן תופיע תמונת ההזמנה - עדיין לא הועלתה",
  details: "כאן יופיעו פרטי האירוע - הוסיפו תאריך, שעה או מקום, או הציגו לפחות חלק אחד",
  featured: "כאן יופיעו התמונות המייצגות - עדיין לא נוספו",
  live: "כל החלקים של האלבום בזמן אמת מוסתרים - הציגו לפחות חלק אחד",
  text: "בלוק טקסט ריק - כתבו כותרת או טקסט",
  image: "כאן תופיע התמונה - בחרו תמונה",
  whatsapp: "כאן יופיע הכפתור להצטרפות לקבוצת הוואטסאפ - הדביקו את קישור ההזמנה לקבוצה",
  messages: "",
  checklist: "כאן תופיע הרשימה - הוסיפו פריטים, או אפשרו לאורחים להוסיף",
};

function Placeholder({ block, dark }: { block: Block; dark: boolean }) {
  return (
    <section className="px-5 py-8">
      <div
        className={cx(
          "mx-auto flex max-w-xl items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-5 py-8 text-center font-semibold",
          dark ? "border-white/40 bg-white/5 text-white/85" : "border-fg/25 bg-card/60 text-fg/75",
        )}
      >
        <ImageIcon className="size-5 shrink-0" aria-hidden />
        {PLACEHOLDER[block.type]}
      </div>
    </section>
  );
}

const TEXT_SIZES: Record<TextBlock["size"], { h: string; p: string }> = {
  sm: { h: "text-2xl sm:text-3xl", p: "text-base" },
  md: { h: "text-3xl sm:text-4xl", p: "text-lg sm:text-xl" },
  lg: { h: "text-4xl sm:text-6xl", p: "text-xl sm:text-2xl" },
};

function TextSection({ block, dark }: { block: TextBlock; dark: boolean }) {
  const s = TEXT_SIZES[block.size];
  return (
    <section className="relative px-5 py-10 sm:py-14" style={titleFontVars(block.font)}>
      <Reveal variant="up" className="mx-auto w-full max-w-2xl">
        <div
          className={cx(
            block.align === "center" ? "text-center" : "text-start",
            block.card && "rounded-[2rem] px-6 py-7 backdrop-blur-md sm:px-8",
            block.card && (dark ? "bg-white/10" : "bg-card/85 shadow-soft"),
          )}
          style={block.color ? { color: block.color } : undefined}
        >
          {block.heading && <h2 className={cx("font-title leading-tight [text-wrap:balance]", s.h, block.body && "mb-3")}>{block.heading}</h2>}
          {block.body && <p className={cx("whitespace-pre-line leading-relaxed", s.p)}>{block.body}</p>}
        </div>
      </Reveal>
    </section>
  );
}

/** Join the event's WhatsApp group: a card with the hosts' texts and one big button (opens WhatsApp). */
function WhatsAppSection({ block, dark }: { block: WhatsAppBlock; dark: boolean }) {
  const t = (k: keyof typeof WHATSAPP_TEXTS) => partText(block.texts, k, WHATSAPP_TEXTS[k]);
  return (
    <section className="relative px-5 py-10 sm:py-14" style={blockStyle(block)} aria-label={t("title")}>
      <Reveal variant="up" className="mx-auto w-full max-w-md">
        <div className={cx("flex flex-col items-center gap-4 rounded-[2rem] px-6 py-8 text-center backdrop-blur-md", dark ? "bg-white/10" : "bg-card/85 shadow-soft")}>
          <span className="flex size-16 items-center justify-center rounded-2xl bg-[#25D366] text-white shadow-soft">
            <WhatsAppIcon className="size-9" />
          </span>
          <h2 className="font-title text-3xl [text-wrap:balance] sm:text-4xl">{t("title")}</h2>
          {t("text") && <p className="text-lg leading-relaxed opacity-90 [text-wrap:balance]">{t("text")}</p>}
          <a
            href={block.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] px-6 text-lg font-bold text-[#052e16] shadow-soft transition-[filter,transform] duration-200 hover:brightness-105 active:scale-[0.99]"
          >
            <WhatsAppIcon className="size-6" />
            {t("button")}
          </a>
        </div>
      </Reveal>
    </section>
  );
}

/** Official WhatsApp glyph (Simple Icons, CC0). */
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function ImageSection({ block, src, title }: { block: ImageBlock; src: string; title: string }) {
  const alt = block.caption || `תמונה מ${title}`;
  let img: ReactNode;
  if (block.shape === "round")
    img = <img src={src} alt={alt} loading="lazy" decoding="async" className="mx-auto size-56 rounded-full object-cover shadow-[0_20px_60px_rgb(0_0_0/0.4)] ring-4 ring-white/75 sm:size-72" />;
  else if (block.shape === "wide")
    img = <img src={src} alt={alt} loading="lazy" decoding="async" className="mx-auto block h-auto w-full max-w-5xl rounded-3xl object-cover shadow-[0_24px_60px_rgb(0_0_0/0.35)]" />;
  else
    img = (
      <div className="mx-auto w-full max-w-md rotate-[-1.5deg] rounded-2xl bg-white p-2 shadow-[0_24px_60px_rgb(0_0_0/0.4)] motion-reduce:rotate-0">
        <img src={src} alt={alt} loading="lazy" decoding="async" className="block h-auto w-full rounded-xl" />
      </div>
    );
  return (
    <section className={cx("relative py-10 sm:py-14", block.shape === "wide" ? "px-3 sm:px-5" : "px-5")} style={blockStyle(block)}>
      <Reveal variant="up">
        <figure>
          {img}
          {block.caption && <figcaption className={cx("mx-auto mt-4 max-w-xl text-center [text-wrap:balance]", block.font ? "font-title text-2xl" : "text-lg font-semibold")}>{block.caption}</figcaption>}
        </figure>
      </Reveal>
    </section>
  );
}

function DetailsSection({ block, event, dark }: { block: DetailsBlock; event: PublicEvent; dark: boolean }) {
  const title = partText(block.texts, "title", DETAILS_TEXTS.title);
  return (
    <section
      id="event-details"
      className="relative scroll-mt-20 px-5 py-14 sm:py-20"
      style={blockStyle(block)}
      {...(block.show.title ? { "aria-labelledby": "details-title" } : { "aria-label": title })}
    >
      {block.show.title && (
        <Reveal variant="up">
          <h2 id="details-title" className="mb-8 text-center font-title text-4xl [text-wrap:balance] sm:text-5xl">
            {title}
          </h2>
        </Reveal>
      )}
      <Reveal variant="up" delay={120}>
        <EventDetails event={event} dark={dark} block={block} />
      </Reveal>
    </section>
  );
}

/** The album, live, closing with the two big Upload / View actions. Each part can be hidden and its texts rewritten. */
function LiveSection({ block, event, dark, choiceRef }: { block: LiveBlock; event: PublicEvent; dark: boolean; choiceRef?: Ref<HTMLDivElement> }) {
  const { show, texts } = block;
  const t = (k: keyof typeof LIVE_TEXTS) => partText(texts, k, LIVE_TEXTS[k]);
  const top = show.title || show.count || show.strip;
  const cards = show.view || show.upload;
  return (
    <section
      id="live-strip"
      className={cx("relative px-5 pb-20", top ? "pt-14 sm:pt-20" : "pt-8")}
      style={blockStyle(block)}
      {...(show.title ? { "aria-labelledby": "live-title" } : { "aria-label": t("title") })}
    >
      {top && <LiveStrip event={event} dark={dark} block={block} />}

      {/* Two large, clearly separated actions (MASTER project overrides). */}
      {cards && (
        <div
          ref={choiceRef}
          className={cx("mx-auto grid w-full gap-4", top && "mt-10", show.view && show.upload ? "max-w-3xl sm:grid-cols-2" : "max-w-md")}
        >
          {show.view && (
            <Reveal variant="start" delay={100}>
              <Link
                to={`/${event.code}/gallery`}
                className={cx(
                  "flex h-full min-h-44 flex-col items-center justify-center gap-3 rounded-[2rem] border-2 px-6 py-8 text-center backdrop-blur-md transition-[background-color,transform] duration-200 active:scale-[0.99]",
                  dark ? "border-white/45 bg-white/10 hover:bg-white/20" : "border-primary bg-card/85 hover:bg-card",
                )}
              >
                <span className={cx("flex size-16 items-center justify-center rounded-2xl", dark ? "bg-white/15" : "bg-primary/10 text-primary")}>
                  <Images className="size-9" aria-hidden />
                </span>
                <span className={cx("text-2xl [text-wrap:balance]", block.font ? "font-title" : "font-bold")}>{t("viewTitle")}</span>
                <span className="text-base opacity-85 [text-wrap:balance]">{t("viewText")}</span>
              </Link>
            </Reveal>
          )}
          {show.upload && (
            <Reveal variant="end" delay={200}>
              {event.uploadsOpen && event.maintenance ? (
                <div role="status" className={cx("flex h-full min-h-44 flex-col items-center justify-center gap-3 rounded-[2rem] px-6 py-8 text-center", dark ? "bg-white/10" : "bg-card/80")}>
                  <Wrench className="size-8" aria-hidden />
                  <span className="text-lg font-semibold">האתר בתחזוקה קצרה</span>
                  <span className="text-base opacity-85">נסו להעלות שוב בעוד כמה דקות</span>
                </div>
              ) : event.uploadsOpen ? (
                <Link
                  to={`/${event.code}/upload`}
                  className={cx(
                    // Same glass card and icon tile as "view"; the accent border keeps it recognizable as the main action.
                    "flex h-full min-h-44 flex-col items-center justify-center gap-3 rounded-[2rem] border-2 border-accent px-6 py-8 text-center backdrop-blur-md transition-[background-color,transform] duration-200 active:scale-[0.99]",
                    dark ? "bg-white/10 hover:bg-white/20" : "bg-card/85 hover:bg-card",
                  )}
                >
                  <span className={cx("flex size-16 items-center justify-center rounded-2xl", dark ? "bg-white/15" : "bg-primary/10 text-primary")}>
                    <Camera className="size-9" aria-hidden />
                  </span>
                  <span className={cx("text-2xl [text-wrap:balance]", block.font ? "font-title" : "font-bold")}>{t("uploadTitle")}</span>
                  <span className="text-base opacity-85 [text-wrap:balance]">{t("uploadText")}</span>
                </Link>
              ) : (
                <div className={cx("flex h-full min-h-44 flex-col items-center justify-center gap-3 rounded-[2rem] px-6 py-8 text-center", dark ? "bg-white/10" : "bg-card/80")}>
                  <Lock className="size-8" aria-hidden />
                  <span className="text-lg font-semibold">ההעלאות לאירוע הזה סגורות</span>
                </div>
              )}
            </Reveal>
          )}
        </div>
      )}
    </section>
  );
}

/** Newest photos from the album, refreshed every 30s while visible. */
function LiveStrip({ event, dark, block }: { event: PublicEvent; dark: boolean; block: LiveBlock }) {
  const { show, texts } = block;
  const t = (k: keyof typeof LIVE_TEXTS) => partText(texts, k, LIVE_TEXTS[k]);
  const [items, setItems] = useState<MediaDTO[] | null>(null);
  useEffect(() => {
    if (!show.strip) return;
    let stop = false;
    const load = () =>
      api<{ media: MediaDTO[] }>(`/e/${event.code}/latest?n=12`)
        .then((r) => !stop && setItems(r.media))
        .catch(() => !stop && setItems((p) => p ?? []));
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [event.code, show.strip]);

  const shown = (items ?? []).filter((m) => m.url);
  return (
    <div className="mx-auto max-w-4xl">
      {(show.title || show.count) && (
        <Reveal variant="up" className={cx(show.strip && "mb-8")}>
          {show.title && (
            <h2 id="live-title" className={cx("flex items-center justify-center gap-2 text-center font-title text-4xl [text-wrap:balance] sm:text-5xl", show.count && "mb-2")}>
              {t("title")}
            </h2>
          )}
          {show.count && (
            <p className="flex items-center justify-center gap-2 text-base opacity-85" aria-live="polite">
              <Radio className="size-4 animate-pulse text-red-500" aria-hidden />
              {event.mediaCount > 0
                ? `${event.mediaCount.toLocaleString("he-IL")} תמונות וסרטונים עד עכשיו`
                : "כל תמונה שמועלית מופיעה כאן מיד"}
            </p>
          )}
        </Reveal>
      )}
      {!show.strip ? null : items === null ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-6" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton aspect-square rounded-xl" />
          ))}
        </div>
      ) : shown.length ? (
        <Reveal variant="up" delay={100}>
          <Link to={`/${event.code}/gallery`} aria-label="פתיחת אלבום האירוע" className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-6">
            {shown.map((m, i) => (
              <span key={m.id} className={cx("relative block overflow-hidden rounded-xl bg-black/20 shadow-soft", i >= 6 && "max-sm:hidden", i >= 8 && "max-md:hidden")}>
                <img src={thumbUrl(m, 240)!} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-cover transition-transform duration-500 hover:scale-105" />
                {m.kind === "video" && (
                  <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                    <span className="flex size-9 items-center justify-center rounded-full bg-black/55 text-white">
                      <Play className="size-4" />
                    </span>
                  </span>
                )}
              </span>
            ))}
          </Link>
        </Reveal>
      ) : (
        <Reveal variant="up" delay={100}>
          <div className={cx("mx-auto max-w-md rounded-[2rem] px-6 py-10 text-center backdrop-blur-md", dark ? "bg-white/10" : "bg-card/85 shadow-soft")}>
            <Camera className="mx-auto mb-3 size-10 opacity-80" aria-hidden />
            <p className={cx("text-xl [text-wrap:balance]", block.font ? "font-title" : "font-bold")}>{t("emptyTitle")}</p>
            <p className="mt-1 opacity-85 [text-wrap:balance]">{t("emptyText")}</p>
          </div>
        </Reveal>
      )}
    </div>
  );
}

/** The hosts' invitation as a paper card; tap opens it full screen (native <dialog>: Esc / back-drop / X close). */
function InvitationImage({ src, title }: { src: string; title: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Reveal variant="up" className="mx-auto w-full max-w-md">
        <button
          type="button"
          onClick={() => dlg.current?.showModal()}
          aria-label="הגדלת ההזמנה למסך מלא"
          className="group block w-full rotate-[-1.5deg] rounded-2xl bg-white p-2 shadow-[0_24px_60px_rgb(0_0_0/0.4)] transition-transform duration-300 hover:rotate-0 motion-reduce:rotate-0"
        >
          <img src={src} alt={`ההזמנה ל${title}`} loading="lazy" decoding="async" className="block h-auto w-full rounded-xl" />
        </button>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-sm font-semibold opacity-80" aria-hidden>
          <ZoomIn className="size-4" />
          הקישו להגדלה
        </p>
      </Reveal>
      <dialog
        ref={dlg}
        aria-label={`ההזמנה ל${title}`}
        onClick={(e) => e.target === e.currentTarget && dlg.current?.close()}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 backdrop:bg-black"
      >
        <div className="flex h-full items-center justify-center overflow-auto p-4" onClick={(e) => e.target === e.currentTarget && dlg.current?.close()}>
          <img src={src} alt={`ההזמנה ל${title}`} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
        <button
          type="button"
          onClick={() => dlg.current?.close()}
          aria-label="סגירה"
          autoFocus
          className="fixed end-4 top-[max(1rem,env(safe-area-inset-top))] inline-flex size-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md hover:bg-white/25"
        >
          <X className="size-6" aria-hidden />
        </button>
      </dialog>
    </>
  );
}
