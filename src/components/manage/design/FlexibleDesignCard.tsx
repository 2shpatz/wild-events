import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Monitor, Pencil, RotateCcw, Save, Smartphone, Eye, X } from "lucide-react";
import type { BlockType, EventDesign, ImageBlock } from "../../../../shared/design";
import { MAX_IMAGES, newBlock, usedImageSlots } from "../../../../shared/design";
import type { ManageEvent, PublicEvent } from "../../../../shared/types";
import { api, errorMessage } from "../../../lib/api";
import { isDarkBackground } from "../../../lib/themes";
import { compressBackground } from "../../ThemePicker";
import { Button, Card, Segmented, cx, useToast } from "../../ui";
import { AddBlockSheet } from "./AddBlockSheet";
import { BlockInspector } from "./BlockInspector";
import { BLOCK_META } from "./blockMeta";
import { DesignPreview, type Device } from "./DesignPreview";
import { designKey, draftReducer, findBlock, type Where } from "./draft";
import { FontStepper } from "./FontPicker";
import { HeroInspector, type HeroTexts } from "./HeroInspector";
import { StructureList } from "./StructureList";

/** Unsaved drafts survive switching manage tabs (same page session). */
const drafts = new Map<string, EventDesign>();
const textDrafts = new Map<string, HeroTexts>();

const savedTexts = (e: ManageEvent): HeroTexts => ({ subtitle: e.subtitle ?? "", welcome: e.welcome ?? "" });
/** The same cleanup the server applies, so "unsaved changes" means a change that would actually be saved. */
const cleanTexts = (t: HeroTexts): HeroTexts => ({
  subtitle: t.subtitle.normalize("NFKC").trim().replace(/\s+/g, " "),
  welcome: t.welcome.normalize("NFKC").trim(),
});

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

/**
 * "עיצוב גמיש": an interactive editor for the guest page. The main page (hero) is fixed; elements can be added
 * before and after it, reordered, hidden and edited, and the hero's title font / colors / date style changed -
 * all on a live preview of the real page. Nothing reaches guests until "Save".
 */
