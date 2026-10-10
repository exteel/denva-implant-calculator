import { describe, it, expect } from "vitest";
import { BASKETS, COMPONENT_INFO } from "./catalog";
import { CITIES, OBLASTS, oblastLocationId } from "./geo";
import { formatUah } from "./format";
import { MARKET_DATA, isDemoData } from "./market-data";
import {
  lookupPrice,
  priceExtras,
  priceScenario,
  scenarioIncluded,
} from "./price-engine";
import { alignedPackage } from "./segments";
import {
  SEGMENTS,
  type BasketCode,
  type MarketPriceRecord,
  type PackageChoice,
  type Scenario,
  type Segment,
} from "./types";

const NOW = new Date("2026-10-09T12:00:00Z");
const opts = { now: NOW };

function scenarioOf(
  basket: BasketCode,
  extra: Partial<Scenario> = {},
): Scenario {
  return {
    id: basket,
    label: basket,
    parts: [{ basket, modifiers: { ...BASKETS[basket].defaultModifiers } }],
    ...extra,
  };
}

function bothJaws(basket: BasketCode): Scenario {
  const m = BASKETS[basket].defaultModifiers;
  return {
    id: `${basket}+${basket}`,
    label: "both",
    parts: [
      { basket, modifiers: { ...m }, arch: "UPPER" },
      { basket, modifiers: { ...m }, arch: "LOWER" },
    ],
  };
}

function rec(
  over: Partial<MarketPriceRecord> & Pick<MarketPriceRecord, "geo_scope" | "n">,
): MarketPriceRecord {
  return {
    service_or_basket: "IMPLANT_SURGICAL",
    segment: "OPTIMAL",
    p25: 17000,
    median: 20000,
    p75: 23600,
    source_mix: { clinics: 3, sources: ["x"] },
    updated_at: "2026-09-01",
    original_currency: "UAH",
    is_demo: true,
    ...over,
  };
}

describe("demo data integrity", () => {
  it("every record has p25 < median < p75 and rounded to 100", () => {
    expect(MARKET_DATA.length).toBeGreaterThan(100);
    for (const r of MARKET_DATA) {
      const id = `${r.service_or_basket}/${r.segment}/${r.geo_scope.level}:${r.geo_scope.id}`;
      expect(r.p25, id).toBeLessThan(r.median);
      expect(r.median, id).toBeLessThan(r.p75);
      expect(r.p25 % 100, id).toBe(0);
      expect(r.median % 100, id).toBe(0);
      expect(r.p75 % 100, id).toBe(0);
      expect(r.is_demo).toBe(true);
      expect(r.original_currency).toBe("UAH");
    }
    expect(isDemoData()).toBe(true);
    expect(isDemoData([])).toBe(false);
  });

  it("country medians match the spec", () => {
    const r = lookupPrice("IMPLANT_SURGICAL", "OPTIMAL", "atlantis", opts)!;
    expect(r.scope).toEqual({ level: "country", id: "UA" });
    expect(r.record.median).toBe(20000);
    expect(r.record.n).toBeGreaterThanOrEqual(120);
  });
});

