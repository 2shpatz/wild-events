import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { Link } from "react-router-dom";
import { Camera, ImageIcon, Images, Lock, Play, Radio, Wrench, X, ZoomIn } from "lucide-react";
import type { Block, ImageBlock, TextBlock } from "../../../shared/design";
import type { MediaDTO, PublicEvent } from "../../../shared/types";
import { Reveal } from "../Reveal";
import { cx } from "../ui";
import { api } from "../../lib/api";
import { thumbUrl } from "../../lib/media";
import { EventDetails, hasDetails } from "../EventDetails";

export const featuredUrl = (code: string, f: { slot: number; v: string }) => `/api/e/${code}/asset/f${f.slot}?v=${encodeURIComponent(f.v)}`;
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
      return hasDetails(ev);
    case "featured":
      return ev.featured.length > 0;
    case "live":
      return true;
    case "text":
      return !!(b.heading || b.body);
    case "image":
      return !!blockImageUrl(ev, b.slot);
  }
}

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
      return (
        <section id="event-details" className="relative scroll-mt-20 px-5 py-14 sm:py-20" aria-labelledby="details-title">
          <Reveal variant="up">
            <h2 id="details-title" className="mb-8 text-center font-display text-4xl sm:text-5xl">
              פרטי האירוע
            </h2>
          </Reveal>
          <Reveal variant="up" delay={120}>
            <EventDetails event={event} dark={dark} />
          </Reveal>
        </section>
      );
    case "featured":
      return (
        <section className="relative px-5 py-14 sm:py-24" aria-label="מבעלי השמחה">
          <FeaturedGallery event={event} dark={dark} />
        </section>
      );
    case "live":
      return <LiveSection event={event} dark={dark} choiceRef={ctx.choiceRef} />;
    case "text":
      return <TextSection block={block} dark={dark} />;
    case "image":
      return <ImageSection block={block} src={blockImageUrl(event, block.slot)!} title={event.title} />;
  }
}

const PLACEHOLDER: Record<Block["type"], string> = {
  invitation: "כאן תופיע תמונת ההזמנה - עדיין לא הועלתה",
  details: "כאן יופיעו פרטי האירוע - הוסיפו תאריך, שעה או מקום",
  featured: "כאן יופיעו התמונות המייצגות - עדיין לא נוספו",
  live: "",
  text: "בלוק טקסט ריק - כתבו כותרת או טקסט",
  image: "כאן תופיע התמונה - בחרו תמונה",
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
    <section className="relative px-5 py-10 sm:py-14">
      <Reveal variant="up" className="mx-auto w-full max-w-2xl">
        <div
          className={cx(
            block.align === "center" ? "text-center" : "text-start",
            block.card && "rounded-[2rem] px-6 py-7 backdrop-blur-md sm:px-8",
            block.card && (dark ? "bg-white/10" : "bg-card/85 shadow-soft"),
          )}
          style={block.color ? { color: block.color } : undefined}
        >
          {block.heading && <h2 className={cx("font-display leading-tight [text-wrap:balance]", s.h, block.body && "mb-3")}>{block.heading}</h2>}
          {block.body && <p className={cx("whitespace-pre-line leading-relaxed", s.p)}>{block.body}</p>}
        </div>
      </Reveal>
    </section>
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
    <section className={cx("relative py-10 sm:py-14", block.shape === "wide" ? "px-3 sm:px-5" : "px-5")}>
      <Reveal variant="up">
        <figure>
          {img}
          {block.caption && <figcaption className="mx-auto mt-4 max-w-xl text-center text-lg font-semibold [text-wrap:balance]">{block.caption}</figcaption>}
        </figure>
      </Reveal>
    </section>
  );
}

