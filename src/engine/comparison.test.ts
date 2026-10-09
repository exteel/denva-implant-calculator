import { describe, it, expect } from "vitest";
import {
  EUR_UAH_RATE,
  FULL_ARCH_INCLUDE_OPTIONS,
  FULL_ARCH_SCOPE_OPTIONS,
  TEETH_SCOPE_OPTIONS,
  compareQuote,
  quotePosition,
  toUah,
  type ComparisonContext,
} from "./comparison";
import type {
  ComparisonResult,
  ExtraCode,
  PriceRange,
  PricedScenario,
  QuoteInput,
  Resolution,
  Scenario,
} from "./types";

// ───────────────────────── fixtures ─────────────────────────

const TOTAL: PriceRange = { p25: 40000, median: 50000, p75: 60000 };
const STAGE1: PriceRange = { p25: 25000, median: 30000, p75: 36000 };
const city = { level: "city", id: "kyiv" } as const;

const EXTRA_PRICES: Partial<Record<ExtraCode, PriceRange>> = {
  EXTRACTION_SIMPLE: { p25: 1000, median: 1500, p75: 2000 },
  BONE_AUGMENTATION: { p25: 5000, median: 7000, p75: 9000 },
  SINUS_LIFT: { p25: 10000, median: 12000, p75: 15000 },
  SEDATION: { p25: 2000, median: 3000, p75: 4000 },
  TEMPORARY_CROWN: { p25: 1000, median: 1500, p75: 2000 },
};

function scenario(id: string, basket: Scenario["parts"][number]["basket"], units: number): Scenario {
  return {
    id,
    label: id,
    parts: [{ basket, modifiers: { implants: units, existingImplants: 0, units, tempCrowns: 0 } }],
  };
}

function priced(scenarioId: string, over: Partial<PricedScenario> = {}): PricedScenario {
  return {
    scenarioId,
    package: { implant: "OPTIMAL", prosthetic: "OPTIMAL" },
    total: TOTAL,
    lines: [],
    market: {
      confidence: "MEDIUM",
      minN: 12,
      geoScope: city,
      usedFallback: false,
      isDemo: true,
      updatedAt: "2026-09-01",
    },
    source: "composed",
    ...over,
  };
}

function resolution(over: Partial<Resolution> = {}): Resolution {
  return {
    kind: "priced",
    scenarios: [scenario("ADJACENT_3_BRIDGE", "ADJACENT_3_BRIDGE", 3)],
    defaultScenarioId: "ADJACENT_3_BRIDGE",
    clinicalConfidence: "MEDIUM",
    title: "3 зуби поруч",
    assumptions: ["a"],
    relevantExtras: [
      { code: "EXTRACTION_SIMPLE", quantity: 3 },
      { code: "SINUS_LIFT" },
      { code: "TEMPORARY_CROWN", quantity: 3 },
    ],
    comparisonScope: "teeth",
    flags: { massExtraction: false, unsureSave: false, existingImplants: false, tempCrownOption: false },
    ...over,
  };
}

const teethCtx = (): ComparisonContext => ({
  resolution: resolution(),
  priced: priced("ADJACENT_3_BRIDGE"),
  extraUnitPrices: EXTRA_PRICES,
});

const archCtx = (over: Partial<Resolution> = {}): ComparisonContext => ({
  resolution: resolution({
    scenarios: [scenario("AOX4", "FULL_ARCH_AOX4", 0)],
    defaultScenarioId: "AOX4",
    comparisonScope: "full_arch",
    relevantExtras: [{ code: "EXTRACTION_SIMPLE", quantity: 2 }, { code: "SEDATION" }],
    ...over,
  }),
  priced: priced("AOX4", { stage1: STAGE1, stage2: { p25: 15000, median: 20000, p75: 24000 } }),
  extraUnitPrices: EXTRA_PRICES,
});

function expectComparable(r: ComparisonResult) {
  if (!r.comparable) throw new Error(`expected comparable, got: ${r.reason}`);
  return r;
}
function expectNot(r: ComparisonResult) {
  if (r.comparable) throw new Error("expected not comparable");
  return r;
}

const noPay = (r: unknown) => expect(JSON.stringify(r).toLowerCase()).not.toContain("переплачу");

// ───────────────────────── tests ─────────────────────────

