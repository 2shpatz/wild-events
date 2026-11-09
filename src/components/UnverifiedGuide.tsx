import { useState, type ReactNode } from "react";
import { AlertTriangle, ChevronLeft, Loader2 } from "lucide-react";
import { Button, Modal } from "./ui";

/** Illustrated walkthrough of Google's "unverified app" + consent screens, shown before redirecting. */
export function UnverifiedGuide({
  open,
  onClose,
  href,
  onGo,
  firstStep = "בוחרים את חשבון ה-Google שבו יישמרו התמונות",
  goLabel = "הבנתי, להתחברות",
}: {
  open: boolean;
  onClose: () => void;
  href: string;
  /** Runs (e.g. saves a draft) before leaving for Google. */
  onGo?: () => Promise<void> | void;
  firstStep?: ReactNode;
  goLabel?: string;
}) {
  const [going, setGoing] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="מה תראו אצל Google"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            סגירה
          </Button>
          <a
            href={href}
            aria-busy={going || undefined}
            onClick={async (e) => {
              if (!onGo) return;
              e.preventDefault();
              setGoing(true);
              try {
                await onGo();
              } finally {
                location.href = href;
              }
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-on-primary"
          >
            {goLabel}
            {going ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ChevronLeft className="size-5" aria-hidden />}
          </a>
        </>
      }
    >
      <ol className="space-y-6">
        <li className="space-y-2">
          <p className="text-lg font-bold">1. {firstStep}</p>
        </li>
        <li className="space-y-3">
          <p className="text-lg font-bold">2. אם מופיע "Google hasn't verified this app" - זה תקין</p>
          <p className="text-muted-fg">האתר חדש ועוד לא עבר את תהליך האימות של Google. לוחצים על <strong>Advanced</strong> ואז על <strong>Go to … (unsafe)</strong>.</p>
          <div dir="ltr" className="rounded-2xl border border-zinc-200 bg-white p-5 text-start font-sans text-zinc-800 shadow-soft" aria-hidden>
            <div className="mb-3 flex items-center gap-2 text-sm text-zinc-500">
              <AlertTriangle className="size-5 text-red-600" /> Google hasn&apos;t verified this app
            </div>
            <div className="mb-4 h-2 w-3/4 rounded bg-zinc-200" />
            <div className="mb-5 h-2 w-1/2 rounded bg-zinc-200" />
            <div className="flex items-center justify-between">
              <span className="relative rounded px-2 py-1 text-sm font-semibold text-blue-700 ring-4 ring-amber-400">Advanced</span>
              <span className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white">BACK TO SAFETY</span>
            </div>
            <div className="mt-4 border-t pt-3 text-sm">
              <span className="font-semibold text-zinc-600 underline ring-4 ring-amber-400">Go to live-event-albums (unsafe)</span>
            </div>
          </div>
        </li>
        <li className="space-y-3">
          <p className="text-lg font-bold">3. מסמנים את כל תיבות ההרשאה ולוחצים Continue</p>
          <p className="text-muted-fg">ההרשאות מאפשרות לאתר להעלות תמונות לחשבון שלך ולראות רק את התמונות שהוא עצמו העלה.</p>
          <div dir="ltr" className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-800 shadow-soft" aria-hidden>
            {["Add to your Google Photos library", "View photos added by this app", "Manage photos added by this app", "Select photos to import"].map((t) => (
              <div key={t} className="flex items-center gap-3 text-sm">
                <span className="flex size-5 items-center justify-center rounded bg-blue-600 text-white ring-2 ring-amber-400">✓</span>
                {t}
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <span className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white ring-4 ring-amber-400">Continue</span>
            </div>
          </div>
        </li>
      </ol>
    </Modal>
  );
}
