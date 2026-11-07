import { ChevronDown, ChevronUp, EyeOff, LayoutTemplate, Plus } from "lucide-react";
import type { Block, EventDesign } from "../../../../shared/design";
import { cx } from "../../ui";
import { BLOCK_META, blockSummary } from "./blockMeta";
import { flatBlocks, type DraftAction, type Where } from "./draft";

/**
 * The page's structure: blocks before the main page, the main page itself (fixed), blocks after it.
 * Reordering uses Move up / Move down buttons (no drag-only interaction).
 */
export function StructureList({
  design,
  selected,
  onSelect,
  dispatch,
  onAdd,
}: {
  design: EventDesign;
  selected: string | null;
  onSelect: (id: string) => void;
  dispatch: (a: DraftAction) => void;
  onAdd: (where: Where) => void;
}) {
  const flat = flatBlocks(design);
  const first = flat[0]?.block.id;
  const last = flat[flat.length - 1]?.block.id;
  const row = (b: Block) => (
    <BlockRow
      key={b.id}
      block={b}
      active={selected === b.id}
      onSelect={() => onSelect(b.id)}
      onUp={b.id === first ? undefined : () => dispatch({ type: "move", id: b.id, dir: -1 })}
      onDown={b.id === last ? undefined : () => dispatch({ type: "move", id: b.id, dir: 1 })}
    />
  );
  return (
    <div className="space-y-2">
      <Section title="לפני העמוד הראשי" empty={!design.before.length} onAdd={() => onAdd("before")}>
        {design.before.map(row)}
      </Section>

      <button
        type="button"
        onClick={() => onSelect("hero")}
        aria-pressed={selected === "hero"}
        className={cx(
          "flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-4 text-start transition-colors duration-200",
          selected === "hero" ? "border-primary bg-primary/10" : "border-primary/40 bg-primary/5 hover:border-primary",
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary">
          <LayoutTemplate className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">העמוד הראשי</span>
          <span className="block truncate text-sm text-muted-fg">כותרת, תאריך, מקום וברכה · קבוע במקומו</span>
        </span>
      </button>

      <Section title="אחרי העמוד הראשי" empty={!design.after.length} onAdd={() => onAdd("after")}>
        {design.after.map(row)}
      </Section>
    </div>
  );
}

function Section({ title, empty, onAdd, children }: { title: string; empty: boolean; onAdd: () => void; children: React.ReactNode }) {
  return (
    <section className="space-y-2 py-1" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-muted-fg">{title}</h3>
        <button type="button" onClick={onAdd} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-primary hover:bg-primary/10">
          <Plus className="size-4" aria-hidden />
          הוספת אלמנט
        </button>
      </div>
      {empty ? <p className="rounded-xl border border-dashed border-border px-4 py-3 text-center text-sm text-muted-fg">אין כאן אלמנטים</p> : <ul className="space-y-2">{children}</ul>}
    </section>
  );
}

function BlockRow({ block, active, onSelect, onUp, onDown }: { block: Block; active: boolean; onSelect: () => void; onUp?: () => void; onDown?: () => void }) {
  const { Icon, label } = BLOCK_META[block.type];
  const summary = blockSummary(block);
  const arrow = "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg transition-colors duration-200 hover:bg-fg/5 disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <li className={cx("flex items-center gap-1 rounded-2xl border-2 bg-card pe-1 transition-colors duration-200", active ? "border-primary" : "border-border")}>
      <button type="button" onClick={onSelect} aria-pressed={active} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl ps-3 text-start">
        <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-lg", active ? "bg-primary text-on-primary" : "bg-muted text-fg")}>
          <Icon className="size-5" aria-hidden />
        </span>
        <span className={cx("min-w-0 flex-1", block.hidden && "opacity-60")}>
          <span className="flex items-center gap-1.5 font-semibold">
            {label}
            {block.hidden && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 text-xs font-semibold text-muted-fg">
                <EyeOff className="size-3" aria-hidden />
                מוסתר
              </span>
            )}
          </span>
          {summary && <span className="block truncate text-sm text-muted-fg">{summary}</span>}
        </span>
      </button>
      <button type="button" className={arrow} onClick={onUp} disabled={!onUp} aria-label={`הזזת ${label} למעלה`}>
        <ChevronUp className="size-5" aria-hidden />
      </button>
      <button type="button" className={arrow} onClick={onDown} disabled={!onDown} aria-label={`הזזת ${label} למטה`}>
        <ChevronDown className="size-5" aria-hidden />
      </button>
    </li>
  );
}
