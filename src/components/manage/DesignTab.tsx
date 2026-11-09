import { useEffect, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import type { EventType, ManageEvent } from "../../../shared/types";
import { api, errorMessage } from "../../lib/api";
import { EVENT_TYPES } from "../../lib/themes";
import { BackgroundPicker, compressBackground } from "../ThemePicker";
import { Button, Card, useToast } from "../ui";
import { FlexibleDesignCard } from "./design/FlexibleDesignCard";

/** "עיצוב" tab: theme + background, and the flexible page design (which also holds the guest page texts and images). */
export function DesignTab({ event, onChanged }: { event: ManageEvent; onChanged: () => void }) {
  return (
    <div className="space-y-6">
      <DesignCard event={event} onChanged={onChanged} />
      <FlexibleDesignCard event={event} onChanged={onChanged} />
    </div>
  );
}

/** Design settings (event type + background) are edited as a local draft and only sent on "Save". */
function DesignCard({ event, onChanged }: { event: ManageEvent; onChanged: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<EventType>(event.type);
  const [background, setBackground] = useState<string | null>(event.background);
  const [file, setFile] = useState<File | null>(null);
  const [removeCustom, setRemoveCustom] = useState(false);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setType(event.type);
    setBackground(event.background);
    setFile(null);
    setRemoveCustom(false);
  };
  // Re-sync the draft once the saved values come back from the server.
  useEffect(reset, [event.type, event.background, event.bgVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!file) return setFilePreview(null);
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const savedCustom = event.background === "custom" && !removeCustom ? `/api/e/${event.code}/asset/bg?v=${encodeURIComponent(event.bgVersion || "")}` : null;
  const info = EVENT_TYPES.find((t) => t.id === type)!;
  const dirty = type !== event.type || background !== event.background || !!file || removeCustom;

  const save = async () => {
    setBusy(true);
    try {
      if (removeCustom && event.background === "custom") await api(`/e/${event.code}/manage/background`, { method: "DELETE" });
      if (file) {
        const blob = await compressBackground(file);
        await api(`/e/${event.code}/manage/background`, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
      }
      if (type !== event.type || background !== (file ? "custom" : event.background)) {
        await api(`/e/${event.code}/manage`, { method: "PATCH", json: { type, theme: info.theme, background } });
      }
      toast("העיצוב נשמר");
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setBusy(false);
  };

  return (
    <Card className="space-y-5">
      <h2 className="text-xl font-bold">ערכת נושא ורקע</h2>
      <div role="radiogroup" aria-label="סוג האירוע" className="flex flex-wrap gap-2">
        {EVENT_TYPES.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={type === t.id}
            onClick={() => {
              if (t.id === type) return;
              setType(t.id as EventType);
              setBackground(null);
              setFile(null);
            }}
            data-theme={t.theme}
            className={`min-h-11 rounded-xl border-2 px-4 font-semibold transition-colors ${type === t.id ? "border-primary bg-primary text-on-primary" : "border-border bg-bg text-fg hover:border-primary/50"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <BackgroundPicker
        type={type}
        value={background ?? info.backgrounds[0].id}
        customPreview={filePreview ?? savedCustom}
        onPreset={(id) => {
          setBackground(id);
          setFile(null);
        }}
        onCustom={(f) => {
          setFile(f);
          setBackground("custom");
        }}
        onClearCustom={() => {
          if (file) setFile(null);
          else setRemoveCustom(true);
          setBackground(null);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!dirty} loading={busy} icon={<Save className="size-4" aria-hidden />} onClick={save}>
          שמירת ערכת הנושא
        </Button>
        {dirty && !busy && (
          <>
            <Button variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={reset}>
              ביטול השינויים
            </Button>
            <span role="status" className="text-sm text-muted-fg">
              יש שינויים שלא נשמרו
            </span>
          </>
        )}
      </div>
    </Card>
  );
}
