import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Minus, Plus, Trash2, Undo2 } from "lucide-react";
import {
  CHECKLIST_ITEM_MAX,
  CHECKLIST_TEXTS,
  VISIBLE_ITEMS,
  MESSAGES_TEXTS,
  PART_TEXT_MAX,
  WHATSAPP_TEXTS,
  whatsappUrl,
  type ChecklistBlock,
  type MessagesBlock,
  type WhatsAppBlock,
} from "../../../../shared/design";
import type { BoardMessage, ChecklistItem, ManageEvent } from "../../../../shared/types";
import { api, errorMessage } from "../../../lib/api";
import { timeAgo } from "../../../lib/format";
import { useLastDeleted } from "../../../lib/useLastDeleted";
import { Button, ConfirmDialog, Field, IconButton, PlusButton, Spinner, cx, inputClass } from "../../ui";
import { Toggle } from "../Toggle";
import { PartText } from "./PartsFields";

// ------------------------------------------------------------------ list length

/** "כמה פריטים לפני גלילה": the list shows this many items, then scrolls inside its box. */
function VisibleItemsField({ id, value, onChange, noun }: { id: string; value: number; onChange: (n: number) => void; noun: string }) {
  const set = (n: number) => onChange(Math.min(VISIBLE_ITEMS.max, Math.max(VISIBLE_ITEMS.min, n)));
  return (
    <div className="space-y-2">
      <p id={id} className="font-semibold">
        כמה {noun} יוצגו לפני גלילה
      </p>
      <div role="group" aria-labelledby={id} className="flex items-center gap-3">
        <IconButton label={`פחות ${noun}`} onClick={() => set(value - 1)} disabled={value <= VISIBLE_ITEMS.min} className="border border-border bg-card disabled:opacity-40">
          <Minus className="size-5" aria-hidden />
        </IconButton>
        <span className="min-w-8 text-center text-xl font-bold tabular-nums" aria-live="polite">
          {value}
        </span>
        <IconButton label={`יותר ${noun}`} onClick={() => set(value + 1)} disabled={value >= VISIBLE_ITEMS.max} className="border border-border bg-card disabled:opacity-40">
          <Plus className="size-5" aria-hidden />
        </IconButton>
      </div>
      <p className="text-sm text-muted-fg">מעבר לזה הרשימה נגללת בתוך המסגרת שלה, כדי שלא תדחוף את שאר העמוד רחוק למטה.</p>
    </div>
  );
}

// ------------------------------------------------------------------ WhatsApp group

export function WhatsAppFields({ block, update }: { block: WhatsAppBlock; update: (p: Partial<WhatsAppBlock>) => void }) {
  // What the hosts typed; only a valid invite link reaches the design (and the preview).
  const [raw, setRaw] = useState(block.url);
  const valid = whatsappUrl(raw);
  const text = (k: keyof typeof WHATSAPP_TEXTS) => (v: string | null) => update({ texts: { ...block.texts, [k]: v } });
  return (
    <>
      <Field
        label="קישור ההזמנה לקבוצה"
        htmlFor={`wa-url-${block.id}`}
        error={raw.trim() && !valid ? "זה לא נראה כמו קישור להזמנה לקבוצה. הוא אמור להתחיל ב-https://chat.whatsapp.com/" : null}
        hint={valid ? "הקישור תקין" : undefined}
      >
        <input
          id={`wa-url-${block.id}`}
          className={inputClass}
          dir="ltr"
          inputMode="url"
          autoComplete="off"
          value={raw}
          placeholder="https://chat.whatsapp.com/..."
          onChange={(e) => {
            setRaw(e.target.value);
            update({ url: whatsappUrl(e.target.value) });
          }}
        />
      </Field>
      <div className="rounded-xl bg-muted px-4 py-3">
        <p className="mb-1 font-semibold">איך מוצאים את הקישור?</p>
        <ol className="list-inside list-decimal space-y-1 text-muted-fg">
          <li>פותחים את הקבוצה בוואטסאפ ולוחצים על שם הקבוצה למעלה.</li>
          <li>בוחרים "הזמנה לקבוצה באמצעות קישור" (צריך להיות מנהל/ת בקבוצה).</li>
          <li>לוחצים "העתקת קישור" ומדביקים כאן.</li>
        </ol>
      </div>
      <PartText id={`${block.id}-title`} label="כותרת" value={block.texts.title} fallback={WHATSAPP_TEXTS.title} max={PART_TEXT_MAX.title} onChange={text("title")} />
      <PartText id={`${block.id}-text`} label="טקסט" value={block.texts.text} fallback={WHATSAPP_TEXTS.text} max={PART_TEXT_MAX.text} onChange={text("text")} />
      <PartText id={`${block.id}-button`} label="הטקסט על הכפתור" value={block.texts.button} fallback={WHATSAPP_TEXTS.button} max={PART_TEXT_MAX.button} onChange={text("button")} />
    </>
  );
}

