/**
 * The hosts' event planner ("רשימת אורחים"): guest list + RSVP, seating chart, gifts, vendors and expenses.
 * Shared by the Worker (sanitizing what is stored) and the browser (UI, statistics, auto-seating, import/export).
 * Everything here is pure: no fetch, no DOM, no Date.now() unless passed in.
 */
import type { EventType } from "./types";

// ------------------------------------------------------------------ limits

export const MAX_HOUSEHOLDS = 1500;
export const MAX_FLOOR_ITEMS = 300;
export const MAX_VENDORS = 200;
export const MAX_EXPENSES = 600;
export const MAX_TAGS = 30;
export const MAX_CUSTOM_FIELDS = 30;
export const MAX_PAYMENTS = 24;
export const MAX_PARTY = 60;
export const NAME_MAX = 40;
export const NOTE_MAX = 500;
export const TEMPLATE_MAX = 1000;

// ------------------------------------------------------------------ small sanitizers

const ID_RE = /^[A-Za-z0-9_-]{1,24}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const obj = (v: unknown) => (isObj(v) ? v : {});
export const cleanText = (v: unknown, max: number, multiline = false) => {
  let s = typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
  s = s.normalize("NFKC");
  s = multiline ? s.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  return s.trim().slice(0, max);
};
const int = (v: unknown, min: number, max: number, d: number) => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v.replace(/[,\s₪]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
};
const num = (v: unknown, min: number, max: number, d: number) => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v.replace(/[,\s₪]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : d;
};
const money = (v: unknown) => (v === null || v === "" || v === undefined ? null : num(v, 0, 100_000_000, 0));
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const id = (v: unknown) => (typeof v === "string" && ID_RE.test(v) ? v : null);
const color = (v: unknown, d: string) => (typeof v === "string" && COLOR_RE.test(v.toLowerCase()) ? v.toLowerCase() : d);
const time = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
/** "YYYY-MM-DD" or null. */
export const cleanDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
export const newId = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

/**
 * Categorical colors for sides / circles / meals, in fixed order. The first 8 passed the dataviz palette validator
 * (light: all checks; CVD 6.9 in the legal band because every tag is always shown with its name; on the dark theme
 * some are under 3:1, again relieved by the visible names). The last 4 are extra choices for the color picker.
 */
export const TAG_COLORS = ["#2563eb", "#ea580c", "#16a34a", "#7c3aed", "#db2777", "#0891b2", "#a16207", "#4f46e5", "#0d9488", "#9333ea", "#65a30d", "#dc2626"];

// ------------------------------------------------------------------ settings

export type Tag = { id: string; name: string; color: string };
export type CustomFieldType = "text" | "number" | "choice" | "checkbox" | "date";
export const CUSTOM_FIELD_TYPES: CustomFieldType[] = ["text", "number", "choice", "checkbox", "date"];
export type CustomField = { id: string; label: string; type: CustomFieldType; options: string[] };
export type PlanBy = "confirmed" | "confirmed_maybe" | "all";
export type BudgetCategory = { id: string; name: string; planned: number | null };

export interface RsvpSettings {
  open: boolean;
  /** last day to answer ("YYYY-MM-DD"); after it the personal link only shows the answer given */
  deadline: string | null;
  askKids: boolean;
  askMeals: boolean;
  askNote: boolean;
  /** a guest may confirm more people than invited */
  allowMore: boolean;
  templates: Record<TemplateId, string>;
}

/** Israeli banks (code - name) for the gift transfer details. */
export const ISRAELI_BANKS: { code: string; name: string }[] = [
  { code: "12", name: "בנק הפועלים" },
  { code: "10", name: "בנק לאומי" },
  { code: "11", name: "בנק דיסקונט" },
  { code: "20", name: "בנק מזרחי טפחות" },
  { code: "31", name: "הבנק הבינלאומי" },
  { code: "17", name: "בנק מרכנתיל" },
  { code: "14", name: "בנק אוצר החייל" },
  { code: "46", name: "בנק מסד" },
  { code: "52", name: "בנק פועלי אגודת ישראל" },
  { code: "54", name: "בנק ירושלים" },
  { code: "4", name: "בנק יהב" },
  { code: "9", name: "בנק הדואר" },
  { code: "18", name: "וואן זירו" },
];

/** Where guests can send a gift: bank transfer details (+ Bit / PayBox), shown on the personal RSVP link. */
export interface GiftDetails {
  /** show them to guests on the personal RSVP page */
  onRsvp: boolean;
  /** account holder(s) as the bank knows them */
  holder: string;
  /** bank code from ISRAELI_BANKS, or a free name */
  bank: string;
  branch: string;
  account: string;
  /** for transfers from abroad (optional) */
  iban: string;
  /** phone for Bit / PayBox */
  bitPhone: string;
  /** a PayBox group link or another payment page (https only) */
  payLink: string;
  note: string;
}
export const emptyGiftDetails = (): GiftDetails => ({ onRsvp: false, holder: "", bank: "", branch: "", account: "", iban: "", bitPhone: "", payLink: "", note: "" });
export const hasGiftDetails = (g: GiftDetails) => !!(g.account || g.bitPhone || g.payLink || g.iban);
export const bankName = (bank: string) => ISRAELI_BANKS.find((b) => b.code === bank)?.name ?? bank;

/** The details as plain lines (copy / WhatsApp message). */
export function giftDetailsText(g: GiftDetails): string {
  const lines: string[] = [];
  if (g.account) {
    const code = ISRAELI_BANKS.some((b) => b.code === g.bank) ? ` (${g.bank})` : "";
    lines.push(`העברה בנקאית: ${bankName(g.bank)}${code}${g.branch ? `, סניף ${g.branch}` : ""}, חשבון ${g.account}${g.holder ? `, על שם ${g.holder}` : ""}`);
  }
  if (g.iban) lines.push(`IBAN: ${g.iban}`);
  if (g.bitPhone) lines.push(`ביט / פייבוקס: ${g.bitPhone}`);
  if (g.payLink) lines.push(g.payLink);
  return lines.join("\n");
}

function cleanGiftDetails(v: unknown): GiftDetails {
  const o = obj(v);
  const digits = (x: unknown, max: number) => cleanText(x, 40).replace(/[^\d-]/g, "").slice(0, max);
  const link = cleanText(o.payLink, 300);
  return {
    onRsvp: bool(o.onRsvp, false),
    holder: cleanText(o.holder, 80),
    bank: cleanText(o.bank, 40),
    branch: digits(o.branch, 6),
    account: digits(o.account, 20),
    iban: cleanText(o.iban, 40).replace(/[^A-Za-z0-9 ]/g, "").toUpperCase(),
    bitPhone: cleanText(o.bitPhone, 30),
    payLink: /^https:\/\/[^\s"'<>]+$/i.test(link) ? link : "",
    note: cleanText(o.note, 300, true),
  };
}

export interface PlannerConfig {
  v: 1;
  /** the first-visit wizard was done (or skipped) */
  onboarded: boolean;
  /** "צדדים" = the hosts (בעלי השמחה) a guest belongs to; empty = no sides */
  sides: Tag[];
  /** "מעגל" = where the hosts know the guest from */
  circles: Tag[];
  /** built-in columns the hosts turned off */
  hidden: FieldKey[];
  custom: CustomField[];
  /** special meals (the rest get the regular meal) */
  meals: Tag[];
  /** % of the not-yet-answered invited people expected to come (Israel: ~85%) */
  turnoutPct: number;
  /** seats left free at every table when auto-seating */
  spareSeats: number;
  /** who the seating plan counts */
  planBy: PlanBy;
  rsvp: RsvpSettings;
  budget: { total: number | null; perGuest: number | null; minGuests: number | null; categories: BudgetCategory[] };
  /** guests may see their table (personal RSVP link + "find my table" element) */
  seatingPublished: boolean;
  /** bank / Bit details for gifts */
  giftDetails: GiftDetails;
}

export const TEMPLATE_IDS = ["invite", "reminder", "table", "thanks"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];
export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  invite: "הזמנה ואישור הגעה",
  reminder: "תזכורת למי שעוד לא ענה",
  table: "מספר השולחן (ביום האירוע)",
  thanks: "תודה אחרי האירוע",
};
/** Placeholders the hosts can put in a message. */
export const PLACEHOLDERS = ["{שם}", "{שם מלא}", "{אירוע}", "{תאריך}", "{שעה}", "{מקום}", "{קישור}", "{שולחן}", "{פרטים למתנה}"] as const;
export const DEFAULT_TEMPLATES: Record<TemplateId, string> = {
  invite: "שלום {שם}! אנחנו שמחים להזמין אתכם ל{אירוע} ב{תאריך}{מקום}.\nנשמח אם תאשרו הגעה בקישור:\n{קישור}",
  reminder: "שלום {שם}, עוד לא קיבלנו את אישור ההגעה שלכם ל{אירוע}. אפשר לאשר כאן בקליק:\n{קישור}",
  table: "שלום {שם}! מחכים לכם היום ב{אירוע}. השולחן שלכם: {שולחן}.\n{קישור}",
  thanks: "{שם}, תודה רבה שבאתם ל{אירוע}! היה לנו כיף גדול לחגוג איתכם.",
};

