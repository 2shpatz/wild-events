import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ELEMENT_LABELS, TABLE_KIND_LABELS, tableName, type ElementKind, type FloorItem, type FloorPlan } from "../../../../shared/guests";
import { cx } from "../../ui";
import { CHAIR_R, ELEMENT_FILL, chairPositions, planBounds, type Pt } from "./geometry";

export type Occupant = { id: string; name: string; n: number; color: string };
export interface CanvasHandle {
  fit: () => void;
  zoom: (factor: number) => void;
  /** floor point at the middle of what is on screen (new items go there) */
  center: () => Pt;
  svg: () => SVGSVGElement | null;
}

const GRID = 10;
const snap = (v: number) => Math.round(v / GRID) * GRID;

/**
 * The floor plan: SVG with pan (drag the empty floor), zoom (wheel / pinch / buttons), and items that can be selected,
 * dragged (snapped to a 10cm grid), moved with the arrow keys, and receive families (drop a chip, or tap a table
 * while a family is picked).
 */
export const Canvas = forwardRef<CanvasHandle, {
  floor: FloorPlan;
  occupants: Map<string, Occupant[]>;
  selected: string | null;
  armed: boolean;
  onSelect: (id: string | null) => void;
  onMove: (items: FloorItem[], commit: boolean) => void;
  onTableTap: (id: string) => void;
  onDropHousehold: (householdId: string, tableId: string) => void;
  onDelete: (id: string) => void;
  onRotate: (id: string) => void;
}>(function Canvas({ floor, occupants, selected, armed, onSelect, onMove, onTableTap, onDropHousehold, onDelete, onRotate }, ref) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [measured, setMeasured] = useState(false);
  const [view, setView] = useState<{ x: number; y: number; w: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const items = floor.items;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: Math.max(200, e.contentRect.width), h: Math.max(200, e.contentRect.height) });
      setMeasured(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const b = planBounds(floor);
    const pad = 60;
    const bw = b.x2 - b.x1 + pad * 2;
    const bh = b.y2 - b.y1 + pad * 2;
    const w = Math.max(bw, (bh * size.w) / size.h);
    const h = (w * size.h) / size.w;
    setView({ x: b.x1 - pad - (w - bw) / 2, y: b.y1 - pad - (h - bh) / 2, w });
  }, [floor, size.w, size.h]);
  // first fit once the size is known
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && measured) {
      fitted.current = true;
      fit();
    }
  }, [fit, measured]);

  const v = view ?? { x: 0, y: 0, w: floor.w };
  const vh = (v.w * size.h) / size.w;
  const zoomAt = useCallback(
    (factor: number, at?: Pt) => {
      setView((cur) => {
        const c = cur ?? { x: 0, y: 0, w: floor.w };
        const ch = (c.w * size.h) / size.w;
        const p = at ?? { x: c.x + c.w / 2, y: c.y + ch / 2 };
        const w = Math.min(20000, Math.max(150, c.w / factor));
        const k = w / c.w;
        return { x: p.x - (p.x - c.x) * k, y: p.y - (p.y - c.y) * k, w };
      });
    },
    [floor.w, size.h, size.w],
  );

  useImperativeHandle(ref, () => ({
    fit,
    zoom: (f) => zoomAt(f),
    center: () => ({ x: snap(v.x + v.w / 2), y: snap(v.y + vh / 2) }),
    svg: () => svgRef.current,
  }));

  const toFloor = (cx: number, cy: number): Pt => {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    return { x: v.x + ((cx - r.left) / r.width) * v.w, y: v.y + ((cy - r.top) / r.height) * vh };
  };

  // wheel zoom (non-passive, so the page doesn't scroll)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const at = { x: v.x + ((e.clientX - r.left) / r.width) * v.w, y: v.y + ((e.clientY - r.top) / r.height) * vh };
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, at);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  });

  // ------------------------------------------------ pointer: drag items, pan, pinch
  const pointers = useRef(new Map<number, Pt>());
  const drag = useRef<{ id: string; start: Pt; ox: number; oy: number; moved: boolean } | null>(null);
  const pan = useRef<{ cx: number; cy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const pinch = useRef<{ d: number; w: number } | null>(null);
  const live = useRef<FloorItem[] | null>(null);

  const down = (e: React.PointerEvent, it?: FloorItem) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svgRef.current?.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), w: v.w };
      drag.current = null;
      pan.current = null;
      return;
    }
    if (it) {
      e.stopPropagation();
      if (armed && it.kind === "table") {
        onTableTap(it.id);
        return;
      }
      onSelect(it.id);
      if (!it.locked) drag.current = { id: it.id, start: toFloor(e.clientX, e.clientY), ox: it.x, oy: it.y, moved: false };
    } else pan.current = { cx: e.clientX, cy: e.clientY, vx: v.x, vy: v.y, moved: false };
  };
  const move = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const target = pinch.current.w / (d / pinch.current.d);
      zoomAt(v.w / target, toFloor((a.x + b.x) / 2, (a.y + b.y) / 2));
      return;
    }
    const dr = drag.current;
    if (dr) {
      const p = toFloor(e.clientX, e.clientY);
      const nx = snap(dr.ox + p.x - dr.start.x);
      const ny = snap(dr.oy + p.y - dr.start.y);
      if (!dr.moved && Math.hypot(p.x - dr.start.x, p.y - dr.start.y) < 4) return;
      dr.moved = true;
      const next = items.map((i) => (i.id === dr.id ? { ...i, x: nx, y: ny } : i));
      live.current = next;
      onMove(next, false);
      return;
    }
    const pn = pan.current;
    if (pn) {
      const r = svgRef.current!.getBoundingClientRect();
      const dx = ((e.clientX - pn.cx) / r.width) * v.w;
      const dy = ((e.clientY - pn.cy) / r.height) * vh;
      if (Math.abs(e.clientX - pn.cx) + Math.abs(e.clientY - pn.cy) > 4) pn.moved = true;
      setView({ x: pn.vx - dx, y: pn.vy - dy, w: v.w });
    }
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (drag.current?.moved && live.current) onMove(live.current, true);
    if (pan.current && !pan.current.moved) onSelect(null);
    drag.current = null;
    pan.current = null;
    live.current = null;
  };

  const key = (e: React.KeyboardEvent, it: FloorItem) => {
    const step = e.shiftKey ? 50 : GRID;
    const d: Record<string, Pt> = { ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step }, ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 } };
    if (d[e.key] && !it.locked) {
      e.preventDefault();
      onMove(items.map((i) => (i.id === it.id ? { ...i, x: i.x + d[e.key].x, y: i.y + d[e.key].y } : i)), true);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onDelete(it.id);
    } else if (e.key === "r" || e.key === "R" || e.key === "ר") {
      e.preventDefault();
      onRotate(it.id);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (armed && it.kind === "table") onTableTap(it.id);
      else onSelect(it.id);
    } else if (e.key === "Escape") onSelect(null);
  };

  const ordered = useMemo(() => [...items].sort((a, b) => layer(a) - layer(b)), [items]);

  return (
    <div ref={wrapRef} className="relative h-full min-h-[22rem] w-full overflow-hidden rounded-2xl border border-border bg-muted/60">
      <svg
        ref={svgRef}
        viewBox={`${v.x} ${v.y} ${v.w} ${vh}`}
        className={cx("block h-full w-full touch-none select-none", armed ? "cursor-copy" : "cursor-grab active:cursor-grabbing")}
        onPointerDown={(e) => down(e)}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        role="application"
        aria-label="מפת האולם. גוררים כדי להזיז, גלגלת או צביטה לזום. אפשר לבחור פריט במקלדת עם Tab ולהזיז בחצים."
      >
        <defs>
          <pattern id="floor-grid" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M 100 0 L 0 0 0 100" fill="none" className="stroke-border" strokeWidth="2" />
          </pattern>
        </defs>
        <rect x={0} y={0} width={floor.w} height={floor.h} className="fill-card stroke-border" strokeWidth={4} rx={12} />
        <rect x={0} y={0} width={floor.w} height={floor.h} fill="url(#floor-grid)" pointerEvents="none" />
        {ordered.map((it) => (
          <Item
            key={it.id}
            it={it}
            occ={occupants.get(it.id) ?? []}
            selected={selected === it.id}
            drop={dropTarget === it.id}
            armed={armed}
            onDown={(e) => down(e, it)}
            onKey={(e) => key(e, it)}
            onDragOver={(e) => {
              if (it.kind !== "table") return;
              e.preventDefault();
              setDropTarget(it.id);
            }}
            onDragLeave={() => setDropTarget((d) => (d === it.id ? null : d))}
            onDrop={(e) => {
              e.preventDefault();
              setDropTarget(null);
              const hid = e.dataTransfer.getData("text/x-household");
              if (hid && it.kind === "table") onDropHousehold(hid, it.id);
            }}
          />
        ))}
      </svg>
    </div>
  );
});