/** Staggered "scrapbook" of the hosts' photos, each revealed as it scrolls in. */
function FeaturedGallery({ event, dark }: { event: PublicEvent; dark: boolean }) {
  const rot = [-3, 2.5, -1.5, 3, -2.5, 1.5];
  return (
    <ul className="mx-auto grid max-w-5xl grid-cols-2 gap-4 sm:gap-8 md:grid-cols-3">
      {event.featured.map((f, i) => (
        <Reveal
          as="li"
          key={f.slot}
          variant={i % 2 ? "end" : "start"}
          delay={(i % 3) * 120}
          className={cx(i % 3 === 1 && "md:translate-y-12", i === 0 && event.featured.length % 2 === 1 && "col-span-2 md:col-span-1")}
        >
          <figure
            className={cx("overflow-hidden rounded-2xl p-2 shadow-[0_20px_50px_rgb(0_0_0/0.35)] transition-transform duration-500 hover:rotate-0", dark ? "bg-white/90" : "bg-white")}
            style={{ rotate: `${rot[i % rot.length]}deg` }}
          >
            <img src={featuredUrl(event.code, f)} alt={`תמונה מבעלי השמחה ${i + 1}`} loading="lazy" decoding="async" className="aspect-[4/5] w-full rounded-xl object-cover" />
          </figure>
        </Reveal>
      ))}
    </ul>
  );
}

/** The album, live, closing with the two big Upload / View actions. */
function LiveSection({ event, dark, choiceRef }: { event: PublicEvent; dark: boolean; choiceRef?: Ref<HTMLDivElement> }) {
  return (
    <section id="live-strip" className="relative px-5 pb-20 pt-14 sm:pt-20" aria-labelledby="live-title">
      <LiveStrip event={event} dark={dark} />

      {/* Two large, clearly separated actions (MASTER project overrides). */}
      <div ref={choiceRef} className="mx-auto mt-10 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
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
            <span className="text-2xl font-bold">צפייה בתמונות האירוע</span>
            <span className="text-base opacity-85">כל התמונות של כולם, בזמן אמת</span>
          </Link>
        </Reveal>
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
              className="flex h-full min-h-44 flex-col items-center justify-center gap-3 rounded-[2rem] bg-accent px-6 py-8 text-center text-on-accent shadow-lift transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.99]"
            >
              <span className="flex size-16 items-center justify-center rounded-2xl bg-white/20">
                <Camera className="size-9" aria-hidden />
              </span>
              <span className="text-2xl font-bold">הוסיפו את התמונות שלכם</span>
              <span className="text-base opacity-90">צילמתם? העלו לאלבום - מהגלריה או מהמצלמה</span>
            </Link>
          ) : (
            <div className={cx("flex h-full min-h-44 flex-col items-center justify-center gap-3 rounded-[2rem] px-6 py-8 text-center", dark ? "bg-white/10" : "bg-card/80")}>
              <Lock className="size-8" aria-hidden />
              <span className="text-lg font-semibold">ההעלאות לאירוע הזה סגורות</span>
            </div>
          )}
        </Reveal>
      </div>
    </section>
  );
}

/** Newest photos from the album, refreshed every 30s while visible. */
function LiveStrip({ event, dark }: { event: PublicEvent; dark: boolean }) {
  const [items, setItems] = useState<MediaDTO[] | null>(null);
  useEffect(() => {
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
  }, [event.code]);

  const shown = (items ?? []).filter((m) => m.url);
  return (
    <div className="mx-auto max-w-4xl">
      <Reveal variant="up">
        <h2 id="live-title" className="mb-2 flex items-center justify-center gap-2 text-center font-display text-4xl sm:text-5xl">
          מהאלבום, בזמן אמת
        </h2>
        <p className="mb-8 flex items-center justify-center gap-2 text-base opacity-85" aria-live="polite">
          <Radio className="size-4 animate-pulse text-red-500" aria-hidden />
          {event.mediaCount > 0
            ? `${event.mediaCount.toLocaleString("he-IL")} תמונות וסרטונים עד עכשיו`
            : "כל תמונה שמועלית מופיעה כאן מיד"}
        </p>
      </Reveal>
      {items === null ? (
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
            <p className="text-xl font-bold">האלבום עוד ריק</p>
            <p className="mt-1 opacity-85">היו הראשונים להעלות תמונה מהאירוע</p>
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