describe("lookupPrice / geo fallback", () => {
  it("uses the city when it has enough observations", () => {
    const r = lookupPrice("IMPLANT_SURGICAL", "OPTIMAL", "kyiv", opts)!;
    expect(r.scope).toEqual({ level: "city", id: "kyiv" });
    expect(r.usedFallback).toBe(false);
    expect(r.confidence).toBe("HIGH");
  });

  it("chernivtsi (n=9) falls to the oblast, which is stale → LOW", () => {
    const r = lookupPrice("IMPLANT_SURGICAL", "OPTIMAL", "chernivtsi", opts)!;
    expect(r.scope).toEqual({ level: "oblast", id: "chernivetska" });
    expect(r.record.n).toBe(11);
    expect(r.usedFallback).toBe(true);
    expect(r.confidence).toBe("LOW");
  });

  it("vinnytsia (n=6, no oblast data) falls to the center macroregion", () => {
    const r = lookupPrice("IMPLANT_SURGICAL", "OPTIMAL", "vinnytsia", opts)!;
    expect(r.scope).toEqual({ level: "macroregion", id: "center" });
    expect(r.usedFallback).toBe(true);
    expect(r.confidence).toBe("MEDIUM");
  });

  it("city without own data uses its oblast (drohobych → lvivska)", () => {
    const r = lookupPrice("IMPLANT_SURGICAL", "OPTIMAL", "drohobych", opts)!;
    expect(r.scope).toEqual({ level: "oblast", id: "lvivska" });
  });

  it("oblast: location starts at the oblast", () => {
    const r = lookupPrice("IMPLANT_SURGICAL", "OPTIMAL", oblastLocationId("lvivska"), opts)!;
    expect(r.scope.level).toBe("oblast");
    expect(r.usedFallback).toBe(false);
    const r2 = lookupPrice("IMPLANT_SURGICAL", "OPTIMAL", oblastLocationId("sumska"), opts)!;
    expect(r2.scope).toEqual({ level: "macroregion", id: "north" });
    expect(r2.usedFallback).toBe(true);
  });

  it("falls back per code, not per location (kyiv has no SEDATION at city level)", () => {
    expect(lookupPrice("IMPLANT_SURGICAL", "OPTIMAL", "kyiv", opts)!.scope.level).toBe("city");
    const sedation = lookupPrice("SEDATION", null, "kyiv", opts)!;
    expect(sedation.scope).toEqual({ level: "macroregion", id: "kyiv" });
    expect(sedation.usedFallback).toBe(true);
  });

  it("returns null when no record exists anywhere", () => {
    expect(lookupPrice("IMPLANT_SURGICAL", "OPTIMAL", "kyiv", { data: [], now: NOW })).toBeNull();
  });

  it("insufficient local data is skipped when a sufficient broader scope exists", () => {
    const data = [
      rec({ geo_scope: { level: "city", id: "lviv" }, n: 5 }),
      rec({ geo_scope: { level: "country", id: "UA" }, n: 100 }),
    ];
    const r = lookupPrice("IMPLANT_SURGICAL", "OPTIMAL", "lviv", { data, now: NOW })!;
    expect(r.scope.level).toBe("country");
  });

  it("when nothing is sufficient, the broadest existing record is returned with LOW confidence", () => {
    const data = [
      rec({ geo_scope: { level: "city", id: "lviv" }, n: 5 }),
      rec({ geo_scope: { level: "oblast", id: "lvivska" }, n: 3 }),
    ];
    const r = lookupPrice("IMPLANT_SURGICAL", "OPTIMAL", "lviv", { data, now: NOW })!;
    expect(r.scope).toEqual({ level: "oblast", id: "lvivska" });
    expect(r.confidence).toBe("LOW");
    expect(r.usedFallback).toBe(true);
  });

  it("a low-n record at the requested scope is used as-is when it is the only one", () => {
    const data = [rec({ geo_scope: { level: "city", id: "lviv" }, n: 5 })];
    const r = lookupPrice("IMPLANT_SURGICAL", "OPTIMAL", "lviv", { data, now: NOW })!;
    expect(r.scope.level).toBe("city");
    expect(r.usedFallback).toBe(false);
  });

  it("segment must match", () => {
    expect(lookupPrice("IMPLANT_SURGICAL", null, "kyiv", opts)).toBeNull();
    expect(lookupPrice("DIAGNOSTICS_SCAN", "BASIC", "kyiv", opts)).toBeNull();
  });

  it("an explicit record.confidence overrides the derived one", () => {
    const data = [
      rec({ geo_scope: { level: "country", id: "UA" }, n: 200, confidence: "LOW" }),
    ];
    expect(
      lookupPrice("IMPLANT_SURGICAL", "OPTIMAL", "kyiv", { data, now: NOW })!.confidence,
    ).toBe("LOW");
  });
});

