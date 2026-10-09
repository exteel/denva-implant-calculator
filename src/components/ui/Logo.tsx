import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-ink no-underline"
      aria-label="Denva — на головну"
    >
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-[10px] bg-brand text-[15px] font-extrabold text-white"
      >
        D
      </span>
      <span className="text-[17px] font-extrabold tracking-[0.18em]">DENVA</span>
    </Link>
  );
}
