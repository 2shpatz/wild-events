import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, Link2, MessageSquareText, RotateCcw, Save, Share2 } from "lucide-react";
import { Button, CopyField, inputClass, useToast } from "./ui";
import { eventUrl } from "../lib/format";

export function WhatsAppIcon({ className }: { className?: string }) {
  // Official WhatsApp glyph (Simple Icons, CC0).
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/** Printable card: QR + event title, drawn on a canvas. */
async function printableCard(url: string, title: string, color: string) {
  const W = 1200;
  const H = 1500;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, 18);
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "#111";
  ctx.font = "700 72px Heebo, sans-serif";
  ctx.fillText(title.slice(0, 28), W / 2, 170);
  ctx.font = "400 44px Heebo, sans-serif";
  ctx.fillStyle = "#444";
  ctx.fillText("סרקו כדי להעלות ולצפות בתמונות", W / 2, 250);
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, url, { width: 900, margin: 1, color: { dark: "#111111", light: "#ffffff" }, errorCorrectionLevel: "M" });
  ctx.drawImage(qr, (W - 900) / 2, 320, 900, 900);
  ctx.font = "500 40px Heebo, sans-serif";
  ctx.fillStyle = "#555";
  ctx.direction = "ltr";
  ctx.fillText(url.replace(/^https?:\/\//, ""), W / 2, 1320);
  return canvas.toDataURL("image/png");
}

export const SHARE_TEXT_MAX = 500;

/** The built-in share message (without the link). */
export const defaultShareText = (title: string) => `📸 ${title}\nמעלים תמונות מהאירוע וצופים בכולן בלייב - בלי הרשמה:`;

/** The message that is shared: the hosts' text (or the built-in one), with the event link always on its own last line. */
export const shareMessage = (text: string | null, title: string, url: string) => `${text?.trim() || defaultShareText(title)}\n${url}`;

export function QRShare({
  code,
  title,
  shareText,
  onSaveText,
}: {
  code: string;
  title: string;
  shareText?: string | null;
  /** given = the hosts can edit the message here; null = back to the built-in text */
  onSaveText?: (text: string | null) => Promise<void>;
}) {
  const url = eventUrl(code);
  const [src, setSrc] = useState<string | null>(null);
  const toast = useToast();
  const message = shareMessage(shareText ?? null, title, url);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 560, margin: 1, errorCorrectionLevel: "M" }).then(setSrc);
  }, [url]);

  return (
    <div className="flex min-w-0 flex-col items-center gap-5">
      <div className="rounded-3xl border border-border bg-white p-4 shadow-soft">
        {src ? (
          <img src={src} alt={`קוד QR לאירוע ${title}`} width={280} height={280} className="size-64 sm:size-72" />
        ) : (
          <div className="skeleton size-64 rounded-xl sm:size-72" />
        )}
      </div>
      <div className="grid w-full min-w-0 max-w-md grid-cols-1 gap-3">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-[#25D366] px-6 text-lg font-bold text-[#062e16] shadow-soft transition-[filter] duration-200 hover:brightness-105"
        >
          <WhatsAppIcon className="size-6" />
          שיתוף בוואטסאפ
        </a>
        <div className="grid grid-cols-2 gap-3">
          {"share" in navigator && (
            <Button
              variant="outline"
              icon={<Share2 className="size-5" aria-hidden />}
              onClick={() => navigator.share({ title, text: message, url }).catch(() => {})}
            >
              שיתוף אחר
            </Button>
          )}
          <Button
            variant="outline"
            icon={<Download className="size-5" aria-hidden />}
            onClick={async () => {
              const color = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#111";
              const a = document.createElement("a");
              a.href = await printableCard(url, title, color);
              a.download = `qr-${code}.png`;
              a.click();
              toast("כרטיס ה-QR ירד למכשיר - אפשר להדפיס ולהניח על השולחנות");
            }}
          >
            הורדה להדפסה
          </Button>
        </div>
        <CopyField label="קישור לאירוע" value={url} />
        <p className="flex items-center justify-center gap-2 text-sm text-muted-fg">
          <Link2 className="size-4" aria-hidden />
          כל מי שיש לו את הקישור יכול להעלות ולצפות
        </p>
        {onSaveText && <ShareTextEditor title={title} url={url} shareText={shareText ?? null} onSave={onSaveText} />}
      </div>
    </div>
  );
}

/** The hosts rewrite the message that goes with the link; the link itself is added automatically so it can't break. */
function ShareTextEditor({
  title,
  url,
  shareText,
  onSave,
}: {
  title: string;
  url: string;
  shareText: string | null;
  onSave: (text: string | null) => Promise<void>;
}) {
  const saved = shareText?.trim() || defaultShareText(title);
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  useEffect(() => setText(saved), [saved]);

  const clean = text.trim();
  const isDefault = clean === defaultShareText(title);
  const dirty = clean !== saved;
  const save = async (value: string | null, which: "save" | "reset") => {
    setBusy(which);
    await onSave(value);
    setBusy(null);
  };

  return (
    <section className="mt-2 flex flex-col gap-3 border-t border-border pt-5" aria-labelledby="share-text-title">
      <h3 id="share-text-title" className="flex items-center gap-2 text-lg font-bold">
        <MessageSquareText className="size-5" aria-hidden />
        נוסח ההודעה לאורחים
      </h3>
      <label htmlFor="share-text" className="sr-only">
        נוסח ההודעה לאורחים
      </label>
      <textarea
        id="share-text"
        className={`${inputClass} min-h-28 resize-y py-3 leading-relaxed`}
        value={text}
        maxLength={SHARE_TEXT_MAX}
        onChange={(e) => setText(e.target.value)}
        aria-describedby="share-text-hint"
      />
      <p id="share-text-hint" className="flex justify-between gap-3 text-sm text-muted-fg">
        <span>הקישור לאירוע מתווסף אוטומטית בסוף ההודעה.</span>
        <span dir="ltr" className="shrink-0 tabular-nums">
          {text.length}/{SHARE_TEXT_MAX}
        </span>
      </p>

      <div className="rounded-2xl bg-[#efeae2] p-3" aria-label="תצוגה מקדימה של ההודעה">
        <p className="mb-1.5 text-xs font-semibold text-[#54656f]">כך זה ייראה בוואטסאפ</p>
        <div className="ms-auto w-fit max-w-[92%] whitespace-pre-wrap break-words rounded-xl rounded-se-sm bg-[#d9fdd3] px-3 py-2 text-[15px] leading-relaxed text-[#111b21] shadow-sm">
          {clean || defaultShareText(title)}
          {"\n"}
          <bdi dir="ltr" className="text-[#027eb5] underline">
            {url}
          </bdi>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button disabled={!dirty} loading={busy === "save"} icon={<Save className="size-4" aria-hidden />} onClick={() => save(isDefault || !clean ? null : clean, "save")}>
          שמירת הנוסח
        </Button>
        {(shareText || !isDefault) && (
          <Button
            variant="ghost"
            loading={busy === "reset"}
            icon={<RotateCcw className="size-4" aria-hidden />}
            onClick={() => (shareText ? save(null, "reset") : setText(defaultShareText(title)))}
          >
            חזרה לנוסח המקורי
          </Button>
        )}
      </div>
    </section>
  );
}
