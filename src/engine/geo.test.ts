import { describe, it, expect } from "vitest";
import {
  CITIES,
  MACROREGIONS,
  OBLASTS,
  findCity,
  geoChain,
  geoScopeLabel,
  locationLabel,
  oblastLocationId,
  searchCities,
} from "./geo";

describe("geo data", () => {
  it("has 6 macroregions, 24 oblasts + Kyiv city, and ~35 cities", () => {
    expect(MACROREGIONS).toHaveLength(6);
    expect(OBLASTS).toHaveLength(25);
    expect(CITIES.length).toBeGreaterThanOrEqual(30);
  });

  it("has consistent ids and references", () => {
    const macroIds = new Set(MACROREGIONS.map((m) => m.id));
    const oblastIds = new Set(OBLASTS.map((o) => o.id));
    expect(new Set(CITIES.map((c) => c.id)).size).toBe(CITIES.length);
    for (const o of OBLASTS) expect(macroIds.has(o.macroregionId)).toBe(true);
    for (const c of CITIES) {
      expect(oblastIds.has(c.oblastId)).toBe(true);
      const oblast = OBLASTS.find((o) => o.id === c.oblastId)!;
      expect(c.macroregionId).toBe(oblast.macroregionId);
    }
  });
});

describe("geoChain", () => {
  it("city → oblast → macroregion → country", () => {
    expect(geoChain("lviv")).toEqual([
      { level: "city", id: "lviv" },
      { level: "oblast", id: "lvivska" },
      { level: "macroregion", id: "west" },
      { level: "country", id: "UA" },
    ]);
    expect(geoChain("kyiv")[2]).toEqual({ level: "macroregion", id: "kyiv" });
  });

  it("oblast: ids start at the oblast", () => {
    expect(geoChain(oblastLocationId("chernivetska"))).toEqual([
      { level: "oblast", id: "chernivetska" },
      { level: "macroregion", id: "west" },
      { level: "country", id: "UA" },
    ]);
  });

  it("unknown ids fall back to country only", () => {
    expect(geoChain("atlantis")).toEqual([{ level: "country", id: "UA" }]);
    expect(geoChain("oblast:nope")).toEqual([{ level: "country", id: "UA" }]);
  });
});

describe("labels", () => {
  it("locationLabel", () => {
    expect(locationLabel("kyiv")).toBe("Київ");
    expect(locationLabel(oblastLocationId("lvivska"))).toBe("Львівська область");
  });

  it("geoScopeLabel", () => {
    expect(geoScopeLabel({ level: "city", id: "lviv" })).toBe("м. Львів");
    expect(geoScopeLabel({ level: "oblast", id: "lvivska" })).toBe("Львівська область");
    expect(geoScopeLabel({ level: "macroregion", id: "west" })).toBe("Західний регіон");
    expect(geoScopeLabel({ level: "country", id: "UA" })).toBe("Україна");
  });

  it("findCity", () => {
    expect(findCity("odesa")?.name).toBe("Одеса");
    expect(findCity("nope")).toBeUndefined();
  });
});

describe("searchCities", () => {
  it("empty query returns popular cities first", () => {
    const res = searchCities("");
    expect(res.map((c) => c.id).slice(0, 4)).toEqual(["kyiv", "lviv", "odesa", "dnipro"]);
    expect(res).toHaveLength(8);
  });

  it("matches latin aliases", () => {
    expect(searchCities("kiev")[0].id).toBe("kyiv");
    expect(searchCities("LVOV")[0].id).toBe("lviv");
    expect(searchCities("frankivsk")[0].id).toBe("ivano-frankivsk");
    expect(searchCities("chernivtsi")[0].id).toBe("chernivtsi");
  });

  it("prefix matches come before substring matches", () => {
    const res = searchCities("ів").map((c) => c.id);
    expect(res[0]).toBe("ivano-frankivsk");
    expect(res.indexOf("lviv")).toBeGreaterThan(0);
  });

  it("handles Ukrainian alternative forms", () => {
    expect(searchCities("Франківськ")[0].id).toBe("ivano-frankivsk");
  });

  it("handles apostrophe variants and hyphen/space", () => {
    for (const q of ["кам’янець", "кам'янець", "камʼянець", "камянець"]) {
      expect(searchCities(q).map((c) => c.id)).toContain("kamianets-podilskyi");
    }
    expect(searchCities("ivano frankivsk")[0].id).toBe("ivano-frankivsk");
  });

  it("is loose about і/и/ї", () => {
    expect(searchCities("чернивці")[0].id).toBe("chernivtsi");
    expect(searchCities("винниця")[0]?.id).toBe("vinnytsia");
  });

  it("respects limit and returns [] for nonsense", () => {
    expect(searchCities("а", 3)).toHaveLength(3);
    expect(searchCities("zzzzzz")).toEqual([]);
  });
});
