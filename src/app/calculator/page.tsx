import type { Metadata } from "next";
import { CalculatorApp } from "@/components/calculator/CalculatorApp";

export const metadata: Metadata = {
  title: "Розрахунок вартості імплантації — Denva",
  description:
    "Дізнайтеся ринковий діапазон вартості імплантації у вашому місті за 2 хвилини — без реєстрації та телефону.",
};

export default function CalculatorPage() {
  return <CalculatorApp />;
}
