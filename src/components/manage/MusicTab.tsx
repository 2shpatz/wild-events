import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, Check, ListPlus, Music2, Pause, Pencil, Play, Plus, RotateCcw, Save, Sparkles, Trash2, Upload, X } from "lucide-react";
import type { EventType, ManageEvent, UploadedTrack } from "../../../shared/types";
import { AUDIO_MIME_RE, MAX_PLAYLIST, MAX_TRACK_BYTES, MAX_UPLOADED_TRACKS, trackKey, type EventMusic, type TrackRef } from "../../../shared/music";
import { LIBRARY, LIBRARY_LICENSE, LIBRARY_LICENSE_URL, MOODS, libraryTrack, libraryUrl, suggestedTracks, type Mood } from "../../../shared/musicLibrary";
import { ApiError, api, errorMessage } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import { Button, Card, ConfirmDialog, IconButton, cx, inputClass, useToast } from "../ui";
import { Toggle } from "./Toggle";

const FOR_TYPE: Record<EventType, string> = {
  wedding: "לחתונה",
  birthday: "ליום הולדת",
  family: "לאירוע משפחתי",
  party: "למסיבה",
  general: "לאירוע",
};

const mmss = (s: number | null | undefined) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}` : "");

// ------------------------------------------------------------- preview (one song at a time in the manage screen)

let previewEl: HTMLAudioElement | null = null;
let previewKey: string | null = null;
const previewSubs = new Set<() => void>();
const setPreview = (k: string | null) => {
  previewKey = k;
  previewSubs.forEach((f) => f());
};
function togglePreview(key: string, url: string) {
  if (!previewEl) {
    previewEl = new Audio();
    previewEl.addEventListener("ended", () => setPreview(null));
    previewEl.addEventListener("error", () => setPreview(null));
  }
  if (previewKey === key) {
    previewEl.pause();
    return setPreview(null);
  }
  previewEl.src = url;
  previewEl.play().catch(() => setPreview(null));
  setPreview(key);
}
const stopPreview = () => {
  previewEl?.pause();
  setPreview(null);
};
const usePreviewKey = () =>
  useSyncExternalStore(
    (f) => {
      previewSubs.add(f);
      return () => previewSubs.delete(f);
    },
    () => previewKey,
  );

function PreviewButton({ k, url, title }: { k: string; url: string; title: string }) {
  const playing = usePreviewKey() === k;
  return (
    <IconButton
      label={playing ? `עצירת ההשמעה של ${title}` : `השמעה של ${title}`}
      onClick={() => togglePreview(k, url)}
      className={cx("shrink-0", playing ? "bg-primary text-on-primary" : "bg-muted text-fg hover:bg-border")}
    >
      {playing ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
    </IconButton>
  );
}

// ------------------------------------------------------------- upload helpers

const mimeOf = (f: File) => {
  const t = f.type.toLowerCase();
  if (AUDIO_MIME_RE.test(t)) return t;
  if (/\.mp3$/i.test(f.name)) return "audio/mpeg";
  if (/\.(m4a|mp4|aac)$/i.test(f.name)) return "audio/mp4";
  return t;
};

function readDuration(f: File): Promise<number | null> {
  return new Promise((resolve) => {
    const a = new Audio();
    const url = URL.createObjectURL(f);
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const t = setTimeout(() => done(null), 5000);
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      clearTimeout(t);
      done(Number.isFinite(a.duration) ? Math.round(a.duration) : null);
    };
    a.onerror = () => {
      clearTimeout(t);
      done(null);
    };
    a.src = url;
  });
}

function uploadTrack(code: string, f: File, duration: number | null, onProgress: (p: number) => void): Promise<UploadedTrack> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/e/${code}/manage/tracks`);
    xhr.setRequestHeader("Content-Type", mimeOf(f));
    xhr.setRequestHeader("X-Filename", encodeURIComponent(f.name));
    if (duration) xhr.setRequestHeader("X-Duration", String(duration));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as UploadedTrack);
      else reject(new ApiError(xhr.status, body?.error || "server_error"));
    };
    xhr.onerror = () => reject(new TypeError("network"));
    xhr.send(f);
  });
}

// ------------------------------------------------------------- the tab

