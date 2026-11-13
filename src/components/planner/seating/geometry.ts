/** Pure geometry of the floor plan: chair positions around each table shape, bounds, layout of new tables. */
import { ELEMENT_SIZES, nextTableNumber, newId, tableSize, type ElementKind, type FloorItem, type FloorPlan, type TableShape } from "../../../../shared/guests";

export const CHAIR_R = 11;
const GAP = 8;

export type Pt = { x: number; y: number };

/** Chair centers relative to the table center (before rotation). */
export function chairPositions(it: Pick<FloorItem, "shape" | "w" | "h" | "seats">): Pt[] {
  const n = Math.max(0, it.seats);
  const out: Pt[] = [];
  const rx = it.w / 2 + CHAIR_R + GAP;
  const ry = it.h / 2 + CHAIR_R + GAP;
  if (!n) return out;
  if (it.shape === "round" || it.shape === "oval") {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      out.push({ x: Math.cos(a) * rx, y: Math.sin(a) * ry });
    }
    return out;
  }
  if (it.shape === "halfround") {
    // chairs along the curved side (the flat side faces the stage / the wall)
    for (let i = 0; i < n; i++) {
      const a = Math.PI + ((i + 0.5) / n) * Math.PI;
      out.push({ x: Math.cos(a) * rx, y: it.h / 2 + Math.sin(a) * (it.h + CHAIR_R + GAP) });
    }
    return out;
  }
  if (it.shape === "square") {
    // spread over the 4 sides
    const per = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) per[i % 4]++;
    const side = (count: number, k: number) => {
      for (let i = 0; i < count; i++) {
        const t = (i + 1) / (count + 1);
        if (k === 0) out.push({ x: -it.w / 2 + t * it.w, y: -ry });
        if (k === 1) out.push({ x: rx, y: -it.h / 2 + t * it.h });
        if (k === 2) out.push({ x: it.w / 2 - t * it.w, y: ry });
        if (k === 3) out.push({ x: -rx, y: it.h / 2 - t * it.h });
      }
    };
    per.forEach((c, k) => side(c, k));
    return out;
  }
  // rect / knights: two long sides, an odd chair at the head
  const top = Math.ceil(n / 2);
  const bottom = n - top;
  for (let i = 0; i < top; i++) out.push({ x: -it.w / 2 + ((i + 0.5) / top) * it.w, y: -ry });
  for (let i = 0; i < bottom; i++) out.push({ x: it.w / 2 - ((i + 0.5) / bottom) * it.w, y: ry });
  return out;
}

/** Area an item covers (including chairs), for "fit to screen" and placing new things. */
export function itemBounds(it: FloorItem) {
  const pad = it.kind === "table" ? CHAIR_R * 2 + GAP : 0;
  const rot = (it.rot * Math.PI) / 180;
  const ex = it.rot % 180 === 0 ? it.w / 2 + pad : it.rot % 90 === 0 ? it.h / 2 + pad : Math.abs(Math.cos(rot)) * (it.w / 2 + pad) + Math.abs(Math.sin(rot)) * (it.h / 2 + pad);
  const ey = it.rot % 180 === 0 ? it.h / 2 + pad : it.rot % 90 === 0 ? it.w / 2 + pad : Math.abs(Math.sin(rot)) * (it.w / 2 + pad) + Math.abs(Math.cos(rot)) * (it.h / 2 + pad);
  return { x1: it.x - ex, y1: it.y - ey, x2: it.x + ex, y2: it.y + ey };
}

export function planBounds(f: FloorPlan) {
  if (!f.items.length) return { x1: 0, y1: 0, x2: f.w, y2: f.h };
  const b = f.items.map(itemBounds);
  return {
    x1: Math.min(0, ...b.map((x) => x.x1)),
    y1: Math.min(0, ...b.map((x) => x.y1)),
    x2: Math.max(f.w, ...b.map((x) => x.x2)),
    y2: Math.max(f.h, ...b.map((x) => x.y2)),
  };
}

export function newTable(f: FloorPlan, shape: TableShape, seats: number, at?: Pt): FloorItem {
  const size = tableSize(shape, seats);
  return {
    id: newId(),
    kind: "table",
    shape,
    x: at?.x ?? f.w / 2,
    y: at?.y ?? f.h / 2,
    ...size,
    rot: 0,
    seats,
    label: String(nextTableNumber(f)),
    color: null,
    tableKind: "regular",
    audience: "mixed",
    text: "",
    fontSize: 32,
    locked: false,
  };
}

export function newElement(kind: ElementKind, at: Pt, label: string): FloorItem {
  const s = ELEMENT_SIZES[kind];
  return {
    id: newId(),
    kind,
    shape: kind === "pillar" ? "round" : "rect",
    x: at.x,
    y: at.y,
    w: s.w,
    h: s.h,
    rot: 0,
    seats: 0,
    label: kind === "text" ? "" : label,
    color: null,
    tableKind: "regular",
    audience: "mixed",
    text: kind === "text" ? "טקסט" : "",
    fontSize: 40,
    locked: false,
  };
}

/** N tables in rows, below whatever is already on the floor (or from the top-start corner). */
export function tableGrid(f: FloorPlan, count: number, shape: TableShape, seats: number, perRow: number): FloorItem[] {
  const size = tableSize(shape, seats);
  const cellW = size.w + (CHAIR_R + GAP) * 2 + 60;
  const cellH = size.h + (CHAIR_R + GAP) * 2 + 60;
  const used = f.items.length ? planBounds({ ...f, w: 0, h: 0 }) : null;
  const top = used ? used.y2 + 80 : 120;
  // RTL hall: start filling from the right (the start side for Hebrew readers)
  const startX = f.w - 120 - cellW / 2;
  const out: FloorItem[] = [];
  let plan = f;
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / perRow);
    const c = i % perRow;
    const t = newTable(plan, shape, seats, { x: startX - c * cellW, y: top + cellH / 2 + r * cellH });
    out.push(t);
    plan = { ...plan, items: [...plan.items, t] };
  }
  return out;
}

/** Element fill colors (light tints, readable labels on top). */
export const ELEMENT_FILL: Record<ElementKind, string> = {
  dance_floor: "#ede9fe",
  stage: "#fde68a",
  dj: "#c7d2fe",
  bar: "#bae6fd",
  buffet: "#bbf7d0",
  chuppah: "#fce7f3",
  entrance: "#d1fae5",
  exit: "#fee2e2",
  pillar: "#a1a1aa",
  gift_table: "#fef3c7",
  photo_booth: "#e0f2fe",
  kids_corner: "#fef9c3",
  area: "#f4f4f5",
  wall: "#3f3f46",
  text: "transparent",
};
