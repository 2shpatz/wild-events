import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Camera,
  Clock,
  GalleryHorizontal,
  LayoutGrid,
  MonitorPlay,
  Shuffle,
  Sparkles,
  Users,
  Grid3x3,
  ArrowDownUp,
  ImageOff,
  Maximize,
  Minimize,
} from "lucide-react";
import { useEvent } from "../lib/session";
import { useFeed } from "../lib/useFeed";
import { EventStatus } from "../components/EventChrome";
import { EventHeader } from "../components/EventHeader";
import { IconButton, Segmented, Spinner, useToast } from "../components/ui";
import { ViewSheet } from "../components/gallery/ViewSheet";
import { Masonry } from "../components/gallery/Masonry";
import { Floating } from "../components/gallery/Floating";
import { Carousel } from "../components/gallery/Carousel";
import { Slideshow } from "../components/gallery/Slideshow";
import { Mosaic } from "../components/gallery/Mosaic";
import { Lightbox } from "../components/gallery/Lightbox";
import { MediaImg } from "../components/gallery/MediaImg";
import { seededRank } from "../lib/media";
import { savedIdentity } from "../lib/device";
import { deviceTag } from "../../shared/deviceTag";
import { api, errorMessage } from "../lib/api";
import type { MediaDTO, ViewMode, ViewOrder } from "../../shared/types";

const ORDERS: { value: ViewOrder; label: string; icon: React.ReactNode }[] = [
  { value: "mixed", label: "הכל מעורבב", icon: <Shuffle className="size-4" aria-hidden /> },
  { value: "timeline", label: "ציר זמן", icon: <Clock className="size-4" aria-hidden /> },
  { value: "albums", label: "לפי אלבום", icon: <Users className="size-4" aria-hidden /> },
];

const ORDERS_SHORT = ORDERS.map((o) => ({ ...o, label: o.value === "mixed" ? "הכל" : o.value === "albums" ? "אלבומים" : o.label }));

const VIEWS: { value: ViewMode; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: "masonry", label: "גלילה", icon: <LayoutGrid className="size-4" aria-hidden />, hint: "כל התמונות ברשת, גוללים למטה" },
  { value: "floating", label: "מרחפות", icon: <Sparkles className="size-4" aria-hidden />, hint: "תמונות צפות ומתחלפות, לוחצים להגדלה" },
  { value: "carousel", label: "קרוסלה", icon: <GalleryHorizontal className="size-4" aria-hidden />, hint: "תמונה גדולה אחת, מחליקים הצידה" },
  { value: "slideshow", label: "מצגת לייב", icon: <MonitorPlay className="size-4" aria-hidden />, hint: "מתחלפת לבד, החדשות קודם - מעולה למסך באולם" },
  { value: "mosaic", label: "קיר פסיפס", icon: <Grid3x3 className="size-4" aria-hidden />, hint: "קיר צפוף שמשתנה כל הזמן" },
];

