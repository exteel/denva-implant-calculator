import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Скільки коштує імплантація зубів — калькулятор Denva",
  description:
    "Безкоштовний калькулятор ринкової вартості імплантації у вашому місті: повний кошик лікування, що входить у ціну, можливі доплати та порівняння пропозиції клініки. Без реєстрації та телефону.",
  openGraph: {
    title: "Калькулятор вартості імплантації Denva",
    description:
      "Ринковий діапазон вартості імплантації у вашому місті — без реєстрації та телефону.",
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