export const DEFAULT_CIRCLES = ["משפחה", "חברים", "עבודה", "צבא", "לימודים", "שכנים"];

/** Default sides by event type: weddings have two families; a bar/bat mitzvah has mom's and dad's side. */
export function defaultSides(type: EventType): string[] {
  if (type === "wedding") return ["צד הכלה", "צד החתן", "משותף"];
  if (type === "family") return ["צד אמא", "צד אבא", "משותף"];
  return [];
}

export const tagsFrom = (names: string[], offset = 0): Tag[] =>
  names.map((name, i) => ({ id: newId(), name, color: TAG_COLORS[(i + offset) % TAG_COLORS.length] }));

export function defaultConfig(type: EventType): PlannerConfig {
  return {
    v: 1,
    onboarded: false,
    sides: tagsFrom(defaultSides(type)),
    circles: tagsFrom(DEFAULT_CIRCLES, 3),
    hidden: ["email", "priority", "accessibility", "arrived"],
    custom: [],
    meals: tagsFrom(["צמחוני", "טבעוני", "ללא גלוטן", "מנת ילדים"], 6),
    turnoutPct: 85,
    spareSeats: 0,
    planBy: "confirmed_maybe",
    rsvp: { open: true, deadline: null, askKids: true, askMeals: false, askNote: true, allowMore: false, templates: { ...DEFAULT_TEMPLATES } },
    budget: { total: null, perGuest: null, minGuests: null, categories: [] },
    seatingPublished: false,
    giftDetails: emptyGiftDetails(),
  };
}

function cleanTags(v: unknown, max = MAX_TAGS): Tag[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: Tag[] = [];
  for (const t of v) {
    const o = obj(t);
    const tid = id(o.id);
    const name = cleanText(o.name, NAME_MAX);
    if (!tid || !name || seen.has(tid)) continue;
    seen.add(tid);
    out.push({ id: tid, name, color: color(o.color, TAG_COLORS[out.length % TAG_COLORS.length]) });
    if (out.length >= max) break;
  }
  return out;
}

export function sanitizeConfig(input: unknown, type: EventType): PlannerConfig {
  const d = defaultConfig(type);
  const o = obj(input);
  if (o.v !== 1) return d;
  const r = obj(o.rsvp);
  const tpl = obj(r.templates);
  const b = obj(o.budget);
  const custom: CustomField[] = [];
  if (Array.isArray(o.custom))
    for (const f of o.custom) {
      const x = obj(f);
      const fid = id(x.id);
      const label = cleanText(x.label, NAME_MAX);
      if (!fid || !label || custom.some((c) => c.id === fid)) continue;
      const options = Array.isArray(x.options) ? [...new Set(x.options.map((s) => cleanText(s, NAME_MAX)).filter(Boolean))].slice(0, 30) : [];
      custom.push({ id: fid, label, type: oneOf(x.type, CUSTOM_FIELD_TYPES, "text"), options });
      if (custom.length >= MAX_CUSTOM_FIELDS) break;
    }
  const cats: BudgetCategory[] = [];
  if (Array.isArray(b.categories))
    for (const c of b.categories) {
      const x = obj(c);
      const cid = id(x.id);
      const name = cleanText(x.name, NAME_MAX);
      if (cid && name && !cats.some((k) => k.id === cid)) cats.push({ id: cid, name, planned: money(x.planned) });
      if (cats.length >= MAX_TAGS) break;
    }
  return {
    v: 1,
    onboarded: bool(o.onboarded, false),
    sides: cleanTags(o.sides),
    circles: cleanTags(o.circles),
    hidden: Array.isArray(o.hidden) ? [...new Set(o.hidden.filter((k): k is FieldKey => HIDEABLE.includes(k as FieldKey)))] : d.hidden,
    custom,
    meals: cleanTags(o.meals, 12),
    turnoutPct: int(o.turnoutPct, 0, 100, d.turnoutPct),
    spareSeats: int(o.spareSeats, 0, 10, 0),
    planBy: oneOf(o.planBy, ["confirmed", "confirmed_maybe", "all"] as const, d.planBy),
    rsvp: {
      open: bool(r.open, true),
      deadline: cleanDate(r.deadline),
      askKids: bool(r.askKids, true),
      askMeals: bool(r.askMeals, false),
      askNote: bool(r.askNote, true),
      allowMore: bool(r.allowMore, false),
      templates: Object.fromEntries(TEMPLATE_IDS.map((k) => [k, cleanText(tpl[k], TEMPLATE_MAX, true) || DEFAULT_TEMPLATES[k]])) as Record<TemplateId, string>,
    },
    budget: { total: money(b.total), perGuest: money(b.perGuest), minGuests: b.minGuests == null ? null : int(b.minGuests, 0, 100_000, 0), categories: cats },
    seatingPublished: bool(o.seatingPublished, false),
    giftDetails: cleanGiftDetails(o.giftDetails),
  };
}

// ------------------------------------------------------------------ households (one invitation)

export const STATUSES = ["pending", "coming", "maybe", "not_coming"] as const;
export type RsvpStatus = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<RsvpStatus, string> = { pending: "ממתין", coming: "מגיע", maybe: "אולי", not_coming: "לא מגיע" };
/** Semantic colors of the statuses (text on them is white or dark as noted in the UI). */
export const STATUS_COLORS: Record<RsvpStatus, string> = { pending: "#64748b", coming: "#16a34a", maybe: "#d97706", not_coming: "#dc2626" };

export const GIFT_METHODS = ["cash", "cheque", "bit", "paybox", "transfer", "card", "gift"] as const;
export type GiftMethod = (typeof GIFT_METHODS)[number];
export const GIFT_LABELS: Record<GiftMethod, string> = {
  cash: "מזומן",
  cheque: "צ'ק",
  bit: "ביט",
  paybox: "פייבוקס",
  transfer: "העברה בנקאית",
  card: "כרטיס אשראי",
  gift: "מתנה",
};

export type RsvpBy = "guest" | "host" | "sheet";
export type Seat = { t: string; n: number };
export type CustomValue = string | number | boolean | null;

export interface Household {
  id: string;
  first: string;
  last: string;
  /** stored as typed by the hosts, normalized for links with waNumber() */
  phone: string;
  email: string;
  side: string | null;
  circle: string | null;
  priority: "a" | "b" | null;
  /** invited people in total (including the main guest), of them kids */
  invited: number;
  invitedKids: number;
  /** names of the people who come with the main guest */
  companions: string[];
  status: RsvpStatus;
  /** confirmed people (when coming / maybe), of them kids */
  coming: number;
  comingKids: number;
  rsvpAt: number | null;
  rsvpBy: RsvpBy | null;
  /** what the guest wrote with their answer */
  guestNote: string;
  inviteSentAt: number | null;
  reminders: number;
  lastContactAt: number | null;
  /** special meals: meal tag id -> number of people */
  meals: Record<string, number>;
  allergies: string;
  accessibility: string;
  notes: string;
  /** tables: usually one entry with the whole party; a family may be split */
  seats: Seat[];
  giftAmount: number | null;
  giftMethod: GiftMethod | null;
  giftNote: string;
  thanked: boolean;
  /** people checked in at the entrance on the day */
  arrived: number;
  custom: Record<string, CustomValue>;
}

/** What the browser gets: + the personal RSVP token and timestamps. */
export type HouseholdDTO = Household & { token: string; sort: number; createdAt: number; updatedAt: number };

export function emptyHousehold(hid = newId()): Household {
  return {
    id: hid,
    first: "",
    last: "",
    phone: "",
    email: "",
    side: null,
    circle: null,
    priority: null,
    invited: 1,
    invitedKids: 0,
    companions: [],
    status: "pending",
    coming: 0,
    comingKids: 0,
    rsvpAt: null,
    rsvpBy: null,
    guestNote: "",
    inviteSentAt: null,
    reminders: 0,
    lastContactAt: null,
    meals: {},
    allergies: "",
    accessibility: "",
    notes: "",
    seats: [],
    giftAmount: null,
    giftMethod: null,
    giftNote: "",
    thanked: false,
    arrived: 0,
    custom: {},
  };
}

