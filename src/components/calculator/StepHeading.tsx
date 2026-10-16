"use client";

import { createContext, useContext, useEffect, useRef } from "react";

/**
 * Standalone calculator: step titles are <h1>. Embedded in a host page that
 * already has its own <h1> (SEO city pages): they become <h2>.
 */
export const HeadingLevelContext = createContext<"h1" | "h2">("h1");

/** Step title; takes focus on mount so keyboard / screen-reader users follow the flow. */
export function StepHeading({ children, focus = true }: { children: React.ReactNode; focus?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const Tag = useContext(HeadingLevelContext);
  useEffect(() => {
    if (focus) ref.current?.focus({ preventScroll: true });
  }, [focus]);
  return (
    <Tag
      ref={ref}
      tabIndex={-1}
      data-testid="step-heading"
      className="text-[26px] leading-tight font-extrabold tracking-tight text-balance outline-none sm:text-[30px]"
    >
      {children}
    </Tag>
  );
}
