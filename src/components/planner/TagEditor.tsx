import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { MAX_TAGS, TAG_COLORS, newId, type Tag } from "../../../shared/guests";
import { Button, ConfirmDialog, IconButton, cx } from "../ui";
import { smallInput } from "./bits";

/**
 * Editable list of named, colored tags (sides, circles, meals): rename in place, pick a color, reorder with
 * buttons (no drag), delete, add. `usage` shows how many invitations use each tag (warns before deleting).
 */
export function TagEditor({
  tags,
  onChange,
  noun,
  placeholder,
  usage,
  max = MAX_TAGS,
  suggestions = [],
}: {
  tags: Tag[];
  onChange: (t: Tag[]) => void;
  noun: string;
  placeholder: string;
  usage?: Record<string, number>;
  max?: number;
  suggestions?: string[];
}) {
  const [name, setName] = useState("");
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [asking, setAsking] = useState<Tag | null>(null);
  const add = (n: string) => {
    const v = n.trim();
    if (!v || tags.length >= max || tags.some((t) => t.name === v)) return;
    onChange([...tags, { id: newId(), name: v.slice(0, 40), color: TAG_COLORS[tags.length % TAG_COLORS.length] }]);
    setName("");
  };
  const set = (i: number, patch: Partial<Tag>) => onChange(tags.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...tags];
    const [t] = next.splice(i, 1);
    next.splice(i + d, 0, t);
    onChange(next);
  };
  const free = suggestions.filter((s) => !tags.some((t) => t.name === s));
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {tags.map((t, i) => (
          <li key={t.id} className="rounded-xl border border-border bg-card p-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setColorFor(colorFor === t.id ? null : t.id)}
                aria-expanded={colorFor === t.id}
                aria-label={`צבע של ${t.name}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-fg/5"
              >
                <span className="size-6 rounded-full ring-2 ring-card ring-offset-1 ring-offset-border" style={{ background: t.color }} />
              </button>
              <input className={cx(smallInput, "flex-1")} value={t.name} maxLength={40} aria-label={`שם ה${noun}`} onChange={(e) => set(i, { name: e.target.value })} onBlur={(e) => !e.target.value.trim() && set(i, { name: t.name || "ללא שם" })} />
              {usage && <span className="hidden w-16 shrink-0 text-center text-sm text-muted-fg sm:block">{(usage[t.id] ?? 0).toLocaleString("he-IL")} הזמנות</span>}
              <IconButton label="למעלה" onClick={() => move(i, -1)} disabled={i === 0} className="hover:bg-fg/5 disabled:opacity-30">
                <ChevronUp className="size-5" aria-hidden />
              </IconButton>
              <IconButton label="למטה" onClick={() => move(i, 1)} disabled={i === tags.length - 1} className="hover:bg-fg/5 disabled:opacity-30">
                <ChevronDown className="size-5" aria-hidden />
              </IconButton>
              <IconButton
                label={`מחיקת ${t.name}`}
                className="text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (usage?.[t.id]) setAsking(t);
                  else onChange(tags.filter((x) => x.id !== t.id));
                }}
              >
                <Trash2 className="size-5" aria-hidden />
              </IconButton>
            </div>
            {colorFor === t.id && (
              <div role="radiogroup" aria-label={`צבע של ${t.name}`} className="mt-2 flex flex-wrap gap-1.5 ps-1">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={t.color === c}
                    aria-label={c}
                    onClick={() => {
                      set(i, { color: c });
                      setColorFor(null);
                    }}
                    className={cx("size-11 rounded-full border-4 transition-transform duration-150 hover:scale-105", t.color === c ? "border-fg" : "border-transparent")}
                    style={{ background: c }}
                  />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {tags.length < max && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add(name);
          }}
        >
          <input className={cx(smallInput, "flex-1")} value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} maxLength={40} aria-label={`${noun} חדש`} />
          <Button type="submit" variant="outline" size="md" icon={<Plus className="size-4" aria-hidden />} disabled={!name.trim()}>
            הוספה
          </Button>
        </form>
      )}
      <ConfirmDialog
        open={!!asking}
        title={`למחוק את "${asking?.name ?? ""}"?`}
        message={<p>{(usage?.[asking?.id ?? ""] ?? 0).toLocaleString("he-IL")} הזמנות משויכות אליו. אחרי המחיקה הן יישארו בלי {noun}.</p>}
        confirmLabel="מחיקה"
        onClose={() => setAsking(null)}
        onConfirm={() => onChange(tags.filter((x) => x.id !== asking?.id))}
      />
      {free.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-fg">הצעות:</span>
          {free.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-dashed border-border px-3 text-sm font-semibold hover:border-primary hover:bg-primary/5">
              <Plus className="size-3.5" aria-hidden />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
