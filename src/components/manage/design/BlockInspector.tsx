import { useRef, useState } from "react";
import { Eye, EyeOff, GalleryHorizontal, ImagePlus, ImageUp, Layers, LayoutGrid, Settings, Trash2, Wind, type LucideIcon } from "lucide-react";
import type { Block, FeaturedBlock, FeaturedLayout, ImageBlock, TextBlock } from "../../../../shared/design";
import { MAX_FEATURED, type ManageEvent } from "../../../../shared/types";
import { Button, ConfirmDialog, Field, Segmented, Spinner, cx, inputClass } from "../../ui";
import { Toggle } from "../Toggle";
import { useAssetActions } from "../useAssetActions";
import { ColorField } from "./ColorField";
import { BLOCK_META } from "./blockMeta";
import type { DraftAction } from "./draft";
import { DetailsFields, LiveFields } from "./PartsFields";

/** Editing one block: its content / style, hide-show and delete. */
export function BlockInspector({
  event,
  block,
  imageSrc,
  dispatch,
  against,
  onReplaceImage,
  onDeleted,
  onGoSettings,
  onChanged,
}: {
  event: ManageEvent;
  block: Block;
  /** current picture of an image block (saved or just uploaded) */
  imageSrc: string | null;
  dispatch: (a: DraftAction) => void;
  against: string;
  onReplaceImage: (block: ImageBlock, f: File) => Promise<void>;
  onDeleted: () => void;
  onGoSettings: () => void;
  onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const update = (patch: Partial<Block>) => dispatch({ type: "update", id: block.id, patch });
  const meta = BLOCK_META[block.type];
  return (
    <div className="space-y-6">
      {block.type === "text" && <TextFields block={block} update={update} against={against} />}
      {block.type === "image" && <ImageFields block={block} src={imageSrc} update={update} onReplace={(f) => onReplaceImage(block, f)} />}
      {block.type === "invitation" && <InvitationFields event={event} onChanged={onChanged} />}
      {block.type === "featured" && (
        <>
          <FeaturedLayoutPicker value={block.layout} onChange={(layout) => update({ layout })} />
          <FeaturedFields event={event} onChanged={onChanged} />
        </>
      )}
      {block.type === "details" && (
        <>
          <div className="space-y-3">
            <p className="text-muted-fg">התאריך, השעה, שם המקום והכתובת עצמם נלקחים מההגדרות. כאן בוחרים אילו חלקים יופיעו ואיך ייקראו הכותרות.</p>
            <Button variant="outline" icon={<Settings className="size-4" aria-hidden />} onClick={onGoSettings}>
              עריכת הפרטים בהגדרות
            </Button>
          </div>
          <DetailsFields event={event} block={block} update={update} />
        </>
      )}
      {block.type === "live" && (
        <>
          <p className="text-muted-fg">התמונות האחרונות שהועלו לאלבום מתעדכנות כאן מעצמן, ומתחתן שני הכרטיסים הגדולים: צפייה בתמונות והעלאת תמונות.</p>
          <LiveFields block={block} update={update} />
        </>
      )}

      <div className="flex flex-wrap gap-3 border-t border-border pt-5">
        <Button
          variant="outline"
          icon={block.hidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
          onClick={() => update({ hidden: !block.hidden })}
        >
          {block.hidden ? "להציג לאורחים" : "להסתיר מהאורחים"}
        </Button>
        <Button variant="ghost" className="text-destructive" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirm(true)}>
          הסרה מהעמוד
        </Button>
      </div>

      <ConfirmDialog
        open={confirm}
        title={`להסיר את "${meta.label}" מהעמוד?`}
        message={
          <p>
            {block.type === "text" || block.type === "image"
              ? "התוכן של הבלוק יימחק כשתשמרו את העיצוב."
              : "התוכן עצמו לא נמחק - אפשר להחזיר את הבלוק בכל רגע דרך \"הוספת אלמנט\"."}
          </p>
        }
        confirmLabel="הסרה"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          dispatch({ type: "remove", id: block.id });
          onDeleted();
        }}
      />
    </div>
  );
}

function TextFields({ block, update, against }: { block: TextBlock; update: (p: Partial<TextBlock>) => void; against: string }) {
  return (
    <>
      <Field label="כותרת" htmlFor={`t-h-${block.id}`}>
        <input id={`t-h-${block.id}`} className={inputClass} value={block.heading} maxLength={80} onChange={(e) => update({ heading: e.target.value })} placeholder="למשל: הסיפור שלנו" />
      </Field>
      <Field label="טקסט" htmlFor={`t-b-${block.id}`} hint={`${block.body.length}/1000`}>
        <textarea id={`t-b-${block.id}`} className={cx(inputClass, "min-h-32 py-3")} value={block.body} maxLength={1000} onChange={(e) => update({ body: e.target.value })} />
      </Field>
      <div className="flex flex-wrap gap-x-6 gap-y-4">
        <div className="space-y-2">
          <p className="font-semibold">יישור</p>
          <Segmented label="יישור" value={block.align} onChange={(v) => update({ align: v })} options={[{ value: "center", label: "למרכז" }, { value: "start", label: "לימין" }]} />
        </div>
        <div className="space-y-2">
          <p className="font-semibold">גודל</p>
          <Segmented label="גודל הטקסט" value={block.size} onChange={(v) => update({ size: v })} options={[{ value: "sm", label: "קטן" }, { value: "md", label: "בינוני" }, { value: "lg", label: "גדול" }]} />
        </div>
      </div>
      <Toggle checked={block.card} onChange={(v) => update({ card: v })} label="על רקע כרטיס" hint="משפר את הקריאות מעל תמונת רקע" />
      <ColorField label="צבע הטקסט" value={block.color} onChange={(c) => update({ color: c })} against={against} />
    </>
  );
}