/**
 * "מוזיקה" tab: background music for the guest pages. Settings + playlist are a draft saved with one button
 * (like the design editor); uploading / renaming / deleting songs happens at once (skill: progressive disclosure,
 * visible labels, 44px targets, no drag-only reordering).
 */
export function MusicTab({ event, onChanged }: { event: ManageEvent; onChanged: () => void }) {
  const toast = useToast();
  const saved = event.musicConfig;
  const savedJson = JSON.stringify(saved);
  const [draft, setDraft] = useState<EventMusic>(saved);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== savedJson;
  const uploadedById = useMemo(() => new Map(event.uploadedTracks.map((t) => [t.id, t])), [event.uploadedTracks]);

  // Saved settings changed (our save or someone else's): adopt them unless there are unsaved edits.
  const justSaved = useRef(false);
  useEffect(() => {
    if (justSaved.current || !dirty) setDraft(saved);
    justSaved.current = false;
  }, [savedJson]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => stopPreview, []);

  const inList = new Set(draft.tracks.map(trackKey));
  const full = draft.tracks.length >= MAX_PLAYLIST;
  const patch = (p: Partial<EventMusic>) => setDraft((d) => ({ ...d, ...p }));
  const add = (refs: TrackRef[]) =>
    setDraft((d) => {
      const have = new Set(d.tracks.map(trackKey));
      const extra = refs.filter((r) => !have.has(trackKey(r)));
      return { ...d, tracks: [...d.tracks, ...extra].slice(0, MAX_PLAYLIST) };
    });
  const remove = (k: string) => setDraft((d) => ({ ...d, tracks: d.tracks.filter((t) => trackKey(t) !== k) }));
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const tracks = [...d.tracks];
      const j = i + dir;
      if (j < 0 || j >= tracks.length) return d;
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
      return { ...d, tracks };
    });

  const save = async () => {
    setSaving(true);
    try {
      await api(`/e/${event.code}/manage`, { method: "PATCH", json: { music: draft } });
      justSaved.current = true;
      toast(draft.enabled && draft.tracks.length ? "המוזיקה נשמרה - האורחים כבר שומעים אותה" : "הגדרות המוזיקה נשמרו");
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setSaving(false);
  };

  const describe = (r: TrackRef) => {
    if (r.src === "lib") {
      const t = libraryTrack(r.id);
      return t ? { title: t.title, sub: t.artist, duration: t.duration, url: libraryUrl(t.id) } : null;
    }
    const t = uploadedById.get(r.id);
    return t ? { title: t.title, sub: "שיר שהעליתם", duration: t.duration, url: `/api/e/${event.code}/track/${t.id}` } : null;
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Music2 className="size-6" aria-hidden />
          </span>
          <div>
            <h2 className="text-xl font-bold">מוזיקת רקע</h2>
            <p className="text-sm text-muted-fg">נגן קטן צף בראש עמודי האורחים. בלחיצה עליו נפתחים כפתורי שיר קודם, הפעלה / השהיה ושיר הבא.</p>
          </div>
        </div>
        <div className="divide-y divide-border">
          <Toggle checked={draft.enabled} onChange={(v) => patch({ enabled: v })} label="מוזיקת רקע בעמוד האורחים" />
          <Toggle
            checked={draft.autoStart}
            onChange={(v) => patch({ autoStart: v })}
            label="להתחיל לנגן מיד כשהעמוד עולה"
            hint="בחלק מהטלפונים (בעיקר אייפון) הדפדפן לא מאפשר צליל לפני שנוגעים בעמוד - שם המוזיקה תתחיל בנגיעה הראשונה של האורח. אורח שעצר את המוזיקה לא ישמע אותה שוב מעצמה."
          />
          <Toggle checked={draft.shuffle} onChange={(v) => patch({ shuffle: v })} label="סדר אקראי" />
        </div>

        <section aria-labelledby="playlist-h" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="playlist-h" className="text-lg font-bold">
              רשימת השירים של האירוע
            </h3>
            <span className="text-sm text-muted-fg">
              {draft.tracks.length} מתוך {MAX_PLAYLIST}
            </span>
          </div>
          {draft.tracks.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-border p-5 text-center">
              <p className="mb-3 text-muted-fg">עדיין אין שירים ברשימה. אפשר להתחיל מהמנגינות שבחרנו {FOR_TYPE[event.type]}.</p>
              <Button
                variant="outline"
                size="sm"
                icon={<Sparkles className="size-4" aria-hidden />}
                onClick={() => add(suggestedTracks(event.type).map((t) => ({ src: "lib", id: t.id })))}
              >
                להוסיף את המומלצים {FOR_TYPE[event.type]}
              </Button>
            </div>
          ) : (
            <ol className="space-y-2">
              {draft.tracks.map((r, i) => {
                const k = trackKey(r);
                const d = describe(r);
                if (!d) return null;
                return (
                  <li key={k} className="flex items-center gap-1 rounded-xl bg-muted/60 p-1.5 pe-1 sm:gap-2">
                    <span className="hidden w-6 shrink-0 text-center text-sm font-semibold text-muted-fg sm:block">{i + 1}</span>
                    <PreviewButton k={k} url={d.url} title={d.title} />
                    <div className="min-w-0 flex-1">
                      <p dir="auto" className="truncate text-right font-semibold">{d.title}</p>
                      <p dir="auto" className="truncate text-right text-sm text-muted-fg">
                        {[mmss(d.duration), d.sub].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <IconButton label={`הזזת ${d.title} למעלה`} onClick={() => move(i, -1)} disabled={i === 0} className="size-10 shrink-0 hover:bg-fg/5 disabled:opacity-30">
                      <ArrowUp className="size-5" aria-hidden />
                    </IconButton>
                    <IconButton
                      label={`הזזת ${d.title} למטה`}
                      onClick={() => move(i, 1)}
                      disabled={i === draft.tracks.length - 1}
                      className="size-10 shrink-0 hover:bg-fg/5 disabled:opacity-30"
                    >
                      <ArrowDown className="size-5" aria-hidden />
                    </IconButton>
                    <IconButton label={`הסרת ${d.title} מהרשימה`} onClick={() => remove(k)} className="size-10 shrink-0 text-destructive hover:bg-destructive/10">
                      <X className="size-5" aria-hidden />
                    </IconButton>
                  </li>
                );
              })}
            </ol>
          )}
          {draft.enabled && draft.tracks.length === 0 && (
            <p role="status" className="text-sm font-semibold text-destructive">
              כדי שהאורחים ישמעו מוזיקה צריך להוסיף לפחות שיר אחד.
            </p>
          )}
        </section>
      </Card>

      <LibraryCard type={event.type} inList={inList} full={full} onAdd={(id) => add([{ src: "lib", id }])} />
      <MySongsCard event={event} inList={inList} full={full} onAdd={(id) => add([{ src: "up", id }])} onRemoved={(id) => remove(`up:${id}`)} onChanged={onChanged} />

      {/* Save bar: stays in reach while scrolling the library. */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/95 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lift backdrop-blur-md">
        <Button disabled={!dirty} loading={saving} icon={<Save className="size-4" aria-hidden />} onClick={save}>
          שמירת המוזיקה
        </Button>
        {dirty && !saving && (
          <>
            <Button variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => setDraft(saved)}>
              ביטול השינויים
            </Button>
            <span role="status" className="text-sm text-muted-fg max-sm:sr-only">
              יש שינויים שלא נשמרו
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function AddButton({ added, full, title, onAdd }: { added: boolean; full: boolean; title: string; onAdd: () => void }) {
  if (added)
    return (
      <span className="inline-flex min-h-10 shrink-0 items-center gap-1 px-2 text-sm font-semibold text-muted-fg">
        <Check className="size-4" aria-hidden />
        ברשימה
      </span>
    );
  return (
    <Button variant="outline" size="sm" className="shrink-0" disabled={full} onClick={onAdd} aria-label={`הוספת ${title} לרשימה`} icon={<Plus className="size-4" aria-hidden />}>
      הוספה
    </Button>
  );
}

function LibraryCard({ type, inList, full, onAdd }: { type: EventType; inList: Set<string>; full: boolean; onAdd: (id: string) => void }) {
  const [filter, setFilter] = useState<Mood | "suggested">("suggested");
  const list = filter === "suggested" ? suggestedTracks(type) : LIBRARY.filter((t) => t.mood === filter);
  const chips: { id: Mood | "suggested"; label: string }[] = [{ id: "suggested", label: `מומלץ ${FOR_TYPE[type]}` }, ...MOODS];
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">ספריית מנגינות</h2>
        <p className="text-sm text-muted-fg">מנגינות רקע בלי מילים, חופשיות לשימוש, לפי אווירה.</p>
      </div>
      <div role="radiogroup" aria-label="אווירה" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={filter === c.id}
            onClick={() => setFilter(c.id)}
            className={cx(
              "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              filter === c.id ? "border-primary bg-primary text-on-primary" : "border-border bg-card text-fg hover:bg-muted",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {list.map((t) => {
          const k = `lib:${t.id}`;
          return (
            <li key={t.id} className="flex items-center gap-3 rounded-xl border border-border p-1.5 pe-2">
              <PreviewButton k={k} url={libraryUrl(t.id)} title={t.title} />
              <div className="min-w-0 flex-1">
                <p dir="auto" className="truncate text-right font-semibold">{t.title}</p>
                <p className="truncate text-sm text-muted-fg">
                  {MOODS.find((m) => m.id === t.mood)?.label} · {mmss(t.duration)}
                </p>
              </div>
              <AddButton added={inList.has(k)} full={full} title={t.title} onAdd={() => onAdd(t.id)} />
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-fg">
        המנגינות של Kevin MacLeod (incompetech.com), ברישיון{" "}
        <a href={LIBRARY_LICENSE_URL} target="_blank" rel="noopener" className="underline underline-offset-2" dir="ltr">
          {LIBRARY_LICENSE}
        </a>
        . הקרדיט מוצג לאורחים בנגן.
      </p>
    </Card>
  );
}

interface Pending {
  name: string;
  progress: number;
}

function MySongsCard({
  event,
  inList,
  full,
  onAdd,
  onRemoved,
  onChanged,
}: {
  event: ManageEvent;
  inList: Set<string>;
  full: boolean;
  onAdd: (id: string) => void;
  onRemoved: (id: string) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [confirm, setConfirm] = useState<UploadedTrack | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const left = MAX_UPLOADED_TRACKS - event.uploadedTracks.length;

  const pick = async (files: FileList | null) => {
    const list = [...(files ?? [])].slice(0, Math.max(0, left));
    if (input.current) input.current.value = "";
    let added = 0;
    for (const f of list) {
      if (!AUDIO_MIME_RE.test(mimeOf(f))) {
        toast(`${f.name}: ${errorMessage(new ApiError(415, "bad_audio"))}`, "error");
        continue;
      }
      if (f.size > MAX_TRACK_BYTES) {
        toast(`${f.name}: ${errorMessage(new ApiError(413, "track_too_large"))}`, "error");
        continue;
      }
      setPending({ name: f.name, progress: 0 });
      try {
        const duration = await readDuration(f);
        const t = await uploadTrack(event.code, f, duration, (p) => setPending({ name: f.name, progress: p }));
        onAdd(t.id);
        added++;
      } catch (e) {
        toast(`${f.name}: ${errorMessage(e)}`, "error");
      }
    }
    setPending(null);
    if (added) {
      toast(added === 1 ? "השיר הועלה ונוסף לרשימה - לא לשכוח לשמור" : `${added} שירים הועלו ונוספו לרשימה - לא לשכוח לשמור`);
      onChanged();
    }
  };

  const rename = async () => {
    if (!editing) return;
    const title = editing.title.trim();
    if (!title) return;
    setBusyId(editing.id);
    try {
      await api(`/e/${event.code}/manage/tracks/${editing.id}`, { method: "PATCH", json: { title } });
      setEditing(null);
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setBusyId(null);
  };

  const del = async (t: UploadedTrack) => {
    setBusyId(t.id);
    try {
      if (previewKey === `up:${t.id}`) stopPreview();
      await api(`/e/${event.code}/manage/tracks/${t.id}`, { method: "DELETE" });
      onRemoved(t.id);
      toast("השיר נמחק");
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setBusyId(null);
  };

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">השירים שלי</h2>
          <p className="text-sm text-muted-fg">
            קובצי MP3 או M4A, עד {formatBytes(MAX_TRACK_BYTES)} לשיר. השירים נשמרים ב-Google Drive של בעל האירוע, בתיקייה "אירוע פרוע - מוזיקה".
          </p>
        </div>
        <input
          ref={input}
          type="file"
          accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => pick(e.target.files)}
        />
        <Button
          variant="accent"
          size="sm"
          icon={<Upload className="size-4" aria-hidden />}
          loading={!!pending}
          disabled={left <= 0}
          onClick={() => input.current?.click()}
        >
          העלאת שירים
        </Button>
      </div>

      {pending && (
        <div role="status" className="rounded-xl bg-muted p-3">
          <p className="mb-2 truncate text-sm font-semibold">מעלה את {pending.name}…</p>
          <div className="h-2 overflow-hidden rounded-full bg-border" aria-hidden>
            <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${Math.round(pending.progress * 100)}%` }} />
          </div>
          <span className="sr-only">{Math.round(pending.progress * 100)}%</span>
        </div>
      )}

      {event.uploadedTracks.length === 0 && !pending ? (
        <p className="rounded-xl border-2 border-dashed border-border p-5 text-center text-muted-fg">עוד לא העליתם שירים.</p>
      ) : (
        <ul className="space-y-2">
          {event.uploadedTracks.map((t) => {
            const k = `up:${t.id}`;
            const isEditing = editing?.id === t.id;
            return (
              <li key={t.id} className="flex items-center gap-2 rounded-xl border border-border p-1.5 pe-2">
                <PreviewButton k={k} url={`/api/e/${event.code}/track/${t.id}`} title={t.title} />
                {isEditing ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename();
                    }}
                  >
                    <label className="sr-only" htmlFor={`title-${t.id}`}>
                      שם השיר
                    </label>
                    <input
                      id={`title-${t.id}`}
                      className={cx(inputClass, "min-w-0 flex-1")}
                      value={editing.title}
                      maxLength={80}
                      autoFocus
                      onChange={(e) => setEditing({ id: t.id, title: e.target.value })}
                      onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                    />
                    <IconButton label="שמירת השם" type="submit" disabled={busyId === t.id} className="text-primary hover:bg-primary/10">
                      <Check className="size-5" aria-hidden />
                    </IconButton>
                    <IconButton label="ביטול" type="button" onClick={() => setEditing(null)} className="hover:bg-fg/5">
                      <X className="size-5" aria-hidden />
                    </IconButton>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p dir="auto" className="truncate text-right font-semibold">{t.title}</p>
                      <p className="truncate text-sm text-muted-fg">
                        {[mmss(t.duration), formatBytes(t.size)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {inList.has(k) ? (
                      <span className="inline-flex min-h-10 shrink-0 items-center gap-1 px-1 text-sm font-semibold text-muted-fg">
                        <Check className="size-4" aria-hidden />
                        <span className="max-sm:sr-only">ברשימה</span>
                      </span>
                    ) : (
                      <IconButton label={`הוספת ${t.title} לרשימה`} disabled={full} onClick={() => onAdd(t.id)} className="text-primary hover:bg-primary/10">
                        <ListPlus className="size-5" aria-hidden />
                      </IconButton>
                    )}
                    <IconButton label={`שינוי השם של ${t.title}`} onClick={() => setEditing({ id: t.id, title: t.title })} className="hover:bg-fg/5">
                      <Pencil className="size-5" aria-hidden />
                    </IconButton>
                    <IconButton label={`מחיקת ${t.title}`} disabled={busyId === t.id} onClick={() => setConfirm(t)} className="text-destructive hover:bg-destructive/10">
                      <Trash2 className="size-5" aria-hidden />
                    </IconButton>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-fg">
        העלו רק שירים שמותר לכם להשמיע בפומבי. השירים מושמעים לכל מי שנכנס לעמוד האירוע. נשארו {Math.max(0, left)} מתוך {MAX_UPLOADED_TRACKS} שירים.
      </p>

      <ConfirmDialog
        open={!!confirm}
        title="למחוק את השיר?"
        message={`"${confirm?.title ?? ""}" יימחק מהאתר ומה-Google Drive, ויוסר מרשימת השירים.`}
        confirmLabel="מחיקה"
        danger
        onConfirm={() => {
          if (confirm) del(confirm);
          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
      />
    </Card>
  );
}
