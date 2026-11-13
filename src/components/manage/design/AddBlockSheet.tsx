import type { BlockType, EventDesign } from "../../../../shared/design";
import { MAX_BLOCKS, SINGLETONS, type SingletonType } from "../../../../shared/design";
import { Modal, cx } from "../../ui";
import { BLOCK_META } from "./blockMeta";
import type { Where } from "./draft";

const ORDER: BlockType[] = ["text", "image", "details", "featured", "invitation", "live", "whatsapp", "messages", "checklist", "findTable"];

/** Choose an element to add before / after the main page. Elements that can appear once are disabled when used. */
export function AddBlockSheet({
  open,
  where,
  design,
  onClose,
  onPick,
}: {
  open: boolean;
  where: Where;
  design: EventDesign;
  onClose: () => void;
  onPick: (type: BlockType) => void;
}) {
  const all = [...design.before, ...design.after];
  const full = all.length >= MAX_BLOCKS;
  return (
    <Modal open={open} onClose={onClose} title={where === "before" ? "הוספת אלמנט לפני העמוד הראשי" : "הוספת אלמנט אחרי העמוד הראשי"} size="lg">
      {full && <p className="mb-4 font-semibold text-destructive">הגעתם למספר האלמנטים המרבי ({MAX_BLOCKS}).</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {ORDER.map((t) => {
          const used = (SINGLETONS.includes(t as SingletonType) || t === "findTable") && all.some((b) => b.type === t);
          const { Icon, label, hint } = BLOCK_META[t];
          return (
            <li key={t}>
              <button
                type="button"
                disabled={used || full}
                onClick={() => onPick(t)}
                className={cx(
                  "flex h-full min-h-20 w-full items-start gap-3 rounded-2xl border-2 border-border p-4 text-start transition-colors duration-200",
                  "enabled:hover:border-primary enabled:hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-6" aria-hidden />
                </span>
                <span>
                  <span className="block font-bold">{label}</span>
                  <span className="block text-sm text-muted-fg">{used ? "כבר מופיע בעמוד" : hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
