import Link from "next/link";
import { CATALOG_PATH } from "@/lib/seo/site";

export interface BreadcrumbItem {
  name: string;
  /** Omit for the current page. */
  href?: string;
}

/** Visible breadcrumbs: Головна → Калькулятор імплантації → … (mirrors the BreadcrumbList JSON-LD). */
export function Breadcrumbs({ trail }: { trail: readonly BreadcrumbItem[] }) {
  const items: BreadcrumbItem[] = [{ name: "Головна", href: "/" }, { name: "Калькулятор імплантації", href: CATALOG_PATH }, ...trail];
  return (
    <nav aria-label="Навігаційний ланцюжок" className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={item.name} className="flex items-center gap-2">
              {item.href && !last ? (
                <Link href={item.href} className="font-semibold text-ink-soft underline-offset-2 hover:text-brand hover:underline">
                  {item.name}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined}>{item.name}</span>
              )}
              {!last && <span aria-hidden>›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
