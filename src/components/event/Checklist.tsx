import { useCallback, useEffect, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { CHECKLIST_ITEM_MAX, CHECKLIST_TEXTS, partText, type ChecklistBlock } from "../../../shared/design";
import type { ChecklistItem, PublicEvent } from "../../../shared/types";
import { errorMessage } from "../../lib/api";
import { boardApi, guestName, setGuestName } from "../../lib/guestName";
import { Button, IconButton, Modal, cx, inputClass } from "../ui";
import { Reveal } from "../Reveal";
import { blockStyle } from "./EventBlocks";

type Items = { items: ChecklistItem[] };

/**
 * Things left to do before the event, with progress. The hosts choose whether guests may tick items and whether
 * they may add / delete them; hosts on the guest page can always do both. Refreshes every 30s.
 */
export function Checklist({ block, event, dark, preview }: { block: ChecklistBlock; event: PublicEvent; dark: boolean; preview: boolean }) {
  const title = partText(block.texts, "title", CHECKLIST_TEXTS.title);
  const host = event.canManage && !preview;
  const canTick = !preview && (block.guestsTick || host);
  const canEdit = !preview && (block.guestsEdit || host);
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // An action waiting for the guest's name (asked once, so everyone sees who did what).
  const [pending, setPending] = useState<((name: string) => void) | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await boardApi<Items>(`/e/${event.code}/checklist`)).items);
    } catch (e) {
      setError(errorMessage(e));
      setItems((cur) => cur ?? []);
    }
  }, [event.code, event.checklistCount]); // the editor adding / removing items reloads the preview's copy

  useEffect(() => {
    load();
    const iv = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    return () => clearInterval(iv);
  }, [load]);

  /** Runs `fn` with the guest's name, asking for it first if this device doesn't know it (hosts don't need one). */
  const withName = (fn: (name: string) => void) => {
    const n = guestName(event.code);
    if (host || n) fn(n);
    else setPending(() => fn);
  };

  const call = async (path: string, init: Parameters<typeof boardApi>[1], optimistic?: (l: ChecklistItem[]) => ChecklistItem[]) => {
    const before = items;
    if (optimistic && items) setItems(optimistic(items));
    setError(null);
    try {
      setItems((await boardApi<Items>(path, init)).items);
      return true;
    } catch (e) {
      setItems(before);
      setError(errorMessage(e));
      return false;
    }
  };

  const toggle = (it: ChecklistItem) =>
    withName((name) =>
      call(`/e/${event.code}/checklist/${it.id}`, { method: "PATCH", json: { done: !it.done, name } }, (l) =>
        l.map((x) => (x.id === it.id ? { ...x, done: !it.done, doneBy: !it.done && !host ? name || null : null } : x)),
      ),
    );
  const remove = (it: ChecklistItem) => call(`/e/${event.code}/checklist/${it.id}`, { method: "DELETE" }, (l) => l.filter((x) => x.id !== it.id));
  const add = () =>
    withName(async (name) => {
      if (!text.trim()) return;
      setBusy(true);
      if (await call(`/e/${event.code}/checklist`, { method: "POST", json: { text, name } })) setText("");
      setBusy(false);
    });

  const list = items ?? [];
  const done = list.filter((i) => i.done).length;
  const pct = list.length ? Math.round((done / list.length) * 100) : 0;
  const card = dark ? "bg-white/10" : "bg-card/85 shadow-soft";

  return (
    <section className="relative px-5 py-14 sm:py-20" style={blockStyle(block)} aria-labelledby={`todo-title-${block.id}`}>
      <div className="mx-auto w-full max-w-2xl">
        <Reveal variant="up">
          <h2 id={`todo-title-${block.id}`} className="mb-8 text-center font-title text-4xl [text-wrap:balance] sm:text-5xl">
            {title}
          </h2>
        </Reveal>

        <Reveal variant="up" delay={100}>
          <div className={cx("rounded-[2rem] px-5 py-6 backdrop-blur-md sm:px-7", card)}>
            {items === null ? (
              <div className="space-y-3" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-12 rounded-2xl" />
                ))}
              </div>
            ) : (
              <>
                {list.length > 0 && (
                  <div className="mb-5">
                    <p className="mb-2 flex items-baseline justify-between gap-2 font-semibold">
                      <span>
                        {done.toLocaleString("he-IL")} מתוך {list.length.toLocaleString("he-IL")} בוצעו
                      </span>
                      <span className="text-sm opacity-80">{pct}%</span>
                    </p>
                    <div
                      className={cx("h-3 overflow-hidden rounded-full", dark ? "bg-white/20" : "bg-fg/10")}
                      role="progressbar"
                      aria-label="התקדמות"
                      aria-valuemin={0}
                      aria-valuemax={list.length}
                      aria-valuenow={done}
                      aria-valuetext={`${done} מתוך ${list.length}`}
                    >
                      <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}

                {list.length === 0 && <p className="py-4 text-center text-lg opacity-85">הרשימה עוד ריקה - אפשר להוסיף את הדבר הראשון</p>}

                <ul className="space-y-2">
                  {list.map((it) => {
                    const mark = (
                      <span
                        className={cx(
                          "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200",
                          it.done ? "border-primary bg-primary text-on-primary" : dark ? "border-white/70" : "border-fg/40",
                        )}
                        aria-hidden
                      >
                        {it.done && <Check className="size-4" strokeWidth={3} />}
                      </span>
                    );
                    const label = (
                      <span className="min-w-0 flex-1">
                        <span className={cx("block break-words text-lg leading-snug", it.done && "line-through decoration-2 opacity-70")}>{it.text}</span>
                        {(it.doneBy || it.addedBy) && (
                          <span className="block text-sm opacity-75">
                            {it.done && it.doneBy ? `בוצע ע"י ${it.doneBy}` : it.addedBy ? `נוסף ע"י ${it.addedBy}` : ""}
                          </span>
                        )}
                      </span>
                    );
                    return (
                      <li key={it.id} className={cx("flex items-center gap-1 rounded-2xl", dark ? "bg-white/5" : "bg-fg/[0.03]")}>
                        {canTick ? (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={it.done}
                            onClick={() => toggle(it)}
                            className={cx("flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-start transition-colors duration-200", dark ? "hover:bg-white/10" : "hover:bg-fg/5")}
                          >
                            {mark}
                            {label}
                          </button>
                        ) : (
                          <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2">
                            {mark}
                            <span className="sr-only">{it.done ? "בוצע:" : "עוד לא בוצע:"}</span>
                            {label}
                          </div>
                        )}
                        {canEdit && (
                          <IconButton label={`מחיקת "${it.text}"`} onClick={() => remove(it)} className={cx("me-1 shrink-0", dark ? "hover:bg-white/15" : "hover:bg-fg/5")}>
                            <Trash2 className="size-5" aria-hidden />
                          </IconButton>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {(canEdit || (preview && block.guestsEdit)) && (
                  <form
                    className="mt-4 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      add();
                    }}
                  >
                    <label htmlFor={`todo-new-${block.id}`} className="sr-only">
                      פריט חדש לרשימה
                    </label>
                    <input
                      id={`todo-new-${block.id}`}
                      className={cx(inputClass, "flex-1")}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="מה עוד צריך לעשות?"
                      maxLength={CHECKLIST_ITEM_MAX}
                      disabled={preview}
                      enterKeyHint="done"
                    />
                    <Button type="submit" loading={busy} disabled={preview || !text.trim()} icon={<Plus className="size-5" aria-hidden />} className="min-h-12 shrink-0">
                      הוספה
                    </Button>
                  </form>
                )}
              </>
            )}
            {error && (
              <p className="mt-4 rounded-xl bg-destructive/90 px-3 py-2 font-medium text-white" role="alert">
                {error}
              </p>
            )}
          </div>
        </Reveal>
      </div>

      <NamePrompt
        open={!!pending}
        code={event.code}
        onClose={() => setPending(null)}
        onDone={(name) => {
          const fn = pending;
          setPending(null);
          fn?.(name);
        }}
      />
    </section>
  );
}

/** Asks the guest's name once (kept on the device, shared with the message board). */
function NamePrompt({ open, code, onClose, onDone }: { open: boolean; code: string; onClose: () => void; onDone: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="איך קוראים לך?">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setGuestName(code, name);
          onDone(name.trim());
        }}
      >
        <p className="text-muted-fg">כך כולם יראו מי עשה מה. שואלים רק פעם אחת.</p>
        <label htmlFor={`todo-name-${code}`} className="sr-only">
          השם שלך
        </label>
        <input
          id={`todo-name-${code}`}
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="למשל: דנה כהן"
          autoComplete="name"
          maxLength={40}
          autoFocus
          enterKeyHint="go"
        />
        <Button type="submit" size="lg" className="w-full" disabled={!name.trim()}>
          המשך
        </Button>
      </form>
    </Modal>
  );
}
