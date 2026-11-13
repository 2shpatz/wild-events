import { useMemo, useState } from "react";
import { ArrowDownUp, Columns3, ContactRound, Download, FileSpreadsheet, Filter, Plus, Search, Trash2, Undo2, Upload, Users, X } from "lucide-react";
import {
  STATUSES,
  STATUS_LABELS,
  displayPhone,
  formatCell,
  fullName,
  partySize,
  seatedCount,
  tableLabelOf,
  toCsv,
  visibleFields,
  type FieldKey,
  type HouseholdDTO,
  type RsvpStatus,
} from "../../../shared/guests";
import { Button, ConfirmDialog, IconButton, Modal, cx } from "../ui";
import { useLastDeleted } from "../../lib/useLastDeleted";
import { usePlanner } from "./store";
import { ContactButtons, Empty, StatusBadge, TagChip, TagSelect, download, num, smallInput, smallSelect } from "./bits";
import { HouseholdEditor } from "./HouseholdEditor";
import { ImportDialog } from "./ImportDialog";

type GroupBy = "none" | "side" | "circle" | "status";
type SortBy = "order" | "name" | "status" | "invited";
const PAGE = 150;

/** Columns that can be shown in the table (besides the name, which is always there). */
const TABLE_COLS: FieldKey[] = ["phone", "side", "circle", "invited", "status", "coming", "table", "priority", "email", "companions", "meals", "giftAmount", "inviteSentAt", "notes"];
const DEFAULT_COLS: FieldKey[] = ["phone", "side", "circle", "invited", "status", "coming", "table"];
const colsKey = (code: string) => `lea:planner-cols:${code}`;

/**
 * The guest list: one row per invitation. Quick add line at the top, search + filters, group by side / circle /
 * status with subtotals, inline status / count / side / circle, multi-select with a bulk bar, import / export.
 */
