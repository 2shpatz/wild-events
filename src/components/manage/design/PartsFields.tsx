import { useId, useState, type ReactNode } from "react";
import { Pencil, RotateCcw } from "lucide-react";
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
import { Toggle } from "../Toggle";

type TextKey = keyof typeof PART_TEXT_MAX;

/**
 * One part of the page: a show / hide switch, and - when the part has texts - a pencil button
 * that opens them for editing (closed by default to keep the list short).
 */
export function PartCard({ label, hint, checked, onChange, children }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-1 sm:px-4">
      <div className="flex items-center gap-2">
        {children && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panel}
            aria-label={`עריכת הטקסט של ${label}`}
            title="עריכת הטקסט"
            className={cx(
              "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
              open ? "bg-primary text-on-primary" : "bg-primary/10 text-primary hover:bg-primary/20",
            )}
          >
            <Pencil className="size-5" aria-hidden />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <Toggle checked={checked} onChange={onChange} label={label} hint={hint} />
        </div>
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
function PartText({ id, label, value, fallback, max, onChange }: { id: string; label: string; value: string | null; fallback: string; max: number; onChange: (v: string | null) => void }) {
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
      <PartCard label="כותרת" checked={block.show.title} onChange={show("title")}>
        {field("title", "טקסט הכותרת")}
      </PartCard>
      <PartCard label="מתי" hint="התאריך, השעה והספירה לאחור" checked={block.show.when} onChange={show("when")} />
      <PartCard label="איפה" hint="שם המקום והכתובת" checked={block.show.where} onChange={show("where")} />
      <PartCard label="איך מגיעים" hint={hasAddress ? "כפתורי Waze ו-Google Maps" : "יופיע רק אחרי שתוסיפו כתובת או שם מקום"} checked={block.show.nav} onChange={show("nav")}>
        {field("nav", "כותרת החלק")}
      </PartCard>
      <PartCard label="שיתוף" hint="וואטסאפ ושיתוף הפרטים" checked={block.show.share} onChange={show("share")}>
        {field("share", "כותרת החלק", hasAddress ? DETAILS_TEXTS.share : DETAILS_SHARE_NO_ADDRESS)}
      </PartCard>
      <PartCard label="הוספה ליומן" hint="מופיע כשיש תאריך שעוד לא עבר" checked={block.show.calendar} onChange={show("calendar")}>
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
      <PartCard label="כותרת" checked={block.show.title} onChange={show("title")}>
        {field("title", "טקסט הכותרת")}
      </PartCard>
      <PartCard label="מונה התמונות" hint={'למשל "120 תמונות וסרטונים עד עכשיו" - מתעדכן מעצמו'} checked={block.show.count} onChange={show("count")} />
      <PartCard label="התמונות האחרונות" hint="מתעדכנות מעצמן כל חצי דקה" checked={block.show.strip} onChange={show("strip")}>
        <p className="text-sm text-muted-fg">כשהאלבום עוד ריק מופיע במקומן כרטיס:</p>
        {field("emptyTitle", "כותרת הכרטיס")}
        {field("emptyText", "טקסט הכרטיס")}
      </PartCard>
      <PartCard label="כרטיס הצפייה בתמונות" checked={block.show.view} onChange={show("view")}>
        {field("viewTitle", "כותרת הכרטיס")}
        {field("viewText", "טקסט הכרטיס")}
      </PartCard>
      <PartCard label="כרטיס ההעלאה" hint="כשההעלאות סגורות מופיעה במקומו הודעה קבועה" checked={block.show.upload} onChange={show("upload")}>
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
