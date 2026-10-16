// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error — plain .mjs build script
import { buildEngineCopy } from "../../scripts/sync-engine.mjs";
import { CalculateInputError, handleCalculate, parseCalculateRequest } from "../functions/_shared/calculate";
import { calculateQuote, createPriceBook } from "../../src/engine/v3";
import { fixturePricesResponse } from "../../src/lib/data/fixture";
import type { JawInput } from "../../src/lib/contracts";

const jaw = (patch: Partial<JawInput> & Pick<JawInput, "jaw">): JawInput => ({
  tooth_count: 1,
  location: null,
  status: "removed",
  installed_implant_count: null,
  scenario: null,
  implant_tier: "classic",
  crown_or_arch_tier: "classic",
  include_temporary: false,
  ...patch,
});

describe("calculate API (ТЗ §8.1)", () => {
  it("the Edge Function engine copy is identical to src/engine/v3 (run scripts/sync-engine.mjs)", () => {
    const files = buildEngineCopy() as Record<string, string>;
    for (const [name, content] of Object.entries(files)) {
      const onDisk = readFileSync(join(__dirname, "../functions/_shared/engine", name), "utf8");
      expect(onDisk, name).toBe(content);
    }
  });

  it("returns exactly what the browser engine computes", async () => {
    const body = {
      location: { kind: "city", id: "kyiv" },
      upperJawInput: jaw({ jaw: "upper", tooth_count: 3, location: "adjacent" }),
      lowerJawInput: jaw({ jaw: "lower", tooth_count: 10, scenario: "aox6", include_temporary: true }),
    };
    const api = await handleCalculate(body, async (kind, id) => fixturePricesResponse(kind, id));
    const book = createPriceBook(fixturePricesResponse("city", "kyiv"));
    const browser = calculateQuote(body.upperJawInput, body.lowerJawInput, book);
    expect(api).toEqual(browser);
    expect(api.overallTotal).not.toBeNull();
    expect(api.overallTotal!.low).toBeCloseTo(
      api.upperJawCalculation!.total.low + api.lowerJawCalculation!.total.low,
      6,
    );
  });

  it("validates input", () => {
    const bad = (b: unknown) => () => parseCalculateRequest(b);
    expect(bad(null)).toThrow(CalculateInputError);
    expect(bad({ location: { kind: "city", id: "kyiv" }, upperJawInput: null, lowerJawInput: null })).toThrow(/tooth_count > 0/);
    expect(bad({ location: { kind: "city", id: "kyiv" }, upperJawInput: jaw({ jaw: "upper", tooth_count: 15 }) })).toThrow(/0–14/);
    expect(bad({ location: { kind: "city", id: "kyiv" }, upperJawInput: jaw({ jaw: "lower" }) })).toThrow(/jaw must be/);
    expect(
      bad({ location: { kind: "city", id: "kyiv" }, upperJawInput: jaw({ jaw: "upper", status: "implants_installed", installed_implant_count: 5, tooth_count: 3 }) }),
    ).toThrow(/installed_implant_count/);
  });

  it("unknown location → input error", async () => {
    await expect(
      handleCalculate({ location: { kind: "city", id: "nowhere" }, upperJawInput: jaw({ jaw: "upper" }) }, async () => null),
    ).rejects.toThrow(CalculateInputError);
  });
  it("numeric strings from the RPC (jsonb numerics) give the same result as numbers", async () => {
    const body = { location: { kind: "city", id: "lviv" }, upperJawInput: jaw({ jaw: "upper", tooth_count: 2, location: "separate" }) };
    const asNumbers = await handleCalculate(body, async (kind, id) => fixturePricesResponse(kind, id));
    const asStrings = await handleCalculate(body, async (kind, id) => {
      const r = fixturePricesResponse(kind, id);
      return { ...r, prices: r.prices.map((p) => ({ ...p, value: String(p.value) as unknown as number })) };
    });
    expect(asStrings).toEqual(asNumbers);
  });
});
