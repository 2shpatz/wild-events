import { useMemo, useState } from "react";
import { AtSign, FileImage, FileSpreadsheet, FileText, Globe, Loader2, MapPin, Paperclip, Pencil, Plus, Printer, Star, Store, Trash2, X } from "lucide-react";
import {
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABELS,
  VENDOR_STATUSES,
  VENDOR_STATUS_LABELS,
  MAX_VENDOR_FILES,
  MAX_VENDOR_FILE_BYTES,
  VENDOR_FILE_ACCEPT,
  displayPhone,
  emptyVendor,
  expenseTotal,
  paidOf,
  type Vendor,
  type VendorCategory,
  type VendorDTO,
  type VendorFile,
  type VendorStatus,
} from "../../../shared/guests";
import { formatBytes } from "../../lib/format";
import { navLinks } from "../../lib/eventInfo";
import { Button, Card, ConfirmDialog, Field, IconButton, Modal, cx, inputClass } from "../ui";
import { Switch } from "../manage/Toggle";
import { WazeIcon } from "../EventDetails";
import { usePlanner } from "./store";
import { ContactButtons, Empty, esc, ils, printHtml, selectClass, smallSelect } from "./bits";

const STATUS_TONE: Record<VendorStatus, string> = {
  lead: "bg-slate-500/15 ring-slate-500/40",
  quote: "bg-sky-500/15 ring-sky-500/40",
  booked: "bg-green-600/15 ring-green-600/45",
  done: "bg-primary/15 ring-primary/40",
  cancelled: "bg-red-600/10 ring-red-600/35 line-through",
};

