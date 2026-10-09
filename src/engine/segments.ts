/**
 * Ринкові сегменти (ТЗ §10, P-08): сегмент визначається характеристиками
 * лікування, а не ціною. Ніколи не «краще / гірше».
 */
import type { PackageChoice, Segment } from "./types";

export interface SegmentInfo {
  label: string;
  shortLabel: string;
  description: string;
  /** Частина «імплантаційна система» у конструкторі 3×3. */
  implantDescription: string;
  /** Частина «коронка / протез» у конструкторі 3×3. */
  prostheticDescription: string;
}

export const SEGMENT_INFO: Record<Segment, SegmentInfo> = {
  BASIC: {
    label: "Базовий",
    shortLabel: "Базовий",
    description:
      "Повноцінне лікування з доступнішими імплантаційними системами та стандартними ортопедичними рішеннями.",
    implantDescription:
      "Доступніші імплантаційні системи, які широко використовуються в клініках.",
    prostheticDescription:
      "Стандартні ортопедичні рішення: типові компоненти та матеріали коронки.",
  },
  OPTIMAL: {
    label: "Оптимальний",
    shortLabel: "Оптимальний",
    description:
      "Імплантаційні системи та ортопедичні рішення середнього або вище середнього ринкового сегмента. Базовий референсний варіант для складніших результатів All-on-X.",
    implantDescription:
      "Імплантаційні системи середнього або вище середнього ринкового сегмента.",
    prostheticDescription:
      "Ортопедичні рішення середнього або вище середнього сегмента: компоненти та матеріали коронки.",
  },
  PREMIUM: {
    label: "Преміальний",
    shortLabel: "Преміальний",
    description:
      "Преміальні світові імплантаційні системи, оригінальні або преміальні компоненти та/або більш індивідуалізовані ортопедичні рішення.",
    implantDescription:
      "Преміальні світові імплантаційні системи та оригінальні компоненти.",
    prostheticDescription:
      "Преміальні або більш індивідуалізовані ортопедичні рішення.",
  },
};

/** Default package (ТЗ §13): the same segment for implant and prosthetic. */
export function alignedPackage(segment: Segment): PackageChoice {
  return { implant: segment, prosthetic: segment };
}

export function isAlignedPackage(p: PackageChoice): boolean {
  return p.implant === p.prosthetic;
}