export function sanitizeCustomValue(f: CustomField, v: unknown): CustomValue {
  if (v === null || v === undefined || v === "") return null;
  switch (f.type) {
    case "number":
      return num(v, -1e9, 1e9, 0);
    case "checkbox":
      return typeof v === "boolean" ? v : ["כן", "v", "✓", "true", "1", "yes", "x"].includes(String(v).trim().toLowerCase());
    case "date":
      return cleanDate(v);
    case "choice":
    case "text":
    default:
      return cleanText(v, 200) || null;
  }
}

/** Whole household from anything (stored JSON, a client patch merged on top of the stored one). */
export function sanitizeHousehold(input: unknown, cfg: PlannerConfig, hid: string): Household {
  const o = obj(input);
  const invited = int(o.invited, 0, MAX_PARTY, 1);
  const allowMore = cfg.rsvp.allowMore;
  const status = oneOf(o.status, STATUSES, "pending");
  const comingMax = allowMore ? MAX_PARTY : Math.max(invited, 1);
  let coming = int(o.coming, 0, comingMax, 0);
  if (status === "not_coming") coming = 0;
  const meals: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(o.meals))) {
    const n = int(v, 0, MAX_PARTY, 0);
    if (n > 0 && cfg.meals.some((m) => m.id === k)) meals[k] = n;
  }
  const seats: Seat[] = [];
  if (Array.isArray(o.seats))
    for (const s of o.seats) {
      const x = obj(s);
      const t = id(x.t);
      const n = int(x.n, 1, MAX_PARTY, 1);
      if (t && !seats.some((q) => q.t === t)) seats.push({ t, n });
      if (seats.length >= 10) break;
    }
  const custom: Record<string, CustomValue> = {};
  const co = obj(o.custom);
  for (const f of cfg.custom) {
    const v = sanitizeCustomValue(f, co[f.id]);
    if (v !== null) custom[f.id] = v;
  }
  return {
    id: hid,
    first: cleanText(o.first, NAME_MAX),
    last: cleanText(o.last, NAME_MAX),
    phone: cleanText(o.phone, 30),
    email: cleanText(o.email, 120).toLowerCase(),
    side: cfg.sides.some((s) => s.id === o.side) ? (o.side as string) : null,
    circle: cfg.circles.some((s) => s.id === o.circle) ? (o.circle as string) : null,
    priority: o.priority === "a" || o.priority === "b" ? o.priority : null,
    invited,
    invitedKids: Math.min(int(o.invitedKids, 0, MAX_PARTY, 0), invited),
    companions: Array.isArray(o.companions) ? o.companions.map((s) => cleanText(s, NAME_MAX)).filter(Boolean).slice(0, MAX_PARTY) : [],
    status,
    coming,
    comingKids: Math.min(int(o.comingKids, 0, MAX_PARTY, 0), coming),
    rsvpAt: time(o.rsvpAt),
    rsvpBy: o.rsvpBy === "guest" || o.rsvpBy === "host" || o.rsvpBy === "sheet" ? o.rsvpBy : null,
    guestNote: cleanText(o.guestNote, NOTE_MAX, true),
    inviteSentAt: time(o.inviteSentAt),
    reminders: int(o.reminders, 0, 99, 0),
    lastContactAt: time(o.lastContactAt),
    meals,
    allergies: cleanText(o.allergies, 200),
    accessibility: cleanText(o.accessibility, 200),
    notes: cleanText(o.notes, NOTE_MAX, true),
    seats,
    giftAmount: money(o.giftAmount),
    giftMethod: GIFT_METHODS.includes(o.giftMethod as GiftMethod) ? (o.giftMethod as GiftMethod) : null,
    giftNote: cleanText(o.giftNote, 200),
    thanked: bool(o.thanked, false),
    arrived: int(o.arrived, 0, MAX_PARTY, 0),
    custom,
  };
}

/** Fields a host PATCH may change (the rest are bookkeeping kept by the server). */
export const HOST_EDITABLE: (keyof Household)[] = [
  "first", "last", "phone", "email", "side", "circle", "priority", "invited", "invitedKids", "companions", "status", "coming",
  "comingKids", "guestNote", "inviteSentAt", "reminders", "lastContactAt", "meals", "allergies", "accessibility", "notes", "seats",
  "giftAmount", "giftMethod", "giftNote", "thanked", "arrived", "custom",
];

export const fullName = (h: Pick<Household, "first" | "last">) => `${h.first} ${h.last}`.trim();

/** How many people this invitation counts as right now (for seating / expected attendance). */
export function partySize(h: Household, planBy: PlanBy): number {
  if (h.status === "not_coming") return 0;
  if (h.status === "coming") return h.coming || h.invited;
  if (h.status === "maybe") return planBy === "confirmed" ? 0 : h.coming || h.invited;
  return planBy === "all" ? h.invited : 0;
}

export const seatedCount = (h: Household) => h.seats.reduce((a, s) => a + s.n, 0);

// ------------------------------------------------------------------ the field registry (table columns / sheet / CSV)

export type FieldKey =
  | "first" | "last" | "phone" | "email" | "side" | "circle" | "priority" | "invited" | "invitedKids" | "companions" | "status"
  | "coming" | "comingKids" | "meals" | "allergies" | "accessibility" | "notes" | "guestNote" | "table" | "inviteSentAt"
  | "reminders" | "giftAmount" | "giftMethod" | "giftNote" | "thanked" | "arrived" | "link";

export type FieldGroup = "basic" | "rsvp" | "needs" | "seating" | "gift" | "day";
export interface FieldDef {
  key: FieldKey;
  /** column title (also the Google Sheet / CSV header) */
  label: string;
  /** other headers recognized when importing */
  aliases: string[];
  group: FieldGroup;
  kind: "text" | "int" | "money" | "status" | "side" | "circle" | "priority" | "list" | "date" | "gift" | "bool" | "table" | "meals" | "link";
  /** may be turned off in the settings */
  hideable: boolean;
  /** shown in the sheet but changed only in the app */
  readOnly?: boolean;
}

export const FIELDS: FieldDef[] = [
  { key: "first", label: "שם פרטי", aliases: ["שם", "first name", "first", "name", "שם המוזמן"], group: "basic", kind: "text", hideable: false },
  { key: "last", label: "שם משפחה", aliases: ["משפחה", "last name", "last", "surname"], group: "basic", kind: "text", hideable: false },
  { key: "phone", label: "טלפון", aliases: ["נייד", "פלאפון", "מספר טלפון", "phone", "mobile", "tel"], group: "basic", kind: "text", hideable: true },
  { key: "email", label: "אימייל", aliases: ["מייל", "דואל", "email", "e-mail", "דוא\"ל"], group: "basic", kind: "text", hideable: true },
  { key: "side", label: "צד", aliases: ["side", "צד של"], group: "basic", kind: "side", hideable: true },
  { key: "circle", label: "מעגל", aliases: ["קבוצה", "מאיפה מכירים", "קשר", "group", "circle"], group: "basic", kind: "circle", hideable: true },
  { key: "priority", label: "עדיפות", aliases: ["רשימה", "priority"], group: "basic", kind: "priority", hideable: true },
  { key: "invited", label: "מספר מוזמנים", aliases: ["מוזמנים", "כמות", "מספר אורחים", "invited", "guests", "party size", "כמות מוזמנים"], group: "basic", kind: "int", hideable: false },
  { key: "invitedKids", label: "מתוכם ילדים", aliases: ["ילדים", "kids", "children"], group: "basic", kind: "int", hideable: true },
  { key: "companions", label: "שמות המצטרפים", aliases: ["נלווים", "מצטרפים", "שמות הנלווים", "companions", "plus ones"], group: "basic", kind: "list", hideable: true },
  { key: "status", label: "סטטוס", aliases: ["אישור הגעה", "מגיע?", "status", "rsvp"], group: "rsvp", kind: "status", hideable: false },
  { key: "coming", label: "מספר מגיעים", aliases: ["מגיעים", "אישרו", "confirmed", "coming"], group: "rsvp", kind: "int", hideable: false },
  { key: "comingKids", label: "ילדים מגיעים", aliases: ["kids coming"], group: "rsvp", kind: "int", hideable: true },
  { key: "guestNote", label: "הערת האורח", aliases: ["guest note"], group: "rsvp", kind: "text", hideable: true },
  { key: "inviteSentAt", label: "הזמנה נשלחה", aliases: ["נשלח", "invite sent"], group: "rsvp", kind: "date", hideable: true },
  { key: "reminders", label: "תזכורות", aliases: ["reminders"], group: "rsvp", kind: "int", hideable: true },
  { key: "meals", label: "מנות מיוחדות", aliases: ["מנות", "מנה", "meals", "meal"], group: "needs", kind: "meals", hideable: true },
  { key: "allergies", label: "אלרגיות", aliases: ["רגישויות", "allergies"], group: "needs", kind: "text", hideable: true },
  { key: "accessibility", label: "נגישות", aliases: ["צרכים מיוחדים", "accessibility"], group: "needs", kind: "text", hideable: true },
  { key: "table", label: "שולחן", aliases: ["מספר שולחן", "table"], group: "seating", kind: "table", hideable: true },
  { key: "giftAmount", label: "מתנה (₪)", aliases: ["מתנה", "סכום", "סכום מתנה", "gift", "gift amount", "צ'ק"], group: "gift", kind: "money", hideable: true },
  { key: "giftMethod", label: "אמצעי", aliases: ["אמצעי תשלום", "אמצעי מתנה", "gift method"], group: "gift", kind: "gift", hideable: true },
  { key: "giftNote", label: "הערה למתנה", aliases: ["gift note"], group: "gift", kind: "text", hideable: true },
  { key: "thanked", label: "נשלחה תודה", aliases: ["תודה", "thanked"], group: "gift", kind: "bool", hideable: true },
  { key: "arrived", label: "הגיעו בפועל", aliases: ["הגיעו", "arrived", "checked in"], group: "day", kind: "int", hideable: true },
  { key: "notes", label: "הערות", aliases: ["הערה", "notes", "note"], group: "basic", kind: "text", hideable: true },
  { key: "link", label: "קישור אישי", aliases: ["קישור", "link"], group: "rsvp", kind: "link", hideable: true, readOnly: true },
];
export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<FieldKey, FieldDef>;
export const HIDEABLE = FIELDS.filter((f) => f.hideable).map((f) => f.key);
export const GROUP_LABELS: Record<FieldGroup, string> = {
  basic: "פרטים",
  rsvp: "אישור הגעה",
  needs: "מנות וצרכים",
  seating: "הושבה",
  gift: "מתנות",
  day: "ביום האירוע",
};