// ------------------------------------------------------------------ message board

export function MessagesFields({ event, block, update }: { event: ManageEvent; block: MessagesBlock; update: (p: Partial<MessagesBlock>) => void }) {
  const text = (k: keyof typeof MESSAGES_TEXTS) => (v: string | null) => update({ texts: { ...block.texts, [k]: v } });
  return (
    <>
      <p className="text-muted-fg">האורחים רואים את כל ההודעות, כל אורח בצבע משלו, ולחיצה על כפתור הפלוס פותחת חלון לכתיבה. את השם כותבים פעם אחת. ההודעות מופיעות מיד לכולם. אורח יכול למחוק רק הודעה שכתב מהטלפון שלו, ואתם יכולים למחוק כל הודעה כאן למטה.</p>
      <PartText id={`${block.id}-title`} label="כותרת" value={block.texts.title} fallback={MESSAGES_TEXTS.title} max={PART_TEXT_MAX.title} onChange={text("title")} />
      <PartText id={`${block.id}-add`} label="כותרת חלון הכתיבה (הכפתור עצמו הוא פלוס)" value={block.texts.add} fallback={MESSAGES_TEXTS.add} max={PART_TEXT_MAX.add} onChange={text("add")} />
      <PartText id={`${block.id}-prompt`} label="ההזמנה לכתוב (מעל תיבת הטקסט)" value={block.texts.prompt} fallback={MESSAGES_TEXTS.prompt} max={PART_TEXT_MAX.prompt} onChange={text("prompt")} />
      <PartText id={`${block.id}-button`} label="הטקסט על כפתור השליחה" value={block.texts.button} fallback={MESSAGES_TEXTS.button} max={PART_TEXT_MAX.button} onChange={text("button")} />
      <VisibleItemsField id={`${block.id}-visible`} value={block.visible} onChange={(visible) => update({ visible })} noun="הודעות" />
      <Moderation code={event.code} />
    </>
  );
}

/** All the messages, newest first, each with a delete button (saved immediately). */
function Moderation({ code }: { code: string }) {
  const [list, setList] = useState<BoardMessage[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<BoardMessage | null>(null);
  const load = useCallback(
    async (before?: number) => {
      try {
        const r = await api<{ messages: BoardMessage[]; more: boolean }>(`/e/${code}/messages${before ? `?before=${before}` : ""}`);
        setList((cur) => (before ? [...(cur ?? []), ...r.messages] : r.messages));
        setMore(r.more);
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
        setList((cur) => cur ?? []);
      }
    },
    [code],
  );
  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="space-y-3 border-t border-border pt-5" aria-labelledby="moderation-title">
      <div className="flex items-center justify-between gap-2">
        <h4 id="moderation-title" className="font-semibold">
          ההודעות בלוח {list && list.length > 0 && <span className="text-muted-fg">({list.length.toLocaleString("he-IL")}{more ? "+" : ""})</span>}
        </h4>
        <Button variant="ghost" size="sm" onClick={() => load()}>
          רענון
        </Button>
      </div>
      {error && (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
      {list === null ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-center text-sm text-muted-fg">עוד אין הודעות</p>
      ) : (
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {list.map((m) => (
            <li key={m.id} className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <strong>{m.name}</strong> <span className="text-muted-fg">· {timeAgo(m.createdAt)}</span>
                </p>
                <p className="whitespace-pre-line break-words">{m.body}</p>
              </div>
              <IconButton label={`מחיקת ההודעה של ${m.name}`} onClick={() => setToDelete(m)} className="shrink-0 text-destructive hover:bg-destructive/10">
                <Trash2 className="size-5" aria-hidden />
              </IconButton>
            </li>
          ))}
          {more && (
            <li className="text-center">
              <Button variant="outline" size="sm" onClick={() => load(list[list.length - 1].createdAt)}>
                הודעות קודמות
              </Button>
            </li>
          )}
        </ul>
      )}
      <ConfirmDialog
        open={!!toDelete}
        title="למחוק את ההודעה?"
        message={<p>ההודעה של {toDelete?.name} תימחק מהלוח לכולם. אי אפשר לבטל.</p>}
        confirmLabel="מחיקה"
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          const m = toDelete!;
          try {
            await api(`/e/${code}/messages/${m.id}`, { method: "DELETE" });
            setList((cur) => (cur ?? []).filter((x) => x.id !== m.id));
          } catch (e) {
            setError(errorMessage(e));
          }
          setToDelete(null);
        }}
      />
    </section>
  );
}