function ImageFields({ block, src, update, onReplace }: { block: ImageBlock; src: string | null; update: (p: Partial<ImageBlock>) => void; onReplace: (f: File) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative size-28 overflow-hidden rounded-2xl border border-border bg-muted">
          {src && <img src={src} alt="" className="size-full object-cover" />}
          {busy && <Spinner label="מעלה…" className="absolute inset-0 bg-card/70" />}
        </div>
        <Button variant="outline" icon={<ImageUp className="size-4" aria-hidden />} disabled={busy} onClick={() => input.current?.click()}>
          החלפת התמונה
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            await onReplace(f);
            setBusy(false);
          }}
        />
      </div>
      <Field label="כיתוב (לא חובה)" htmlFor={`i-c-${block.id}`} hint="מוצג מתחת לתמונה ומשמש גם כתיאור לקוראי מסך">
        <input id={`i-c-${block.id}`} className={inputClass} value={block.caption} maxLength={160} onChange={(e) => update({ caption: e.target.value })} />
      </Field>
      <div className="space-y-2">
        <p className="font-semibold">צורה</p>
        <Segmented label="צורת התמונה" value={block.shape} onChange={(v) => update({ shape: v })} options={[{ value: "card", label: "כרטיס" }, { value: "wide", label: "רחבה" }, { value: "round", label: "עיגול" }]} />
      </div>
    </>
  );
}

function InvitationFields({ event, onChanged }: { event: ManageEvent; onChanged: () => void }) {
  const a = useAssetActions(event, onChanged);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative h-36 w-28 overflow-hidden rounded-xl border border-border bg-muted">
        {a.invitationSrc && <img src={a.invitationSrc} alt="ההזמנה" className="size-full object-cover" />}
        {busy && <Spinner label="מעלה…" className="absolute inset-0 bg-card/70" />}
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="outline" icon={<ImageUp className="size-4" aria-hidden />} disabled={busy} onClick={() => input.current?.click()}>
          {a.invitationSrc ? "החלפת ההזמנה" : "העלאת תמונת ההזמנה"}
        </Button>
        {a.invitationSrc && (
          <Button variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={a.clearInvitation}>
            הסרת התמונה
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          await a.setInvitation(f);
          setBusy(false);
        }}
      />
    </div>
  );
}

const LAYOUTS: { value: FeaturedLayout; label: string; hint: string; Icon: LucideIcon }[] = [
  { value: "grid", label: "עומדות", hint: "אלבום מפוזר, כל תמונה נכנסת בגלילה", Icon: LayoutGrid },
  { value: "stack", label: "ערמה לדפדוף", hint: "ערמת תמונות, מחליקים או מקישים לבאה", Icon: Layers },
  { value: "carousel", label: "קרוסלה", hint: "תמונה אחת במרכז, גוללים הצידה", Icon: GalleryHorizontal },
  { value: "floating", label: "מרחפות", hint: "תמונות שמרחפות בעדינות במקום", Icon: Wind },
];

/** How the featured photos are shown (part of the design draft - visible in the preview right away). */
function FeaturedLayoutPicker({ value, onChange }: { value: FeaturedBlock["layout"]; onChange: (v: FeaturedLayout) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 font-semibold">סגנון התצוגה</legend>
      <div role="radiogroup" aria-label="סגנון התצוגה של התמונות המייצגות" className="grid gap-2 sm:grid-cols-2">
        {LAYOUTS.map(({ value: v, label, hint, Icon }) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cx(
              "flex min-h-16 items-center gap-3 rounded-xl border-2 px-3 py-2 text-start transition-colors duration-200",
              value === v ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
            )}
          >
            <span className={cx("flex size-10 shrink-0 items-center justify-center rounded-lg", value === v ? "bg-primary text-on-primary" : "bg-fg/5 text-fg")}>
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{label}</span>
              <span className="block text-sm text-muted-fg">{hint}</span>
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function FeaturedFields({ event, onChanged }: { event: ManageEvent; onChanged: () => void }) {
  const a = useAssetActions(event, onChanged);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const free = MAX_FEATURED - a.featuredSlots.length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-fg">עד {MAX_FEATURED} תמונות. השינויים בתמונות נשמרים מיד.</p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {a.featuredSlots.map((f) => (
          <li key={f.slot} className="relative">
            <img src={f.src} alt="" className="aspect-[4/5] w-full rounded-xl object-cover" />
            <button
              type="button"
              onClick={() => a.removeFeatured(f.slot)}
              aria-label="הסרת התמונה"
              className="absolute end-1 top-1 inline-flex size-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
        {free > 0 && (
          <li>
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-muted-fg hover:border-primary/50"
            >
              {busy ? <Spinner label="מעלה…" /> : <ImagePlus className="size-6" aria-hidden />}
              {!busy && "הוספה"}
            </button>
          </li>
        )}
      </ul>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])].slice(0, free);
          e.target.value = "";
          if (!files.length) return;
          setBusy(true);
          await a.addFeatured(files);
          setBusy(false);
        }}
      />
    </div>
  );
}