/** Built-in fields that are on, in order; "side" disappears when the event has no sides. */
export function visibleFields(cfg: PlannerConfig): FieldDef[] {
  return FIELDS.filter((f) => !cfg.hidden.includes(f.key) && !(f.key === "side" && !cfg.sides.length) && !(f.key === "meals" && !cfg.meals.length));
}

// ------------------------------------------------------------------ phones, links, messages

/** International digits for wa.me / tel ("050-1234567" -> "972501234567"); "" when it doesn't look like a phone. */
export function waNumber(phone: string): string {
  let d = (phone || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "972" + d.slice(1);
  else if (d.length === 9 && d.startsWith("5")) d = "972" + d;
  return /^\d{8,15}$/.test(d) ? d : "";
}

/** Readable Israeli format for display ("972501234567" -> "050-123-4567"). */
export function displayPhone(phone: string): string {
  const d = waNumber(phone);
  if (d.startsWith("9725") && d.length === 12) return `0${d.slice(3, 5)}-${d.slice(5, 8)}-${d.slice(8)}`;
  if (d.startsWith("972") && d.length === 11) return `0${d.slice(3, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  return phone;
}

export const waLink = (phone: string, text: string) => {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
};
export const telLink = (phone: string) => {
  const n = waNumber(phone);
  return n ? `tel:+${n}` : `tel:${phone}`;
};
export const smsLink = (phone: string, text: string) => `sms:${waNumber(phone) ? "+" + waNumber(phone) : phone}?&body=${encodeURIComponent(text)}`;

export type TemplateVars = { name: string; fullName: string; event: string; date: string; time: string; place: string; link: string; table: string; gift?: string };

/** Fills {שם} etc.; a placeholder with no value disappears (with the space/comma before it). */
export function fillTemplate(tpl: string, v: TemplateVars): string {
  const map: Record<string, string> = {
    "{שם}": v.name,
    "{שם מלא}": v.fullName,
    "{אירוע}": v.event,
    "{תאריך}": v.date,
    "{שעה}": v.time,
    "{מקום}": v.place ? ` ב${v.place}` : "",
    "{קישור}": v.link,
    "{שולחן}": v.table,
    "{פרטים למתנה}": v.gift ?? "",
  };
  return tpl.replace(/\{[^{}]{1,14}\}/g, (m) => (m in map ? map[m] : m)).replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").trim();
}

// ------------------------------------------------------------------ floor plan (seating chart)

export const TABLE_SHAPES = ["round", "square", "rect", "oval", "knights", "halfround"] as const;
export type TableShape = (typeof TABLE_SHAPES)[number];
export const SHAPE_LABELS: Record<TableShape, string> = {
  round: "עגול",
  square: "מרובע",
  rect: "מלבני",
  oval: "אובלי",
  knights: "אבירים",
  halfround: "חצי עיגול",
};
export const ELEMENT_KINDS = [
  "dance_floor", "stage", "dj", "bar", "buffet", "chuppah", "entrance", "exit", "pillar", "gift_table", "photo_booth", "kids_corner", "area", "wall", "text",
] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];
export type FloorKind = "table" | ElementKind;
export const ELEMENT_LABELS: Record<ElementKind, string> = {
  dance_floor: "רחבת ריקודים",
  stage: "במה",
  dj: "עמדת DJ",
  bar: "בר",
  buffet: "בופה",
  chuppah: "חופה",
  entrance: "כניסה",
  exit: "יציאה",
  pillar: "עמוד",
  gift_table: "שולחן מתנות",
  photo_booth: "עמדת צילום / מגנטים",
  kids_corner: "פינת ילדים",
  area: "אזור",
  wall: "קיר / מחיצה",
  text: "טקסט חופשי",
};
export const TABLE_KINDS = ["regular", "vip", "family", "kids", "reserve", "staff"] as const;
export type TableKind = (typeof TABLE_KINDS)[number];
export const TABLE_KIND_LABELS: Record<TableKind, string> = {
  regular: "רגיל",
  vip: "שולחן כבוד",
  family: "משפחה",
  kids: "ילדים",
  reserve: "רזרבה",
  staff: "צוות / ספקים",
};
export const AUDIENCES = ["mixed", "men", "women"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABELS: Record<Audience, string> = { mixed: "מעורב", men: "גברים", women: "נשים" };

export interface FloorItem {
  id: string;
  kind: FloorKind;
  shape: TableShape;
  /** center, in floor units (1 unit ~ 1 cm) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** degrees */
  rot: number;
  /** tables: chairs */
  seats: number;
  /** tables: number or name ("12", "משפחת כהן"); elements: label */
  label: string;
  color: string | null;
  tableKind: TableKind;
  audience: Audience;
  /** text elements */
  text: string;
  fontSize: number;
  locked: boolean;
}

export interface FloorPlan {
  v: 1;
  w: number;
  h: number;
  items: FloorItem[];
}

export const FLOOR_DEFAULT = { w: 2400, h: 1600 } as const;
export const emptyFloor = (): FloorPlan => ({ v: 1, w: FLOOR_DEFAULT.w, h: FLOOR_DEFAULT.h, items: [] });

/** Default size of a new table for a seat count (bigger tables need more room). */
export function tableSize(shape: TableShape, seats: number): { w: number; h: number } {
  const s = Math.max(1, seats);
  switch (shape) {
    case "round":
      return { w: Math.round(Math.max(90, Math.min(260, 40 + s * 13))), h: Math.round(Math.max(90, Math.min(260, 40 + s * 13))) };
    case "square":
      return { w: Math.max(90, Math.min(260, 50 + Math.ceil(s / 4) * 45)), h: Math.max(90, Math.min(260, 50 + Math.ceil(s / 4) * 45)) };
    case "oval":
      return { w: Math.max(140, Math.min(420, 40 + Math.ceil(s / 2) * 40)), h: 120 };
    case "halfround":
      return { w: Math.max(140, Math.min(360, 60 + s * 18)), h: Math.max(80, Math.min(180, 30 + s * 9)) };
    case "knights":
      return { w: Math.max(160, Math.min(1200, 20 + Math.ceil(s / 2) * 60)), h: 90 };
    case "rect":
    default:
      return { w: Math.max(140, Math.min(600, 30 + Math.ceil(s / 2) * 55)), h: 90 };
  }
}

export const ELEMENT_SIZES: Record<ElementKind, { w: number; h: number }> = {
  dance_floor: { w: 500, h: 400 },
  stage: { w: 500, h: 200 },
  dj: { w: 180, h: 100 },
  bar: { w: 350, h: 90 },
  buffet: { w: 400, h: 90 },
  chuppah: { w: 220, h: 220 },
  entrance: { w: 200, h: 60 },
  exit: { w: 160, h: 60 },
  pillar: { w: 50, h: 50 },
  gift_table: { w: 160, h: 70 },
  photo_booth: { w: 200, h: 150 },
  kids_corner: { w: 300, h: 250 },
  area: { w: 400, h: 300 },
  wall: { w: 600, h: 16 },
  text: { w: 260, h: 60 },
};

export function sanitizeFloor(input: unknown): FloorPlan {
  const o = obj(input);
  if (o.v !== 1) return emptyFloor();
  const W = int(o.w, 600, 10_000, FLOOR_DEFAULT.w);
  const H = int(o.h, 600, 10_000, FLOOR_DEFAULT.h);
  const items: FloorItem[] = [];
  const seen = new Set<string>();
  if (Array.isArray(o.items))
    for (const it of o.items) {
      const x = obj(it);
      const iid = id(x.id);
      if (!iid || seen.has(iid)) continue;
      seen.add(iid);
      const kind: FloorKind = x.kind === "table" ? "table" : oneOf(x.kind, ELEMENT_KINDS, "area");
      items.push({
        id: iid,
        kind,
        shape: oneOf(x.shape, TABLE_SHAPES, "round"),
        x: num(x.x, -1000, W + 1000, W / 2),
        y: num(x.y, -1000, H + 1000, H / 2),
        w: num(x.w, 10, 5000, 120),
        h: num(x.h, 10, 5000, 120),
        rot: ((int(x.rot, -720, 720, 0) % 360) + 360) % 360,
        seats: kind === "table" ? int(x.seats, 1, 60, 10) : 0,
        label: cleanText(x.label, NAME_MAX),
        color: typeof x.color === "string" && COLOR_RE.test(x.color.toLowerCase()) ? x.color.toLowerCase() : null,
        tableKind: oneOf(x.tableKind, TABLE_KINDS, "regular"),
        audience: oneOf(x.audience, AUDIENCES, "mixed"),
        text: cleanText(x.text, 300, true),
        fontSize: int(x.fontSize, 10, 200, 32),
        locked: bool(x.locked, false),
      });
      if (items.length >= MAX_FLOOR_ITEMS) break;
    }
  return { v: 1, w: W, h: H, items };
}

export const tables = (f: FloorPlan) => f.items.filter((i) => i.kind === "table");
export const tableName = (t: FloorItem) => t.label || "ללא שם";

/** The label the guests see / the sheet shows for a household's table(s). */
export function tableLabelOf(h: Household, byId: Map<string, FloorItem>): string {
  return h.seats.map((s) => byId.get(s.t)).filter(Boolean).map((t) => tableName(t!)).join(", ");
}

/** Next free table number ("1", "2", ...) for a new table. */
export function nextTableNumber(f: FloorPlan): number {
  const used = new Set(tables(f).map((t) => Number(t.label)).filter((n) => Number.isInteger(n)));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

// ------------------------------------------------------------------ vendors and expenses

export const VENDOR_CATEGORIES = [
  "venue", "catering", "photo", "video", "magnets", "dj", "band", "design", "makeup", "rabbi", "transport", "bar", "attire", "invitations", "planner", "other",
] as const;
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];
export const VENDOR_CATEGORY_LABELS: Record<VendorCategory, string> = {
  venue: "אולם / גן אירועים",
  catering: "קייטרינג",
  photo: "צילום סטילס",
  video: "צילום וידאו",
  magnets: "צילום מגנטים",
  dj: "DJ",
  band: "להקה / מוזיקה",
  design: "עיצוב ופרחים",
  makeup: "איפור ושיער",
  rabbi: "רב / עורך טקס",
  transport: "הסעות",
  bar: "בר ומשקאות",
  attire: "שמלה / חליפה",
  invitations: "הזמנות ומיתוג",
  planner: "הפקה / ניהול אירוע",
  other: "אחר",
};
export const VENDOR_STATUSES = ["lead", "quote", "booked", "done", "cancelled"] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];
export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  lead: "בבדיקה",
  quote: "קיבלנו הצעה",
  booked: "סגרנו",
  done: "סיים",
  cancelled: "בוטל",
};

/** A contract / quote / invoice kept in the Drive of the event's Google account (uploaded from the vendor card). */
export interface VendorFile {
  /** Drive file id */
  id: string;
  name: string;
  mime: string;
  size: number;
  at: number;
  /** which Google account holds it ('self' | storage account id) - the event may move to another account later */
  acc: string;
}
export const MAX_VENDOR_FILES = 10;
export const MAX_VENDOR_FILE_BYTES = 15 * 1024 * 1024;
/** PDF, pictures (a photo of a signed contract), Word / Excel, plain text. */
export const VENDOR_FILE_MIME_RE =
  /^(application\/pdf|image\/(jpeg|png|webp|heic|heif)|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|application\/vnd\.ms-excel|text\/plain)$/;
export const VENDOR_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.txt,application/pdf,image/*";

export interface Vendor {
  id: string;
  category: VendorCategory;
  name: string;
  contact: string;
  phone: string;
  /** WhatsApp number when different from the phone */
  whatsapp: string;
  email: string;
  website: string;
  instagram: string;
  address: string;
  status: VendorStatus;
  /** when they arrive on the day ("HH:MM") */
  arrival: string | null;
  notes: string;
  favorite: boolean;
  /** contracts / quotes: only the server adds or removes them (a PUT from the browser keeps the stored list) */
  files: VendorFile[];
}

export type PaymentMethod = "cash" | "cheque" | "transfer" | "card" | "bit" | "other";
export const PAYMENT_METHODS: PaymentMethod[] = ["transfer", "card", "cash", "cheque", "bit", "other"];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  transfer: "העברה",
  card: "אשראי",
  cash: "מזומן",
  cheque: "צ'ק",
  bit: "ביט",
  other: "אחר",
};
export interface Payment {
  id: string;
  /** "מקדמה", "תשלום 2", "יתרה" ... */
  label: string;
  amount: number;
  due: string | null;
  paidAt: string | null;
  method: PaymentMethod | null;
}
export interface Expense {
  id: string;
  title: string;
  vendorId: string | null;
  /** a budget category id (config.budget.categories) or a vendor category */
  category: string | null;
  /** the agreed total; payments add up to it */
  amount: number;
  /** price per guest deals (the hall / catering): total = per guest x guests */
  perGuest: boolean;
  notes: string;
  payments: Payment[];
}

export type VendorDTO = Vendor & { sort: number; updatedAt: number };
export type ExpenseDTO = Expense & { sort: number; updatedAt: number };

const urlish = (v: unknown, max = 300) => {
  const s = cleanText(v, max);
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : /^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(s) ? `https://${s}` : s.startsWith("@") ? s : "";
};

export function emptyVendor(vid = newId()): Vendor {
  return { id: vid, category: "other", name: "", contact: "", phone: "", whatsapp: "", email: "", website: "", instagram: "", address: "", status: "lead", arrival: null, notes: "", favorite: false, files: [] };
}

export function sanitizeVendor(input: unknown, vid: string): Vendor {
  const o = obj(input);
  const arrival = typeof o.arrival === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.arrival) ? o.arrival : null;
  return {
    id: vid,
    category: oneOf(o.category, VENDOR_CATEGORIES, "other"),
    name: cleanText(o.name, 80),
    contact: cleanText(o.contact, NAME_MAX),
    phone: cleanText(o.phone, 30),
    whatsapp: cleanText(o.whatsapp, 30),
    email: cleanText(o.email, 120).toLowerCase(),
    website: urlish(o.website),
    instagram: cleanText(o.instagram, 80),
    address: cleanText(o.address, 200),
    status: oneOf(o.status, VENDOR_STATUSES, "lead"),
    arrival,
    notes: cleanText(o.notes, 2000, true),
    favorite: bool(o.favorite, false),
    files: cleanVendorFiles(o.files),
  };
}

