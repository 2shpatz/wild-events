import { useState } from "react";
import { FolderPlus, Pencil, Trash2, Users, Crown, Camera, Link2 } from "lucide-react";
import type { ManageEvent } from "../../../shared/types";
import { api, errorMessage } from "../../lib/api";
import { Button, ConfirmDialog, Field, Modal, inputClass, useToast } from "../ui";

export function AlbumsManager({ event, onChanged }: { event: ManageEvent; onChanged: () => void }) {
  const toast = useToast();
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [del, setDel] = useState<{ id: string; name: string; count: number } | null>(null);
  const [create, setCreate] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const doDelete = async (id: string) => {
    try {
      let more = true;
      while (more) {
        const r = await api<{ more: boolean }>(`/e/${event.code}/manage/albums/${id}`, { method: "DELETE" });
        more = r.more;
      }
      toast("האלבום הוסר");
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          icon={<FolderPlus className="size-4" aria-hidden />}
          onClick={() => {
            setName("");
            setCreate(true);
          }}
        >
          אלבום חדש
        </Button>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {event.albums.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-fg" aria-hidden>
              {a.kind === "host" ? <Crown className="size-5" /> : a.link ? <Link2 className="size-5" /> : a.kind === "custom" ? <Camera className="size-5" /> : <Users className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{a.name}</p>
              <p className="text-sm text-muted-fg">
                {a.count.toLocaleString("he-IL")} פריטים{a.link && " · מקושר לאלבום ב-Google Photos"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setRename({ id: a.id, name: a.name })} icon={<Pencil className="size-4" aria-hidden />} aria-label={`שינוי שם לאלבום ${a.name}`}>
              <span className="hidden sm:inline">שינוי שם</span>
            </Button>
            {a.kind !== "host" && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setDel({ id: a.id, name: a.name, count: a.count })}
                icon={<Trash2 className="size-4" aria-hidden />}
                aria-label={`מחיקת האלבום ${a.name}`}
              >
                <span className="hidden sm:inline">מחיקה</span>
              </Button>
            )}
          </li>
        ))}
      </ul>

      <Modal
        open={!!rename}
        onClose={() => setRename(null)}
        title="שינוי שם האלבום"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRename(null)}>
              ביטול
            </Button>
            <Button
              loading={busy}
              disabled={!rename?.name.trim()}
              onClick={async () => {
                if (!rename) return;
                setBusy(true);
                try {
                  await api(`/e/${event.code}/manage/albums/${rename.id}`, { method: "PATCH", json: { name: rename.name } });
                  toast("השם עודכן");
                  setRename(null);
                  onChanged();
                } catch (e) {
                  toast(errorMessage(e), "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              שמירה
            </Button>
          </>
        }
      >
        <Field label="שם חדש" htmlFor="album-rename">
          <input id="album-rename" className={inputClass} value={rename?.name || ""} onChange={(e) => setRename((r) => r && { ...r, name: e.target.value })} maxLength={40} autoFocus />
        </Field>
      </Modal>

      <Modal
        open={create}
        onClose={() => setCreate(false)}
        title="אלבום חדש"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreate(false)}>
              ביטול
            </Button>
            <Button
              loading={busy}
              disabled={!name.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/e/${event.code}/manage/albums`, { method: "POST", json: { name } });
                  toast("האלבום נוצר");
                  setCreate(false);
                  onChanged();
                } catch (e) {
                  toast(errorMessage(e), "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              יצירה
            </Button>
          </>
        }
      >
        <Field label="שם האלבום" htmlFor="album-new" hint="למשל: צלם האירוע, החינה, קבלת פנים">
          <input id="album-new" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!del}
        title={`למחוק את האלבום "${del?.name}"?`}
        requireText={del?.name}
        message={
          <>
            <p>
              כל <strong>{del?.count.toLocaleString("he-IL")} הפריטים</strong> באלבום יוסרו מהאתר ומאלבומי האירוע ב-Google Photos, ולא יוצגו יותר לאף אחד.
            </p>
            <p className="text-muted-fg">הקבצים עצמם והאלבום הריק יישארו בחשבון Google Photos שלך, ושם אפשר למחוק אותם לצמיתות.</p>
          </>
        }
        confirmLabel="מחיקת האלבום"
        onClose={() => setDel(null)}
        onConfirm={() => (del ? doDelete(del.id) : undefined)}
      />
    </div>
  );
}
