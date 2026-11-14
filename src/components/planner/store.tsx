/**
 * Data of the guest planner page: one load of everything, optimistic changes with rollback, polling for other
 * devices' changes (and guests' RSVP answers), and the Google Sheet sync in the background.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, api, errorMessage } from "../../lib/api";
import { useToast } from "../ui";
import {
  computeStats,
  fillTemplate,
  fullName,
  giftDetailsText,
  hasGiftDetails,
  tableLabelOf,
  tables,
  type ExpenseDTO,
  type FloorItem,
  type FloorPlan,
  type Household,
  type HouseholdDTO,
  type PlannerConfig,
  type PlannerData,
  type Stats,
  type TemplateId,
  type VendorDTO,
} from "../../../shared/guests";
import { formatDate } from "../../lib/format";

type Patch = Partial<Household>;
type SyncState = "idle" | "syncing" | "error";

export interface Planner {
  code: string;
  data: PlannerData;
  stats: Stats;
  tablesById: Map<string, FloorItem>;
  /** settings */
  saveConfig: (cfg: PlannerConfig, toast?: string) => Promise<boolean>;
  saveFloor: (floor: FloorPlan) => void;
  /** guest list */
  addHouseholds: (list: Partial<Household>[], cfg?: PlannerConfig) => Promise<HouseholdDTO[] | null>;
  patchHouseholds: (items: { id: string; patch: Patch }[], toast?: string) => Promise<boolean>;
  patchOne: (id: string, patch: Patch) => Promise<boolean>;
  deleteHouseholds: (ids: string[]) => Promise<boolean>;
  restoreHouseholds: (ids: string[]) => Promise<void>;
  newLink: (id: string) => Promise<void>;
  /** vendors / expenses */
  /** the saved record (with its new id when isNew), or null when it failed */
  saveRecord: (kind: "vendor" | "expense", rec: VendorDTO | ExpenseDTO | Omit<VendorDTO, "sort" | "updatedAt"> | Omit<ExpenseDTO, "sort" | "updatedAt">, isNew: boolean) => Promise<VendorDTO | ExpenseDTO | null>;
  deleteRecord: (kind: "vendor" | "expense", id: string) => Promise<void>;
  /** vendors' contracts / quotes (Drive of the event's account) */
  uploadVendorFile: (vendorId: string, file: File, onProgress: (p: number) => void) => Promise<VendorDTO | null>;
  deleteVendorFile: (vendorId: string, fileId: string) => Promise<void>;
  vendorFileUrl: (vendorId: string, fileId: string) => string;
  /** Google Sheet */
  sync: (opts?: { create?: boolean; confirmDeletes?: boolean; keepDeleted?: boolean; overwrite?: boolean; quiet?: boolean }) => Promise<void>;
  unlinkSheet: () => Promise<void>;
  syncState: SyncState;
  /** message for a household from a template */
  message: (tpl: TemplateId | string, h: HouseholdDTO) => string;
  rsvpUrl: (h: Pick<HouseholdDTO, "token">) => string;
  reload: () => Promise<void>;
}

const Ctx = createContext<Planner | null>(null);
export const usePlanner = () => {
  const p = useContext(Ctx);
  if (!p) throw new Error("usePlanner outside PlannerProvider");
  return p;
};

const POLL_MS = 30_000;
const SHEET_POLL_MS = 60_000;
const SHEET_AFTER_CHANGE_MS = 4_000;

