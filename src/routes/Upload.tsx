import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Camera,
  CheckCircle2,
  Film,
  ImagePlus,
  Images,
  Loader2,
  RotateCcw,
  Trash2,
  AlertCircle,
  Sparkles,
  Gem,
  Video,
  Wrench,
} from "lucide-react";
import { useEvent } from "../lib/session";
import { EventStatus } from "../components/EventChrome";
import { EventHeader } from "../components/EventHeader";
import { Identify } from "../components/Identify";
import { Button, ConfirmDialog, cx, Segmented, useToast } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { clearIdentity, deviceId, isAndroid, savedIdentity, saveIdentity } from "../lib/device";
import { isBusy, overallProgress, uploadQueue, type QueueItem, type UploadQueue } from "../lib/upload";
import { formatBytes } from "../lib/format";
import type { GuestIdentity, ManageEvent } from "../../shared/types";
import { takeSharedFiles } from "../lib/share";

const cameraBtn =
  "flex min-h-24 items-center justify-center rounded-2xl border-2 border-primary bg-card font-bold text-fg transition-colors duration-200 hover:bg-primary/5 active:bg-primary/10";

export default function Upload() {
  const { code = "" } = useParams();
  const [params] = useSearchParams();
  const { event, error } = useEvent(code);
  const toast = useToast();
  const [identity, setIdentity] = useState<GuestIdentity | null>(() => savedIdentity(code));
  const [checking, setChecking] = useState(!identity);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [toDelete, setToDelete] = useState<QueueItem | null>(null);
  const [albums, setAlbums] = useState<{ id: string; name: string }[] | null>(null);
  const queue = useRef<UploadQueue | null>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  // Managers upload to the host album by default (and may pick another album, e.g. "photographer").
  useEffect(() => {
    if (!event?.canManage) return;
    api<ManageEvent>(`/e/${code}/manage`)
      .then((m) => setAlbums(m.albums.filter((a) => a.kind !== "guest").map((a) => ({ id: a.id, name: a.name }))))
      .catch(() => {});
    if (!identity || identity.album.kind === "guest") selectManagedAlbum();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.canManage]);

  const selectManagedAlbum = async (albumId?: string) => {
    try {
      const r = await api<GuestIdentity>(`/e/${code}/guest`, {
        method: "POST",
        json: { deviceId: deviceId(), asHost: !albumId, albumId },
      });
      saveIdentity(code, r);
      setIdentity(r);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  // Device might already be known to the server (e.g. localStorage cleared but cookie kept).
  useEffect(() => {
    if (identity) return;
    api<GuestIdentity | { needName: true }>(`/e/${code}/guest`, { method: "POST", json: { deviceId: deviceId() } })
      .then((r) => {
        if ("token" in r) {
          saveIdentity(code, r);
          setIdentity(r);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [code, identity]);

  // The queue outlives this page (app-wide registry): coming back shows uploads that kept running meanwhile.
  // Wake lock + "leave the site?" warning live in <UploadDock>, which covers every page.
  useEffect(() => {
    if (!event || !identity) return;
    const q = uploadQueue({ code, token: identity.token, quality: event.quality, keepGps: event.keepGps });
    queue.current = q;
    return q.subscribe(setItems);
  }, [event, identity, code]);

  const shared = !!params.get("shared");
  const ready = !!event && !!identity;
  useEffect(() => {
    if (!shared || !ready) return;
    takeSharedFiles().then((files) => files.length && queue.current?.add(files, "share"));
  }, [shared, ready]);

  const busy = isBusy(items);

  const stats = useMemo(() => {
    const done = items.filter((i) => i.state === "done").length;
    const failed = items.filter((i) => i.state === "error").length;
    const saved = items.reduce((s, i) => s + (i.state === "done" ? i.savedBytes || 0 : 0), 0);
    return { done, failed, saved, progress: overallProgress(items) };
  }, [items]);

  if (!event) return <EventStatus error={error} loading />;

  const addFiles = (list: FileList | File[] | null) => {
    if (!list || !queue.current) return;
    queue.current.add(Array.from(list));
  };

  return (
    <div className="min-h-dvh bg-bg">
      <EventHeader event={event} backTo={`/${code}`} pageTitle="העלאת תמונות" />

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {event.maintenance ? (
          <Maintenance code={code} />
        ) : !identity && !event.canManage ? (
          checking ? (
            <div className="flex justify-center p-10">
              <Loader2 className="size-8 animate-spin text-muted-fg" aria-label="טוען" />
            </div>
          ) : (
            <Identify code={code} onDone={setIdentity} />
          )
        ) : identity ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-base">
                מעלים לאלבום: <strong>{identity.album.name}</strong>
                {!event.canManage && (
                  <button
                    className="ms-2 text-sm text-muted-fg underline underline-offset-4"
                    onClick={() => {
                      clearIdentity(code);
                      setIdentity(null);
                      setChecking(false);
                    }}
                  >
                    לא אתה?
                  </button>
                )}
              </p>
              <span
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
                  event.quality === "original" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900",
                )}
              >
                {event.quality === "original" ? <Gem className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                {event.quality === "original" ? "איכות מקורית" : "איכות גבוהה, דחוסה"}
              </span>
            </div>

            {albums && albums.length > 1 && (
              <Segmented
                label="בחירת אלבום להעלאה"
                value={identity.album.id}
                onChange={(id) => selectManagedAlbum(id)}
                options={albums.map((a) => ({ value: a.id, label: a.name }))}
              />
            )}

            {/* Pickers - buttons first; drag & drop is a bonus on desktop, never the only way. */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                addFiles(e.dataTransfer.files);
              }}
              className={cx(
                "grid gap-3 rounded-3xl border-2 border-dashed p-4 transition-colors duration-200 sm:grid-cols-2 sm:p-6",
                dragOver ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <button
                onClick={() => galleryInput.current?.click()}
                className="flex min-h-24 items-center justify-center gap-3 rounded-2xl bg-accent px-6 text-xl font-bold text-on-accent shadow-soft transition-[filter] duration-200 hover:brightness-110"
              >
                <ImagePlus className="size-7" aria-hidden />
                בחירה מהגלריה
              </button>
              {isAndroid ? (
                // Android ignores `capture` when one input accepts both photos and videos (it opens the file
                // picker instead of the camera), so each camera mode gets its own input.
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => cameraInput.current?.click()} className={cx(cameraBtn, "flex-col gap-1.5 px-3 text-lg")}>
                    <Camera className="size-7" aria-hidden />
                    צילום תמונה
                  </button>
                  <button onClick={() => videoInput.current?.click()} className={cx(cameraBtn, "flex-col gap-1.5 px-3 text-lg")}>
                    <Video className="size-7" aria-hidden />
                    צילום וידאו
                  </button>
                </div>
              ) : (
                <button onClick={() => cameraInput.current?.click()} className={cx(cameraBtn, "gap-3 px-6 text-xl")}>
                  <Camera className="size-7" aria-hidden />
                  צילום עכשיו
                </button>
              )}
              <p className="text-center text-sm text-muted-fg sm:col-span-2">אפשר לבחור הרבה תמונות וסרטונים בבת אחת · במחשב אפשר גם לגרור לכאן</p>
              <input
                ref={galleryInput}
                type="file"
                // Extensions help desktop browsers that don't map HEIC to image/*; on Android they push Chrome
                // from the photo picker to the generic file browser, so Android gets MIME types only.
                accept={isAndroid ? "image/*,video/*" : "image/*,video/*,.heic,.heif"}
                multiple
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={cameraInput}
                type="file"
                accept={isAndroid ? "image/*" : "image/*,video/*"}
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              {isAndroid && (
                <input
                  ref={videoInput}
                  type="file"
                  accept="video/*"
                  capture="environment"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              )}
            </div>

            {items.length > 0 && (
              <section aria-label="קבצים בהעלאה" className="space-y-3">
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {items.map((it) => (
                    <QueueTile
                      key={it.key}
                      item={it}
                      onRetry={() => queue.current?.retry(it.key)}
                      onDelete={() => setToDelete(it)}
                    />
                  ))}
                </ul>
                {stats.saved > 1024 * 1024 && (
                  <p className="text-sm text-muted-fg">הדחיסה חסכה {formatBytes(stats.saved)} באחסון של בעלי האירוע</p>
                )}
              </section>
            )}
          </>
        ) : (
          <div className="flex justify-center p-10">
            <Loader2 className="size-8 animate-spin text-muted-fg" aria-label="טוען" />
          </div>
        )}
      </main>

      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur-md safe-bottom">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 pt-3">
            <div className="flex items-center justify-between gap-3 text-base font-semibold" aria-live="polite">
              <span>
                {busy ? (
                  <>מעלה… {stats.done.toLocaleString("he-IL")} מתוך {items.length.toLocaleString("he-IL")}</>
                ) : (
                  <>
                    {stats.done.toLocaleString("he-IL")} הועלו בהצלחה
                    {stats.failed > 0 && <span className="text-destructive"> · {stats.failed} נכשלו</span>}
                  </>
                )}
              </span>
              {busy && <span className="text-sm text-muted-fg">אפשר להמשיך לגלוש באתר, ההעלאה תמשיך</span>}
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${stats.progress * 100}%` }} />
            </div>
            <Link
              to={`/${code}/gallery`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-lg font-bold text-on-primary"
            >
              <Images className="size-5" aria-hidden />
              לצפייה באלבום
            </Link>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="למחוק את הפריט?"
        message={<p>הפריט יוסר מהאלבום שלך ולא יוצג יותר לאף אחד באתר.</p>}
        confirmLabel="כן, למחוק"
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete?.media || !identity) return;
          try {
            await api(`/e/${code}/media/delete`, { method: "POST", json: { ids: [toDelete.media.id] }, guest: identity.token });
            queue.current?.remove(toDelete.key);
            toast("הפריט נמחק");
          } catch (e) {
            toast(errorMessage(e), "error");
          }
        }}
      />
    </div>
  );
}

function QueueTile({ item, onRetry, onDelete }: { item: QueueItem; onRetry: () => void; onDelete: () => void }) {
  const isVideo = item.file.type.startsWith("video/");
  const label =
    item.state === "preparing" ? (isVideo ? "מכין סרטון…" : "מכין…") : item.state === "uploading" ? `${Math.round(item.progress * 100)}%` : item.state === "saving" ? "שומר…" : "";
  return (
    <li className="relative aspect-square overflow-hidden rounded-xl bg-muted">
      {item.preview ? (
        <img src={item.preview} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-fg">
          <Film className="size-8" aria-hidden />
        </div>
      )}
      {item.state !== "done" && item.state !== "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-sm font-bold text-white">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          <span>{label}</span>
        </div>
      )}
      {(item.state === "uploading" || item.state === "preparing") && (
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/30" aria-hidden>
          <div className="h-full bg-white transition-[width] duration-200" style={{ width: `${item.progress * 100}%` }} />
        </div>
      )}
      {item.state === "done" && (
        <>
          <CheckCircle2 className="absolute end-1.5 top-1.5 size-7 rounded-full bg-white text-emerald-600" aria-label="הועלה" />
          <button
            onClick={onDelete}
            aria-label="מחיקת הפריט"
            className="absolute bottom-1.5 start-1.5 inline-flex size-10 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
          >
            <Trash2 className="size-5" aria-hidden />
          </button>
        </>
      )}
      {item.state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/65 p-2 text-center text-xs text-white">
          <AlertCircle className="size-6 text-red-300" aria-hidden />
          <span className="line-clamp-3">{item.error}</span>
          <Button size="sm" variant="glass" onClick={onRetry} icon={<RotateCcw className="size-4" aria-hidden />}>
            שוב
          </Button>
        </div>
      )}
    </li>
  );
}

/** The event is moving to another Google account: viewing works, uploads wait a few minutes. */
function Maintenance({ code }: { code: string }) {
  return (
    <div role="status" className="space-y-4 rounded-3xl border border-border bg-card p-6 text-center shadow-soft">
      <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
        <Wrench className="size-8" aria-hidden />
      </span>
      <h2 className="text-2xl font-bold">האתר בתחזוקה קצרה</h2>
      <p className="text-lg text-muted-fg">אפשר לצפות בכל התמונות כרגיל. נסו להעלות שוב בעוד כמה דקות.</p>
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <button
          onClick={() => location.reload()}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-6 text-lg font-bold text-on-accent"
        >
          <RotateCcw className="size-5" aria-hidden />
          לנסות שוב
        </button>
        <Link to={`/${code}/gallery`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-primary px-6 text-lg font-bold">
          <Images className="size-5" aria-hidden />
          לצפייה בתמונות
        </Link>
      </div>
    </div>
  );
}
