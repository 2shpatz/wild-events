import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronUp, EyeOff, GripVertical, LayoutTemplate, Plus } from "lucide-react";
import type { Block, EventDesign } from "../../../../shared/design";
import { cx } from "../../ui";
import { BLOCK_META, blockSummary } from "./blockMeta";
import { flatBlocks, type DraftAction, type Where } from "./draft";
import { Switch } from "../Toggle";

/** One row the dragged block can land next to (page coordinates, measured when the drag starts). */
type Spot = { id: string | null; top: number; bottom: number; mid: number };
type Drag = { id: string; startY: number; startScroll: number; dy: number; slot: number; spots: Spot[]; boxTop: number };

/**
 * The page's structure: blocks before the main page, the main page itself (fixed), blocks after it.
 * Reorder by dragging the handle (mouse or finger), or with the Move up / Move down buttons (no drag-only interaction).
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
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const flat = flatBlocks(design);
  const first = flat[0]?.block.id;
  const last = flat[flat.length - 1]?.block.id;

  /** Where the block would land: the number of rows (the main page included) above the pointer. */
  const slotAt = (spots: Spot[], pageY: number) => spots.filter((s) => s.mid < pageY).length;

  const start = (id: string, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !box.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const spots = [...box.current.querySelectorAll<HTMLElement>("[data-drag-spot]")]
      .filter((el) => el.dataset.dragSpot !== id)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.dataset.dragSpot === "hero" ? null : el.dataset.dragSpot!, top: r.top + scrollY, bottom: r.bottom + scrollY, mid: r.top + scrollY + r.height / 2 };
      });
    setDrag({ id, startY: e.clientY, startScroll: scrollY, dy: 0, slot: slotAt(spots, e.clientY + scrollY), spots, boxTop: box.current.getBoundingClientRect().top + scrollY });
  };

  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    // Near the screen edges the page scrolls along, so long lists can be crossed on a phone.
    if (e.clientY < 80) scrollBy(0, -14);
    else if (e.clientY > innerHeight - 80) scrollBy(0, 14);
    setDrag({ ...drag, dy: e.clientY - drag.startY + (scrollY - drag.startScroll), slot: slotAt(drag.spots, e.clientY + scrollY) });
  };

  const end = () => {
    if (!drag) return;
    const hero = drag.spots.findIndex((s) => s.id === null);
    const where: Where = drag.slot <= hero ? "before" : "after";
    dispatch({ type: "place", id: drag.id, where, index: where === "before" ? drag.slot : drag.slot - hero - 1 });
    setDrag(null);
  };

  // The drop line: under the row above the landing spot (or above the first row).
  const line = drag
    ? (drag.slot === 0 ? drag.spots[0].top - 6 : drag.spots[drag.slot - 1].bottom + 3) - drag.boxTop
    : null;

  const row = (b: Block) => (
    <BlockRow
      key={b.id}
      block={b}
      active={selected === b.id}
      dragging={drag?.id === b.id ? drag.dy : null}
      onSelect={() => onSelect(b.id)}
      onShown={(v) => dispatch({ type: "update", id: b.id, patch: { hidden: !v } })}
      onUp={b.id === first ? undefined : () => dispatch({ type: "move", id: b.id, dir: -1 })}
      onDown={b.id === last ? undefined : () => dispatch({ type: "move", id: b.id, dir: 1 })}
      handle={{
        onPointerDown: (e) => start(b.id, e),
        onPointerMove: move,
        onPointerUp: end,
        onPointerCancel: () => setDrag(null),
      }}
    />
  );
  return (
    <div ref={box} className={cx("relative space-y-2", drag && "select-none")}>
      <Section title="לפני העמוד הראשי" empty={!design.before.length} onAdd={() => onAdd("before")}>
        {design.before.map(row)}
      </Section>

      <button
        type="button"
        data-drag-spot="hero"
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

      {line !== null && <div className="pointer-events-none absolute inset-x-2 z-20 h-1 rounded-full bg-primary shadow-[0_0_0_3px_rgb(255_255_255/0.8)]" style={{ top: line }} aria-hidden />}
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

type HandleEvents = Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel">;

function BlockRow({
  block,
  active,
  dragging,
  onSelect,
  onShown,
  onUp,
  onDown,
  handle,
}: {
  block: Block;
  active: boolean;
  /** vertical offset while this row is being dragged, else null */
  dragging: number | null;
  onSelect: () => void;
  /** show (true) / hide (false) the element for guests */
  onShown: (v: boolean) => void;
  onUp?: () => void;
  onDown?: () => void;
  handle: HandleEvents;
}) {
  const { Icon, label } = BLOCK_META[block.type];
  const summary = blockSummary(block);
  const arrow = "inline-flex size-11 max-sm:w-9 shrink-0 items-center justify-center rounded-full text-fg transition-colors duration-200 hover:bg-fg/5 disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <li
      data-drag-spot={block.id}
      className={cx(
        "relative flex items-center gap-1 rounded-2xl border-2 bg-card pe-1 transition-[border-color,box-shadow] duration-200",
        active ? "border-primary" : "border-border",
        dragging !== null && "z-10 shadow-lift",
      )}
      style={dragging !== null ? { transform: `translateY(${dragging}px)` } : undefined}
    >
      <button
        type="button"
        aria-label={`גרירה לשינוי המיקום של ${label}`}
        title="גרירה לשינוי הסדר"
        className={cx("inline-flex h-14 w-9 shrink-0 touch-none items-center justify-center rounded-s-2xl text-muted-fg hover:text-fg", dragging !== null ? "cursor-grabbing" : "cursor-grab")}
        onKeyDown={(e) => {
          // Keyboard users move with the arrow keys on the handle (same as the Move up / down buttons).
          if (e.key === "ArrowUp" && onUp) (e.preventDefault(), onUp());
          if (e.key === "ArrowDown" && onDown) (e.preventDefault(), onDown());
        }}
        {...handle}
      >
        <GripVertical className="size-5" aria-hidden />
      </button>
      <button type="button" onClick={onSelect} aria-pressed={active} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl text-start">
        {/* Phones: no icon, so the name fits on one line next to the switch and the arrows. */}
        <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-lg max-sm:hidden", active ? "bg-primary text-on-primary" : "bg-muted text-fg")}>
          <Icon className="size-5" aria-hidden />
        </span>
        <span className={cx("min-w-0 flex-1", block.hidden && "opacity-60")}>
          <span className="flex min-w-0 items-center gap-1.5 font-semibold">
            <span className="truncate">{label}</span>
            {block.hidden && (
              // Phones: the switch shows it (no room for the tag there).
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 text-xs font-semibold text-muted-fg max-sm:hidden">
                <EyeOff className="size-3" aria-hidden />
                מוסתר
              </span>
            )}
          </span>
          {summary && <span className="block truncate text-sm text-muted-fg">{summary}</span>}
        </span>
      </button>
      <span title={block.hidden ? "מוסתר מהאורחים - הדליקו כדי להציג" : "מוצג לאורחים"}>
        <Switch checked={!block.hidden} onChange={onShown} label={`${label} מוצג לאורחים`} />
      </span>
      <button type="button" className={arrow} onClick={onUp} disabled={!onUp} aria-label={`הזזת ${label} למעלה`}>
        <ChevronUp className="size-5" aria-hidden />
      </button>
      <button type="button" className={arrow} onClick={onDown} disabled={!onDown} aria-label={`הזזת ${label} למטה`}>
        <ChevronDown className="size-5" aria-hidden />
      </button>
    </li>
  );
}
