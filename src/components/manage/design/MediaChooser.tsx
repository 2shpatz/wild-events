import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { MediaDTO } from "../../../../shared/types";
import { MediaImg } from "../../gallery/MediaImg";
import { Button, Modal, Spinner, cx } from "../../ui";
import { useManageFeed } from "../feedContext";

const PAGE = 60;

/**
 * Choose photos from the event's album (what guests and the hosts uploaded), newest first, optionally per album.
 * Up to `max` photos; videos and photos still processing are left out.
 */
export function MediaChooser({
  open,
  max,
  onClose,
  onChoose,
}: {
  open: boolean;
  max: number;
  onClose: () => void;
  onChoose: (ids: string[]) => Promise<void>;
}) {
  const feed = useManageFeed();
  const [album, setAlbum] = useState("all");
  const [shown, setShown] = useState(PAGE);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const photos = useMemo(
    () =>
      (feed?.media ?? [])
        .filter((m: MediaDTO) => m.kind === "photo" && !m.processing && (album === "all" || m.album === album))
        .sort((a, b) => b.uploadedAt - a.uploadedAt),
    [feed?.media, album],
  );
  const albums = (feed?.albums ?? []).filter((a) => a.count > 0);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < max ? [...p, id] : p));
  const close = () => {
    setPicked([]);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="בחירה מהתמונות שהועלו"
      size="lg"
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!picked.length}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await onChoose(picked);
              setBusy(false);
              close();
            }}
          >
            {picked.length ? `הוספה (${picked.length})` : "הוספה"}
          </Button>
          <Button variant="ghost" onClick={close} disabled={busy}>
            ביטול
          </Button>
          <span className="text-sm text-muted-fg" role="status">
            {picked.length >= max ? `אפשר לבחור עד ${max}` : `נבחרו ${picked.length} מתוך ${max} אפשריות`}
          </span>
        </div>
      }
    >
      {!feed || feed.loading ? (
        <Spinner />
      ) : !photos.length && album === "all" ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-muted-fg">עדיין לא הועלו תמונות לאירוע.</p>
      ) : (
        <div className="space-y-4">
          {albums.length > 1 && (
            <div className="flex items-center gap-2">
              <label htmlFor="mc-album" className="font-semibold">
                אלבום
              </label>
              <select
                id="mc-album"
                value={album}
                onChange={(e) => {
                  setAlbum(e.target.value);
                  setShown(PAGE);
                }}
                className="min-h-11 rounded-xl border border-border bg-card px-3"
              >
                <option value="all">כל האלבומים</option>
                {albums.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.count.toLocaleString("he-IL")})
                  </option>
                ))}
              </select>
            </div>
          )}
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {photos.slice(0, shown).map((m) => {
              const n = picked.indexOf(m.id);
              const on = n >= 0;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={on ? `תמונה ${n + 1} שנבחרה` : "בחירת התמונה"}
                    disabled={!on && picked.length >= max}
                    onClick={() => toggle(m.id)}
                    className={cx(
                      "relative block aspect-square w-full overflow-hidden rounded-xl border-4 transition-[border-color,opacity] duration-200 disabled:opacity-40",
                      on ? "border-primary" : "border-transparent hover:border-primary/40",
                    )}
                  >
                    <MediaImg m={m} width={240} onNeedUrl={feed.requestUrls} className="size-full" />
                    {on && (
                      <span className="absolute end-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary" aria-hidden>
                        {picked.length > 1 ? n + 1 : <Check className="size-4" />}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {photos.length > shown && (
            <div className="text-center">
              <Button variant="outline" onClick={() => setShown((s) => s + PAGE)}>
                עוד תמונות
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
