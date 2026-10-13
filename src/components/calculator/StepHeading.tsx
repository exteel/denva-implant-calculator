"use client";

import { useEffect, useRef } from "react";

/** Step title; takes focus on mount so keyboard / screen-reader users follow the flow. */
export function StepHeading({ children, focus = true }: { children: React.ReactNode; focus?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus({ preventScroll: true });
  }, [focus]);
  return (
    <h1
      ref={ref}
      tabIndex={-1}
      className="text-[26px] leading-tight font-extrabold tracking-tight text-balance outline-none sm:text-[30px]"
    >
      {children}
    </h1>
  );
}
