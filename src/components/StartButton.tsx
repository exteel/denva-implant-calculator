"use client";

import Link from "next/link";
import { track } from "@/services/analytics";
import { buttonClass } from "@/components/ui/Button";

export function StartButton({ placement, className = "" }: { placement: string; className?: string }) {
  return (
    <Link
      href="/calculator/"
      onClick={() => track("calculator_started", { placement })}
      className={buttonClass("primary", `min-h-14 px-8 text-[16px] ${className}`)}
    >
      Почати розрахунок
      <span aria-hidden>→</span>
    </Link>
  );
}
