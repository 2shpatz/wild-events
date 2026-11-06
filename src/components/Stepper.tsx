import { Check } from "lucide-react";
import { cx } from "./ui";

/** Wizard progress (ux: "Show progress for multi-step processes"). */
export function Stepper({ steps, current, done }: { steps: string[]; current: number; done?: Set<number> }) {
  return (
    <nav aria-label="שלבים" className="w-full">
      <p className="mb-3 text-sm font-semibold text-muted-fg">
        שלב {current + 1} מתוך {steps.length}: <span className="text-fg">{steps[current]}</span>
      </p>
      <ol className="flex gap-1.5">
        {steps.map((s, i) => {
          const isDone = done ? done.has(i) : i < current;
          return (
            <li key={s} className="flex-1" aria-current={i === current ? "step" : undefined}>
              <span className="sr-only">
                {s}
                {isDone ? " (הושלם)" : ""}
              </span>
              <span
                className={cx(
                  "flex h-2 rounded-full transition-colors duration-300",
                  i === current ? "bg-primary" : isDone ? "bg-primary/45" : "bg-muted",
                )}
                aria-hidden
              />
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StepDot({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-base font-bold",
        done ? "bg-emerald-500 text-white" : "bg-primary text-on-primary",
      )}
      aria-hidden
    >
      {done ? <Check className="size-5" /> : n}
    </span>
  );
}
