import { useMemo, useState } from "react";
import { CheckSquare, Square, Trash2, X, ImageOff } from "lucide-react";
import type { AlbumDTO } from "../../../shared/types";
import type { Feed } from "../../lib/useFeed";
import { api, errorMessage } from "../../lib/api";
import { MediaImg } from "../gallery/MediaImg";
import { Button, ConfirmDialog, Spinner, cx, useToast } from "../ui";

/** Select & remove photos (owner / event admins). Removal = remove from Google albums + hide. */
export function MediaManager({ code, feed, albums }: { code: string; feed: Feed; albums: AlbumDTO[] }) {
  const toast = useToast();
  const [album, setAlbum] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);

  const items = useMemo(
    () => feed.media.filter((m) => album === "all" || m.album === album).sort((a, b) => b.uploadedAt - a.uploadedAt),
    [feed.media, album],
  );
  const names = useMemo(() => new Map(albums.map((a) => [a.id, a.name])), [albums]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const remove = async () => {
    const ids = [...selected];
    try {
      let removed = 0;
      for (let i = 0; i < ids.length; i += 200) {
        const r = await api<{ removed: number }>(`/e/${code}/manage/media/hide`, { method: "POST", json: { ids: ids.slice(i, i + 200) } });
        removed += r.removed;
      }
      feed.removeLocal(ids);
      setSelected(new Set());
      toast(`${removed.toLocaleString("he-IL")} פריטים הוסרו`);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  if (feed.loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="mm-album" className="font-semibold">
          אלבום:
        </label>
        <select
          id="mm-album"
          value={album}
          onChange={(e) => {
            setAlbum(e.target.value);
            setSelected(new Set());
          }}
          className="min-h-11 rounded-xl border border-border bg-card px-3"
        >
          <option value="all">כל האלבומים ({feed.media.length.toLocaleString("he-IL")})</option>
          {albums.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.count.toLocaleString("he-IL")})
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((m) => m.id)))}
          icon={selected.size === items.length && items.length ? <Square className="size-4" aria-hidden /> : <CheckSquare className="size-4" aria-hidden />}
        >
          {selected.size === items.length && items.length ? "ביטול הבחירה" : "בחירת הכל"}
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-fg">
          <ImageOff className="size-12" aria-hidden />
          <p>אין פריטים באלבום הזה.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
          {items.map((m) => {
            const on = selected.has(m.id);
            return (
              <li key={m.id}>
                <button
                  onClick={() => toggle(m.id)}
                  aria-pressed={on}
                  aria-label={`${on ? "ביטול בחירת" : "בחירת"} פריט של ${names.get(m.album) || ""}`}
                  className={cx("relative block aspect-square w-full overflow-hidden rounded-xl ring-offset-2 transition-shadow", on && "ring-4 ring-primary")}
                >
                  <MediaImg m={m} width={220} onNeedUrl={feed.requestUrls} className="size-full" />
                  <span className={cx("absolute end-1.5 top-1.5 flex size-7 items-center justify-center rounded-md border-2", on ? "border-primary bg-primary text-on-primary" : "border-white bg-black/30")} aria-hidden>
                    {on && <CheckSquare className="size-4" />}
                  </span>
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-start text-xs text-white">{names.get(m.album)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected.size > 0 && (
        <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-md safe-bottom">
          <span className="font-semibold">{selected.size.toLocaleString("he-IL")} נבחרו</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setSelected(new Set())} icon={<X className="size-4" aria-hidden />}>
              ביטול
            </Button>
            <Button variant="danger" onClick={() => setConfirm(true)} icon={<Trash2 className="size-4" aria-hidden />}>
              הסרה ({selected.size.toLocaleString("he-IL")})
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        title={`להסיר ${selected.size.toLocaleString("he-IL")} פריטים?`}
        message={
          <>
            <p>
              <strong>{selected.size.toLocaleString("he-IL")} פריטים</strong> יוסרו מהאלבומים באתר ומאלבומי האירוע ב-Google Photos, ולא יוצגו יותר לאף אחד.
            </p>
            <p className="text-muted-fg">
              Google לא מאפשרת לאתרים למחוק קבצים לצמיתות. הקבצים עצמם יישארו בספריית Google Photos שלך - ושם אפשר למחוק אותם לגמרי.
            </p>
          </>
        }
        confirmLabel={`כן, להסיר ${selected.size.toLocaleString("he-IL")} פריטים`}
        onClose={() => setConfirm(false)}
        onConfirm={remove}
      />
    </div>
  );
}