// ------------------------------------------------------------------ checklist

export function ChecklistFields({
  event,
  block,
  update,
  onChanged,
}: {
  event: ManageEvent;
  block: ChecklistBlock;
  update: (p: Partial<ChecklistBlock>) => void;
  onChanged: () => void;
}) {
  return (
    <>
      <PartText
        id={`${block.id}-title`}
        label="כותרת"
        value={block.texts.title}
        fallback={CHECKLIST_TEXTS.title}
        max={PART_TEXT_MAX.title}
        onChange={(v) => update({ texts: { ...block.texts, title: v } })}
      />
      <fieldset className="space-y-2 rounded-xl border border-border px-4 py-3">
        <legend className="px-1 font-semibold">מה האורחים יכולים לעשות</legend>
        <Toggle checked={block.guestsTick} onChange={(v) => update({ guestsTick: v })} label="לסמן שבוצע" hint={'ליד כל פריט שסומן יופיע "בוצע ע"י" והשם'} />
        <Toggle checked={block.guestsAdd} onChange={(v) => update({ guestsAdd: v })} label="להוסיף פריטים" hint={'ליד פריט שאורח הוסיף יופיע "נוסף ע"י" והשם'} />
        <Toggle checked={block.guestsDelete} onChange={(v) => update({ guestsDelete: v })} label="למחוק פריטים" hint="כל אורח יוכל למחוק כל פריט ברשימה. גם כשזה כבוי, אורח תמיד יכול למחוק פריט שהוא עצמו הוסיף" />
        <p className="text-sm text-muted-fg">
          {block.guestsTick || block.guestsAdd || block.guestsDelete ? "ההרשאות נכנסות לתוקף כשתשמרו את העיצוב." : "כרגע האורחים רק רואים את הרשימה. אתם יכולים לסמן ולערוך כאן."}
        </p>
      </fieldset>
      <Toggle checked={block.showProgress} onChange={(v) => update({ showProgress: v })} label="פס ההתקדמות" hint={'השורה "3 מתוך 7 בוצעו" והפס שמתמלא'} />
      <VisibleItemsField id={`${block.id}-visible`} value={block.visible} onChange={(visible) => update({ visible })} noun="פריטים" />
      <Toggle
        checked={block.inBar}
        onChange={(v) => update({ inBar: v })}
        label="כפתור קפיצה בבאנר התחתון"
        hint="בטלפון, בבאנר שמופיע בזמן הגלילה: כפתור עם שם הרשימה שמקפיץ אליה מיד"
      />
      <ItemsEditor key={block.id} code={event.code} listId={block.id} onChanged={onChanged} />
    </>
  );
}

