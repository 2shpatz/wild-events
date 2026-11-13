/** Printouts of the seating: the map, a list per table, the entrance list (A-Z) and table cards. */
import { fullName, tableName, tables, type FloorPlan, type HouseholdDTO } from "../../../../shared/guests";
import { esc, printHtml } from "../bits";
import { planBounds } from "./geometry";

/** A copy of the map SVG with the computed colors written in (the print window has no Tailwind). */
function mapSvg(svg: SVGSVGElement, floor: FloorPlan) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = svg.querySelectorAll("*");
  const dst = clone.querySelectorAll("*");
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const d = dst[i] as SVGElement;
    for (const prop of ["fill", "stroke", "stroke-width", "font-size", "font-weight", "opacity"]) {
      const v = cs.getPropertyValue(prop);
      if (v) d.style.setProperty(prop, v);
    }
    d.removeAttribute("class");
    d.removeAttribute("tabindex");
  });
  const b = planBounds(floor);
  clone.setAttribute("viewBox", `${b.x1 - 40} ${b.y1 - 40} ${b.x2 - b.x1 + 80} ${b.y2 - b.y1 + 80}`);
  clone.setAttribute("width", "100%");
  clone.removeAttribute("class");
  clone.style.maxHeight = "250mm";
  clone.querySelectorAll("title").forEach((t) => t.remove());
  return clone.outerHTML;
}

const sortedTables = (floor: FloorPlan) =>
  [...tables(floor)].sort((a, b) => {
    const na = Number(a.label);
    const nb = Number(b.label);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.label.localeCompare(b.label, "he");
  });

export function printPlan(kind: "map" | "entrance" | "cards", opts: { title: string; floor: FloorPlan; households: HouseholdDTO[]; svg: SVGSVGElement | null }) {
  const { floor, households, title } = opts;
  const byTable = new Map<string, { h: HouseholdDTO; n: number }[]>();
  for (const h of households) for (const s of h.seats) byTable.set(s.t, [...(byTable.get(s.t) ?? []), { h, n: s.n }]);
  const tbls = sortedTables(floor);
  if (kind === "map") {
    const lists = tbls
      .map((t) => {
        const rows = byTable.get(t.id) ?? [];
        const used = rows.reduce((a, r) => a + r.n, 0);
        return `<div class="avoid table-box"><h2>שולחן ${esc(tableName(t))} <span class="muted">(${used}/${t.seats})</span></h2><ul>${rows
          .map((r) => `<li><b>${esc(fullName(r.h))}</b> (${r.n})${r.h.companions.length ? ` <span class="muted">${esc(r.h.companions.join(", "))}</span>` : ""}</li>`)
          .join("")}</ul></div>`;
      })
      .join("");
    return printHtml(
      `סידור הושבה - ${title}`,
      `<h1>סידור הושבה - ${esc(title)}</h1>${opts.svg ? `<div class="break">${mapSvg(opts.svg, floor)}</div>` : ""}<div class="cols">${lists}</div>`,
      `.cols { columns: 2; column-gap: 10mm; } .table-box { margin-bottom: 4mm; } ul { margin: 0; padding-inline-start: 5mm; } li { margin: 0.5mm 0; }`,
    );
  }
  if (kind === "entrance") {
    const label = new Map(tbls.map((t) => [t.id, tableName(t)]));
    const rows = households
      .filter((h) => h.seats.some((s) => label.has(s.t)))
      .sort((a, b) => (a.last || a.first).localeCompare(b.last || b.first, "he") || a.first.localeCompare(b.first, "he"))
      .map((h) => `<tr><td><b>${esc(h.last)}</b> ${esc(h.first)}${h.companions.length ? ` <span class="muted">+ ${esc(h.companions.join(", "))}</span>` : ""}</td><td class="t">${esc(h.seats.map((s) => label.get(s.t)).filter(Boolean).join(", "))}</td></tr>`)
      .join("");
    return printHtml(
      `רשימת כניסה - ${title}`,
      `<h1>איפה יושבים? - ${esc(title)}</h1><table><thead><tr><th>שם</th><th>שולחן</th></tr></thead><tbody>${rows}</tbody></table>`,
      `td.t { font-size: 16pt; font-weight: 800; text-align: center; width: 30mm; } table { columns: 1; } tr { break-inside: avoid; }`,
    );
  }
  const cards = tbls.map((t) => `<div class="card"><div class="small">${esc(title)}</div><div class="num">${esc(tableName(t))}</div><div class="small">שולחן</div></div>`).join("");
  return printHtml(
    `שלטי שולחנות - ${title}`,
    cards,
    `@page { margin: 10mm; } .card { height: 128mm; border: 1px dashed #bbb; display: flex; flex-direction: column; align-items: center; justify-content: center; break-inside: avoid; margin-bottom: 6mm; }
     .num { font-size: 140pt; font-weight: 800; line-height: 1; } .small { font-size: 16pt; color: #555; }`,
  );
}
