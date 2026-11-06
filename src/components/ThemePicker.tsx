import { useRef } from "react";
import { Check, ImageUp, X } from "lucide-react";
import type { EventType } from "../../shared/types";
import { EVENT_TYPES } from "../lib/themes";
import { Button, cx } from "./ui";

/** Background picker: presets for the event type (+ others) or an uploaded photo. */
export function BackgroundPicker({
  type,
  value,
  customPreview,
  onPreset,
  onCustom,
  onClearCustom,
}: {
  type: EventType;
  value: string | null;
  customPreview: string | null;
  onPreset: (id: string) => void;
  onCustom: (file: File) => void;
  onClearCustom: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const mine = EVENT_TYPES.find((t) => t.id === type)?.backgrounds ?? [];
  const others = EVENT_TYPES.flatMap((t) => t.backgrounds).filter((b, i, arr) => !mine.some((m) => m.id === b.id) && arr.findIndex((x) => x.id === b.id) === i);
  const all = [...mine, ...others];
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="רקע" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {all.map((b) => {
          const active = value === b.id;
          return (
            <button
              key={b.id}
              role="radio"
              aria-checked={active}
              onClick={() => onPreset(b.id)}
              className={cx(
                "relative flex aspect-[4/3] items-end overflow-hidden rounded-xl border-2 p-2 text-start text-xs font-semibold transition-[border-color] duration-200",
                `bg-preset-${b.id}`,
                active ? "border-primary" : "border-transparent hover:border-primary/40",
              )}
            >
              <span className="rounded-md bg-white/85 px-1.5 py-0.5 text-zinc-900">{b.label}</span>
              {active && <Check className="absolute end-1.5 top-1.5 size-6 rounded-full bg-primary p-1 text-on-primary" aria-hidden />}
            </button>
          );
        })}
        <button
          role="radio"
          aria-checked={value === "custom"}
          onClick={() => input.current?.click()}
          className={cx(
            "relative flex aspect-[4/3] flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed bg-cover bg-center text-sm font-semibold transition-[border-color]",
            value === "custom" ? "border-primary" : "border-border hover:border-primary/40",
          )}
          style={customPreview ? { backgroundImage: `url(${customPreview})` } : undefined}
        >
          {!customPreview && (
            <>
              <ImageUp className="size-6" aria-hidden />
              תמונה שלי
            </>
          )}
          {value === "custom" && <Check className="absolute end-1.5 top-1.5 size-6 rounded-full bg-primary p-1 text-on-primary" aria-hidden />}
        </button>
      </div>
      {value === "custom" && customPreview && (
        <Button variant="ghost" size="sm" onClick={onClearCustom} icon={<X className="size-4" aria-hidden />}>
          הסרת התמונה שלי
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onCustom(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Compress a background image client-side (≤1920px JPEG) so it can live in D1 and load fast. */
export async function compressBackground(file: File, maxEdge = 1920): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  for (const q of [0.82, 0.7, 0.55]) {
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", q));
    if (blob.size < 850 * 1024) return blob;
  }
  throw new Error("too_large");
}
