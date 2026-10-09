import type { HTMLAttributes } from "react";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={`rounded-[var(--radius-card)] border border-line bg-paper p-5 sm:p-6 ${className}`}
      {...rest}
    />
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[17px] font-extrabold text-ink">{children}</h2>;
}
