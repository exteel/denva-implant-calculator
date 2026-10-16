import { describe, expect, it } from "vitest";
import { cleanContent, contentProblems, emptyContent, missingKeyPrices, normalizeContent, validateSlug } from "./cityPage";

describe("validateSlug", () => {
  it("accepts url-safe slugs only", () => {
    expect(validateSlug("ivano-frankivsk")).toBeNull();
    expect(validateSlug("lviv")).toBeNull();
    expect(validateSlug("")).toMatch(/Вкажіть/);
    expect(validateSlug("Lviv")).not.toBeNull();
    expect(validateSlug("lviv city")).not.toBeNull();
    expect(validateSlug("-lviv")).not.toBeNull();
    expect(validateSlug("lviv--x")).not.toBeNull();
  });
});

describe("content helpers", () => {
  it("normalizes partial / wrong jsonb into a full object", () => {
    expect(normalizeContent(null)).toEqual(emptyContent());
    const c = normalizeContent({ intro: "Вступ", faq: [{ q: "Q", a: "A" }, "junk", { q: 1 }], reviewed_at: "2026-10-01T00:00:00Z", reviewer_name: "  " });
    expect(c.intro).toBe("Вступ");
    expect(c.faq).toEqual([{ q: "Q", a: "A" }, { q: "1", a: "" }]); // non-objects dropped, missing parts become ""
    expect(c.reviewed_at).toBe("2026-10-01");
    expect(c.reviewer_name).toBeNull();
  });

  it("cleans blank FAQ rows and strings", () => {
    const c = cleanContent({ ...emptyContent(), intro: "  ", faq: [{ q: " Q ", a: " A " }, { q: "", a: "" }, { q: "only q", a: "" }] });
    expect(c.intro).toBeNull();
    expect(c.faq).toEqual([{ q: "Q", a: "A" }]);
  });

  it("lists what blocks publication", () => {
    expect(contentProblems(emptyContent())).toHaveLength(4);
    const ok = { intro: "x", faq: [{ q: "q", a: "a" }], local_notes: null, reviewer_name: "Іван", reviewer_url: null, reviewed_at: "2026-10-01" };
    expect(contentProblems(ok)).toEqual([]);
    expect(contentProblems({ ...ok, faq: [{ q: "q", a: "a" }, { q: "half", a: "" }] })).toEqual(["у FAQ є рядок без питання або без відповіді"]);
  });
});

describe("missingKeyPrices", () => {
  const full = (codes: string[], tiers: Array<"minimum" | "classic" | "premium" | "common">) =>
    codes.flatMap((service_code) => tiers.map((tier) => ({ service_code, tier, published_value: 1 as number | null })));
  it("is empty when every key price is published", () => {
    const rows = [
      ...full(["IMPLANT_INSTALL", "HEALING_ABUTMENT", "SUPERSTRUCTURE_SET", "CROWN_IMPLANT", "MULTIUNIT", "ARCH_FINAL"], ["minimum", "classic", "premium"]),
      ...full(["SCAN_JAW_STAGE", "REPEAT_SCAN_JAW", "ARCH_TEMP"], ["common"]),
    ];
    expect(missingKeyPrices(rows)).toEqual([]);
  });
  it("reports unpublished and absent combinations", () => {
    const rows = [
      ...full(["IMPLANT_INSTALL"], ["minimum", "classic"]),
      { service_code: "IMPLANT_INSTALL", tier: "premium" as const, published_value: null },
    ];
    const missing = missingKeyPrices(rows);
    expect(missing).toContainEqual({ service_code: "IMPLANT_INSTALL", tier: "premium" });
    expect(missing).not.toContainEqual({ service_code: "IMPLANT_INSTALL", tier: "classic" });
    expect(missing).toContainEqual({ service_code: "ARCH_TEMP", tier: "common" });
    expect(missing).toContainEqual({ service_code: "REPEAT_SCAN_JAW", tier: "common" });
    expect(missing).toHaveLength(3 * 5 + 1 + 3); // 5 other tiered × 3, premium implant, 3 common
  });
});