function useIsMobile() {
  const q = "(max-width: 639px)";
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

const seed = Math.floor(Math.random() * 1e9);

export default function Gallery() {
  const { code = "" } = useParams();
  const feed = useFeed(code);
  const { event, error } = useEvent(code, feed.eventVersion);
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [open, setOpen] = useState<number | null>(null);
  const [seenFresh, setSeenFresh] = useState(0);
  const identity = savedIdentity(code);
  // Guest token is "<albumId>.<deviceId>.<sig>"; its device id is the one the server checks on delete.
  const myTag = useMemo(() => deviceTag(identity?.token.split(".")[1]), [identity?.token]);
  const isMobile = useIsMobile();
  const [sheet, setSheet] = useState(false);
  const [immersive, setImmersive] = useState(false);

  // Fullscreen viewing: native Fullscreen API where supported (Android, desktop, iPad);
  // on iPhone Safari (no page fullscreen) the immersive mode alone fills the screen and hides all chrome.
  useEffect(() => {
    if (!immersive) return;
    const root = document.documentElement;
    let native = false;
    if (root.requestFullscreen && !document.fullscreenElement) {
      root.requestFullscreen({ navigationUI: "hide" }).then(() => (native = true)).catch(() => {});
    }
    const t = setTimeout(() => root.style.setProperty("--toolbar-h", "0px"), 0);
    const onFs = () => {
      if (native && !document.fullscreenElement) setImmersive(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && open === null && setImmersive(false);
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [immersive, open]);

  const order = (params.get("order") as ViewOrder) || event?.defaultOrder || "mixed";
  const view = (params.get("view") as ViewMode) || event?.defaultView || "masonry";
  const albumId = params.get("album");
  const desc = params.get("dir") === "desc";

  // URL reflects view state (gallery override: "Update URL on state/view changes").
  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v === null) p.delete(k);
    else p.set(k, v);
    if (k === "order" && v !== "albums") p.delete("album");
    setParams(p, { replace: k !== "album" });
  };


  const albumNames = useMemo(() => new Map(feed.albums.map((a) => [a.id, a.name])), [feed.albums]);
  const albumName = useCallback((id: string) => albumNames.get(id) || "אורח", [albumNames]);
  const byId = useMemo(() => new Map(feed.media.map((m) => [m.id, m])), [feed.media]);

  const items = useMemo(() => {
    let list = feed.media;
    if (order === "albums" && albumId) list = list.filter((m) => m.album === albumId);
    if (order === "timeline" || (order === "albums" && albumId)) {
      list = [...list].sort((a, b) => (desc ? b.takenAt - a.takenAt : a.takenAt - b.takenAt));
    } else if (order === "mixed") {
      // Fresh live uploads first (newest first), the rest in a stable shuffle.
      list = [...list].sort((a, b) => {
        const fa = feed.fresh.has(a.id) ? 1 : 0;
        const fb = feed.fresh.has(b.id) ? 1 : 0;
        if (fa !== fb) return fb - fa;
        if (fa && fb) return b.uploadedAt - a.uploadedAt;
        return seededRank(a.id, seed) - seededRank(b.id, seed);
      });
    }
    return list;
  }, [feed.media, feed.fresh, order, albumId, desc]);

  const freshCount = feed.fresh.size - seenFresh;

  if (!event) return <EventStatus error={error} loading />;

  // Guests delete only what this phone uploaded (the server enforces the same rule).
  const canDelete = (m: MediaDTO) => event.canManage || (!!identity && identity.album.id === m.album && !!m.by && m.by === myTag);
  const onDelete = async (m: MediaDTO) => {
    try {
      if (event.canManage) await api(`/e/${code}/manage/media/hide`, { method: "POST", json: { ids: [m.id] } });
      else await api(`/e/${code}/media/delete`, { method: "POST", json: { ids: [m.id] }, guest: identity?.token });
      feed.removeLocal([m.id]);
      toast("הפריט נמחק");
    } catch (e) {
      toast(errorMessage(e), "error");
      throw e;
    }
  };

  const showAlbumsGrid = order === "albums" && !albumId;
  const viewProps = {
    items,
    fresh: feed.fresh,
    albumName,
    onOpen: (i: number) => setOpen(i),
    onNeedUrl: feed.requestUrls,
    groupBy: order === "timeline" ? ("hour" as const) : null,
    eventCode: code,
  };

  return (
    <div className="min-h-dvh bg-canvas text-white" data-theme={event.theme}>
      {!immersive && (
      <EventHeader
        event={event}
        backTo={`/${code}`}
        pageTitle={`${feed.media.length.toLocaleString("he-IL")} פריטים · ${feed.albums.length.toLocaleString("he-IL")} אלבומים`}
        actions={
          <>
          {order === "timeline" && (
            <button
              onClick={() => setParam("dir", desc ? null : "desc")}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-sm font-semibold hover:bg-white/25"
              aria-label={desc ? "מיון: מהחדש לישן. לחצו להפוך" : "מיון: מהישן לחדש. לחצו להפוך"}
            >
              <ArrowDownUp className="size-4" aria-hidden />
              {desc ? "מהחדש" : "מההתחלה"}
            </button>
          )}
          <IconButton label="צפייה במסך מלא" onClick={() => setImmersive(true)} className="shrink-0 bg-white/15 hover:bg-white/25">
            <Maximize className="size-5" aria-hidden />
          </IconButton>
          </>
        }
      >
        <div className="no-scrollbar mx-auto flex max-w-[1600px] gap-2 overflow-x-auto px-3 pb-2 sm:px-4">
          <Segmented dark label="סדר התמונות" value={order} onChange={(v) => setParam("order", v)} options={isMobile ? ORDERS_SHORT : ORDERS} />
          {!showAlbumsGrid &&
            (isMobile ? (
              <ViewSheet label="אופן התצוגה" value={view} options={VIEWS} onChange={(v) => setParam("view", v)} open={sheet} setOpen={setSheet} />
            ) : (
              <Segmented dark label="אופן התצוגה" value={view} onChange={(v) => setParam("view", v)} options={VIEWS} />
            ))}
        </div>
      </EventHeader>
      )}

      {immersive && (
        <IconButton
          label="יציאה ממסך מלא"
          onClick={() => setImmersive(false)}
          className="fixed end-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 bg-black/45 text-white opacity-80 backdrop-blur hover:bg-black/70 hover:opacity-100"
        >
          <Minimize className="size-5" aria-hidden />
        </IconButton>
      )}

      {feed.loading ? (
        <Spinner className="min-h-[60dvh] text-white/70" label="טוען את התמונות…" />
      ) : feed.media.length === 0 ? (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 p-8 text-center">
          <ImageOff className="size-14 text-white/50" aria-hidden />
          <h2 className="text-2xl font-bold">עוד אין כאן תמונות</h2>
          <p className="max-w-sm text-white/70">היו הראשונים להעלות! התמונות יופיעו כאן אצל כולם תוך כמה שניות.</p>
          {event.uploadsOpen && (
            <Link to={`/${code}/upload`} className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-accent px-6 text-lg font-bold text-on-accent">
              <Camera className="size-6" aria-hidden />
              העלאת תמונות
            </Link>
          )}
        </div>
      ) : showAlbumsGrid ? (
        <AlbumsGrid albums={feed.albums} byId={byId} onPick={(id) => setParam("album", id)} onNeedUrl={feed.requestUrls} />
      ) : (
        <main className={immersive ? "pt-0" : "mx-auto max-w-[1600px] pt-2"}>
          {order === "albums" && albumId && (
            <div className="flex items-center gap-3 px-4 py-2">
              <button onClick={() => setParam("album", null)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold hover:bg-white/15">
                <ArrowRight className="size-4" aria-hidden />
                כל האלבומים
              </button>
              <h2 className="text-lg font-bold">
                האלבום של {albumName(albumId)} <span className="text-white/60">· {items.length}</span>
              </h2>
            </div>
          )}
          {view === "masonry" && <Masonry {...viewProps} />}
          {view === "floating" && <Floating {...viewProps} />}
          {view === "carousel" && <Carousel {...viewProps} />}
          {view === "slideshow" && <Slideshow {...viewProps} />}
          {view === "mosaic" && <Mosaic {...viewProps} />}
        </main>
      )}

      {freshCount > 0 && view === "masonry" && !showAlbumsGrid && !immersive && (
        <button
          onClick={() => {
            const first = items.findIndex((m) => feed.fresh.has(m.id));
            setSeenFresh(feed.fresh.size);
            if (first >= 0) setOpen(first);
          }}
          className="animate-pop-in fixed inset-x-0 top-[calc(var(--toolbar-h,64px)+12px)] z-30 mx-auto w-fit rounded-full bg-white px-5 py-2.5 text-base font-bold text-zinc-900 shadow-lift"
        >
          {freshCount === 1 ? "תמונה חדשה אחת" : `${freshCount.toLocaleString("he-IL")} תמונות חדשות`}
        </button>
      )}

      {event.uploadsOpen && view !== "slideshow" && !immersive && (
        <Link
          to={`/${code}/upload`}
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] end-5 z-30 inline-flex min-h-14 items-center gap-2 rounded-full bg-accent px-5 text-lg font-bold text-on-accent shadow-lift transition-[filter] hover:brightness-110"
        >
          <Camera className="size-6" aria-hidden />
          העלאה
        </Link>
      )}

      {open !== null && (
        <Lightbox
          items={items}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          albumName={albumName}
          onNeedUrl={feed.requestUrls}
          canDelete={canDelete}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

function AlbumsGrid({
  albums,
  byId,
  onPick,
  onNeedUrl,
}: {
  albums: { id: string; name: string; count: number; cover: string | null; kind: string }[];
  byId: Map<string, MediaDTO>;
  onPick: (id: string) => void;
  onNeedUrl: (ids: string[], force?: boolean) => void;
}) {
  return (
    <main className="mx-auto grid max-w-[1600px] grid-cols-2 gap-3 p-3 pb-24 sm:grid-cols-3 sm:gap-4 sm:p-4 lg:grid-cols-5">
      {albums.map((a) => {
        const cover = a.cover ? byId.get(a.cover) : undefined;
        return (
          <button
            key={a.id}
            onClick={() => onPick(a.id)}
            className="group overflow-hidden rounded-2xl bg-white/5 text-start transition-colors duration-200 hover:bg-white/10"
          >
            <div className="aspect-[4/5]">
              {cover ? (
                <MediaImg m={cover} width={420} onNeedUrl={onNeedUrl} className="size-full" imgClassName="transition-transform duration-500 group-hover:scale-[1.04]" />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <Users className="size-10 text-white/40" aria-hidden />
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="truncate text-base font-bold">{a.name}</p>
              <p className="text-sm text-white/65">{a.count.toLocaleString("he-IL")} פריטים</p>
            </div>
          </button>
        );
      })}
    </main>
  );
}