function cleanVendorFiles(v: unknown): VendorFile[] {
  if (!Array.isArray(v)) return [];
  const out: VendorFile[] = [];
  for (const f of v) {
    const x = obj(f);
    const fid = typeof x.id === "string" && /^[A-Za-z0-9_-]{10,100}$/.test(x.id) ? x.id : null;
    const mime = typeof x.mime === "string" && VENDOR_FILE_MIME_RE.test(x.mime) ? x.mime : null;
    if (!fid || !mime || out.some((y) => y.id === fid)) continue;
    out.push({ id: fid, name: cleanText(x.name, 120) || "קובץ", mime, size: int(x.size, 0, MAX_VENDOR_FILE_BYTES, 0), at: time(x.at) ?? 0, acc: typeof x.acc === "string" ? cleanText(x.acc, 40) : "self" });
    if (out.length >= MAX_VENDOR_FILES) break;
  }
  return out;
}

export function emptyExpense(eid = newId()): Expense {
  return { id: eid, title: "", vendorId: null, category: null, amount: 0, perGuest: false, notes: "", payments: [] };
}

export function sanitizeExpense(input: unknown, eid: string): Expense {
  const o = obj(input);
  const payments: Payment[] = [];
  if (Array.isArray(o.payments))
    for (const p of o.payments) {
      const x = obj(p);
      const pid = id(x.id) ?? newId();
      if (payments.some((q) => q.id === pid)) continue;
      payments.push({
        id: pid,
        label: cleanText(x.label, NAME_MAX),
        amount: num(x.amount, 0, 100_000_000, 0),
        due: cleanDate(x.due),
        paidAt: cleanDate(x.paidAt),
        method: PAYMENT_METHODS.includes(x.method as PaymentMethod) ? (x.method as PaymentMethod) : null,
      });
      if (payments.length >= MAX_PAYMENTS) break;
    }
  return {
    id: eid,
    title: cleanText(o.title, 80),
    vendorId: id(o.vendorId),
    category: typeof o.category === "string" ? cleanText(o.category, 24) || null : null,
    amount: num(o.amount, 0, 100_000_000, 0),
    perGuest: bool(o.perGuest, false),
    notes: cleanText(o.notes, 1000, true),
    payments,
  };
}

