import { cx, inputClass } from "./ui";

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/**
 * Always-24h time picker ("HH:MM" or "" for no time). The native <input type="time"> follows the device
 * locale and may show AM/PM, so we use two selects (native wheels on mobile).
 */
export function TimeField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  const hh = m?.[1] ?? "";
  const mm = m?.[2] ?? "";
  const minutes = mm && !MINUTES.includes(mm) ? [...MINUTES, mm].sort() : MINUTES;
  const select = cx(inputClass, "w-24 cursor-pointer text-center tabular-nums");
  return (
    <div dir="ltr" className="flex items-center justify-end gap-2">
      <select
        id={id}
        aria-label="שעה"
        className={select}
        value={hh}
        onChange={(e) => onChange(e.target.value ? `${e.target.value}:${mm || "00"}` : "")}
      >
        <option value="">--</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-xl font-bold" aria-hidden>
        :
      </span>
      <select
        aria-label="דקות"
        className={select}
        value={hh ? mm : ""}
        disabled={!hh}
        onChange={(e) => onChange(`${hh}:${e.target.value}`)}
      >
        {!hh && <option value="">--</option>}
        {minutes.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      {hh && (
        <button type="button" onClick={() => onChange("")} className="min-h-11 whitespace-nowrap rounded-lg px-2 text-sm font-semibold text-muted-fg underline underline-offset-4 hover:text-fg" dir="rtl">
          ללא שעה
        </button>
      )}
    </div>
  );
}