export function PlannerProvider({ code, initial, children }: { code: string; initial: PlannerData; children: ReactNode }) {
  const toast = useToast();
  const [data, setData] = useState<PlannerData>(initial);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const dataRef = useRef(data);
  dataRef.current = data;
  const base = `/e/${code}/planner`;

  const reload = useCallback(async () => {
    try {
      const r = await api<PlannerData | { unchanged: true; version: number }>(`${base}?since=${dataRef.current.version}`);
      if (!("unchanged" in r)) setData(r);
    } catch {
      /* next poll */
    }
  }, [base]);

  // Other devices / guests answering: poll while the page is visible.
  useEffect(() => {
    const iv = setInterval(() => document.visibilityState === "visible" && reload(), POLL_MS);
    const vis = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [reload]);

  // ------------------------------------------------ Google Sheet
  const syncing = useRef(false);
  const sync = useCallback<Planner["sync"]>(
    async (opts = {}) => {
      if (syncing.current) return;
      if (!opts.create && !dataRef.current.sheet) return;
      syncing.current = true;
      setSyncState("syncing");
      try {
        const r = await api<{ ok: boolean; error?: string; data: PlannerData; added?: number; pulled?: number; deleted?: number }>(`${base}/sheet/sync`, {
          method: "POST",
          json: { create: !!opts.create, confirmDeletes: !!opts.confirmDeletes, keepDeleted: !!opts.keepDeleted, overwrite: !!opts.overwrite },
        });
        setData(r.data);
        setSyncState(r.ok ? "idle" : "error");
        if (!opts.quiet) {
          if (!r.ok) toast(sheetError(r.error), "error");
          else if (opts.create) toast("הגיליון נוצר ומסונכרן");
          else toast(r.pulled || r.added || r.deleted ? `סונכרן: ${[r.pulled && `${r.pulled} עודכנו`, r.added && `${r.added} נוספו`, r.deleted && `${r.deleted} נמחקו`].filter(Boolean).join(", ")}` : "הגיליון מעודכן");
        }
      } catch (e) {
        setSyncState("error");
        if (!opts.quiet) toast(errorMessage(e), "error");
      } finally {
        syncing.current = false;
      }
    },
    [base, toast],
  );
  const hasSheet = !!data.sheet;
  useEffect(() => {
    if (!hasSheet) return;
    sync({ quiet: true });
    const iv = setInterval(() => document.visibilityState === "visible" && sync({ quiet: true }), SHEET_POLL_MS);
    return () => clearInterval(iv);
  }, [hasSheet, sync]);
  const sheetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changed = useCallback(() => {
    if (!dataRef.current.sheet) return;
    if (sheetTimer.current) clearTimeout(sheetTimer.current);
    sheetTimer.current = setTimeout(() => sync({ quiet: true }), SHEET_AFTER_CHANGE_MS);
  }, [sync]);
  const unlinkSheet = useCallback(async () => {
    try {
      await api(`${base}/sheet`, { method: "DELETE" });
      setData((d) => ({ ...d, sheet: null }));
      toast("הסנכרון עם הגיליון הופסק. הגיליון עצמו נשאר ב-Google Drive.");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }, [base, toast]);

  // ------------------------------------------------ settings + floor
  const saveConfig = useCallback<Planner["saveConfig"]>(
    async (cfg, msg) => {
      const before = dataRef.current.config;
      setData((d) => ({ ...d, config: cfg }));
      try {
        const r = await api<{ config: PlannerConfig }>(`${base}/config`, { method: "PUT", json: { config: cfg } });
        setData((d) => ({ ...d, config: r.config, version: d.version + 1 }));
        if (msg) toast(msg);
        changed();
        return true;
      } catch (e) {
        setData((d) => ({ ...d, config: before }));
        toast(errorMessage(e), "error");
        return false;
      }
    },
    [base, toast, changed],
  );

  // The floor plan saves itself a moment after the last change (dragging sends many changes).
  const floorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const floorSaved = useRef<FloorPlan>(initial.floor);
  const saveFloor = useCallback(
    (floor: FloorPlan) => {
      setData((d) => ({ ...d, floor }));
      if (floorTimer.current) clearTimeout(floorTimer.current);
      floorTimer.current = setTimeout(async () => {
        try {
          const r = await api<{ floor: FloorPlan }>(`${base}/floor`, { method: "PUT", json: { floor } });
          floorSaved.current = r.floor;
          setData((d) => ({ ...d, version: d.version + 1 }));
          changed();
        } catch (e) {
          toast(errorMessage(e), "error");
          setData((d) => ({ ...d, floor: floorSaved.current }));
        }
      }, 700);
    },
    [base, toast, changed],
  );
  // flush a pending floor save when leaving the page
  useEffect(() => {
    const flush = () => {
      if (!floorTimer.current) return;
      clearTimeout(floorTimer.current);
      navigator.sendBeacon?.(`/api${base}/floor`, new Blob([JSON.stringify({ floor: dataRef.current.floor })], { type: "application/json" }));
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [base]);

  // ------------------------------------------------ households
  const mergeIn = (list: HouseholdDTO[]) =>
    setData((d) => {
      const m = new Map(list.map((h) => [h.id, h]));
      return { ...d, households: d.households.map((h) => m.get(h.id) ?? h), version: d.version + 1 };
    });

  const addHouseholds = useCallback<Planner["addHouseholds"]>(
    async (list, cfg) => {
      try {
        if (cfg) {
          const r = await api<{ config: PlannerConfig }>(`${base}/config`, { method: "PUT", json: { config: cfg } });
          setData((d) => ({ ...d, config: r.config }));
        }
        const r = await api<{ households: HouseholdDTO[] }>(`${base}/households`, { method: "POST", json: { households: list } });
        setData((d) => ({ ...d, households: [...d.households, ...r.households], version: d.version + 1 }));
        changed();
        return r.households;
      } catch (e) {
        toast(errorMessage(e), "error");
        return null;
      }
    },
    [base, toast, changed],
  );

  const patchHouseholds = useCallback<Planner["patchHouseholds"]>(
    async (items, msg) => {
      if (!items.length) return true;
      const before = dataRef.current.households;
      const m = new Map(items.map((i) => [i.id, i.patch]));
      setData((d) => ({ ...d, households: d.households.map((h) => (m.has(h.id) ? ({ ...h, ...m.get(h.id) } as HouseholdDTO) : h)) }));
      try {
        // big bulk changes go in parts (request size)
        for (let i = 0; i < items.length; i += 500) {
          const r = await api<{ households: HouseholdDTO[] }>(`${base}/households`, { method: "PATCH", json: { items: items.slice(i, i + 500) } });
          mergeIn(r.households);
        }
        if (msg) toast(msg);
        changed();
        return true;
      } catch (e) {
        setData((d) => ({ ...d, households: before }));
        toast(errorMessage(e), "error");
        return false;
      }
    },
    [base, toast, changed],
  );
  const patchOne = useCallback((id: string, patch: Patch) => patchHouseholds([{ id, patch }]), [patchHouseholds]);

  const deleteHouseholds = useCallback<Planner["deleteHouseholds"]>(
    async (ids) => {
      const before = dataRef.current.households;
      const set = new Set(ids);
      setData((d) => ({ ...d, households: d.households.filter((h) => !set.has(h.id)) }));
      try {
        await api(`${base}/households/delete`, { method: "POST", json: { ids } });
        changed();
        return true;
      } catch (e) {
        setData((d) => ({ ...d, households: before }));
        toast(errorMessage(e), "error");
        return false;
      }
    },
    [base, toast, changed],
  );
  const restoreHouseholds = useCallback(
    async (ids: string[]) => {
      try {
        await api(`${base}/households/restore`, { method: "POST", json: { ids } });
        const r = await api<PlannerData>(base);
        setData(r);
        changed();
      } catch (e) {
        toast(errorMessage(e), "error");
      }
    },
    [base, toast, changed],
  );
  const newLink = useCallback(
    async (id: string) => {
      try {
        const r = await api<{ token: string }>(`${base}/households/${id}/new-link`, { method: "POST" });
        setData((d) => ({ ...d, households: d.households.map((h) => (h.id === id ? { ...h, token: r.token } : h)) }));
        toast("נוצר קישור אישי חדש. הקישור הקודם כבר לא עובד.");
        changed();
      } catch (e) {
        toast(errorMessage(e), "error");
      }
    },
    [base, toast, changed],
  );

  // ------------------------------------------------ vendors / expenses
  const saveRecord = useCallback<Planner["saveRecord"]>(
    async (kind, rec, isNew) => {
      const list = kind === "vendor" ? "vendors" : "expenses";
      try {
        const r = isNew
          ? await api<{ record: VendorDTO | ExpenseDTO }>(`${base}/records`, { method: "POST", json: { kind, data: rec } })
          : await api<{ record: VendorDTO | ExpenseDTO }>(`${base}/records/${rec.id}`, { method: "PUT", json: { data: rec } });
        setData((d) => {
          const cur = d[list] as (VendorDTO | ExpenseDTO)[];
          const next = isNew ? [...cur, r.record] : cur.map((x) => (x.id === r.record.id ? r.record : x));
          return { ...d, [list]: next, version: d.version + 1 } as PlannerData;
        });
        changed();
        return r.record;
      } catch (e) {
        toast(errorMessage(e), "error");
        return null;
      }
    },
    [base, toast, changed],
  );
  const deleteRecord = useCallback(
    async (kind: "vendor" | "expense", id: string) => {
      const list = kind === "vendor" ? "vendors" : "expenses";
      const before = dataRef.current[list];
      setData((d) => ({ ...d, [list]: (d[list] as { id: string }[]).filter((x) => x.id !== id) }) as PlannerData);
      try {
        await api(`${base}/records/${id}`, { method: "DELETE" });
        changed();
      } catch (e) {
        setData((d) => ({ ...d, [list]: before }) as PlannerData);
        toast(errorMessage(e), "error");
      }
    },
    [base, toast, changed],
  );

  const putVendor = (v: VendorDTO) => setData((d) => ({ ...d, vendors: d.vendors.map((x) => (x.id === v.id ? v : x)), version: d.version + 1 }));
  const uploadVendorFile = useCallback<Planner["uploadVendorFile"]>(
    (vendorId, file, onProgress) =>
      new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api${base}/records/${vendorId}/files`);
        xhr.setRequestHeader("Content-Type", fileMime(file));
        xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
        xhr.onload = () => {
          let body: { record?: VendorDTO; error?: string } | null = null;
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            /* not JSON */
          }
          if (xhr.status >= 200 && xhr.status < 300 && body?.record) {
            putVendor(body.record);
            changed();
            resolve(body.record);
          } else {
            toast(errorMessage(new ApiError(xhr.status, body?.error || "server_error")), "error");
            resolve(null);
          }
        };
        xhr.onerror = () => {
          toast(errorMessage(new TypeError("network")), "error");
          resolve(null);
        };
        xhr.send(file);
      }),
    [base, toast, changed],
  );
  const deleteVendorFile = useCallback(
    async (vendorId: string, fileId: string) => {
      try {
        const r = await api<{ record: VendorDTO }>(`${base}/records/${vendorId}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
        putVendor(r.record);
        changed();
        toast("הקובץ נמחק");
      } catch (e) {
        toast(errorMessage(e), "error");
      }
    },
    [base, toast, changed],
  );
  const vendorFileUrl = useCallback((vendorId: string, fileId: string) => `/api${base}/records/${vendorId}/files/${encodeURIComponent(fileId)}`, [base]);

  // ------------------------------------------------ derived
  const stats = useMemo(() => computeStats(data.households, data.floor, data.config), [data.households, data.floor, data.config]);
  const tablesById = useMemo(() => new Map(tables(data.floor).map((t) => [t.id, t])), [data.floor]);
  const rsvpUrl = useCallback((h: Pick<HouseholdDTO, "token">) => `${location.origin}/${code}/r/${h.token}`, [code]);
  const message = useCallback(
    (tpl: TemplateId | string, h: HouseholdDTO) => {
      const cfg = dataRef.current.config;
      const text = tpl in cfg.rsvp.templates ? cfg.rsvp.templates[tpl as TemplateId] : tpl;
      const ev = dataRef.current.event;
      return fillTemplate(text, {
        name: h.first || fullName(h),
        fullName: fullName(h),
        event: ev.title,
        date: formatDate(ev.date),
        time: ev.time ?? "",
        place: ev.venueName ?? "",
        link: rsvpUrl(h),
        table: tableLabelOf(h, tablesById) || "יפורסם בכניסה",
        gift: hasGiftDetails(cfg.giftDetails) ? giftDetailsText(cfg.giftDetails) : "",
      });
    },
    [rsvpUrl, tablesById],
  );

  const value: Planner = {
    code,
    data,
    stats,
    tablesById,
    saveConfig,
    saveFloor,
    addHouseholds,
    patchHouseholds,
    patchOne,
    deleteHouseholds,
    restoreHouseholds,
    newLink,
    saveRecord,
    deleteRecord,
    uploadVendorFile,
    deleteVendorFile,
    vendorFileUrl,
    sync,
    unlinkSheet,
    syncState,
    message,
    rsvpUrl,
    reload,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Browsers sometimes leave the type empty (e.g. HEIC, some Office files on phones): guess from the extension. */
function fileMime(f: File): string {
  if (f.type) return f.type;
  const ext = f.name.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain",
  };
  return map[ext] ?? "application/octet-stream";
}

export function sheetError(code: string | null | undefined): string {
  switch (code) {
    case "sheets_disabled":
      return "השירות Google Sheets לא מופעל באתר. מנהל/ת האתר צריך/ה להפעיל את Google Sheets API ב-Google Cloud.";
    case "sheet_missing":
      return "הגיליון לא נמצא ב-Google Drive (אולי נמחק). אפשר ליצור גיליון חדש.";
    case "account_disconnected":
      return "החיבור לחשבון ה-Google של האירוע פג. בעל האירוע צריך לחבר אותו מחדש (בהגדרות האירוע).";
    case "sheet_no_access":
      return "אין לאתר גישה לגיליון. ייתכן שהוא הועבר לבעלות של חשבון אחר.";
    case "sheet_no_ids":
      return 'עמודת "מזהה" נמחקה מהגיליון, ולכן אי אפשר לדעת איזו שורה היא איזו הזמנה. מחזירים אותה בגיליון (ביטול פעולה), או כותבים את הגיליון מחדש מהאתר בהגדרות.';
    case "google_rate_limited":
      return "Google עמוסה כרגע. ננסה שוב בעוד רגע.";
    default:
      return "הסנכרון עם הגיליון נכשל. ננסה שוב בעוד רגע.";
  }
}