describe("priceScenario — composition", () => {
  it("single tooth lines use the package axes (3×3 touches only the right lines)", () => {
    const s = scenarioOf("SINGLE_TOOTH_STANDARD");
    const custom: PackageChoice = { implant: "BASIC", prosthetic: "PREMIUM" };
    const aligned = priceScenario(s, "lviv", alignedPackage("BASIC"), opts);
    const mixed = priceScenario(s, "lviv", custom, opts);
    const by = (p: typeof aligned, code: string) => p.lines.find((l) => l.code === code)!;

    expect(by(mixed, "IMPLANT_SURGICAL").segment).toBe("BASIC");
    expect(by(mixed, "PROSTHETIC_ON_IMPLANT").segment).toBe("PREMIUM");
    expect(by(mixed, "DIAGNOSTICS_SCAN").segment).toBeNull();

    // implant and diagnostics lines are identical; only the prosthetic differs
    expect(by(mixed, "IMPLANT_SURGICAL").range).toEqual(by(aligned, "IMPLANT_SURGICAL").range);
    expect(by(mixed, "DIAGNOSTICS_SCAN").range).toEqual(by(aligned, "DIAGNOSTICS_SCAN").range);
    expect(by(mixed, "PROSTHETIC_ON_IMPLANT").range.median).toBeGreaterThan(
      by(aligned, "PROSTHETIC_ON_IMPLANT").range.median,
    );
    expect(mixed.package).toEqual(custom);
  });

  it("quantities multiply ranges and lines sum to the composed total", () => {
    const s = scenarioOf("ADJACENT_3_BRIDGE");
    const p = priceScenario(s, "lviv", alignedPackage("OPTIMAL"), opts);
    expect(p.source).toBe("composed");
    const codes = p.lines.map((l) => `${l.code}x${l.quantity}`);
    expect(codes).toEqual([
      "IMPLANT_SURGICALx2",
      "PROSTHETIC_ON_IMPLANTx2",
      "BRIDGE_PONTICx1",
      "DIAGNOSTICS_SCANx1",
    ]);
    const implant = p.lines[0];
    const unit = lookupPrice("IMPLANT_SURGICAL", "OPTIMAL", "lviv", opts)!.record;
    expect(implant.range.median).toBe(Math.round((unit.median * 2) / 100) * 100);
    const sum = p.lines.reduce((a, l) => a + l.range.median, 0);
    expect(p.total.median).toBe(sum);
    expect(p.total.p25).toBeLessThan(p.total.median);
    expect(p.total.median).toBeLessThan(p.total.p75);
    expect(p.stage1).toBeUndefined();
    expect(p.stage2).toBeUndefined();
  });

  it("IMPLANT_ALREADY_PLACED prices healing abutment + crown only", () => {
    const p = priceScenario(scenarioOf("IMPLANT_ALREADY_PLACED"), "lviv", alignedPackage("OPTIMAL"), opts);
    expect(p.lines.map((l) => l.code)).toEqual([
      "HEALING_ABUTMENT",
      "PROSTHETIC_ON_IMPLANT",
      "DIAGNOSTICS_SCAN",
    ]);
  });

  it("SINGLE_TOOTH_TEMP adds the temp crown package", () => {
    const p = priceScenario(scenarioOf("SINGLE_TOOTH_TEMP"), "lviv", alignedPackage("OPTIMAL"), opts);
    expect(p.lines.map((l) => l.code)).toContain("TEMP_CROWN_PACKAGE");
  });

  it("totals are rounded to 100 UAH", () => {
    const p = priceScenario(scenarioOf("ADJACENT_2"), "odesa", { implant: "BASIC", prosthetic: "PREMIUM" }, opts);
    for (const n of [p.total.p25, p.total.median, p.total.p75]) expect(n % 100).toBe(0);
  });

  it("throws a descriptive error when a record is missing entirely", () => {
    expect(() =>
      priceScenario(scenarioOf("SINGLE_TOOTH_STANDARD"), "kyiv", alignedPackage("BASIC"), {
        data: [],
        now: NOW,
      }),
    ).toThrow(/IMPLANT_SURGICAL/);
  });
});

