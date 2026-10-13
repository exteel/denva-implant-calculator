import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Калькулятор імплантації — DENVA AI",
  description:
    "Дізнайтеся орієнтовну вартість імплантації у вашому місті: мінімальний, класичний і преміальний рівні, додаткові витрати окремо. Без реєстрації та телефону.",
  openGraph: {
    title: "Калькулятор імплантації — DENVA AI",
    description: "Орієнтовна ринкова вартість імплантації у вашому місті — без реєстрації та телефону.",
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
