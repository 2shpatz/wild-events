import type { BarsDesign, Block, BlockType, EventDesign, HeroDesign } from "../../../../shared/design";
import { newBlock } from "../../../../shared/design";

export type Where = "before" | "after";

export type DraftAction =
  | { type: "reset"; design: EventDesign }
  | { type: "hero"; patch: Partial<HeroDesign> }
  | { type: "show"; patch: Partial<HeroDesign["show"]> }
  | { type: "pagesFont"; font: string | null }
  | { type: "bars"; which: keyof BarsDesign; patch: Partial<BarsDesign["top"] & BarsDesign["bottom"]> }
  | { type: "add"; block: Block; where: Where }
  | { type: "update"; id: string; patch: Partial<Block> }
  | { type: "move"; id: string; dir: -1 | 1 }
  | { type: "remove"; id: string };

/** Blocks in page order with their section ("before" the main page / "after" it). */
export function flatBlocks(d: EventDesign): { block: Block; where: Where; index: number }[] {
  return [...d.before.map((block, index) => ({ block, where: "before" as const, index })), ...d.after.map((block, index) => ({ block, where: "after" as const, index }))];
}

export function findBlock(d: EventDesign, id: string) {
  return flatBlocks(d).find((x) => x.block.id === id) ?? null;
}

const mapBoth = (d: EventDesign, fn: (list: Block[], where: Where) => Block[]): EventDesign => ({ ...d, before: fn(d.before, "before"), after: fn(d.after, "after") });

export function draftReducer(d: EventDesign, a: DraftAction): EventDesign {
  switch (a.type) {
    case "reset":
      return a.design;
    case "hero":
      return { ...d, hero: { ...d.hero, ...a.patch } };
    case "show":
      return { ...d, hero: { ...d.hero, show: { ...d.hero.show, ...a.patch } } };
    case "pagesFont":
      return { ...d, pagesFont: a.font };
    case "bars":
      return { ...d, bars: { ...d.bars, [a.which]: { ...d.bars[a.which], ...a.patch } } };
    case "add":
      return { ...d, [a.where]: [...d[a.where], a.block] };
    case "update":
      return mapBoth(d, (list) => list.map((b) => (b.id === a.id ? ({ ...b, ...a.patch } as Block) : b)));
    case "remove":
      return mapBoth(d, (list) => list.filter((b) => b.id !== a.id));
    case "move": {
      const hit = findBlock(d, a.id);
      if (!hit) return d;
      const before = [...d.before];
      const after = [...d.after];
      const list = hit.where === "before" ? before : after;
      const to = hit.index + a.dir;
      if (to >= 0 && to < list.length) {
        [list[hit.index], list[to]] = [list[to], list[hit.index]];
      } else if (hit.where === "before" && a.dir === 1) {
        // last block before the main page → first block after it
        before.splice(hit.index, 1);
        after.unshift(hit.block);
      } else if (hit.where === "after" && a.dir === -1) {
        // first block after the main page → last block before it
        after.splice(hit.index, 1);
        before.push(hit.block);
      } else return d;
      return { ...d, before, after };
    }
  }
}

export { newBlock };
export type { BlockType };

export const designKey = (d: EventDesign) => JSON.stringify(d);
