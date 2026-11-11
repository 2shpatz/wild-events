/** The switch itself (RTL: the knob moves toward the start when on). Wrapped in a label so the knob is clickable. */
export function Switch({ id, checked, onChange, label }: { id?: string; checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="relative inline-flex min-h-11 shrink-0 cursor-pointer items-center">
      <input id={id} type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="h-8 w-14 rounded-full bg-muted transition-colors duration-200 peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-ring" />
      <span className="absolute start-1 top-1/2 size-6 -translate-y-1/2 rounded-full bg-white shadow transition-transform duration-200 peer-checked:-translate-x-6" />
    </label>
  );
}

/** On/off switch row: label (and hint) on one side, the switch on the other; the whole row is clickable. */
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="text-sm text-muted-fg">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-8 w-14 rounded-full bg-muted transition-colors duration-200 peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-ring" />
        <span className="absolute start-1 top-1 size-6 rounded-full bg-white shadow transition-transform duration-200 peer-checked:-translate-x-6" />
      </span>
    </label>
  );
}