describe("currency + options", () => {
  it("converts EUR to UAH at the fixed rate and leaves UAH alone", () => {
    expect(EUR_UAH_RATE).toBe(50.1385);
    expect(toUah(1000, "UAH")).toBe(1000);
    expect(toUah(1000, "EUR")).toBe(50139);
    expect(toUah(0, "EUR")).toBe(0);
  });

  it("ТЗ §14.1 / §14.2 option lists", () => {
    expect(TEETH_SCOPE_OPTIONS.map((o) => o.label)).toEqual([
      "Імпланти",
      "Коронки / міст",
      "Видалення",
      "Кісткова пластика",
      "Синус-ліфтинг",
      "Тимчасові зуби",
      "Седація",
      "Не знаю",
    ]);
    expect(TEETH_SCOPE_OPTIONS.filter((o) => o.exclusive).map((o) => o.id)).toEqual(["unknown"]);
    expect(FULL_ARCH_SCOPE_OPTIONS.map((o) => o.id)).toEqual(["implants_only", "implants_temp", "full", "unknown"]);
    expect(FULL_ARCH_INCLUDE_OPTIONS.map((o) => o.id)).toEqual([
      "EXTRACTION_SIMPLE",
      "BONE_AUGMENTATION",
      "SINUS_LIFT",
      "SEDATION",
    ]);
  });
});

describe("quotePosition", () => {
  it("classifies by p25 / p75 and ±5% around the median", () => {
    expect(quotePosition(39999, TOTAL)).toBe("below");
    expect(quotePosition(40000, TOTAL)).toBe("within_low");
    expect(quotePosition(47499, TOTAL)).toBe("within_low");
    expect(quotePosition(47500, TOTAL)).toBe("within_typical");
    expect(quotePosition(50000, TOTAL)).toBe("within_typical");
    expect(quotePosition(52500, TOTAL)).toBe("within_typical");
    expect(quotePosition(52501, TOTAL)).toBe("within_high");
    expect(quotePosition(60000, TOTAL)).toBe("within_high");
    expect(quotePosition(60001, TOTAL)).toBe("above");
  });
});

