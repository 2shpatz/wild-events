import { useEffect, useRef, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "../ui";

export interface SheetOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
  hint?: string;
}

/**
 * Mobile picker: one compact button in the toolbar → bottom sheet with large, labelled options
 * (thumb-reachable, ≥56px rows). Native <dialog> gives focus trap + Esc / back-gesture close.
 */
export function ViewSheet<T extends string>({
  label,
  value,
  options,
  onChange,
  open,
  setOpen,
}: {
  label: string;
  value: T;
  options: SheetOption<T>[];
  onChange: (v: T) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/15"
      >
        {current.icon}
        <span className="sr-only">{label}: </span>
        {current.label}
        <ChevronDown className="size-4 opacity-70" aria-hidden />
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && setOpen(false)}
        className="mb-0 mt-auto w-full max-w-lg overscroll-contain rounded-t-3xl bg-zinc-900 p-0 text-white backdrop:bg-black/60 sm:mb-auto sm:rounded-3xl"
        aria-label={label}
      >
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/25" aria-hidden />
          <p className="mb-2 px-2 text-lg font-bold">{label}</p>
          <ul className="space-y-1">
            {options.map((o) => (
              <li key={o.value}>
                <button
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  aria-pressed={o.value === value}
                  className={cx(
                    "flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-start transition-colors",
                    o.value === value ? "bg-white text-zinc-900" : "hover:bg-white/10",
                  )}
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-current/10 [&>svg]:size-5">{o.icon}</span>
                  <span className="flex-1">
                    <span className="block text-base font-bold">{o.label}</span>
                    {o.hint && <span className={cx("block text-sm", o.value === value ? "text-zinc-600" : "text-white/65")}>{o.hint}</span>}
                  </span>
                  {o.value === value && <Check className="size-5" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}