/** Vendors' contacts, by category: one tap to call / WhatsApp / mail / navigate; payments come from the expenses. */
export function Vendors() {
  const p = usePlanner();
  const { vendors, expenses } = p.data;
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [cat, setCat] = useState<VendorCategory | "">("");
  const money = useMemo(() => {
    const m = new Map<string, { total: number; paid: number }>();
    for (const e of expenses) {
      if (!e.vendorId) continue;
      const x = m.get(e.vendorId) ?? { total: 0, paid: 0 };
      x.total += expenseTotal(e, p.stats.expected, p.data.config.budget.minGuests);
      x.paid += paidOf(e);
      m.set(e.vendorId, x);
    }
    return m;
  }, [expenses, p.stats.expected, p.data.config.budget.minGuests]);
  const list = vendors.filter((v) => !cat || v.category === cat);
  const byCat = VENDOR_CATEGORIES.map((c) => ({ c, list: list.filter((v) => v.category === c).sort((a, b) => Number(b.favorite) - Number(a.favorite)) })).filter((g) => g.list.length);

  const printDay = () => {
    const rows = [...vendors]
      .filter((v) => v.status !== "cancelled")
      .sort((a, b) => (a.arrival ?? "99").localeCompare(b.arrival ?? "99"))
      .map((v) => `<tr><td>${esc(v.arrival ?? "")}</td><td><b>${esc(v.name)}</b><div class="muted">${esc(VENDOR_CATEGORY_LABELS[v.category])}</div></td><td>${esc(v.contact)}</td><td dir="ltr" style="text-align:end">${esc(displayPhone(v.phone))}</td><td>${esc(v.notes).replace(/\n/g, "<br>")}</td></tr>`)
      .join("");
    printHtml(
      `דף קשר - ${p.data.event.title}`,
      `<h1>דף קשר ליום האירוע</h1><p class="muted">${esc(p.data.event.title)}${p.data.event.date ? ` · ${esc(p.data.event.date)}` : ""}${p.data.event.venueName ? ` · ${esc(p.data.event.venueName)}` : ""}</p>
       <table><thead><tr><th>הגעה</th><th>נותן שירות</th><th>איש קשר</th><th>טלפון</th><th>הערות</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => { setIsNew(true); setEditing(emptyVendor()); }}>
          נותן שירות חדש
        </Button>
        <Button variant="outline" icon={<Printer className="size-4" aria-hidden />} onClick={printDay} disabled={!vendors.length}>
          דף קשר ליום האירוע
        </Button>
        {vendors.length > 0 && (
          <select className={cx(smallSelect, "ms-auto")} value={cat} onChange={(e) => setCat(e.target.value as VendorCategory | "")} aria-label="סינון לפי תחום">
            <option value="">כל התחומים</option>
            {VENDOR_CATEGORIES.filter((c) => vendors.some((v) => v.category === c)).map((c) => (
              <option key={c} value={c}>
                {VENDOR_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        )}
      </div>

      {!vendors.length ? (
        <Empty icon={<Store className="size-7" aria-hidden />} title="עוד אין נותני שירות" text="שומרים כאן את כל הספקים: אולם, צלם, DJ, איפור... עם טלפון, וואטסאפ וניווט בלחיצה אחת." />
      ) : (
        byCat.map((g) => (
          <section key={g.c} aria-labelledby={`vc-${g.c}`}>
            <h2 id={`vc-${g.c}`} className="mb-2 text-lg font-bold">
              {VENDOR_CATEGORY_LABELS[g.c]}
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {g.list.map((v) => (
                <li key={v.id}>
                  <VendorCard v={v} money={money.get(v.id)} onEdit={() => { setIsNew(false); setEditing(v); }} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <VendorEditor vendor={editing} isNew={isNew} onClose={() => setEditing(null)} />
    </div>
  );
}

function VendorCard({ v, money, onEdit }: { v: VendorDTO; money?: { total: number; paid: number }; onEdit: () => void }) {
  const dest = v.address;
  return (
    <Card className="flex h-full flex-col gap-3 !p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-lg font-bold">
            {v.favorite && <Star className="size-4 shrink-0 fill-amber-400 text-amber-500" aria-label="מועדף" />}
            <span className="truncate">{v.name || "ללא שם"}</span>
          </p>
          {v.contact && <p className="text-muted-fg">{v.contact}</p>}
        </div>
        <span className={cx("inline-flex min-h-7 items-center rounded-full px-2.5 text-sm font-semibold ring-1 ring-inset", STATUS_TONE[v.status])}>{VENDOR_STATUS_LABELS[v.status]}</span>
        <IconButton label={`עריכת ${v.name}`} onClick={onEdit} className="hover:bg-fg/5">
          <Pencil className="size-5" aria-hidden />
        </IconButton>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ContactButtons phone={v.phone} whatsapp={v.whatsapp} email={v.email} name={v.name} sms />
        {v.website && (
          <a href={v.website} target="_blank" rel="noopener" className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-card hover:bg-fg/5" aria-label={`האתר של ${v.name} (נפתח בחלון חדש)`} title="אתר">
            <Globe className="size-5" aria-hidden />
          </a>
        )}
        {v.instagram && (
          <a href={`https://instagram.com/${v.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "")}`} target="_blank" rel="noopener" className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-card hover:bg-fg/5" aria-label={`האינסטגרם של ${v.name}`} title="אינסטגרם">
            <AtSign className="size-5" aria-hidden />
          </a>
        )}
        {dest && (
          <a href={navLinks(dest).waze} target="_blank" rel="noopener" className="inline-flex size-11 items-center justify-center rounded-full bg-[#33ccff] text-[#0b1f33] hover:brightness-105" aria-label={`ניווט ב-Waze אל ${v.name}`} title="Waze">
            <WazeIcon className="size-6" />
          </a>
        )}
      </div>
      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-fg">
        {v.phone && <bdi dir="ltr">{displayPhone(v.phone)}</bdi>}
        {v.arrival && <span>הגעה ביום האירוע: {v.arrival}</span>}
        {dest && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {dest}
          </span>
        )}
        {money && (
          <span className="font-semibold text-fg">
            שולם {ils(money.paid)} מתוך {ils(money.total)}
          </span>
        )}
      </div>
      {v.notes && <p className="line-clamp-3 whitespace-pre-line text-sm">{v.notes}</p>}
      {v.files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="קבצים">
          {v.files.map((f) => (
            <li key={f.id}>
              <FileLink vendorId={v.id} f={f} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function VendorEditor({ vendor, isNew, onClose }: { vendor: Vendor | null; isNew: boolean; onClose: () => void }) {
  const p = usePlanner();
  const [d, setD] = useState<Vendor | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  // files picked for a vendor that isn't saved yet: uploaded right after the first save
  const [pending, setPending] = useState<File[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  if (vendor && vendor.id !== lastId) {
    setLastId(vendor.id);
    setD({ ...vendor });
    setPending([]);
  }
  if (!vendor && lastId) setLastId(null);
  if (!d || !vendor) return null;
  const set = <K extends keyof Vendor>(k: K, v: Vendor[K]) => setD({ ...d, [k]: v });
  const save = async () => {
    setBusy(true);
    const rec = await p.saveRecord("vendor", d, isNew);
    if (rec && pending.length) {
      for (const f of pending) {
        setUploading(f.name);
        await p.uploadVendorFile(rec.id, f, () => {});
      }
      setUploading(null);
    }
    setBusy(false);
    if (rec) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? "נותן שירות חדש" : d.name || "נותן שירות"}
      footer={
        <>
          {!isNew && (
            <Button variant="ghost" className="me-auto text-destructive" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirm(true)}>
              מחיקה
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={save} loading={busy} disabled={!d.name.trim()}>
            {uploading ? `מעלה את ${uploading}...` : "שמירה"}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="תחום" htmlFor="v-cat">
          <select id="v-cat" className={selectClass} value={d.category} onChange={(e) => set("category", e.target.value as VendorCategory)}>
            {VENDOR_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {VENDOR_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="שם העסק" htmlFor="v-name">
          <input id="v-name" className={inputClass} value={d.name} onChange={(e) => set("name", e.target.value)} maxLength={80} autoFocus={isNew} />
        </Field>
        <Field label="איש / אשת קשר" htmlFor="v-contact">
          <input id="v-contact" className={inputClass} value={d.contact} onChange={(e) => set("contact", e.target.value)} maxLength={40} />
        </Field>
        <Field label="סטטוס" htmlFor="v-status">
          <select id="v-status" className={selectClass} value={d.status} onChange={(e) => set("status", e.target.value as VendorStatus)}>
            {VENDOR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {VENDOR_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="טלפון" htmlFor="v-phone">
          <input id="v-phone" className={inputClass} dir="ltr" type="tel" inputMode="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} />
        </Field>
        <Field label="וואטסאפ (אם שונה מהטלפון)" htmlFor="v-wa">
          <input id="v-wa" className={inputClass} dir="ltr" type="tel" inputMode="tel" value={d.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} maxLength={30} />
        </Field>
        <Field label="אימייל" htmlFor="v-email">
          <input id="v-email" className={inputClass} dir="ltr" type="email" value={d.email} onChange={(e) => set("email", e.target.value)} maxLength={120} />
        </Field>
        <Field label="אתר" htmlFor="v-web">
          <input id="v-web" className={inputClass} dir="ltr" value={d.website} onChange={(e) => set("website", e.target.value)} maxLength={300} placeholder="example.co.il" />
        </Field>
        <Field label="אינסטגרם" htmlFor="v-ig">
          <input id="v-ig" className={inputClass} dir="ltr" value={d.instagram} onChange={(e) => set("instagram", e.target.value)} maxLength={80} placeholder="@name" />
        </Field>
        <Field label="שעת הגעה ביום האירוע" htmlFor="v-arr">
          <input id="v-arr" className={inputClass} type="time" value={d.arrival ?? ""} onChange={(e) => set("arrival", e.target.value || null)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="כתובת (לניווט)" htmlFor="v-addr">
            <input id="v-addr" className={inputClass} value={d.address} onChange={(e) => set("address", e.target.value)} maxLength={200} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="הערות" htmlFor="v-notes" hint="מה סוכם, מה להביא, שעות, מספר חוזה...">
            <textarea id="v-notes" className={cx(inputClass, "min-h-28 py-3")} value={d.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
          </Field>
        </div>
        <label className="inline-flex items-center gap-3 font-semibold sm:col-span-2">
          <Switch checked={d.favorite} onChange={(v) => set("favorite", v)} label="מועדף" />
          מועדף (מופיע ראשון בתחום)
        </label>
        <div className="sm:col-span-2">
          <VendorFiles vendorId={isNew ? null : d.id} pending={pending} setPending={setPending} />
        </div>
        <p className="text-sm text-muted-fg sm:col-span-2">את המחיר, המקדמה ומועדי התשלום מוסיפים בלשונית &quot;הוצאות ותקציב&quot;.</p>
        <button type="submit" hidden />
      </form>
      <ConfirmDialog
        open={confirm}
        title={`למחוק את "${d.name}"?`}
        message={
          <p>
            פרטי הקשר יימחקו. ההוצאות שקשורות אליו יישארו, בלי שיוך לנותן שירות.
            {d.files.length > 0 && ` גם ${d.files.length === 1 ? "הקובץ המצורף יימחק" : `${d.files.length} הקבצים המצורפים יימחקו`} מ-Google Drive.`}
          </p>
        }
        confirmLabel="מחיקה"
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          await p.deleteRecord("vendor", d.id);
          onClose();
        }}
      />
    </Modal>
  );
}

const fileIcon = (mime: string) =>
  mime.startsWith("image/") ? FileImage : mime.includes("sheet") || mime.includes("excel") ? FileSpreadsheet : FileText;

/** A file chip that opens the file (PDF / pictures in a new tab, Office files download). */
function FileLink({ vendorId, f }: { vendorId: string; f: VendorFile }) {
  const p = usePlanner();
  const Icon = fileIcon(f.mime);
  return (
    <a
      href={p.vendorFileUrl(vendorId, f.id)}
      target="_blank"
      rel="noopener"
      className="inline-flex min-h-11 max-w-56 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-semibold text-fg no-underline hover:border-primary hover:bg-primary/5"
      title={`${f.name} (${formatBytes(f.size)})`}
      aria-label={`פתיחת ${f.name} (נפתח בחלון חדש)`}
    >
      <Icon className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="truncate">{f.name}</span>
    </a>
  );
}

/**
 * Contracts, quotes, invoices: stored in the Drive of the event's Google account. A saved vendor uploads at once
 * (with progress); a new one keeps the picked files and uploads them right after the first save.
 */
function VendorFiles({ vendorId, pending, setPending }: { vendorId: string | null; pending: File[]; setPending: (f: File[]) => void }) {
  const p = usePlanner();
  const files = vendorId ? p.data.vendors.find((v) => v.id === vendorId)?.files ?? [] : [];
  const [progress, setProgress] = useState<{ name: string; p: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<VendorFile | null>(null);
  const room = MAX_VENDOR_FILES - files.length - pending.length;
  const pick = async (list: FileList | null) => {
    setError(null);
    const chosen = [...(list ?? [])];
    const big = chosen.filter((f) => f.size > MAX_VENDOR_FILE_BYTES);
    if (big.length) setError(`${big.map((f) => f.name).join(", ")}: גדול מדי (עד ${formatBytes(MAX_VENDOR_FILE_BYTES)}).`);
    const ok = chosen.filter((f) => f.size <= MAX_VENDOR_FILE_BYTES && f.size > 0).slice(0, Math.max(0, room));
    if (!vendorId) {
      setPending([...pending, ...ok]);
      return;
    }
    for (const f of ok) {
      setProgress({ name: f.name, p: 0 });
      await p.uploadVendorFile(vendorId, f, (x) => setProgress({ name: f.name, p: x }));
    }
    setProgress(null);
  };
  return (
    <fieldset className="space-y-3 rounded-2xl border border-border p-4">
      <legend className="flex items-center gap-2 px-1 font-bold">
        <Paperclip className="size-4" aria-hidden />
        חוזה, הצעת מחיר וקבצים
      </legend>
      <p className="text-sm text-muted-fg">
        PDF, תמונה (למשל צילום של חוזה חתום), Word או Excel, עד <bdi dir="ltr">{formatBytes(MAX_VENDOR_FILE_BYTES)}</bdi> לקובץ ועד {MAX_VENDOR_FILES} קבצים. הקבצים נשמרים ב-Google Drive של חשבון האירוע, ורק מנהלי האירוע רואים אותם.
      </p>
      {(files.length > 0 || pending.length > 0) && (
        <ul className="space-y-1.5">
          {files.map((f) => {
            const Icon = fileIcon(f.mime);
            return (
              <li key={f.id} className="flex items-center gap-2 rounded-xl bg-muted/60 ps-3">
                <Icon className="size-5 shrink-0 text-primary" aria-hidden />
                <a href={p.vendorFileUrl(vendorId!, f.id)} target="_blank" rel="noopener" className="min-h-11 min-w-0 flex-1 truncate py-2.5 font-semibold text-fg underline-offset-2 hover:underline">
                  {f.name}
                </a>
                <bdi dir="ltr" className="shrink-0 text-sm text-muted-fg">{formatBytes(f.size)}</bdi>
                <IconButton label={`מחיקת ${f.name}`} type="button" className="text-destructive hover:bg-destructive/10" onClick={() => setAsking(f)}>
                  <Trash2 className="size-5" aria-hidden />
                </IconButton>
              </li>
            );
          })}
          {pending.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-xl border border-dashed border-border ps-3">
              <Paperclip className="size-5 shrink-0 text-muted-fg" aria-hidden />
              <span className="min-w-0 flex-1 truncate py-2.5 font-semibold">{f.name}</span>
              <span className="shrink-0 text-sm text-muted-fg">יועלה בשמירה</span>
              <IconButton label={`הסרת ${f.name}`} type="button" className="hover:bg-fg/5" onClick={() => setPending(pending.filter((_, j) => j !== i))}>
                <X className="size-5" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {progress && (
        <div role="status" className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            מעלה את {progress.name}... {Math.round(progress.p * 100)}%
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.round(progress.p * 100)}%` }} />
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
      {room > 0 && !progress && (
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 font-semibold hover:border-primary focus-within:outline focus-within:outline-2 focus-within:outline-ring">
          <Plus className="size-4" aria-hidden />
          צירוף קובץ
          <input type="file" multiple accept={VENDOR_FILE_ACCEPT} className="sr-only" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        </label>
      )}
      <ConfirmDialog
        open={!!asking}
        title={`למחוק את "${asking?.name ?? ""}"?`}
        message={<p>הקובץ יימחק מ-Google Drive של חשבון האירוע ולא יהיה אפשר לשחזר אותו מכאן.</p>}
        confirmLabel="מחיקה"
        onClose={() => setAsking(null)}
        onConfirm={async () => {
          if (asking && vendorId) await p.deleteVendorFile(vendorId, asking.id);
        }}
      />
    </fieldset>
  );
}