describe("teeth scope", () => {
  it("implants + crowns: compares against priced.total and computes deviation", () => {
    const r = expectComparable(
      compareQuote({ amountUah: 65500, teethScope: ["implants", "crowns"] }, teethCtx()),
    );
    expect(r.range).toEqual(TOTAL);
    expect(r.deviationPct).toBe(31);
    expect(r.position).toBe("above");
    expect(r.headline).toBe("Ваша пропозиція вища за типовий ринковий діапазон для співставного сценарію.");
    expect(r.explanation).toContain("системою імплантів");
    expect(r.explanation).toContain("по пунктах");
    expect(r.addedExtras).toEqual([]);
    expect(r.offerUah).toBe(65500);
    noPay(r);
  });

  it("below → 'нижча за типовий діапазон' with a neutral explanation", () => {
    const r = expectComparable(compareQuote({ amountUah: 30000, teethScope: ["crowns", "implants"] }, teethCtx()));
    expect(r.position).toBe("below");
    expect(r.deviationPct).toBe(-40);
    expect(r.headline).toContain("нижча за типовий");
    expect(r.explanation).toContain("гарантії");
    expect(r.explanation).not.toContain("погано, ");
    noPay(r);
  });

  it("within → 'у межах типового ринкового діапазону', with low/high side wording", () => {
    const typical = expectComparable(compareQuote({ amountUah: 50000, teethScope: ["implants", "crowns"] }, teethCtx()));
    expect(typical.position).toBe("within_typical");
    expect(typical.headline).toContain("у межах типового ринкового діапазону");
    expect(typical.deviationPct).toBe(0);
    const low = expectComparable(compareQuote({ amountUah: 43000, teethScope: ["implants", "crowns"] }, teethCtx()));
    expect(low.position).toBe("within_low");
    expect(low.headline).toContain("ближче до його нижньої межі");
    const high = expectComparable(compareQuote({ amountUah: 58000, teethScope: ["implants", "crowns"] }, teethCtx()));
    expect(high.position).toBe("within_high");
    expect(high.headline).toContain("ближче до його верхньої межі");
    [typical, low, high].forEach(noPay);
  });

  it("adds ticked extras to the market range using resolution quantities (and 1 by default)", () => {
    const r = expectComparable(
      compareQuote(
        { amountUah: 70000, teethScope: ["implants", "crowns", "extraction", "bone", "sinus", "sedation", "temp"] },
        teethCtx(),
      ),
    );
    // extraction ×3, bone ×1, sinus ×1, sedation ×1, temp ×3 (= units of the scenario)
    const add = {
      p25: 3 * 1000 + 5000 + 10000 + 2000 + 3 * 1000,
      median: 3 * 1500 + 7000 + 12000 + 3000 + 3 * 1500,
      p75: 3 * 2000 + 9000 + 15000 + 4000 + 3 * 2000,
    };
    expect(r.range).toEqual({
      p25: TOTAL.p25 + add.p25,
      median: TOTAL.median + add.median,
      p75: TOTAL.p75 + add.p75,
    });
    expect(r.addedExtras).toEqual(["EXTRACTION_SIMPLE", "BONE_AUGMENTATION", "SINUS_LIFT", "SEDATION", "TEMPORARY_CROWN"]);
    expect(r.basisLabel).toContain("видалення");
    expect(r.basisLabel).toContain("синус-ліфтинг");
  });

  it("each single extra maps to its own code", () => {
    const cases: Array<[Parameters<typeof compareQuote>[0]["teethScope"], ExtraCode]> = [
      [["implants", "crowns", "extraction"], "EXTRACTION_SIMPLE"],
      [["implants", "crowns", "bone"], "BONE_AUGMENTATION"],
      [["implants", "crowns", "sinus"], "SINUS_LIFT"],
      [["implants", "crowns", "sedation"], "SEDATION"],
      [["implants", "crowns", "temp"], "TEMPORARY_CROWN"],
    ];
    for (const [teethScope, code] of cases) {
      const r = expectComparable(compareQuote({ amountUah: 70000, teethScope }, teethCtx()));
      expect(r.addedExtras).toEqual([code]);
      expect(r.range.median).toBeGreaterThan(TOTAL.median);
    }
  });

  it("does not add temp crowns when the priced scenario already is SINGLE_TOOTH_TEMP", () => {
    const ctx: ComparisonContext = {
      resolution: resolution({
        scenarios: [scenario("SINGLE_TOOTH_STANDARD", "SINGLE_TOOTH_STANDARD", 1)],
        defaultScenarioId: "SINGLE_TOOTH_STANDARD",
      }),
      priced: priced("SINGLE_TOOTH_STANDARD", {
        lines: [
          {
            code: "TEMP_CROWN_PACKAGE",
            label: "x",
            quantity: 1,
            unitLabel: "за зуб",
            axis: "none",
            segment: null,
            range: TOTAL,
            geoScope: city,
          },
        ],
      }),
      extraUnitPrices: EXTRA_PRICES,
    };
    const r = expectComparable(compareQuote({ amountUah: 50000, teethScope: ["implants", "crowns", "temp"] }, ctx));
    expect(r.addedExtras).toEqual([]);
    expect(r.range).toEqual(TOTAL);

    const ctx2: ComparisonContext = {
      ...ctx,
      priced: priced("SINGLE_TOOTH_TEMP"),
      resolution: resolution({
        scenarios: [scenario("SINGLE_TOOTH_TEMP", "SINGLE_TOOTH_TEMP", 1)],
        defaultScenarioId: "SINGLE_TOOTH_TEMP",
      }),
    };
    expect(
      expectComparable(compareQuote({ amountUah: 50000, teethScope: ["implants", "crowns", "temp"] }, ctx2))
        .addedExtras,
    ).toEqual([]);
  });

  it("'Не знаю' or nothing selected → not comparable, unclear offer", () => {
    for (const teethScope of [["unknown"], [], undefined] as const) {
      const r = expectNot(compareQuote({ amountUah: 50000, teethScope: teethScope as never }, teethCtx()));
      expect(r.unclearOffer).toBe(true);
      expect(r.reason.length).toBeGreaterThan(10);
    }
    const mixed = expectNot(compareQuote({ amountUah: 50000, teethScope: ["implants", "unknown"] }, teethCtx()));
    expect(mixed.unclearOffer).toBe(true);
  });

  it("missing crowns → spec reason (and flagged as unclear so routing can offer a line-by-line check)", () => {
    const r = expectNot(compareQuote({ amountUah: 50000, teethScope: ["implants", "extraction"] }, teethCtx()));
    expect(r.reason).toBe("У пропозиції немає коронок/мосту — порівнювати її з повним лікуванням некоректно.");
    expect(r.unclearOffer).toBe(true);
  });

  it("missing implants → not comparable", () => {
    const r = expectNot(compareQuote({ amountUah: 50000, teethScope: ["crowns"] }, teethCtx()));
    expect(r.reason).toContain("немає імплантів");
    expect(r.unclearOffer).toBe(true);
  });

  it("missing unit price for a ticked extra → not comparable (never silently skipped)", () => {
    const ctx = { ...teethCtx(), extraUnitPrices: {} };
    const r = expectNot(compareQuote({ amountUah: 50000, teethScope: ["implants", "crowns", "bone"] }, ctx));
    expect(r.unclearOffer).toBe(false);
  });
});