describe("priceScenario — full arch & both jaws", () => {
  it("full arch: stage1 + stage2 = total, lines carry stages", () => {
    const p = priceScenario(scenarioOf("FULL_ARCH_AOX4"), "lviv", alignedPackage("OPTIMAL"), opts);
    expect(p.stage1).toBeDefined();
    expect(p.stage2).toBeDefined();
    expect(p.stage1!.median + p.stage2!.median).toBe(p.total.median);
    expect(p.stage1!.p25 + p.stage2!.p25).toBe(p.total.p25);
    expect(p.stage1!.p75 + p.stage2!.p75).toBe(p.total.p75);
    const stage1 = p.lines.filter((l) => l.stage === 1).map((l) => l.code);
    const stage2 = p.lines.filter((l) => l.stage === 2).map((l) => l.code);
    expect(stage1).toEqual(
      expect.arrayContaining(["IMPLANT_SURGICAL", "MULTI_UNIT", "ARCH_SCAN", "ARCH_TEMP_FIXED", "DIAGNOSTICS_SCAN"]),
    );
    expect(stage2).toEqual(["ARCH_RESCAN", "ARCH_FINAL"]);
    expect(p.lines.every((l) => l.stage !== undefined)).toBe(true);
    // 4 implants × 20000 + 4 multi-unit × 6000 ...
    expect(p.lines.find((l) => l.code === "IMPLANT_SURGICAL")!.quantity).toBe(4);
  });

  it("both jaws: diagnostics once, arch items twice", () => {
    const s = bothJaws("FULL_ARCH_AOX4");
    const pkg = alignedPackage("OPTIMAL");
    const both = priceScenario(s, "kyiv", pkg, opts);
    const single = priceScenario(scenarioOf("FULL_ARCH_AOX4"), "kyiv", pkg, opts);

    expect(both.lines.filter((l) => l.code === "DIAGNOSTICS_SCAN")).toHaveLength(1);
    expect(both.lines.filter((l) => l.code === "DIAGNOSTICS_SCAN")[0].arch).toBeUndefined();
    const implants = both.lines.filter((l) => l.code === "IMPLANT_SURGICAL");
    expect(implants).toHaveLength(2);
    expect(implants.map((l) => l.arch).sort()).toEqual(["LOWER", "UPPER"]);
    expect(both.lines.filter((l) => l.code === "ARCH_FINAL")).toHaveLength(2);

    const diag = lookupPrice("DIAGNOSTICS_SCAN", null, "kyiv", opts)!.record.median;
    expect(both.total.median).toBe(2 * single.total.median - diag);
    expect(both.stage1!.median + both.stage2!.median).toBe(both.total.median);
  });

  it("mixed-basket two-part scenarios also count diagnostics once", () => {
    const s: Scenario = {
      id: "mix",
      label: "mix",
      parts: [
        { basket: "FULL_ARCH_AOX4", modifiers: { ...BASKETS.FULL_ARCH_AOX4.defaultModifiers }, arch: "UPPER" },
        { basket: "FULL_ARCH_AOX6", modifiers: { ...BASKETS.FULL_ARCH_AOX6.defaultModifiers }, arch: "LOWER" },
      ],
    };
    const p = priceScenario(s, "lviv", alignedPackage("BASIC"), opts);
    expect(p.lines.filter((l) => l.code === "DIAGNOSTICS_SCAN")).toHaveLength(1);
  });
});

