import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-bold transition-colors disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-dark disabled:bg-line-strong disabled:text-white",
  secondary:
    "border border-line-strong bg-paper text-ink hover:border-brand hover:text-brand disabled:text-muted",
  ghost: "text-brand hover:bg-brand-soft disabled:text-muted",
};

export function buttonClass(variant: Variant = "primary", extra = ""): string {
  return `${base} ${variants[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...rest} />;
}
