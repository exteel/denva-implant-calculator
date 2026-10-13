"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Button } from "@/components/ui/Button";

// ───────────── layout ─────────────

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad" | "brand";

const tones: Record<Tone, string> = {
  neutral: "bg-canvas text-ink-soft border-line",
  good: "bg-good-soft text-good border-transparent",
  warn: "bg-warn-soft text-warn border-warn-line",
  bad: "bg-bad-soft text-bad border-transparent",
  brand: "bg-brand-soft text-brand border-brand-line",
};

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Notice({ tone = "neutral", children, role }: { tone?: Tone; children: ReactNode; role?: "alert" | "status" }) {
  return (
    <div role={role} className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

/** Loading / error / empty wrapper. Renders `children` only when data is ready and non-empty. */
export function DataState({
  loading,
  error,
  empty,
  emptyText = "Нічого не знайдено.",
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (error) {
    return (
      <Notice tone="bad" role="alert">
        <p className="font-bold">Не вдалося завантажити дані</p>
        <p className="mt-1">{error}</p>
        {onRetry ? (
          <MiniButton className="mt-2" onClick={onRetry}>
            Спробувати знову
          </MiniButton>
        ) : null}
      </Notice>
    );
  }
  if (loading) return <p className="py-6 text-sm text-muted" role="status">Завантаження…</p>;
  if (empty) return <p className="py-6 text-sm text-muted">{emptyText}</p>;
  return <>{children}</>;
}

// ───────────── buttons ─────────────

export function MiniButton({
  tone = "neutral",
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "neutral" | "brand" | "good" | "bad" }) {
  const palette = {
    neutral: "border-line-strong bg-paper text-ink hover:border-brand hover:text-brand",
    brand: "border-brand bg-brand text-white hover:bg-brand-dark",
    good: "border-good bg-good-soft text-good hover:bg-good hover:text-white",
    bad: "border-bad bg-bad-soft text-bad hover:bg-bad hover:text-white",
  }[tone];
  return (
    <button
      type={type}
      className={`inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border px-3 text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${palette} ${className}`}
      {...rest}
    />
  );
}

export { Button };

// ───────────── form fields ─────────────

const controlClass =
  "min-h-10 w-full rounded-lg border bg-paper px-3 text-sm text-ink placeholder:text-muted disabled:bg-canvas disabled:text-muted aria-[invalid=true]:border-bad";

function FieldShell({
  id,
  label,
  error,
  hint,
  required,
  children,
  className = "",
}: {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[13px] font-bold text-ink-soft">
        {label}
        {required ? <span className="text-bad" aria-hidden> *</span> : null}
      </label>
      {children}
      {hint && !error ? <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p> : null}
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs font-bold text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string | null, hint?: string) {
  return error ? `${id}-err` : hint ? `${id}-hint` : undefined;
}

interface BaseFieldProps {
  label: string;
  error?: string | null;
  hint?: string;
  fieldClassName?: string;
}

export function TextField({
  label,
  error,
  hint,
  fieldClassName,
  className = "",
  required,
  ...rest
}: BaseFieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={fieldClassName}>
      <input
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, hint)}
        className={`${controlClass} ${error ? "border-bad" : "border-line-strong"} ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  fieldClassName,
  className = "",
  required,
  ...rest
}: BaseFieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={fieldClassName}>
      <textarea
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, hint)}
        rows={3}
        className={`${controlClass} py-2 ${error ? "border-bad" : "border-line-strong"} ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  error,
  hint,
  fieldClassName,
  className = "",
  required,
  children,
  ...rest
}: BaseFieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={fieldClassName}>
      <select
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, hint)}
        className={`${controlClass} ${error ? "border-bad" : "border-line-strong"} ${className}`}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  hint,
  className = "",
  ...rest
}: { label: string; hint?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2 text-sm text-ink">
        <input id={id} type="checkbox" className="mt-0.5 size-4 accent-[var(--color-brand)]" {...rest} />
        <span>
          <span className="font-bold">{label}</span>
          {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
        </span>
      </label>
    </div>
  );
}

// ───────────── tables ─────────────

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-line bg-paper">{children}</div>;
}
export const thClass = "whitespace-nowrap border-b border-line bg-canvas px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-muted";
export const tdClass = "border-b border-line px-3 py-2 align-top text-sm text-ink";

// ───────────── dialogs ─────────────

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`max-h-[90dvh] w-full overflow-y-auto rounded-2xl bg-paper p-5 shadow-xl outline-none ${wide ? "max-w-3xl" : "max-w-md"}`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-extrabold text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Закрити" className="rounded-lg px-2 text-xl leading-none text-muted hover:text-ink">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Confirm dialog with an optional "Причина зміни" (ТЗ §7.1 history). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Підтвердити",
  askReason = false,
  danger = false,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  askReason?: boolean;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="space-y-3 text-sm text-ink-soft">
        <div>{message}</div>
        {askReason ? (
          <TextAreaField
            label="Причина зміни (необов'язково)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            hint="Потрапить у журнал змін."
          />
        ) : null}
        {error ? <Notice tone="bad" role="alert">{error}</Notice> : null}
        <div className="flex justify-end gap-2 pt-1">
          <MiniButton onClick={onCancel} disabled={busy}>Скасувати</MiniButton>
          <MiniButton tone={danger ? "bad" : "brand"} onClick={() => onConfirm(reason)} disabled={busy}>
            {busy ? "Зачекайте…" : confirmLabel}
          </MiniButton>
        </div>
      </div>
    </Modal>
  );
}

// ───────────── hooks ─────────────

/** Tracks an in-flight action with error text, for forms and dialogs. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(fn: () => Promise<T>, describe: (e: unknown) => string): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(describe(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}
