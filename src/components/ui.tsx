import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Check, Copy, Loader2, Plus, X, AlertTriangle, CheckCircle2, Info } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ------------------------------------------------------------------ Button

type Variant = "primary" | "accent" | "outline" | "ghost" | "danger" | "glass";
type Size = "md" | "lg" | "xl" | "sm";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-on-primary shadow-soft hover:brightness-110",
  accent: "bg-accent text-on-accent shadow-soft hover:brightness-110",
  outline: "border-2 border-primary text-fg bg-card/60 hover:bg-primary/10",
  ghost: "text-fg hover:bg-fg/5",
  danger: "bg-destructive text-white shadow-soft hover:brightness-110",
  glass: "bg-white/15 text-white border border-white/35 backdrop-blur-md hover:bg-white/25",
};
const SIZES: Record<Size, string> = {
  sm: "min-h-10 px-3 text-sm gap-1.5 rounded-lg",
  md: "min-h-11 px-5 text-base gap-2 rounded-xl",
  lg: "min-h-14 px-6 text-lg gap-2.5 rounded-2xl",
  xl: "min-h-16 px-7 text-xl gap-3 rounded-2xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center font-semibold select-none transition-[filter,background-color,box-shadow,opacity] duration-200",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-11 items-center justify-center rounded-full transition-colors duration-200",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * The round "+" add button (icon only - `label` is its accessible name / tooltip): theme color, raised, with a soft
 * ring, a press animation and a spinner while busy. md = 44px (the same circle as the icon buttons beside it), lg = 56px.
 */
export function PlusButton({
  label,
  loading,
  disabled,
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; loading?: boolean; size?: "md" | "lg" }) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-lift ring-4 ring-primary/20",
        "transition-[filter,transform,box-shadow] duration-200 hover:brightness-110 hover:ring-primary/30 active:scale-90",
        "disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:active:scale-100",
        size === "lg" ? "size-14" : "size-11",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Plus className={size === "lg" ? "size-7" : "size-6"} strokeWidth={2.75} aria-hidden />}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <a
      href={href}
      className={cx(
        "inline-flex items-center justify-center font-semibold no-underline transition-[filter,background-color] duration-200",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </a>
  );
}

export function Spinner({ label = "טוען…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cx("flex items-center justify-center gap-3 p-8 text-muted-fg", className)}>
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6", className)}>{children}</div>;
}

// ------------------------------------------------------------------ Form fields

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-semibold">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-sm text-muted-fg">{hint}</p>}
      {error && (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "min-h-12 w-full rounded-xl border border-border bg-card px-4 text-base text-fg placeholder:text-muted-fg/70 transition-shadow duration-200 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20";

// ------------------------------------------------------------------ Modal (native <dialog>: focus trap + Esc)

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
  dismissable?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissable) onClose();
      }}
      // Android's back gesture can close a dialog without a cancellable "cancel" event; keep state in sync.
      onClose={() => {
        if (!openRef.current) return;
        if (dismissable) onClose();
        else ref.current?.showModal();
      }}
      onClick={(e) => {
        if (dismissable && e.target === ref.current) onClose();
      }}
      className={cx(
        "m-auto w-[calc(100%-2rem)] rounded-3xl border border-border bg-card p-0 text-fg shadow-lift backdrop:bg-black/55 backdrop:backdrop-blur-sm",
        size === "lg" ? "max-w-2xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <h2 className="text-xl font-bold leading-snug">{title}</h2>
            {dismissable && (
              <IconButton label="סגירה" onClick={onClose} className="-me-2 hover:bg-fg/5">
                <X className="size-5" aria-hidden />
              </IconButton>
            )}
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap-reverse justify-end gap-3 border-t border-border px-6 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/**
 * Clear confirmation before destructive actions (MASTER rule: state exact item count;
 * whole-album deletion requires typing its name).
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "ביטול",
  danger = true,
  requireText,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  requireText?: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);
  const ok = !requireText || typed.trim() === requireText.trim();
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={
        <span className="flex items-center gap-2">
          {danger && <AlertTriangle className="size-6 text-destructive" aria-hidden />}
          {title}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy} autoFocus>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            loading={busy}
            disabled={!ok}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-base leading-relaxed">
        {message}
        {requireText && (
          <Field label={`כדי לאשר, כתבו: ${requireText}`} htmlFor="confirm-text">
            <input id="confirm-text" className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Copy field

export function CopyField({ value, label, mono = true }: { value: string; label: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-sm font-semibold text-muted-fg">{label}</span>
      <div className="flex min-w-0 items-stretch gap-2">
        <code
          dir="ltr"
          className={cx(
            "flex min-h-11 min-w-0 flex-1 items-center overflow-x-auto rounded-xl border border-border bg-muted px-3 text-sm text-fg no-scrollbar",
            mono ? "font-mono" : "",
          )}
        >
          <span className="whitespace-nowrap">{value}</span>
        </code>
        <Button
          variant="outline"
          size="md"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          icon={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          aria-label={`העתקת ${label}`}
        >
          <span aria-live="polite">{copied ? "הועתק" : "העתק"}</span>
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Toasts

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}
const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, kind: ToastKind = "success") => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p, { id, kind, text }]);
    setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), kind === "error" ? 5000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 safe-bottom">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={cx(
              "animate-pop-in pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-base font-medium shadow-lift",
              t.kind === "error" ? "bg-destructive text-white" : "bg-zinc-900 text-white",
            )}
          >
            {t.kind === "success" && <CheckCircle2 className="size-5 shrink-0 text-emerald-400" aria-hidden />}
            {t.kind === "error" && <AlertTriangle className="size-5 shrink-0" aria-hidden />}
            {t.kind === "info" && <Info className="size-5 shrink-0 text-sky-300" aria-hidden />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ------------------------------------------------------------------ Segmented control

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  dark,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  label: string;
  dark?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("inline-flex gap-1 rounded-2xl p-1", dark ? "bg-white/10" : "bg-muted")}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-colors duration-200",
              active
                ? dark
                  ? "bg-white text-zinc-900"
                  : "bg-card text-fg shadow-soft"
                : dark
                  ? "text-white/80 hover:text-white"
                  : "text-muted-fg hover:text-fg",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
