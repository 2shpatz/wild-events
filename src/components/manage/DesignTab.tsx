import { useEffect, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import type { BgPos, EventType, ManageEvent } from "../../../shared/types";
import { api, errorMessage } from "../../lib/api";
import { EVENT_TYPES, backgroundProps, isPhotoBackground } from "../../lib/themes";
import { BackgroundFramer, CENTERED } from "./BackgroundFramer";
import { BackgroundPicker, compressBackground } from "../ThemePicker";
import { Button, Card, useToast } from "../ui";
import { FlexibleDesignCard } from "./design/FlexibleDesignCard";
import { Toggle } from "./Toggle";

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
  const [bgReveal, setBgReveal] = useState(event.bgReveal);
  const [bgPos, setBgPos] = useState<BgPos>(event.bgPos);
  const [file, setFile] = useState<File | null>(null);
  const [removeCustom, setRemoveCustom] = useState(false);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setType(event.type);
    setBackground(event.background);
    setBgReveal(event.bgReveal);
    setBgPos(event.bgPos);
    setFile(null);
    setRemoveCustom(false);
  };
  // Re-sync the draft once the saved values come back from the server.
  const savedPos = `${event.bgPos.x},${event.bgPos.y},${event.bgPos.zoom}`;
  useEffect(reset, [event.type, event.background, event.bgVersion, event.bgReveal, savedPos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!file) return setFilePreview(null);
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const savedCustom = event.background === "custom" && !removeCustom ? `/api/e/${event.code}/asset/bg?v=${encodeURIComponent(event.bgVersion || "")}` : null;
  const info = EVENT_TYPES.find((t) => t.id === type)!;
  const posChanged = `${bgPos.x},${bgPos.y},${bgPos.zoom}` !== savedPos;
  const dirty = type !== event.type || background !== event.background || bgReveal !== event.bgReveal || posChanged || !!file || removeCustom;
  // A new background starts centered, without zoom.
  const pickBackground = (id: string | null) => {
    setBackground(id);
    setBgPos(CENTERED);
  };
  // The draft background, as the guest page would draw it (a just-picked photo isn't uploaded yet: use its local copy).
  const draftCustom = background === "custom" ? (filePreview ?? savedCustom) : null;
  const draftBg = backgroundProps({ code: event.code, background, bgVersion: event.bgVersion, theme: info.theme, bgPos });
  if (draftCustom) {
    draftBg.style = { ...draftBg.style, backgroundImage: `url(${draftCustom})` };
    draftBg.fill = { backgroundImage: `url(${draftCustom})` };
    if (draftBg.photo) draftBg.photo = { ...draftBg.photo, src: draftCustom };
  }
  const canFrame = isPhotoBackground(background, info.theme) && (background !== "custom" || !!draftCustom);

  const save = async () => {
    setBusy(true);
    try {
      if (removeCustom && event.background === "custom") await api(`/e/${event.code}/manage/background`, { method: "DELETE" });
      if (file) {
        const blob = await compressBackground(file);
        await api(`/e/${event.code}/manage/background`, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
      }
      if (type !== event.type || background !== (file ? "custom" : event.background) || bgReveal !== event.bgReveal || posChanged) {
        await api(`/e/${event.code}/manage`, { method: "PATCH", json: { type, theme: info.theme, background, bgReveal, bgPos } });
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
              pickBackground(null);
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
          pickBackground(id);
          setFile(null);
        }}
        onCustom={(f) => {
          setFile(f);
          pickBackground("custom");
        }}
        onClearCustom={() => {
          if (file) setFile(null);
          else setRemoveCustom(true);
          pickBackground(null);
        }}
      />
      {canFrame && <BackgroundFramer bg={draftBg} custom={background === "custom"} value={bgPos} onChange={setBgPos} />}
      <div className="border-t border-border pt-2">
        <Toggle
          checked={bgReveal}
          onChange={setBgReveal}
          label="גלילה לתמונת הרקע בסוף העמוד"
          hint={
            background === "custom" || (file && !removeCustom)
              ? "בסוף עמוד האורחים אפשר להמשיך לגלול, ותמונת הרקע מופיעה במלואה בלי טקסט מעליה"
              : "בסוף עמוד האורחים אפשר להמשיך לגלול, והרקע מופיע נקי בלי טקסט מעליו. הכי מתאים עם תמונה משלכם"
          }
        />
      </div>
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