/** The expense's real total: per-guest deals multiply by the expected attendance (or the minimum guaranteed). */
export function expenseTotal(e: Expense, guests: number, minGuests: number | null): number {
  if (!e.perGuest) return e.amount;
  return Math.round(e.amount * Math.max(guests, minGuests ?? 0));
}
export const paidOf = (e: Expense) => e.payments.reduce((a, p) => a + (p.paidAt ? p.amount : 0), 0);

// ------------------------------------------------------------------ the whole planner payload

export interface PlannerData {
  config: PlannerConfig;
  floor: FloorPlan;
  households: HouseholdDTO[];
  vendors: VendorDTO[];
  expenses: ExpenseDTO[];
  /** answers over time (dashboard sparkline): day ("YYYY-MM-DD") -> number of answers */
  replies: { day: string; n: number }[];
  sheet: SheetState | null;
  version: number;
  /** event basics for messages and the RSVP page */
  event: { code: string; title: string; type: EventType; theme: string; date: string | null; time: string | null; venueName: string | null; venueAddress: string | null };
}

export interface SheetState {
  url: string;
  syncedAt: number | null;
  error: string | null;
  /** the sheet lost many rows at once: waiting for the hosts to confirm the delete */
  pendingDeletes: number;
}

// ------------------------------------------------------------------ statistics (dashboard)

export interface Stats {
  households: number;
  invited: number;
  invitedKids: number;
  byStatus: Record<RsvpStatus, { households: number; people: number }>;
  confirmed: number;
  confirmedKids: number;
  maybe: number;
  /** confirmed + half the "maybe" + turnout% of the not-yet-answered */
  expected: number;
  /** people the seating plan counts (config.planBy) */
  toSeat: number;
  seated: number;
  seats: number;
  tables: number;
  /** people counted for seating who have no table yet */
  unseatedPeople: number;
  unseatedHouseholds: number;
  overTables: { id: string; label: string; over: number }[];
  bySide: { id: string | null; name: string; color: string; invited: number; confirmed: number }[];
  byCircle: { id: string | null; name: string; color: string; invited: number; confirmed: number }[];
  meals: { id: string; name: string; n: number }[];
  regularMeals: number;
  notSent: number;
  noPhone: number;
  gifts: { total: number; count: number; byMethod: { method: GiftMethod; total: number; count: number }[]; notThanked: number };
  arrived: number;
}

export function computeStats(hs: Household[], floor: FloorPlan, cfg: PlannerConfig): Stats {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, { households: 0, people: 0 }])) as Stats["byStatus"];
  const tbls = tables(floor);
  const tableIds = new Set(tbls.map((t) => t.id));
  const fill = new Map<string, number>();
  let invited = 0, invitedKids = 0, confirmed = 0, confirmedKids = 0, maybe = 0, pendingPeople = 0, toSeat = 0, seated = 0;
  let unseatedPeople = 0, unseatedHouseholds = 0, notSent = 0, noPhone = 0, arrived = 0;
  const side = new Map<string | null, { invited: number; confirmed: number }>();
  const circle = new Map<string | null, { invited: number; confirmed: number }>();
  const meals = new Map<string, number>();
  const gifts = new Map<GiftMethod, { total: number; count: number }>();
  let giftTotal = 0, giftCount = 0, notThanked = 0;
  for (const h of hs) {
    invited += h.invited;
    invitedKids += h.invitedKids;
    const ppl = h.status === "coming" || h.status === "maybe" ? h.coming || h.invited : h.status === "pending" ? h.invited : 0;
    byStatus[h.status].households++;
    byStatus[h.status].people += h.status === "not_coming" ? h.invited : ppl;
    if (h.status === "coming") {
      confirmed += h.coming || h.invited;
      confirmedKids += h.comingKids;
    } else if (h.status === "maybe") maybe += h.coming || h.invited;
    else if (h.status === "pending") pendingPeople += h.invited;
    const size = partySize(h, cfg.planBy);
    toSeat += size;
    let sat = 0;
    for (const s of h.seats) {
      if (!tableIds.has(s.t)) continue;
      sat += s.n;
      fill.set(s.t, (fill.get(s.t) ?? 0) + s.n);
    }
    seated += sat;
    if (size > sat) {
      unseatedPeople += size - sat;
      unseatedHouseholds++;
    }
    const conf = h.status === "coming" ? h.coming || h.invited : 0;
    const sd = side.get(h.side) ?? { invited: 0, confirmed: 0 };
    sd.invited += h.invited;
    sd.confirmed += conf;
    side.set(h.side, sd);
    const cc = circle.get(h.circle) ?? { invited: 0, confirmed: 0 };
    cc.invited += h.invited;
    cc.confirmed += conf;
    circle.set(h.circle, cc);
    if (h.status === "coming") for (const [k, n] of Object.entries(h.meals)) meals.set(k, (meals.get(k) ?? 0) + n);
    if (!h.inviteSentAt && h.status === "pending") notSent++;
    if (!waNumber(h.phone)) noPhone++;
    arrived += h.arrived;
    if (h.giftAmount != null || h.giftMethod) {
      giftCount++;
      giftTotal += h.giftAmount ?? 0;
      if (!h.thanked) notThanked++;
      if (h.giftMethod) {
        const g = gifts.get(h.giftMethod) ?? { total: 0, count: 0 };
        g.total += h.giftAmount ?? 0;
        g.count++;
        gifts.set(h.giftMethod, g);
      }
    }
  }
  const seats = tbls.reduce((a, t) => a + t.seats, 0);
  const overTables = tbls.filter((t) => (fill.get(t.id) ?? 0) > t.seats).map((t) => ({ id: t.id, label: tableName(t), over: (fill.get(t.id) ?? 0) - t.seats }));
  const tagRows = (tags: Tag[], m: Map<string | null, { invited: number; confirmed: number }>) => {
    const rows = tags.map((t) => ({ id: t.id as string | null, name: t.name, color: t.color, ...(m.get(t.id) ?? { invited: 0, confirmed: 0 }) }));
    const none = m.get(null);
    if (none && none.invited) rows.push({ id: null, name: "לא שויך", color: "#94a3b8", ...none });
    return rows;
  };
  const specialMeals = cfg.meals.map((m) => ({ id: m.id, name: m.name, n: meals.get(m.id) ?? 0 }));
  const special = specialMeals.reduce((a, m) => a + m.n, 0);
  return {
    households: hs.length,
    invited,
    invitedKids,
    byStatus,
    confirmed,
    confirmedKids,
    maybe,
    expected: Math.round(confirmed + maybe * 0.5 + (pendingPeople * cfg.turnoutPct) / 100),
    toSeat,
    seated,
    seats,
    tables: tbls.length,
    unseatedPeople,
    unseatedHouseholds,
    overTables,
    bySide: cfg.sides.length ? tagRows(cfg.sides, side) : [],
    byCircle: tagRows(cfg.circles, circle),
    meals: specialMeals,
    regularMeals: Math.max(0, confirmed - special),
    notSent,
    noPhone,
    gifts: {
      total: giftTotal,
      count: giftCount,
      byMethod: GIFT_METHODS.filter((g) => gifts.has(g)).map((g) => ({ method: g, ...gifts.get(g)! })),
      notThanked,
    },
    arrived,
  };
}

/** People seated at each table. */
export function tableFill(hs: Household[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of hs) for (const s of h.seats) m.set(s.t, (m.get(s.t) ?? 0) + s.n);
  return m;
}

// ------------------------------------------------------------------ quick seating ("הושבה מהירה")

