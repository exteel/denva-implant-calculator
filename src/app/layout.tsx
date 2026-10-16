import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { SITE_URL } from "@/lib/seo/site";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

// No global `robots`/`alternates`: indexing is decided per page (ТЗ §11.3) — a
// layout-level directive would be inherited and could conflict with it.
export const metadata: Metadata = {
  metadataBase: new URL(`${SITE_URL}/`),
  title: { default: "Калькулятор імплантації — DENVA", template: "%s | DENVA" },
  description:
    "Дізнайтеся орієнтовну вартість імплантації у вашому місті: мінімальний, класичний і преміальний рівні, додаткові витрати окремо. Без реєстрації та телефону.",
  openGraph: {
    siteName: "DENVA",
    locale: "uk_UA",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2453d6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={manrope.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
