import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { allQueues, isBusy, onAnyUploadChange, overallProgress, type QueueItem } from "../lib/upload";
import { useToast } from "./ui";

interface Snapshot {
  code: string;
  items: QueueItem[];
}

const read = (): Snapshot[] => allQueues().map((q) => ({ code: q.code, items: q.items }));

/**
 * App-wide companion of the upload queues: while anything uploads it keeps the screen awake and warns before
 * the tab is closed, and on pages other than the upload page it shows a small progress pill that leads back.
 */
export function UploadDock() {
  const { pathname } = useLocation();
  const toast = useToast();
  const [queues, setQueues] = useState<Snapshot[]>(read);
  const wasBusy = useRef(new Map<string, boolean>());
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  // Progress events are frequent - re-render at most once per frame.
  useEffect(() => {
    let raf = 0;
    const off = onAnyUploadChange(() => {
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        setQueues(read());
      });
    });
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, []);

  // Finished while the guest was elsewhere → tell them how it went.
  useEffect(() => {
    for (const q of queues) {
      const busy = isBusy(q.items);
      const before = wasBusy.current.get(q.code);
      wasBusy.current.set(q.code, busy);
      if (!before || busy || pathRef.current === `/${q.code}/upload`) continue;
      const done = q.items.filter((i) => i.state === "done").length;
      const failed = q.items.filter((i) => i.state === "error").length;
      if (failed) toast(`${failed.toLocaleString("he-IL")} קבצים לא הועלו. אפשר לנסות שוב בדף ההעלאה`, "error");
      else toast(`ההעלאה הסתיימה: ${done.toLocaleString("he-IL")} הועלו בהצלחה`);
    }
  }, [queues, toast]);

  const anyBusy = queues.some((q) => isBusy(q.items));

  // Keep the screen on (the lock drops whenever the tab is hidden, so re-take it on return) and warn before closing.
  useEffect(() => {
    if (!anyBusy) return;
    let lock: WakeLockSentinel | null = null;
    const take = () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      navigator.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    };
    take();
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    document.addEventListener("visibilitychange", take);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("visibilitychange", take);
      lock?.release().catch(() => {});
    };
  }, [anyBusy]);

  const away = queues.find((q) => isBusy(q.items) && pathname !== `/${q.code}/upload`);
  if (!away) return null;
  const done = away.items.filter((i) => i.state === "done").length;
  const total = away.items.length;
  const pct = Math.round(overallProgress(away.items) * 100);

  return (
    <Link
      to={`/${away.code}/upload`}
      aria-label={`מעלה ${done} מתוך ${total} קבצים. מעבר לדף ההעלאה`}
      className="animate-pop-in fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 mx-auto flex w-fit min-h-11 items-center gap-2.5 overflow-hidden rounded-full bg-zinc-900/95 py-2 pe-4 ps-3 text-sm font-semibold text-white shadow-lift backdrop-blur-md transition-[filter] duration-200 hover:brightness-125"
    >
      <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
      <span className="whitespace-nowrap">
        מעלה {done.toLocaleString("he-IL")} מתוך {total.toLocaleString("he-IL")}
      </span>
      <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-white/20" aria-hidden>
        <span className="block h-full rounded-full bg-emerald-400 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </span>
      <span className="sr-only">{pct}%</span>
    </Link>
  );
}