describe("priceScenario — basket-record precedence & market meta", () => {
  it("single tooth, aligned package, kyiv → basket_record", () => {
    const p = priceScenario(scenarioOf("SINGLE_TOOTH_STANDARD"), "kyiv", alignedPackage("OPTIMAL"), opts);
    expect(p.source).toBe("basket_record");
    const rec = lookupPrice("SINGLE_TOOTH_STANDARD", "OPTIMAL", "kyiv", opts)!.record;
    expect(p.total.median).toBe(rec.median);
    expect(p.lines.length).toBeGreaterThan(0);
    expect(p.market.geoScope).toEqual({ level: "city", id: "kyiv" });
  });

  it("basket_record: breakdown lines sum exactly to the total; temp crown adds only its line", () => {
    const sumLines = (p: ReturnType<typeof priceScenario>, key: "p25" | "median" | "p75") =>
      p.lines.reduce((acc, l) => acc + l.range[key], 0);
    for (const seg of ["BASIC", "OPTIMAL", "PREMIUM"] as const) {
      const std = priceScenario(scenarioOf("SINGLE_TOOTH_STANDARD"), "kyiv", alignedPackage(seg), opts);
      expect(std.source).toBe("basket_record");
      for (const key of ["p25", "median", "p75"] as const) expect(sumLines(std, key)).toBe(std.total[key]);

      const temp = priceScenario(scenarioOf("SINGLE_TOOTH_TEMP"), "kyiv", alignedPackage(seg), opts);
      expect(temp.source).toBe("basket_record");
      const tempLine = temp.lines.find((l) => l.code === "TEMP_CROWN_PACKAGE")!;
      expect(temp.total.median - std.total.median).toBe(tempLine.range.median);
      for (const key of ["p25", "median", "p75"] as const) expect(sumLines(temp, key)).toBe(temp.total[key]);
    }
  });

  it("customised package → composed", () => {
    const p = priceScenario(
      scenarioOf("SINGLE_TOOTH_STANDARD"),
      "kyiv",
      { implant: "OPTIMAL", prosthetic: "PREMIUM" },
      opts,
    );
    expect(p.source).toBe("composed");
  });

  it("modified modifiers → composed", () => {
    const s = scenarioOf("SINGLE_TOOTH_STANDARD");
    s.parts[0].modifiers = { ...s.parts[0].modifiers, implants: 2, units: 2 };
    expect(priceScenario(s, "kyiv", alignedPackage("OPTIMAL"), opts).source).toBe("composed");
  });

  it("basket record at a broader scope than the lines is ignored (lviv)", () => {
    const p = priceScenario(scenarioOf("SINGLE_TOOTH_STANDARD"), "lviv", alignedPackage("OPTIMAL"), opts);
    expect(p.source).toBe("composed");
  });

  it("unknown location → country basket record", () => {
    const p = priceScenario(scenarioOf("SINGLE_TOOTH_STANDARD"), "atlantis", alignedPackage("OPTIMAL"), opts);
    expect(p.source).toBe("basket_record");
    expect(p.total.median).toBeGreaterThanOrEqual(36000);
    expect(p.total.median).toBeLessThanOrEqual(39000);
  });

  it("two-part scenarios never use basket records", () => {
    const s = bothJaws("FULL_ARCH_AOX4");
    expect(priceScenario(s, "kyiv", alignedPackage("OPTIMAL"), opts).source).toBe("composed");
  });

  it("market meta: kyiv full arch is fully city-level (no fallback note for the capital)", () => {
    const p = priceScenario(scenarioOf("FULL_ARCH_AOX4"), "kyiv", alignedPackage("OPTIMAL"), opts);
    expect(p.market.usedFallback).toBe(false);
    expect(p.market.geoScope).toEqual({ level: "city", id: "kyiv" });
    expect(p.market.minN).toBe(45);
    expect(p.market.confidence).toBe("HIGH");
    expect(p.market.isDemo).toBe(true);
    expect(p.market.updatedAt).toBe("2026-09-01");
  });

  it("market meta aggregates across lines (vinnytsia n=6 → centre macroregion)", () => {
    const p = priceScenario(scenarioOf("FULL_ARCH_AOX4"), "vinnytsia", alignedPackage("OPTIMAL"), opts);
    expect(p.market.usedFallback).toBe(true);
    expect(p.market.geoScope).toEqual({ level: "macroregion", id: "center" });
    expect(p.lines.every((l) => l.geoScope.level !== "city")).toBe(true);
  });

  it("stale oblast data lowers confidence and reports the oldest date", () => {
    const p = priceScenario(scenarioOf("ADJACENT_2"), "chernivtsi", alignedPackage("OPTIMAL"), opts);
    expect(p.market.confidence).toBe("LOW");
    expect(p.market.updatedAt).toBe("2025-06-15");
    expect(p.market.usedFallback).toBe(true);
    expect(p.market.geoScope.level).toBe("oblast");
  });
});