const layer = (i: FloorItem) => (i.kind === "area" ? 0 : i.kind === "dance_floor" || i.kind === "stage" || i.kind === "kids_corner" ? 1 : i.kind === "table" ? 3 : 2);

function Item({
  it,
  occ,
  selected,
  drop,
  armed,
  onDown,
  onKey,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  it: FloorItem;
  occ: Occupant[];
  selected: boolean;
  drop: boolean;
  armed: boolean;
  onDown: (e: React.PointerEvent) => void;
  onKey: (e: React.KeyboardEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const isTable = it.kind === "table";
  const used = occ.reduce((a, o) => a + o.n, 0);
  const over = isTable && used > it.seats;
  const ring = selected ? "stroke-primary" : drop ? "stroke-primary" : over ? "stroke-destructive" : "stroke-fg/50";
  const label = isTable
    ? `שולחן ${tableName(it)}, ${used} מתוך ${it.seats} מקומות${over ? ", עמוס מדי" : ""}${it.tableKind !== "regular" ? `, ${TABLE_KIND_LABELS[it.tableKind]}` : ""}${occ.length ? `: ${occ.map((o) => o.name).join(", ")}` : ""}`
    : it.kind === "text"
      ? `טקסט: ${it.text}`
      : `${ELEMENT_LABELS[it.kind as ElementKind]}${it.label ? `: ${it.label}` : ""}`;
  const chairs = isTable ? chairPositions(it) : [];
  const fills: (string | null)[] = [];
  for (const o of occ) for (let i = 0; i < o.n; i++) fills.push(o.color);
  const sw = selected || drop ? 6 : over ? 5 : 2.5;
  const body = () => {
    const common = { className: cx(isTable ? "fill-card" : "", ring), strokeWidth: sw, style: !isTable ? { fill: it.color ?? ELEMENT_FILL[it.kind as ElementKind] } : it.color ? { fill: it.color + "33" } : undefined } as const;
    if (it.kind === "text") return <rect x={-it.w / 2} y={-it.h / 2} width={it.w} height={it.h} fill="transparent" className={selected ? "stroke-primary" : "stroke-transparent"} strokeWidth={3} strokeDasharray="8 6" />;
    if (it.shape === "round" || it.kind === "pillar") return <circle r={it.w / 2} {...common} />;
    if (it.shape === "oval") return <ellipse rx={it.w / 2} ry={it.h / 2} {...common} />;
    if (it.shape === "halfround" && isTable) return <path d={`M ${-it.w / 2} ${it.h / 2} A ${it.w / 2} ${it.h} 0 0 1 ${it.w / 2} ${it.h / 2} Z`} {...common} />;
    return <rect x={-it.w / 2} y={-it.h / 2} width={it.w} height={it.h} rx={isTable ? 10 : 6} {...common} />;
  };
  const dark = it.kind === "wall" || it.kind === "pillar";
  return (
    <g
      tabIndex={0}
      role="button"
      aria-label={label}
      aria-pressed={selected}
      onPointerDown={onDown}
      onKeyDown={onKey}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cx("outline-none focus-visible:[&>g>*:first-child]:stroke-ring", it.locked ? "cursor-default" : armed && isTable ? "cursor-copy" : "cursor-move")}
    >
      <title>{label}</title>
      <g transform={`translate(${it.x} ${it.y}) rotate(${it.rot})`}>
        {body()}
        {chairs.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={CHAIR_R} strokeWidth={2} className={fills[i] ? "stroke-card" : "fill-card stroke-fg/40"} style={fills[i] ? { fill: fills[i]! } : undefined} />
        ))}
      </g>
      {/* texts stay upright whatever the rotation */}
      {isTable ? (
        <g pointerEvents="none">
          <text x={it.x} y={it.y - 4} textAnchor="middle" className="fill-fg font-bold" fontSize={Math.max(18, Math.min(40, it.h * 0.32))} direction="rtl">
            {tableName(it)}
          </text>
          <text x={it.x} y={it.y + Math.max(18, Math.min(34, it.h * 0.26))} textAnchor="middle" className={over ? "fill-destructive font-bold" : "fill-muted-fg"} fontSize={Math.max(14, Math.min(26, it.h * 0.2))}>
            {used}/{it.seats}
          </text>
        </g>
      ) : (
        <text
          x={it.x}
          y={it.y}
          textAnchor="middle"
          dominantBaseline="central"
          direction="rtl"
          pointerEvents="none"
          className={cx("font-semibold", dark ? "fill-white" : it.kind === "text" ? "fill-fg" : "fill-zinc-800")}
          fontSize={it.kind === "text" ? it.fontSize : Math.max(16, Math.min(36, Math.min(it.w, it.h) * 0.22))}
        >
          {it.kind === "text"
            ? it.text.split("\n").map((line, i, all) => (
                <tspan key={i} x={it.x} dy={i === 0 ? `${-(all.length - 1) * 0.6}em` : "1.2em"}>
                  {line}
                </tspan>
              ))
            : it.kind === "wall" || it.kind === "pillar"
              ? ""
              : it.label || ELEMENT_LABELS[it.kind as ElementKind]}
        </text>
      )}
    </g>
  );
}