/** The hosts' editor for the items: add, tick, rename, delete, reorder - each change is saved immediately. */
function ItemsEditor({ code, listId, onChanged }: { code: string; listId: string; onChanged: () => void }) {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: ChecklistItem[] }>(`/e/${code}/checklist/${listId}`)
      .then((r) => setItems(r.items))
      .catch((e) => (setError(errorMessage(e)), setItems([])));
  }, [code, listId]);

  const call = async (path: string, init: Parameters<typeof api>[1], countChanges = false) => {
    setError(null);
    try {
      setItems((await api<{ items: ChecklistItem[] }>(`/e/${code}/checklist/${listId}${path}`, init)).items);
      if (countChanges) onChanged();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  };
  const [lastDeleted, setLastDeleted] = useLastDeleted<ChecklistItem>();
  const remove = async (it: ChecklistItem) => {
    if (await call(`/${it.id}`, { method: "DELETE" }, true)) setLastDeleted(it);
  };
  const undo = async () => {
    const it = lastDeleted;
    if (!it) return;
    setLastDeleted(null);
    await call(`/${it.id}/restore`, { method: "POST" }, true);
  };
  const move = (i: number, dir: -1 | 1) => {
    const ids = (items ?? []).map((x) => x.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    setItems((cur) => ids.map((id) => cur!.find((x) => x.id === id)!));
    call("/order", { method: "PUT", json: { ids } });
  };

  return (
    <section className="space-y-3 border-t border-border pt-5" aria-labelledby={`todo-items-${listId}`}>
      <h4 id={`todo-items-${listId}`} className="font-semibold">
        הפריטים ברשימה
      </h4>
      <p className="text-sm text-muted-fg">השינויים ברשימה נשמרים מיד.</p>
      {error && (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
      {items === null ? (
        <Spinner />
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={it.id} className="flex items-center gap-1 rounded-xl border border-border bg-card ps-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={it.done}
                aria-label={`סימון "${it.text}" כבוצע`}
                onClick={() => call(`/${it.id}`, { method: "PATCH", json: { done: !it.done } })}
                className={cx(
                  "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
                  it.done ? "text-primary" : "text-muted-fg hover:bg-fg/5",
                )}
              >
                <span className={cx("flex size-6 items-center justify-center rounded-full border-2", it.done ? "border-primary bg-primary text-on-primary" : "border-fg/40")}>
                  {it.done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
                </span>
              </button>
              <div className="min-w-0 flex-1 py-1">
                <ItemText item={it} onSave={(t) => call(`/${it.id}`, { method: "PATCH", json: { text: t } })} />
                {(it.doneBy || it.addedBy) && (
                  <p className="px-2 text-xs text-muted-fg">{[it.addedBy && `נוסף ע"י ${it.addedBy}`, it.done && it.doneBy && `בוצע ע"י ${it.doneBy}`].filter(Boolean).join(" · ")}</p>
                )}
              </div>
              <IconButton label={`הזזת "${it.text}" למעלה`} disabled={i === 0} onClick={() => move(i, -1)} className="shrink-0 hover:bg-fg/5 disabled:opacity-30">
                <ChevronUp className="size-5" aria-hidden />
              </IconButton>
              <IconButton label={`הזזת "${it.text}" למטה`} disabled={i === items.length - 1} onClick={() => move(i, 1)} className="shrink-0 hover:bg-fg/5 disabled:opacity-30">
                <ChevronDown className="size-5" aria-hidden />
              </IconButton>
              <IconButton label={`מחיקת "${it.text}"`} onClick={() => remove(it)} className="shrink-0 text-destructive hover:bg-destructive/10">
                <Trash2 className="size-5" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          setBusy(true);
          if (await call("", { method: "POST", json: { text } }, true)) setText("");
          setBusy(false);
        }}
      >
        <label htmlFor={`todo-new-${listId}`} className="sr-only">
          פריט חדש
        </label>
        <input
          id={`todo-new-${listId}`}
          className={cx(inputClass, "flex-1")}
          value={text}
          maxLength={CHECKLIST_ITEM_MAX}
          placeholder="למשל: לאשר הגעה עד יום חמישי"
          onChange={(e) => setText(e.target.value)}
        />
        <PlusButton type="submit" label="הוספה לרשימה" loading={busy} disabled={!text.trim()} />
        {lastDeleted && (
          <IconButton label={`ביטול המחיקה של "${lastDeleted.text}"`} onClick={undo} className="shrink-0 border border-border bg-card hover:bg-fg/5">
            <Undo2 className="size-5" aria-hidden />
          </IconButton>
        )}
      </form>
    </section>
  );
}

/** The item's text; tap to rename (saved on Enter / leaving the field). */
function ItemText({ item, onSave }: { item: ChecklistItem; onSave: (t: string) => void }) {
  const [value, setValue] = useState(item.text);
  useEffect(() => setValue(item.text), [item.text]);
  const save = () => {
    const t = value.trim();
    if (!t) setValue(item.text);
    else if (t !== item.text) onSave(t);
  };
  return (
    <input
      aria-label="הטקסט של הפריט"
      className={cx("min-h-11 w-full rounded-lg bg-transparent px-2 text-base focus:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/50", item.done && "text-muted-fg line-through")}
      value={value}
      maxLength={CHECKLIST_ITEM_MAX}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLInputElement).blur())}
    />
  );
}