export interface AutoSeatOptions {
  /** only these households (already filtered by side / circle by the caller); default = everyone not fully seated */
  households: Household[];
  /** all households (to know how full each table already is) */
  all: Household[];
  floor: FloorPlan;
  cfg: PlannerConfig;
  /** leave the tables that already have people alone */
  onlyEmptyTables?: boolean;
}
export interface AutoSeatResult {
  /** household id -> new seats */
  moves: Map<string, Seat[]>;
  placedPeople: number;
  /** households that didn't fit anywhere (need more tables) */
  leftover: { id: string; people: number }[];
}

/**
 * Seats whole families together, by side then circle (each group as close together as possible): biggest groups and
 * families first, preferring tables that already hold the same group, then the emptiest table that fits. Tables marked
 * reserve / staff / kids / locked are skipped (kids are seated by hand). A family bigger than any table is split.
 */
export function autoSeat(o: AutoSeatOptions): AutoSeatResult {
  const { cfg } = o;
  const tbls = tables(o.floor).filter((t) => !t.locked && t.tableKind !== "reserve" && t.tableKind !== "staff" && t.tableKind !== "kids");
  const fill = tableFill(o.all);
  const groupAt = new Map<string, Set<string>>();
  const byId = new Map(o.all.map((h) => [h.id, h]));
  for (const h of o.all)
    for (const s of h.seats) {
      const g = groupAt.get(s.t) ?? new Set();
      g.add(`${h.side ?? ""}|${h.circle ?? ""}`);
      groupAt.set(s.t, g);
    }
  const cap = (t: FloorItem) => Math.max(0, t.seats - cfg.spareSeats);
  const free = (t: FloorItem) => cap(t) - (fill.get(t.id) ?? 0);
  const candidates = o.households
    .map((h) => ({ h, need: partySize(h, cfg.planBy) - seatedCount(h) }))
    .filter((x) => x.need > 0);
  // group key -> households; bigger groups first so a group gets neighbouring tables before the space runs out
  const groups = new Map<string, { h: Household; need: number }[]>();
  for (const c of candidates) {
    const k = `${c.h.side ?? ""}|${c.h.circle ?? ""}`;
    const list = groups.get(k) ?? [];
    list.push(c);
    groups.set(k, list);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].reduce((s, x) => s + x.need, 0) - a[1].reduce((s, x) => s + x.need, 0));
  const moves = new Map<string, Seat[]>();
  const leftover: { id: string; people: number }[] = [];
  let placedPeople = 0;
  const startedFull = new Set([...fill.entries()].filter(([, n]) => n > 0).map(([t]) => t));
  const usable = (t: FloorItem) => !(o.onlyEmptyTables && startedFull.has(t.id));
  const place = (h: Household, need: number, key: string) => {
    const seats = (moves.get(h.id) ?? byId.get(h.id)?.seats ?? h.seats).map((x) => ({ ...x }));
    const fits = tbls.filter((t) => usable(t) && free(t) >= need);
    let target: FloorItem | undefined;
    if (fits.length) {
      // same group already there > partly filled (keeps tables compact) > emptiest
      target = fits.sort((a, b) => {
        const ga = groupAt.get(a.id)?.has(key) ? 1 : 0;
        const gb = groupAt.get(b.id)?.has(key) ? 1 : 0;
        if (ga !== gb) return gb - ga;
        return free(a) - free(b);
      })[0];
    }
    if (target) {
      const ex = seats.find((s) => s.t === target!.id);
      if (ex) ex.n += need;
      else seats.push({ t: target.id, n: need });
      fill.set(target.id, (fill.get(target.id) ?? 0) + need);
      const g = groupAt.get(target.id) ?? new Set();
      g.add(key);
      groupAt.set(target.id, g);
      moves.set(h.id, seats);
      placedPeople += need;
      return 0;
    }
    // bigger than any free table: split across the emptiest tables (still together as much as possible)
    const biggest = Math.max(0, ...tbls.map((t) => cap(t)));
    if (need > biggest && biggest > 0) {
      let left = need;
      for (const t of tbls.filter((t) => usable(t) && free(t) > 0).sort((a, b) => free(b) - free(a))) {
        const n = Math.min(left, free(t));
        seats.push({ t: t.id, n });
        fill.set(t.id, (fill.get(t.id) ?? 0) + n);
        placedPeople += n;
        left -= n;
        if (!left) break;
      }
      moves.set(h.id, seats);
      return left;
    }
    return need;
  };
  for (const [key, list] of ordered) {
    list.sort((a, b) => b.need - a.need);
    // the whole group fits at one table: keep it together (best fit = the fullest table it still fits in)
    const total = list.reduce((a, x) => a + x.need, 0);
    const block = tbls
      .filter((t) => usable(t) && free(t) >= total)
      .sort((a, b) => Number(!!groupAt.get(b.id)?.has(key)) - Number(!!groupAt.get(a.id)?.has(key)) || free(a) - free(b))[0];
    if (block && list.length > 1) {
      for (const { h, need } of list) {
        const seats = (moves.get(h.id) ?? byId.get(h.id)?.seats ?? h.seats).map((x) => ({ ...x }));
        const ex = seats.find((s) => s.t === block.id);
        if (ex) ex.n += need;
        else seats.push({ t: block.id, n: need });
        moves.set(h.id, seats);
        fill.set(block.id, (fill.get(block.id) ?? 0) + need);
        placedPeople += need;
      }
      const g = groupAt.get(block.id) ?? new Set();
      g.add(key);
      groupAt.set(block.id, g);
      continue;
    }
    for (const { h, need } of list) {
      const left = place(h, need, key);
      if (left > 0) leftover.push({ id: h.id, people: left });
    }
  }
  return { moves, placedPeople, leftover };
}

// ------------------------------------------------------------------ import / export (CSV, pasted cells)

/** Parses CSV / TSV (pasted from Excel or Google Sheets) into rows of cells; detects the separator. */
export function parseTable(text: string): string[][] {
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const first = src.split("\n", 1)[0] ?? "";
  const sep = first.includes("\t") ? "\t" : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const toCsv = (rows: string[][]) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

const headerNorm = (s: string) => s.normalize("NFKC").trim().toLowerCase().replace(/[\s_:*()]+/g, " ").replace(/ +/g, " ").trim();

/** Where an imported column goes: a built-in field, an existing custom field, a new custom field, or nowhere. */
export type ColumnTarget = { kind: "field"; key: FieldKey } | { kind: "custom"; id: string } | { kind: "new"; label: string } | { kind: "skip" };

/** Best guess for each header (built-in labels and aliases, then custom field labels); unknown = new custom column. */
export function guessColumns(headers: string[], cfg: PlannerConfig): ColumnTarget[] {
  const used = new Set<string>();
  return headers.map((raw) => {
    const h = headerNorm(raw);
    if (!h) return { kind: "skip" };
    if (h === "מזהה" || h === "id") return { kind: "skip" };
    const f = FIELDS.find((f) => !used.has(f.key) && f.key !== "link" && (headerNorm(f.label) === h || f.aliases.some((a) => headerNorm(a) === h)));
    if (f) {
      used.add(f.key);
      return { kind: "field", key: f.key };
    }
    const c = cfg.custom.find((c) => !used.has(c.id) && headerNorm(c.label) === h);
    if (c) {
      used.add(c.id);
      return { kind: "custom", id: c.id };
    }
    // "שם מלא" -> first name column; split later
    if (/^(שם מלא|full name|name)$/.test(h) && !used.has("first")) {
      used.add("first");
      return { kind: "field", key: "first" };
    }
    return { kind: "new", label: cleanText(raw, NAME_MAX) };
  });
}

/** Recognizes a status written by people ("מגיע", "כן", "v", "לא", "אולי", ...). */
export function parseStatus(v: string): RsvpStatus | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (/^(מגיע|מגיעה|מגיעים|כן|אישר|אישרה|אישרו|v|✓|yes|y|coming|attending|confirmed)$/.test(s)) return "coming";
  if (/^(לא מגיע|לא מגיעה|לא מגיעים|לא|סירב|סירבה|סירבו|no|n|not coming|declined)$/.test(s)) return "not_coming";
  if (/^(אולי|מתלבט|מתלבטים|מתלבטת|maybe|tentative)$/.test(s)) return "maybe";
  if (/^(ממתין|ממתינה|ממתינים|טרם ענה|טרם ענו|לא ענה|לא ענו|pending|no response|awaiting)$/.test(s)) return "pending";
  return null;
}

const tagByName = (tags: Tag[], v: string) => {
  const s = headerNorm(v);
  return tags.find((t) => headerNorm(t.name) === s) ?? null;
};

