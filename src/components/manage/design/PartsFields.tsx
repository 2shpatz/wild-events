import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { LocateFixed, Pencil, RotateCcw } from "lucide-react";
import {
  DETAILS_SHARE_NO_ADDRESS,
  DETAILS_TEXTS,
  LIVE_TEXTS,
  PART_TEXT_MAX,
  type DetailsBlock,
  type DetailsPart,
  type DetailsText,
  type LiveBlock,
  type LivePart,
  type LiveText,
} from "../../../../shared/design";
import type { ManageEvent } from "../../../../shared/types";
import { Field, cx, inputClass } from "../../ui";
import { Switch } from "../Toggle";

type TextKey = keyof typeof PART_TEXT_MAX;

/** Highlights a part of the selected element in the preview (provided by the design editor). */
export const PartFocusContext = createContext<((part: string) => void) | null>(null);

/**
 * One part of the page: its name (and a hint), then - when the part has texts - a pencil button right next to the
 * show / hide switch that opens them for editing (closed by default to keep the list short).
 * Tapping the name only points the part out in the preview; hiding / showing is the switch's job.
 */
export function PartCard({
  label,
  hint,
  part,
  checked,
  onChange,
  children,
}: {
  label: string;
  hint?: string;
  /** the part's key on the guest page (data-part), for highlighting it in the preview */
  part?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const focusPart = useContext(PartFocusContext);
  const name = (
    <>
      <span className="flex items-center gap-1.5 font-semibold">
        {label}
        {!checked && <span className="rounded-full bg-muted px-2 text-xs font-semibold text-muted-fg">מוסתר</span>}
      </span>
      {hint && <span className="block text-sm text-muted-fg">{hint}</span>}
    </>
  );
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-1 sm:px-4">
      <div className="flex min-h-12 items-center gap-2">
        {focusPart && part ? (
          <button
            type="button"
            onClick={() => focusPart(part)}
            title={checked ? "הצגה בתצוגה המקדימה" : "החלק מוסתר - הדליקו את המתג כדי שיופיע"}
            className="group min-w-0 flex-1 rounded-lg py-1.5 text-start"
          >
            <span className="flex items-start gap-2">
              <span className="min-w-0 flex-1">{name}</span>
              {checked && <LocateFixed className="mt-1 size-4 shrink-0 text-muted-fg transition-colors group-hover:text-primary" aria-hidden />}
            </span>
          </button>
        ) : (
          <div className="min-w-0 flex-1 py-1.5">{name}</div>
        )}
        {children && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panel}
            aria-label={`עריכת הטקסט של ${label}`}
            title="עריכה"
            className={cx(
              "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
              open ? "bg-primary text-on-primary" : "bg-primary/10 text-primary hover:bg-primary/20",
            )}
          >
            <Pencil className="size-5" aria-hidden />
          </button>
        )}
        <Switch checked={checked} onChange={onChange} label={label} />
      </div>
      {children && open && (
        <div id={panel} className="space-y-4 border-t border-border pb-4 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}

/** A rewritable text: prefilled with the default; cleared or reset = the default again. */
export function PartText({ id, label, value, fallback, max, onChange }: { id: string; label: string; value: string | null; fallback: string; max: number; onChange: (v: string | null) => void }) {
  const custom = value !== null && value.trim() !== "" && value.trim() !== fallback;
  return (
    <div className="space-y-1.5">
      <Field label={label} htmlFor={id}>
        <input id={id} className={inputClass} value={value ?? fallback} maxLength={max} placeholder={fallback} onChange={(e) => onChange(e.target.value)} />
      </Field>
      {custom && (
        <button type="button" onClick={() => onChange(null)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-primary/10">
          <RotateCcw className="size-4" aria-hidden />
          החזרת הטקסט המקורי ({fallback})
        </button>
      )}
    </div>
  );
}

export function DetailsFields({ event, block, update }: { event: ManageEvent; block: DetailsBlock; update: (p: Partial<DetailsBlock>) => void }) {
  const show = (k: DetailsPart) => (v: boolean) => update({ show: { ...block.show, [k]: v } });
  const text = (k: DetailsText) => (v: string | null) => update({ texts: { ...block.texts, [k]: v } });
  const hasAddress = !!(event.venueName || event.venueAddress);
  const field = (k: DetailsText, label: string, fallback: string = DETAILS_TEXTS[k]) => (
    <PartText id={`${block.id}-${k}`} label={label} value={block.texts[k]} fallback={fallback} max={PART_TEXT_MAX[k as TextKey]} onChange={text(k)} />
  );
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 font-semibold">מה מופיע בפרטי האירוע</legend>
      <PartCard label="כותרת" part="title" checked={block.show.title} onChange={show("title")}>
        {field("title", "טקסט הכותרת")}
      </PartCard>
      <PartCard label="מתי" part="when" hint="התאריך, השעה והספירה לאחור" checked={block.show.when} onChange={show("when")} />
      <PartCard label="איפה" part="where" hint="שם המקום והכתובת" checked={block.show.where} onChange={show("where")} />
      <PartCard label="איך מגיעים" part="nav" hint={hasAddress ? "כפתורי Waze ו-Google Maps" : "יופיע רק אחרי שתוסיפו כתובת או שם מקום"} checked={block.show.nav} onChange={show("nav")}>
        {field("nav", "כותרת החלק")}
      </PartCard>
      <PartCard label="שיתוף" part="share" hint="וואטסאפ ושיתוף הפרטים" checked={block.show.share} onChange={show("share")}>
        {field("share", "כותרת החלק", hasAddress ? DETAILS_TEXTS.share : DETAILS_SHARE_NO_ADDRESS)}
      </PartCard>
      <PartCard label="הוספה ליומן" part="calendar" hint="מופיע כשיש תאריך שעוד לא עבר" checked={block.show.calendar} onChange={show("calendar")}>
        {field("calendar", "כותרת החלק")}
      </PartCard>
    </fieldset>
  );
}

export function LiveFields({ block, update }: { block: LiveBlock; update: (p: Partial<LiveBlock>) => void }) {
  const show = (k: LivePart) => (v: boolean) => update({ show: { ...block.show, [k]: v } });
  const text = (k: LiveText) => (v: string | null) => update({ texts: { ...block.texts, [k]: v } });
  const field = (k: LiveText, label: string) => (
    <PartText id={`${block.id}-${k}`} label={label} value={block.texts[k]} fallback={LIVE_TEXTS[k]} max={PART_TEXT_MAX[k as TextKey]} onChange={text(k)} />
  );
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 font-semibold">מה מופיע באלבום בזמן אמת</legend>
      <PartCard label="כותרת" part="title" checked={block.show.title} onChange={show("title")}>
        {field("title", "טקסט הכותרת")}
      </PartCard>
      <PartCard label="מונה התמונות" part="count" hint={'למשל "120 תמונות וסרטונים עד עכשיו" - מתעדכן מעצמו'} checked={block.show.count} onChange={show("count")} />
      <PartCard label="התמונות האחרונות" part="strip" hint="מתעדכנות מעצמן כל חצי דקה" checked={block.show.strip} onChange={show("strip")}>
        <p className="text-sm text-muted-fg">כשהאלבום עוד ריק מופיע במקומן כרטיס:</p>
        {field("emptyTitle", "כותרת הכרטיס")}
        {field("emptyText", "טקסט הכרטיס")}
      </PartCard>
      <PartCard label="כרטיס הצפייה בתמונות" part="view" checked={block.show.view} onChange={show("view")}>
        {field("viewTitle", "כותרת הכרטיס")}
        {field("viewText", "טקסט הכרטיס")}
      </PartCard>
      <PartCard label="כרטיס ההעלאה" part="upload" hint="כשההעלאות סגורות מופיעה במקומו הודעה קבועה" checked={block.show.upload} onChange={show("upload")}>
        {field("uploadTitle", "כותרת הכרטיס")}
        {field("uploadText", "טקסט הכרטיס")}
      </PartCard>
      {!block.show.view && !block.show.upload && (
        <p role="status" className="rounded-xl bg-accent/15 px-4 py-3 text-sm">
          שני הכרטיסים מוסתרים - האורחים יגיעו לצפייה ולהעלאה רק מהסרגל שמופיע בזמן הגלילה.
        </p>
      )}
    </fieldset>
  );
}