export function GuestList({ go }: { go: (p: string) => void }) {
  const p = usePlanner();
  const { config: cfg, households } = p.data;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<RsvpStatus | "">("");
  const [side, setSide] = useState<string>("");
  const [circle, setCircle] = useState<string>("");
  const [extra, setExtra] = useState<"" | "notSent" | "unseated" | "noPhone" | "a" | "b">("");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [sortBy, setSortBy] = useState<SortBy>("order");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<HouseholdDTO | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [lastDeleted, setLastDeleted] = useLastDeleted<string[]>();
  const [cols, setCols] = useState<FieldKey[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(colsKey(p.code)) || "null");
      return Array.isArray(v) ? v : DEFAULT_COLS;
    } catch {
      return DEFAULT_COLS;
    }
  });
  const on = new Set(visibleFields(cfg).map((f) => f.key));
  const shownCols = TABLE_COLS.filter((c) => cols.includes(c) && on.has(c));
  const saveCols = (c: FieldKey[]) => {
    setCols(c);
    try {
      localStorage.setItem(colsKey(p.code), JSON.stringify(c));
    } catch {
      /* private mode */
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    let list = households.filter((h) => {
      if (status && h.status !== status) return false;
      if (side && (side === "none" ? h.side : h.side !== side)) return false;
      if (circle && (circle === "none" ? h.circle : h.circle !== circle)) return false;
      if (extra === "notSent" && h.inviteSentAt) return false;
      if (extra === "unseated" && !(partySize(h, cfg.planBy) > seatedCount(h))) return false;
      if (extra === "noPhone" && h.phone.replace(/\D/g, "").length >= 9) return false;
      if ((extra === "a" || extra === "b") && h.priority !== extra) return false;
      if (needle) {
        const hay = `${h.first} ${h.last} ${h.companions.join(" ")} ${h.email} ${h.notes}`.toLowerCase();
        if (!hay.includes(needle) && !(digits.length >= 3 && h.phone.replace(/\D/g, "").includes(digits))) return false;
      }
      return true;
    });
    if (sortBy === "name") list = [...list].sort((a, b) => fullName(a).localeCompare(fullName(b), "he"));
    else if (sortBy === "status") list = [...list].sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status));
    else if (sortBy === "invited") list = [...list].sort((a, b) => b.invited - a.invited);
    return list;
  }, [households, q, status, side, circle, extra, sortBy, cfg.planBy]);

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", title: "", list: filtered }];
    const tags = groupBy === "side" ? cfg.sides : groupBy === "circle" ? cfg.circles : null;
    const keyOf = (h: HouseholdDTO) => (groupBy === "side" ? h.side : groupBy === "circle" ? h.circle : h.status) ?? "none";
    const order = tags ? [...tags.map((t) => t.id), "none"] : [...STATUSES];
    const title = (k: string) => (tags ? tags.find((t) => t.id === k)?.name ?? "לא שויך" : STATUS_LABELS[k as RsvpStatus]);
    return order.map((k) => ({ key: k, title: title(k), list: filtered.filter((h) => keyOf(h) === k) })).filter((g) => g.list.length);
  }, [filtered, groupBy, cfg.sides, cfg.circles]);

  const allSelected = filtered.length > 0 && filtered.every((h) => selected.has(h.id));
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const ids = [...selected].filter((id) => households.some((h) => h.id === id));
  const bulk = (patch: Partial<HouseholdDTO>, msg: string) => p.patchHouseholds(ids.map((id) => ({ id, patch })), msg);
  const filtersOn = !!(q || status || side || circle || extra);

  const exportCsv = () => {
    const fields = visibleFields(cfg).filter((f) => f.key !== "link");
    const head = [...fields.map((f) => f.label), ...cfg.custom.map((c) => c.label), "קישור אישי"];
    const rows = filtered.map((h) => [
      ...fields.map((f) => String(formatCell(f.key, h, cfg, { tables: p.tablesById, link: () => "" }))),
      ...cfg.custom.map((c) => {
        const v = h.custom[c.id];
        return v === null || v === undefined ? "" : v === true ? "כן" : v === false ? "" : String(v);
      }),
      p.rsvpUrl(h),
    ]);
    download(`רשימת אורחים - ${p.data.event.title}.csv`, toCsv([head, ...rows]));
  };

  const pickContacts = async () => {
    const nav = navigator as Navigator & { contacts?: { select: (props: string[], o: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> } };
    try {
      const picked = await nav.contacts!.select(["name", "tel"], { multiple: true });
      const list = picked
        .map((c) => {
          const name = (c.name?.[0] ?? "").trim();
          const parts = name.split(/\s+/);
          return { first: parts.length > 1 ? parts.slice(0, -1).join(" ") : name, last: parts.length > 1 ? parts[parts.length - 1] : "", phone: c.tel?.[0] ?? "" };
        })
        .filter((c) => c.first || c.phone);
      if (list.length) await p.addHouseholds(list);
    } catch {
      /* cancelled */
    }
  };
  const canPickContacts = typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;

  const totals = (list: HouseholdDTO[]) => {
    const inv = list.reduce((a, h) => a + h.invited, 0);
    const com = list.reduce((a, h) => a + (h.status === "coming" ? h.coming || h.invited : 0), 0);
    return `${num(list.length)} הזמנות · ${num(inv)} מוזמנים · ${num(com)} מגיעים`;
  };
  let shown = 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
          הזמנה חדשה
        </Button>
        <Button variant="outline" icon={<Upload className="size-4" aria-hidden />} onClick={() => setImporting(true)}>
          ייבוא מ-Excel / Sheets
        </Button>
        {canPickContacts && (
          <Button variant="outline" icon={<ContactRound className="size-4" aria-hidden />} onClick={pickContacts}>
            מאנשי הקשר
          </Button>
        )}
        <Button variant="ghost" icon={<Download className="size-4" aria-hidden />} onClick={exportCsv} disabled={!households.length}>
          הורדה כקובץ
        </Button>
        {p.data.sheet ? (
          <a href={p.data.sheet.url} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-semibold text-fg no-underline hover:bg-fg/5">
            <FileSpreadsheet className="size-4 text-green-700" aria-hidden />
            פתיחת הגיליון
          </a>
        ) : (
          <Button variant="ghost" icon={<FileSpreadsheet className="size-4" aria-hidden />} onClick={() => go("settings")}>
            חיבור ל-Google Sheets
          </Button>
        )}
      </div>

      <QuickAdd />

      {/* search + filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">חיפוש</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" aria-hidden />
          <input className={cx(smallInput, "ps-9")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש שם, טלפון, הערה" type="search" />
        </label>
        <Filter className="size-4 text-muted-fg" aria-hidden />
        <select className={smallSelect} value={status} onChange={(e) => setStatus(e.target.value as RsvpStatus | "")} aria-label="סינון לפי סטטוס">
          <option value="">כל הסטטוסים</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {cfg.sides.length > 0 && (
          <select className={smallSelect} value={side} onChange={(e) => setSide(e.target.value)} aria-label="סינון לפי צד">
            <option value="">כל הצדדים</option>
            {cfg.sides.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="none">בלי צד</option>
          </select>
        )}
        <select className={smallSelect} value={circle} onChange={(e) => setCircle(e.target.value)} aria-label="סינון לפי מעגל">
          <option value="">כל המעגלים</option>
          {cfg.circles.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value="none">בלי מעגל</option>
        </select>
        <select className={smallSelect} value={extra} onChange={(e) => setExtra(e.target.value as typeof extra)} aria-label="סינון נוסף">
          <option value="">הכול</option>
          <option value="notSent">הזמנה לא נשלחה</option>
          <option value="unseated">בלי שולחן</option>
          <option value="noPhone">בלי טלפון</option>
          {on.has("priority") && <option value="a">רשימה א</option>}
          {on.has("priority") && <option value="b">רשימה ב</option>}
        </select>
        {filtersOn && (
          <Button variant="ghost" size="sm" icon={<X className="size-4" aria-hidden />} onClick={() => { setQ(""); setStatus(""); setSide(""); setCircle(""); setExtra(""); }}>
            ניקוי
          </Button>
        )}
        <span className="ms-auto flex flex-wrap items-center gap-2">
          <select className={smallSelect} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} aria-label="קיבוץ">
            <option value="none">בלי קיבוץ</option>
            {cfg.sides.length > 0 && <option value="side">קיבוץ לפי צד</option>}
            <option value="circle">קיבוץ לפי מעגל</option>
            <option value="status">קיבוץ לפי סטטוס</option>
          </select>
          <label className="relative">
            <span className="sr-only">מיון</span>
            <ArrowDownUp className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-fg" aria-hidden />
            <select className={cx(smallSelect, "ps-8")} value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
              <option value="order">סדר ההוספה</option>
              <option value="name">לפי שם</option>
              <option value="status">לפי סטטוס</option>
              <option value="invited">משפחות גדולות קודם</option>
            </select>
          </label>
          <IconButton label="בחירת עמודות" className="border border-border hover:bg-fg/5" onClick={() => setChooser(true)}>
            <Columns3 className="size-5" aria-hidden />
          </IconButton>
        </span>
      </div>

      <p className="text-sm text-muted-fg" role="status">
        {filtersOn ? `נמצאו ${totals(filtered)}` : totals(households)}
      </p>

      {lastDeleted && (
        <div className="flex items-center gap-3 rounded-xl bg-zinc-900 px-4 py-2 text-white" role="status">
          <span className="flex-1">{lastDeleted.length === 1 ? "ההזמנה נמחקה" : `${num(lastDeleted.length)} הזמנות נמחקו`}</span>
          <Button size="sm" variant="glass" icon={<Undo2 className="size-4" aria-hidden />} onClick={() => { p.restoreHouseholds(lastDeleted); setLastDeleted(null); }}>
            ביטול
          </Button>
        </div>
      )}

      {households.length === 0 ? (
        <Empty
          icon={<Users className="size-7" aria-hidden />}
          title="עוד אין מוזמנים"
          text="מוסיפים אחד אחד בשורה למעלה, או מייבאים רשימה קיימת מ-Excel או מ-Google Sheets."
          action={
            <Button icon={<Upload className="size-4" aria-hidden />} onClick={() => setImporting(true)}>
              ייבוא רשימה
            </Button>
          }
        />
      ) : (
        <>
          {/* desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card shadow-soft md:block">
            <table className="w-full min-w-[48rem] border-collapse text-start">
              <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                <tr className="text-sm text-muted-fg">
                  <th scope="col" className="w-12 px-3 py-2">
                    <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.map((h) => h.id)))} aria-label="בחירת כל השורות" />
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-semibold">שם</th>
                  {shownCols.map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 text-start font-semibold whitespace-nowrap">
                      {COL_TITLE[c] ?? c}
                    </th>
                  ))}
                </tr>
              </thead>
              {groups.map((g) => {
                const list = g.list.slice(0, Math.max(0, limit - shown));
                shown += list.length;
                return (
                  <tbody key={g.key}>
                    {g.title && (
                      <tr className="bg-primary/5">
                        <th colSpan={shownCols.length + 2} scope="colgroup" className="px-3 py-2 text-start">
                          <span className="font-bold">{g.title}</span> <span className="text-sm font-normal text-muted-fg">({totals(g.list)})</span>
                        </th>
                      </tr>
                    )}
                    {list.map((h) => (
                      <Row key={h.id} h={h} cols={shownCols} selected={selected.has(h.id)} onSelect={() => toggle(h.id)} onOpen={() => setEditing(h)} />
                    ))}
                  </tbody>
                );
              })}
            </table>
          </div>
          {/* phone cards */}
          <ul className="space-y-2 md:hidden">
            {filtered.slice(0, limit).map((h) => (
              <li key={h.id}>
                <Card h={h} selected={selected.has(h.id)} onSelect={() => toggle(h.id)} onOpen={() => setEditing(h)} />
              </li>
            ))}
          </ul>
          {filtered.length > limit && (
            <div className="text-center">
              <Button variant="outline" onClick={() => setLimit(limit + PAGE * 2)}>
                הצגת עוד ({num(filtered.length - limit)})
              </Button>
            </div>
          )}
        </>
      )}

      {/* bulk bar */}
      {ids.length > 0 && (
        <div className="sticky bottom-3 z-30 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-lift" role="region" aria-label="פעולות על השורות שנבחרו">
          <span className="font-bold">{num(ids.length)} נבחרו</span>
          <select className={smallSelect} value="" onChange={(e) => e.target.value && bulk({ status: e.target.value as RsvpStatus }, "הסטטוס עודכן")} aria-label="שינוי סטטוס לנבחרים">
            <option value="">סטטוס...</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {cfg.sides.length > 0 && (
            <select className={smallSelect} value="" onChange={(e) => e.target.value && bulk({ side: e.target.value === "none" ? null : e.target.value }, "הצד עודכן")} aria-label="שינוי צד לנבחרים">
              <option value="">צד...</option>
              {cfg.sides.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value="none">בלי צד</option>
            </select>
          )}
          <select className={smallSelect} value="" onChange={(e) => e.target.value && bulk({ circle: e.target.value === "none" ? null : e.target.value }, "המעגל עודכן")} aria-label="שינוי מעגל לנבחרים">
            <option value="">מעגל...</option>
            {cfg.circles.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="none">בלי מעגל</option>
          </select>
          {on.has("priority") && (
            <select className={smallSelect} value="" onChange={(e) => e.target.value && bulk({ priority: e.target.value === "none" ? null : (e.target.value as "a" | "b") }, "העדיפות עודכנה")} aria-label="עדיפות לנבחרים">
              <option value="">עדיפות...</option>
              <option value="a">רשימה א</option>
              <option value="b">רשימה ב</option>
              <option value="none">ללא</option>
            </select>
          )}
          <Button size="sm" variant="outline" onClick={() => bulk({ inviteSentAt: Date.now() }, "סומן שההזמנה נשלחה")}>
            סימון &quot;נשלחה&quot;
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirmBulkDelete(true)}>
            מחיקה
          </Button>
          <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setSelected(new Set())}>
            ביטול הבחירה
          </Button>
        </div>
      )}

      <HouseholdEditor household={editing} open={!!editing || adding} onClose={() => { setEditing(null); setAdding(false); }} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      <ConfirmDialog
        open={confirmBulkDelete}
        title={`למחוק ${num(ids.length)} הזמנות?`}
        message={<p>{num(ids.reduce((a, id) => a + (households.find((h) => h.id === id)?.invited ?? 0), 0))} מוזמנים יוסרו מהרשימה, מהשולחנות ומהגיליון. אפשר לבטל מיד אחרי המחיקה.</p>}
        confirmLabel={`מחיקת ${num(ids.length)} הזמנות`}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={async () => {
          const list = ids;
          if (await p.deleteHouseholds(list)) {
            setLastDeleted(list);
            setSelected(new Set());
          }
        }}
      />
      <Modal open={chooser} onClose={() => setChooser(false)} title="אילו עמודות להציג בטבלה">
        <p className="mb-3 text-sm text-muted-fg">רק לתצוגה במכשיר הזה. עמודות שכבויות בהגדרות לא מופיעות כאן.</p>
        <ul className="space-y-1">
          {TABLE_COLS.filter((c) => on.has(c)).map((c) => (
            <li key={c}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={cols.includes(c)} onChange={(e) => saveCols(e.target.checked ? [...cols, c] : cols.filter((x) => x !== c))} />
                {COL_TITLE[c]}
              </label>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}

const COL_TITLE: Partial<Record<FieldKey, string>> = {
  phone: "טלפון",
  side: "צד",
  circle: "מעגל",
  invited: "מוזמנים",
  status: "סטטוס",
  coming: "מגיעים",
  table: "שולחן",
  priority: "עדיפות",
  email: "אימייל",
  companions: "מצטרפים",
  meals: "מנות",
  giftAmount: "מתנה",
  inviteSentAt: "נשלחה",
  notes: "הערות",
};

/** One table row. Status, counts, side and circle change right in the row; the name opens the full card. */
function Row({ h, cols, selected, onSelect, onOpen }: { h: HouseholdDTO; cols: FieldKey[]; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const p = usePlanner();
  const cfg = p.data.config;
  const patch = (x: Partial<HouseholdDTO>) => p.patchOne(h.id, x);
  const cell = (c: FieldKey) => {
    switch (c) {
      case "phone":
        return h.phone ? <bdi dir="ltr" className="whitespace-nowrap">{displayPhone(h.phone)}</bdi> : <span className="text-muted-fg">-</span>;
      case "side":
        return <TagSelect size="xs" className="w-36" label={`צד - ${fullName(h)}`} value={h.side} tags={cfg.sides} onChange={(v) => patch({ side: v })} empty="-" />;
      case "circle":
        return <TagSelect size="xs" className="w-36" label={`מעגל - ${fullName(h)}`} value={h.circle} tags={cfg.circles} onChange={(v) => patch({ circle: v })} empty="-" />;
      case "invited":
        return <NumCell value={h.invited} label={`מוזמנים - ${fullName(h)}`} onChange={(n) => patch({ invited: n })} />;
      case "coming":
        return h.status === "coming" || h.status === "maybe" ? (
          <NumCell value={h.coming || h.invited} label={`מגיעים - ${fullName(h)}`} onChange={(n) => patch({ coming: n })} />
        ) : (
          <span className="text-muted-fg">-</span>
        );
      case "status":
        return (
          <select
            className={cx("min-h-11 rounded-lg border border-border bg-card px-2 pe-7 text-sm font-semibold")}
            value={h.status}
            aria-label={`סטטוס - ${fullName(h)}`}
            onChange={(e) => {
              const s = e.target.value as RsvpStatus;
              patch({ status: s, coming: s === "coming" ? h.coming || h.invited : h.coming });
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        );
      case "table":
        return tableLabelOf(h, p.tablesById) || <span className="text-muted-fg">-</span>;
      default: {
        const v = formatCell(c, h, cfg, { tables: p.tablesById, link: () => "" });
        return v === "" ? <span className="text-muted-fg">-</span> : <span className="line-clamp-2">{v}</span>;
      }
    }
  };
  return (
    <tr className={cx("border-t border-border transition-colors duration-150", selected ? "bg-primary/10" : "hover:bg-fg/[0.03]")}>
      <td className="px-3 py-1.5">
        <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={selected} onChange={onSelect} aria-label={`בחירת ${fullName(h)}`} />
      </td>
      <td className="px-3 py-1.5">
        <button type="button" onClick={onOpen} className="min-h-11 text-start font-semibold underline-offset-2 hover:underline">
          {fullName(h) || "ללא שם"}
          {h.companions.length > 0 && <span className="block text-xs font-normal text-muted-fg">+ {h.companions.join(", ")}</span>}
        </button>
      </td>
      {cols.map((c) => (
        <td key={c} className="px-3 py-1.5 align-middle">
          {cell(c)}
        </td>
      ))}
    </tr>
  );
}

function NumCell({ value, label, onChange }: { value: number; label: string; onChange: (n: number) => void }) {
  const [v, setV] = useState<string | null>(null);
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={60}
      aria-label={label}
      className="h-11 w-16 rounded-lg border border-border bg-card text-center font-semibold tabular-nums focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20"
      value={v ?? value}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== null && Number(v) !== value && v !== "") onChange(Math.max(0, Math.min(60, Math.round(Number(v)))));
        setV(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function Card({ h, selected, onSelect, onOpen }: { h: HouseholdDTO; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const p = usePlanner();
  const cfg = p.data.config;
  const side = cfg.sides.find((t) => t.id === h.side);
  const circle = cfg.circles.find((t) => t.id === h.circle);
  const table = tableLabelOf(h, p.tablesById);
  return (
    <div className={cx("flex items-start gap-3 rounded-2xl border bg-card p-3 shadow-soft", selected ? "border-primary" : "border-border")}>
      <input type="checkbox" className="mt-3 size-5 shrink-0 accent-[var(--primary)]" checked={selected} onChange={onSelect} aria-label={`בחירת ${fullName(h)}`} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-lg font-bold">{fullName(h) || "ללא שם"}</span>
          <StatusBadge status={h.status} />
        </span>
        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-fg">
          <span>
            {num(h.invited)} מוזמנים{h.status === "coming" ? ` · ${num(h.coming || h.invited)} מגיעים` : ""}
          </span>
          {side && <TagChip tag={side} />}
          {circle && <TagChip tag={circle} />}
          {table && <span>שולחן {table}</span>}
        </span>
      </button>
      <ContactButtons phone={h.phone} name={fullName(h)} text={p.message(h.inviteSentAt ? "reminder" : "invite", h)} />
    </div>
  );
}

/** One line to add an invitation fast (Enter = add, focus stays for the next one). */
function QuickAdd() {
  const p = usePlanner();
  const cfg = p.data.config;
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [invited, setInvited] = useState("2");
  const [side, setSide] = useState<string | null>(null);
  const [circle, setCircle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!first.trim() && !last.trim()) return;
    setBusy(true);
    const r = await p.addHouseholds([{ first, last, phone, invited: Math.max(1, Number(invited) || 1), side, circle }]);
    setBusy(false);
    if (r) {
      setFirst("");
      setLast("");
      setPhone("");
      (document.getElementById("qa-first") as HTMLInputElement | null)?.focus();
    }
  };
  return (
    <form onSubmit={add} className="grid grid-cols-2 gap-2 rounded-2xl border border-dashed border-primary/50 bg-primary/5 p-3 lg:grid-cols-[1fr_1fr_1fr_6rem_1fr_1fr_auto] [&>button]:col-span-2 lg:[&>button]:col-span-1" aria-label="הוספה מהירה">
      <input id="qa-first" className={smallInput} value={first} onChange={(e) => setFirst(e.target.value)} placeholder="שם פרטי" aria-label="שם פרטי" maxLength={40} />
      <input className={smallInput} value={last} onChange={(e) => setLast(e.target.value)} placeholder="שם משפחה" aria-label="שם משפחה" maxLength={40} />
      <input className={smallInput} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="טלפון" aria-label="טלפון" dir="ltr" type="tel" inputMode="tel" maxLength={30} />
      <input className={smallInput} value={invited} onChange={(e) => setInvited(e.target.value)} placeholder="כמה" aria-label="מספר מוזמנים" type="number" inputMode="numeric" min={1} max={60} />
      {cfg.sides.length > 0 ? <TagSelect size="sm" label="צד" value={side} tags={cfg.sides} onChange={setSide} empty="צד" /> : <span className="hidden lg:block" />}
      <TagSelect size="sm" label="מעגל" value={circle} tags={cfg.circles} onChange={setCircle} empty="מעגל" />
      <Button type="submit" loading={busy} icon={<Plus className="size-4" aria-hidden />} disabled={!first.trim() && !last.trim()}>
        הוספה
      </Button>
    </form>
  );
}

