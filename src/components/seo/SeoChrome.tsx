import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { CATALOG_PATH, METHODOLOGY_PATH } from "@/lib/seo/site";

/** Slim top bar of the SEO pages (the embedded calculator has no header of its own). */
export function SeoHeader() {
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo href={CATALOG_PATH} />
        <nav aria-label="Основна навігація" className="flex items-center gap-4 text-sm font-bold text-ink-soft">
          <Link href={CATALOG_PATH} className="hover:text-brand">
            Міста
          </Link>
          <Link href={METHODOLOGY_PATH} className="hover:text-brand">
            Методологія
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SeoFooter() {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto max-w-3xl px-4 py-8 text-sm leading-relaxed text-muted sm:px-6">
        <p>
          DENVA — незалежний калькулятор орієнтовних ринкових цін на імплантацію. Це не стоматологічна клініка і не публічна оферта:
          остаточну схему лікування та вартість визначає лікар після консультації та КТ.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-bold">
          <Link href={CATALOG_PATH} className="text-ink-soft hover:text-brand">
            Міста
          </Link>
          <Link href={METHODOLOGY_PATH} className="text-ink-soft hover:text-brand">
            Методологія розрахунку
          </Link>
        </p>
      </div>
    </footer>
  );
}

/** Wrapper that gives every content section the same width and rhythm. */
export function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-3xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="mt-10">
      <h2 id={id ? `${id}-title` : undefined} className="text-xl font-extrabold text-ink">
        {title}
      </h2>
      <div className="mt-3 space-y-3 leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

/** Paragraphs from a plain-text field edited in the admin (blank line = new paragraph). */
export function Paragraphs({ text, className = "" }: { text: string; className?: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => (
          <p key={part} className={`whitespace-pre-line ${className}`}>
            {part}
          </p>
        ))}
    </>
  );
}