describe("full arch scope", () => {
  it("implants_temp → compares with stage 1", () => {
    const r = expectComparable(compareQuote({ amountUah: 33000, fullArchScope: "implants_temp" }, archCtx()));
    expect(r.range).toEqual(STAGE1);
    expect(r.basisLabel).toBe("Етап 1 — імпланти й тимчасові незнімні зуби");
    expect(r.position).toBe("within_high");
    expect(r.deviationPct).toBe(10);
    expect(r.addedExtras).toEqual([]);
  });

  it("full → compares with total (+ includes extras, quantity from the resolution)", () => {
    const plain = expectComparable(compareQuote({ amountUah: 50000, fullArchScope: "full" }, archCtx()));
    expect(plain.range).toEqual(TOTAL);
    expect(plain.basisLabel).toBe("Повне лікування до постійних зубів");

    const withExtras = expectComparable(
      compareQuote(
        { amountUah: 90000, fullArchScope: "full", fullArchIncludes: ["EXTRACTION_SIMPLE", "SINUS_LIFT", "SEDATION"] },
        archCtx(),
      ),
    );
    expect(withExtras.range).toEqual({
      p25: TOTAL.p25 + 2 * 1000 + 10000 + 2000,
      median: TOTAL.median + 2 * 1500 + 12000 + 3000,
      p75: TOTAL.p75 + 2 * 2000 + 15000 + 4000,
    });
    expect(withExtras.addedExtras).toEqual(["EXTRACTION_SIMPLE", "SINUS_LIFT", "SEDATION"]);
    expect(withExtras.position).toBe("above");
    noPay(withExtras);
  });

  it("implants_only → not comparable, unclearOffer false, explains the basket", () => {
    const r = expectNot(compareQuote({ amountUah: 20000, fullArchScope: "implants_only" }, archCtx()));
    expect(r.unclearOffer).toBe(false);
    expect(r.reason).toContain("починається з імплантів і тимчасових незнімних зубів");
  });

  it("unknown / missing → not comparable, unclearOffer true", () => {
    expect(expectNot(compareQuote({ amountUah: 20000, fullArchScope: "unknown" }, archCtx())).unclearOffer).toBe(true);
    expect(expectNot(compareQuote({ amountUah: 20000 }, archCtx())).unclearOffer).toBe(true);
  });

  it("implants_temp without stage1 data → not comparable", () => {
    const ctx = archCtx();
    ctx.priced = priced("AOX4");
    expect(expectNot(compareQuote({ amountUah: 20000, fullArchScope: "implants_temp" }, ctx)).unclearOffer).toBe(false);
  });
});

describe("guards", () => {
  it("comparisonScope null → not comparable, not 'unclear'", () => {
    const ctx = { ...teethCtx(), resolution: resolution({ comparisonScope: null }) };
    const r = expectNot(compareQuote({ amountUah: 50000, teethScope: ["implants", "crowns"] }, ctx));
    expect(r.unclearOffer).toBe(false);
  });

  it("rejects non-positive / non-finite amounts", () => {
    for (const amountUah of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const input: QuoteInput = { amountUah, teethScope: ["implants", "crowns"] };
      expect(expectNot(compareQuote(input, teethCtx())).unclearOffer).toBe(false);
    }
  });

  it("no generated string ever contains 'переплачу'", () => {
    const outputs: unknown[] = [];
    for (const amountUah of [20000, 45000, 50000, 58000, 99000]) {
      outputs.push(compareQuote({ amountUah, teethScope: ["implants", "crowns"] }, teethCtx()));
      outputs.push(compareQuote({ amountUah, fullArchScope: "full" }, archCtx()));
      outputs.push(compareQuote({ amountUah, fullArchScope: "implants_temp" }, archCtx()));
      outputs.push(compareQuote({ amountUah, fullArchScope: "implants_only" }, archCtx()));
      outputs.push(compareQuote({ amountUah, teethScope: ["unknown"] }, teethCtx()));
    }
    outputs.forEach(noPay);
  });
});

describe("compareQuote — prosthetic-only basket (implant already placed)", () => {
  const crownOnly: Scenario = {
    id: "IMPLANT_ALREADY_PLACED",
    label: "Коронка на імпланті",
    parts: [
      { basket: "IMPLANT_ALREADY_PLACED", modifiers: { implants: 0, existingImplants: 1, units: 1, tempCrowns: 0 } },
    ],
  };
  const ctx: ComparisonContext = {
    resolution: resolution({ scenarios: [crownOnly], defaultScenarioId: crownOnly.id, relevantExtras: [] }),
    priced: priced(crownOnly.id),
    extraUnitPrices: EXTRA_PRICES,
  };

  it("crowns without implants is the comparable scope", () => {
    const r = compareQuote({ amountUah: 50000, teethScope: ["crowns"] }, ctx);
    expect(r.comparable).toBe(true);
  });

  it("an offer that also includes implants is not comparable", () => {
    const r = compareQuote({ amountUah: 50000, teethScope: ["implants", "crowns"] }, ctx);
    expect(r.comparable).toBe(false);
  });
});