/** Text for one built-in cell (sheet / CSV export). */
export function formatCell(key: FieldKey, h: HouseholdDTO, cfg: PlannerConfig, ctx: { tables: Map<string, FloorItem>; link: (token: string) => string }): string | number {
  switch (key) {
    case "side":
      return cfg.sides.find((s) => s.id === h.side)?.name ?? "";
    case "circle":
      return cfg.circles.find((s) => s.id === h.circle)?.name ?? "";
    case "priority":
      return h.priority === "a" ? "א" : h.priority === "b" ? "ב" : "";
    case "status":
      return STATUS_LABELS[h.status];
    case "companions":
      return h.companions.join(", ");
    case "meals":
      return cfg.meals.filter((m) => h.meals[m.id]).map((m) => `${h.meals[m.id]} ${m.name}`).join(", ");
    case "table":
      return tableLabelOf(h, ctx.tables);
    case "inviteSentAt":
      return h.inviteSentAt ? isoDay(h.inviteSentAt) : "";
    case "giftMethod":
      return h.giftMethod ? GIFT_LABELS[h.giftMethod] : "";
    case "giftAmount":
      return h.giftAmount ?? "";
    case "thanked":
      return h.thanked ? "כן" : "";
    case "link":
      return ctx.link(h.token);
    default: {
      const v = h[key as keyof Household];
      return typeof v === "number" ? v : typeof v === "string" ? v : "";
    }
  }
}

export const isoDay = (ms: number) => {
  const d = new Date(ms + 3 * 3_600_000); // close enough to Israel time for a date
  return d.toISOString().slice(0, 10);
};

/**
 * Applies one imported / sheet cell to a household draft. Unknown side / circle / meal names are created
 * (returned in `created`) so the hosts' own words survive the import. Returns false if the value was not understood.
 */
export function applyCell(
  draft: Record<string, unknown>,
  key: FieldKey,
  raw: string,
  cfg: PlannerConfig,
  ctx: { tablesByLabel: Map<string, FloorItem>; partySize?: number },
): boolean {
  const v = raw.trim();
  switch (key) {
    case "first":
    case "last":
    case "phone":
    case "email":
    case "allergies":
    case "accessibility":
    case "notes":
    case "guestNote":
    case "giftNote":
      draft[key] = v;
      return true;
    case "invited":
    case "invitedKids":
    case "coming":
    case "comingKids":
    case "reminders":
    case "arrived": {
      if (!v) {
        draft[key] = key === "invited" ? 1 : 0;
        return true;
      }
      const n = Number(v.replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(n)) return false;
      draft[key] = n;
      return true;
    }
    case "side":
    case "circle": {
      const list = key === "side" ? cfg.sides : cfg.circles;
      if (!v) {
        draft[key] = null;
        return true;
      }
      let t = tagByName(list, v);
      if (!t && list.length < MAX_TAGS) {
        t = { id: newId(), name: cleanText(v, NAME_MAX), color: TAG_COLORS[list.length % TAG_COLORS.length] };
        list.push(t);
      }
      draft[key] = t?.id ?? null;
      return !!t;
    }
    case "priority":
      draft.priority = /^(א|a|1)$/i.test(v) ? "a" : /^(ב|b|2)$/i.test(v) ? "b" : null;
      return true;
    case "status": {
      const s = v ? parseStatus(v) : "pending";
      if (!s) return false;
      draft.status = s;
      return true;
    }
    case "companions":
      draft.companions = v ? v.split(/[,،;\n]+/).map((s) => s.trim()).filter(Boolean) : [];
      return true;
    case "meals": {
      const meals: Record<string, number> = {};
      for (const part of v.split(/[,،;\n]+/).map((s) => s.trim()).filter(Boolean)) {
        const m = /^(\d+)\s*(.+)$/.exec(part) ?? /^(.+?)\s*(\d+)$/.exec(part);
        const n = m ? Number(/^\d+$/.test(m[1]) ? m[1] : m[2]) : 1;
        const name = m ? (/^\d+$/.test(m[1]) ? m[2] : m[1]) : part;
        let t = tagByName(cfg.meals, name);
        if (!t && cfg.meals.length < 12) {
          t = { id: newId(), name: cleanText(name, NAME_MAX), color: TAG_COLORS[cfg.meals.length % TAG_COLORS.length] };
          cfg.meals.push(t);
        }
        if (t) meals[t.id] = (meals[t.id] ?? 0) + n;
      }
      draft.meals = meals;
      return true;
    }
    case "table": {
      if (!v) {
        draft.seats = [];
        return true;
      }
      const ids = v.split(/[,،;]+/).map((s) => ctx.tablesByLabel.get(headerNorm(s))).filter(Boolean) as FloorItem[];
      if (!ids.length) return false;
      const size = Math.max(1, ctx.partySize ?? 1);
      draft.seats = ids.length === 1 ? [{ t: ids[0].id, n: size }] : ids.map((t, i) => ({ t: t.id, n: i === 0 ? size - (ids.length - 1) : 1 }));
      return true;
    }
    case "inviteSentAt": {
      if (!v) {
        draft.inviteSentAt = null;
        return true;
      }
      const t = Date.parse(v);
      draft.inviteSentAt = Number.isFinite(t) ? t : Date.now();
      return true;
    }
    case "giftAmount":
      draft.giftAmount = v ? Number(v.replace(/[^\d.]/g, "")) || 0 : null;
      return true;
    case "giftMethod": {
      if (!v) {
        draft.giftMethod = null;
        return true;
      }
      const g = GIFT_METHODS.find((g) => GIFT_LABELS[g] === v || g === v.toLowerCase());
      if (!g) return false;
      draft.giftMethod = g;
      return true;
    }
    case "thanked":
      draft.thanked = /^(כן|v|✓|yes|true|1|x)$/i.test(v);
      return true;
    case "link":
      return true;
  }
}

export const tableLabelKey = (label: string) => headerNorm(label);

/** "שם מלא" in the first-name column: split into first + last when there's no last-name column. */
export function splitFullName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { first: full.trim(), last: "" };
  // "משפחת כהן" -> last name only
  if (parts[0] === "משפחת" || parts[0] === "מש'") return { first: parts.join(" "), last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

// ------------------------------------------------------------------ money summary (dashboard + expenses page)

export interface DuePayment {
  expenseId: string;
  title: string;
  vendorId: string | null;
  payment: Payment;
  /** days from today (negative = overdue) */
  days: number;
}
export interface BudgetSummary {
  total: number;
  paid: number;
  left: number;
  /** total / expected guests */
  perGuest: number | null;
  budget: number | null;
  overBudget: number;
  due: DuePayment[];
  overdue: DuePayment[];
  byCategory: { id: string; name: string; planned: number | null; total: number; paid: number }[];
}

const dayDiff = (iso: string, today: string) => Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);

export function budgetSummary(expenses: Expense[], vendors: Vendor[], expected: number, cfg: PlannerConfig, today: string): BudgetSummary {
  let total = 0;
  let paid = 0;
  const due: DuePayment[] = [];
  const cats = new Map<string, { total: number; paid: number }>();
  const vendorCat = new Map(vendors.map((v) => [v.id, v.category]));
  for (const e of expenses) {
    const t = expenseTotal(e, expected, cfg.budget.minGuests);
    const p = paidOf(e);
    total += t;
    paid += p;
    const cat = e.category ?? (e.vendorId ? vendorCat.get(e.vendorId) ?? "other" : "other");
    const c = cats.get(cat) ?? { total: 0, paid: 0 };
    c.total += t;
    c.paid += p;
    cats.set(cat, c);
    for (const pay of e.payments) if (!pay.paidAt && pay.due) due.push({ expenseId: e.id, title: e.title, vendorId: e.vendorId, payment: pay, days: dayDiff(pay.due, today) });
  }
  due.sort((a, b) => a.days - b.days);
  const names = new Map<string, string>([...cfg.budget.categories.map((c) => [c.id, c.name] as const), ...VENDOR_CATEGORIES.map((c) => [c, VENDOR_CATEGORY_LABELS[c]] as const)]);
  const ids = new Set([...cfg.budget.categories.map((c) => c.id), ...cats.keys()]);
  const byCategory = [...ids].map((id) => ({
    id,
    name: names.get(id) ?? id,
    planned: cfg.budget.categories.find((c) => c.id === id)?.planned ?? null,
    total: cats.get(id)?.total ?? 0,
    paid: cats.get(id)?.paid ?? 0,
  }));
  return {
    total,
    paid,
    left: total - paid,
    perGuest: expected > 0 && total > 0 ? Math.round(total / expected) : null,
    budget: cfg.budget.total,
    overBudget: cfg.budget.total ? Math.max(0, total - cfg.budget.total) : 0,
    due: due.filter((d) => d.days >= 0),
    overdue: due.filter((d) => d.days < 0),
    byCategory,
  };
}

/** Today in Israel, "YYYY-MM-DD" (the browser's local date is close enough for planning). */
export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