export function FlexibleDesignCard({ event, onChanged }: { event: ManageEvent; onChanged: () => void }) {
  const toast = useToast();
  const [, setParams] = useSearchParams();
  const desktop = useMedia("(min-width: 1024px)");
  const [base, setBase] = useState<EventDesign>(event.design);
  const [draft, dispatch] = useReducer(draftReducer, undefined, () => drafts.get(event.code) ?? event.design);
  // Subtitle + welcome are stored on the event, not in the design JSON, but are edited and saved with it.
  const [textBase, setTextBase] = useState<HeroTexts>(() => savedTexts(event));
  const [texts, setTexts] = useState<HeroTexts>(() => textDrafts.get(event.code) ?? savedTexts(event));
  const [selected, setSelected] = useState<string>("hero");
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [device, setDevice] = useState<Device>("phone");
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [tuning, setTuning] = useState<{ start: string | null } | null>(null);
  const [hebrewOnly, setHebrewOnly] = useState(true);
  const [addWhere, setAddWhere] = useState<Where | null>(null);
  const [extraImages, setExtraImages] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingWhere = useRef<Where>("after");
  const inspector = useRef<HTMLDivElement>(null);
  const justSaved = useRef(false);
  const justSavedTexts = useRef(false);

  const designDirty = designKey(draft) !== designKey(base);
  const clean = cleanTexts(texts);
  const subtitleDirty = clean.subtitle !== textBase.subtitle;
  const welcomeDirty = clean.welcome !== textBase.welcome;
  const textsDirty = subtitleDirty || welcomeDirty;
  const dirty = designDirty || textsDirty;
  const savedKey = designKey(event.design);
  const savedTextsKey = JSON.stringify(savedTexts(event));

  // Keep the draft across tab switches; drop it once it matches what's saved.
  useEffect(() => {
    if (designDirty) drafts.set(event.code, draft);
    else drafts.delete(event.code);
  }, [draft, designDirty, event.code]);
  useEffect(() => {
    if (textsDirty) textDrafts.set(event.code, texts);
    else textDrafts.delete(event.code);
  }, [texts, textsDirty, event.code]);

  // The saved design changed (our save, or someone else's): adopt it unless there are unsaved edits.
  useEffect(() => {
    if (justSaved.current || !designDirty) dispatch({ type: "reset", design: event.design });
    justSaved.current = false;
    setBase(event.design);
  }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (justSavedTexts.current || !textsDirty) setTexts(savedTexts(event));
    justSavedTexts.current = false;
    setTextBase(savedTexts(event));
  }, [savedTextsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Mobile tuning mode is a full-screen overlay: lock the page behind it.
  const tuningOn = !!tuning && !desktop;
  useEffect(() => {
    if (!tuningOn) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [tuningOn]);

  const previewEvent: PublicEvent = useMemo(() => {
    const images = [...event.images.filter((i) => !(i.slot in extraImages)), ...Object.entries(extraImages).map(([slot, v]) => ({ slot: Number(slot), v }))];
    return { ...event, images, subtitle: clean.subtitle || null, welcome: clean.welcome || null };
  }, [event, extraImages, clean.subtitle, clean.welcome]);

  const dark = isDarkBackground(event.background, event.theme);
  const against = dark ? "#18181b" : getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#ffffff";

  const focusOn = useCallback((id: string) => setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 })), []);
  const select = useCallback(
    (id: string, from: "list" | "preview") => {
      setSelected(id);
      if (from === "list") focusOn(id);
      else {
        setMobileView("edit");
        requestAnimationFrame(() => inspector.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    },
    [focusOn],
  );

  const uploadImage = async (f: File): Promise<number | null> => {
    const used = new Set([...usedImageSlots(base), ...usedImageSlots(draft)]);
    const slot = Array.from({ length: MAX_IMAGES }, (_, i) => i).find((i) => !used.has(i));
    if (slot === undefined) {
      toast(`אפשר עד ${MAX_IMAGES} תמונות בעמוד`, "error");
      return null;
    }
    try {
      const r = await api<{ v: string }>(`/e/${event.code}/manage/image/${slot}`, {
        method: "PUT",
        body: await compressBackground(f, 1600),
        headers: { "Content-Type": "image/jpeg" },
      });
      setExtraImages((x) => ({ ...x, [slot]: r.v }));
      return slot;
    } catch (e) {
      toast(errorMessage(e), "error");
      return null;
    }
  };

  const addBlock = (type: BlockType) => {
    const where = addWhere ?? "after";
    setAddWhere(null);
    if (type === "image") {
      pendingWhere.current = where;
      fileInput.current?.click();
      return;
    }
    const b = newBlock(type);
    dispatch({ type: "add", block: b, where });
    select(b.id, "list");
  };

  const save = async () => {
    setSaving(true);
    try {
      // Only flag what's actually sent: a flag left up would make the next server update overwrite unsaved edits.
      justSaved.current = designDirty;
      justSavedTexts.current = textsDirty;
      await api(`/e/${event.code}/manage`, {
        method: "PATCH",
        json: {
          ...(designDirty ? { design: draft } : {}),
          ...(subtitleDirty ? { subtitle: texts.subtitle } : {}),
          ...(welcomeDirty ? { welcome: texts.welcome } : {}),
        },
      });
      toast("העיצוב נשמר - האורחים כבר רואים אותו");
      onChanged();
      setTuning(null);
    } catch (e) {
      justSaved.current = false;
      justSavedTexts.current = false;
      toast(errorMessage(e), "error");
    }
    setSaving(false);
  };

  const reset = () => {
    dispatch({ type: "reset", design: base });
    setTexts(textBase);
    setSelected("hero");
  };

  const hit = selected === "hero" ? null : findBlock(draft, selected);
  const goSettings = () => setParams({ tab: "settings" }, { replace: true });
  const imageSrc = (slot: number) => {
    const img = previewEvent.images.find((i) => i.slot === slot);
    return img ? `/api/e/${event.code}/asset/i${slot}?v=${encodeURIComponent(img.v)}` : null;
  };

  return (
    <Card className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-xl font-bold">עיצוב גמיש</h2>
        <p className="text-muted-fg">
          כך נראה עמוד האורחים. לחצו על כל חלק בתצוגה או ברשימה כדי לערוך אותו, הוסיפו אלמנטים לפני ואחרי העמוד הראשי ושנו את הסדר. השינויים מגיעים לאורחים רק אחרי "שמירה".
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="lg:hidden">
          <Segmented
            label="מצב תצוגה"
            value={mobileView}
            onChange={setMobileView}
            options={[
              { value: "edit", label: "עריכה", icon: <Pencil className="size-4" aria-hidden /> },
              { value: "preview", label: "תצוגה מקדימה", icon: <Eye className="size-4" aria-hidden /> },
            ]}
          />
        </div>
        <div className={cx(mobileView === "edit" && "max-lg:hidden")}>
          <Segmented
            label="מכשיר לתצוגה"
            value={device}
            onChange={setDevice}
            options={[
              { value: "phone", label: "טלפון", icon: <Smartphone className="size-4" aria-hidden /> },
              { value: "desktop", label: "מחשב", icon: <Monitor className="size-4" aria-hidden /> },
            ]}
          />
        </div>
      </div>

      <div className={cx("grid gap-6", device === "phone" && "lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]")}>
        {/* Editing panel */}
        <div className={cx("min-w-0 space-y-6", mobileView === "preview" && "max-lg:hidden")}>
          <StructureList design={draft} selected={selected} onSelect={(id) => select(id, "list")} dispatch={dispatch} onAdd={setAddWhere} />

          <div ref={inspector} className="scroll-mt-4 space-y-4 rounded-2xl border border-border bg-bg/60 p-4 sm:p-5">
            <h3 className="text-lg font-bold">{hit ? `עריכה: ${BLOCK_META[hit.block.type].label}` : "עריכת העמוד הראשי"}</h3>
            {hit ? (
              <BlockInspector
                key={hit.block.id}
                event={event}
                block={hit.block}
                imageSrc={hit.block.type === "image" ? imageSrc(hit.block.slot) : null}
                dispatch={dispatch}
                against={against}
                onReplaceImage={async (b: ImageBlock, f) => {
                  const slot = await uploadImage(f);
                  if (slot !== null) dispatch({ type: "update", id: b.id, patch: { slot } });
                }}
                onDeleted={() => setSelected("hero")}
                onGoSettings={goSettings}
                onChanged={onChanged}
                hebrewOnly={hebrewOnly}
                onHebrewOnly={setHebrewOnly}
              />
            ) : (
              <HeroInspector
                event={event}
                design={draft}
                dispatch={dispatch}
                against={against}
                hebrewOnly={hebrewOnly}
                onHebrewOnly={setHebrewOnly}
                onTune={() => {
                  setTuning({ start: draft.hero.titleFont });
                  focusOn("hero");
                }}
                onGoSettings={goSettings}
                onChanged={onChanged}
                texts={texts}
                onTexts={(patch) => setTexts((t) => ({ ...t, ...patch }))}
              />
            )}
          </div>
        </div>

        {/* Live preview (on mobile: a tab, or the full-screen font tuning mode) */}
        <div
          className={cx(
            "min-w-0",
            device === "phone" ? "lg:sticky lg:top-4 lg:self-start" : "lg:order-first",
            mobileView === "edit" && !tuningOn && "max-lg:hidden",
            tuningOn && "fixed inset-0 z-50 flex flex-col gap-3 bg-zinc-950 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]",
          )}
        >
          <div className={cx(tuningOn && "min-h-0 flex-1")}>
            <DesignPreview
              event={previewEvent}
              design={draft}
              selected={selected}
              focus={focus}
              device={tuningOn ? "phone" : device}
              fill={tuningOn}
              onSelect={(id) => (tuningOn ? undefined : select(id, "preview"))}
            />
          </div>
          {tuningOn && (
            <div className="space-y-3 rounded-3xl bg-zinc-900 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white" role="group" aria-label="דפדוף בגופנים">
              <FontStepper value={draft.hero.titleFont} onChange={(f) => dispatch({ type: "hero", patch: { titleFont: f } })} hebrewOnly={hebrewOnly} dark />
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="glass"
                  icon={<X className="size-4" aria-hidden />}
                  onClick={() => {
                    dispatch({ type: "hero", patch: { titleFont: tuning!.start } });
                    setTuning(null);
                  }}
                >
                  ביטול
                </Button>
                <Button variant="accent" loading={saving} icon={<Save className="size-4" aria-hidden />} onClick={save}>
                  שמירה
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save bar: stays in reach while scrolling the long editor. */}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-wrap items-center gap-3 rounded-b-2xl border-t border-border bg-card/95 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:-mx-6 sm:-mb-6 sm:px-6">
        <Button disabled={!dirty} loading={saving} icon={<Save className="size-4" aria-hidden />} onClick={save}>
          שמירת העיצוב
        </Button>
        {dirty && !saving && (
          <>
            <Button variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={reset}>
              ביטול השינויים
            </Button>
            <span role="status" className="text-sm text-muted-fg max-sm:sr-only">
              יש שינויים שלא נשמרו
            </span>
          </>
        )}
      </div>

      <AddBlockSheet open={addWhere !== null} where={addWhere ?? "after"} design={draft} onClose={() => setAddWhere(null)} onPick={addBlock} />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const slot = await uploadImage(f);
          if (slot === null) return;
          const b = newBlock("image", slot);
          dispatch({ type: "add", block: b, where: pendingWhere.current });
          select(b.id, "list");
        }}
      />
    </Card>
  );
}