describe("priceExtras", () => {
  it("prices extras per unit × quantity, never assumes anything", () => {
    const [a, b] = priceExtras(
      [
        { code: "EXTRACTION_SIMPLE", quantity: 2, note: "якщо видалення підтвердять" },
        { code: "SEDATION" },
      ],
      "lviv",
      opts,
    );
    expect(a.quantity).toBe(2);
    expect(a.range.median).toBe(a.unitRange.median * 2);
    expect(a.note).toBe("якщо видалення підтвердять");
    expect(a.geoScope.level).toBe("city");
    expect(b.quantity).toBe(1);
    expect(b.geoScope.level).toBe("macroregion"); // not carried locally
    expect(b.unitLabel).toBe("за годину");
  });
});

describe("scenarioIncluded", () => {
  it("dedupes and does not prefix identical baskets", () => {
    const list = scenarioIncluded(bothJaws("FULL_ARCH_AOX4"));
    expect(new Set(list).size).toBe(list.length);
    expect(list.some((l) => l.startsWith("Верхня"))).toBe(false);
    expect(list[0]).toMatch(/^Розрахунок для обох щелеп/);
    expect(list.slice(1)).toEqual(BASKETS.FULL_ARCH_AOX4.included);
  });

  it("prefixes by jaw when baskets differ", () => {
    const s: Scenario = {
      id: "mix",
      label: "mix",
      parts: [
        { basket: "FULL_ARCH_AOX4", modifiers: { ...BASKETS.FULL_ARCH_AOX4.defaultModifiers }, arch: "UPPER" },
        { basket: "FULL_ARCH_AOX6", modifiers: { ...BASKETS.FULL_ARCH_AOX6.defaultModifiers }, arch: "LOWER" },
      ],
    };
    const list = scenarioIncluded(s);
    expect(list.some((l) => l.startsWith("Верхня щелепа: "))).toBe(true);
    expect(list.some((l) => l.startsWith("Нижня щелепа: "))).toBe(true);
  });

  it("IMPLANT_ALREADY_PLACED says the healing abutment is conditional", () => {
    expect(scenarioIncluded(scenarioOf("IMPLANT_ALREADY_PLACED"))).toContain("Формувач ясен (якщо потрібен — враховано в розрахунку)");
  });
});

describe("every basket × segment × location", () => {
  const baskets = Object.keys(BASKETS) as BasketCode[];
  const locations = [
    ...CITIES.map((c) => c.id),
    ...OBLASTS.map((o) => oblastLocationId(o.id)),
    "unknown",
  ];

  it("prices with default modifiers without throwing", () => {
    for (const basket of baskets) {
      for (const seg of SEGMENTS as readonly Segment[]) {
        for (const loc of locations) {
          const p = priceScenario(scenarioOf(basket), loc, alignedPackage(seg), opts);
          const id = `${basket}/${seg}/${loc}`;
          expect(p.total.p25, id).toBeLessThan(p.total.median);
          expect(p.total.median, id).toBeLessThan(p.total.p75);
          expect(p.total.median, id).toBeGreaterThan(0);
        }
      }
    }
  });

  it("every 3×3 combination prices for every basket (kyiv)", () => {
    for (const basket of baskets) {
      for (const implant of SEGMENTS) {
        for (const prosthetic of SEGMENTS) {
          expect(() =>
            priceScenario(scenarioOf(basket), "kyiv", { implant, prosthetic }, opts),
          ).not.toThrow();
        }
      }
    }
  });

  it("composition helper sanity", () => {
    expect(COMPONENT_INFO.DIAGNOSTICS_SCAN.perTreatment).toBe(true);
    expect(formatUah(1000)).toContain("грн");
  });
});

describe("scenarioIncluded — prosthetic-only multi-tooth scenario", () => {
  it("MULTIPLE_SEPARATE with every implant already placed lists only the prosthetic stage", () => {
    const s: Scenario = {
      id: "MULTIPLE_SEPARATE_2",
      label: "2 зуби окремо",
      parts: [{ basket: "MULTIPLE_SEPARATE", modifiers: { implants: 0, existingImplants: 2, units: 2, tempCrowns: 0 } }],
    };
    const list = scenarioIncluded(s);
    expect(list).toEqual(BASKETS.IMPLANT_ALREADY_PLACED.included);
    expect(list.join(" ")).not.toContain("Імпланти та їх встановлення");
  });
});
