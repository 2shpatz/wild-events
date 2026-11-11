import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquareHeart, Send, Trash2 } from "lucide-react";
import { MESSAGE_MAX, MESSAGES_TEXTS, partText, type MessagesBlock } from "../../../shared/design";
import type { BoardMessage, PublicEvent } from "../../../shared/types";
import { errorMessage } from "../../lib/api";
import { boardApi, setGuestName, useGuestName } from "../../lib/guestName";
import { timeAgo } from "../../lib/format";
import { Button, ConfirmDialog, IconButton, cx, inputClass } from "../ui";
import { Reveal } from "../Reveal";
import { blockStyle } from "./EventBlocks";

type Page = { messages: BoardMessage[]; more: boolean };

/** Newest page from the server + the older messages already loaded below it. */
function merge(fresh: BoardMessage[], current: BoardMessage[]) {
  const oldest = fresh.length ? fresh[fresh.length - 1].createdAt : Infinity;
  const ids = new Set(fresh.map((m) => m.id));
  return [...fresh, ...current.filter((m) => !ids.has(m.id) && m.createdAt < oldest)];
}

/** "לוח ברכות": guests write once they gave a name; everyone scrolls through the messages. Refreshes every 20s. */
export function MessageBoard({ block, event, dark, preview }: { block: MessagesBlock; event: PublicEvent; dark: boolean; preview: boolean }) {
  const t = (k: keyof typeof MESSAGES_TEXTS) => partText(block.texts, k, MESSAGES_TEXTS[k]);
  const [list, setList] = useState<BoardMessage[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [toDelete, setToDelete] = useState<BoardMessage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const listRef = useRef(list);
  listRef.current = list;

  const refresh = useCallback(async () => {
    try {
      const r = await boardApi<Page>(`/e/${event.code}/messages`);
      // "more" belongs to the oldest page loaded; only the first page's answer may change it.
      if ((listRef.current?.length ?? 0) <= r.messages.length) setMore(r.more);
      setList((cur) => merge(r.messages, cur ?? []));
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
      setList((cur) => cur ?? []);
    }
  }, [event.code]);

  useEffect(() => {
    refresh();
    const iv = setInterval(() => document.visibilityState === "visible" && refresh(), 20_000);
    return () => clearInterval(iv);
  }, [refresh]);

  const loadMore = async () => {
    if (!list?.length) return;
    setLoadingMore(true);
    try {
      const r = await boardApi<Page>(`/e/${event.code}/messages?before=${list[list.length - 1].createdAt}`);
      setList((cur) => [...(cur ?? []), ...r.messages.filter((m) => !cur?.some((x) => x.id === m.id))]);
      setMore(r.more);
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const card = dark ? "bg-white/10" : "bg-card/85 shadow-soft";
  return (
    <section className="relative px-5 py-14 sm:py-20" style={blockStyle(block)} aria-labelledby={`msg-title-${block.id}`}>
      <div className="mx-auto w-full max-w-2xl">
        <Reveal variant="up">
          <h2 id={`msg-title-${block.id}`} className="mb-8 text-center font-title text-4xl [text-wrap:balance] sm:text-5xl">
            {t("title")}
          </h2>
        </Reveal>

        <Reveal variant="up" delay={100}>
          <Composer
            code={event.code}
            prompt={t("prompt")}
            button={t("button")}
            className={cx("rounded-[2rem] px-5 py-6 backdrop-blur-md sm:px-7", card)}
            disabled={preview}
            onSent={(m) => setList((cur) => [m, ...(cur ?? []).filter((x) => x.id !== m.id)])}
          />
        </Reveal>

        <div className="mt-6">
          {list === null ? (
            <div className="space-y-3" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-24 rounded-3xl" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className={cx("rounded-[2rem] px-6 py-10 text-center backdrop-blur-md", card)}>
              <MessageSquareHeart className="mx-auto mb-3 size-10 opacity-80" aria-hidden />
              <p className={cx("text-xl [text-wrap:balance]", block.font ? "font-title" : "font-bold")}>{loadError ?? "עוד אין כאן הודעות"}</p>
              {!loadError && <p className="mt-1 opacity-85">היו הראשונים לכתוב</p>}
            </div>
          ) : (
            <>
              <p className="mb-3 text-center text-sm font-semibold opacity-80" aria-live="polite">
                {list.length === 1 && !more ? "הודעה אחת" : `${list.length.toLocaleString("he-IL")}${more ? "+" : ""} הודעות`}
              </p>
              {/* Scrolls inside its own box so a long board doesn't push the rest of the page far away. */}
              <ul
                className="max-h-[32rem] space-y-3 overflow-y-auto overscroll-contain rounded-3xl p-1 [scrollbar-width:thin]"
                tabIndex={0}
                aria-label={`ההודעות ב${t("title")}`}
                data-preview-interactive
              >
                {list.map((m) => (
                  <li key={m.id} className={cx("rounded-3xl px-5 py-4 backdrop-blur-md", card)}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline gap-x-2">
                          <span className={cx("text-lg", block.font ? "font-title" : "font-bold")}>{m.name}</span>
                          <span className="text-sm opacity-75">{timeAgo(m.createdAt)}</span>
                        </p>
                        <p className="mt-1 whitespace-pre-line break-words text-base leading-relaxed">{m.body}</p>
                      </div>
                      {m.mine && !preview && (
                        <IconButton label="מחיקת ההודעה שלי" onClick={() => setToDelete(m)} className={cx("-me-2 -mt-1 shrink-0", dark ? "hover:bg-white/15" : "hover:bg-fg/5")}>
                          <Trash2 className="size-5" aria-hidden />
                        </IconButton>
                      )}
                    </div>
                  </li>
                ))}
                {more && (
                  <li className="pt-1 text-center">
                    <Button variant={dark ? "glass" : "outline"} loading={loadingMore} onClick={loadMore}>
                      הודעות קודמות
                    </Button>
                  </li>
                )}
              </ul>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title="למחוק את ההודעה?"
        message={<p>ההודעה תימחק מהלוח לכולם.</p>}
        confirmLabel="מחיקה"
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          const m = toDelete!;
          setToDelete(null);
          setList((cur) => (cur ?? []).filter((x) => x.id !== m.id));
          try {
            await boardApi(`/e/${event.code}/messages/${m.id}`, { method: "DELETE" });
          } catch (e) {
            setLoadError(errorMessage(e));
            refresh();
          }
        }}
      />
    </section>
  );
}

/** Name (asked once per event, then "writing as X · change") + the message. */
function Composer({
  code,
  prompt,
  button,
  className,
  disabled,
  onSent,
}: {
  code: string;
  prompt: string;
  button: string;
  className: string;
  disabled: boolean;
  onSent: (m: BoardMessage) => void;
}) {
  const saved = useGuestName(code);
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState(saved);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const askName = !saved || editName;

  useEffect(() => {
    if (editName) nameInput.current?.focus();
  }, [editName]);

  const submit = async () => {
    const n = (askName ? name : saved).trim();
    if (!n) {
      setError("צריך לכתוב את השם שלך.");
      nameInput.current?.focus();
      return;
    }
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await boardApi<{ message: BoardMessage }>(`/e/${code}/messages`, { method: "POST", json: { name: n, body } });
      setGuestName(code, n);
      setEditName(false);
      setBody("");
      setSent(true);
      onSent(r.message);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={cx("space-y-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {askName ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`msg-name-${code}`} className="font-semibold">
            השם שלך
          </label>
          <input
            ref={nameInput}
            id={`msg-name-${code}`}
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="למשל: דנה כהן"
            autoComplete="name"
            maxLength={40}
            disabled={disabled}
          />
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-x-1 text-base">
          כותבים בתור <strong>{saved}</strong>
          <span aria-hidden>·</span>
          <button type="button" className="inline-flex min-h-11 items-center px-1 font-semibold underline underline-offset-4" onClick={() => (setName(saved), setEditName(true))}>
            שינוי
          </button>
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`msg-body-${code}`} className="font-semibold">
          {prompt}
        </label>
        <textarea
          id={`msg-body-${code}`}
          className={cx(inputClass, "min-h-28 resize-y py-3 leading-relaxed")}
          value={body}
          onChange={(e) => (setBody(e.target.value), setSent(false))}
          maxLength={MESSAGE_MAX}
          disabled={disabled}
          aria-describedby={`msg-count-${code}`}
        />
        <p id={`msg-count-${code}`} className="text-end text-sm opacity-75">
          {body.length}/{MESSAGE_MAX}
        </p>
      </div>
      {error && (
        <p className="rounded-xl bg-destructive/90 px-3 py-2 font-medium text-white" role="alert">
          {error}
        </p>
      )}
      <p className="sr-only" role="status">
        {sent ? "ההודעה נשלחה" : ""}
      </p>
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={disabled || !body.trim()} icon={<Send className="size-5 rtl:-scale-x-100" aria-hidden />}>
        {button}
      </Button>
    </form>
  );
}
