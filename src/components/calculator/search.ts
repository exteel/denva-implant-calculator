import type { PublicLocation } from "@/lib/contracts";

/** Lower-case, drop apostrophes, fold hyphens, loosely fold і/и/ї/ы and є/е. */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'ʼ`‘]/g, "")
    .replace(/[-–—_]/g, " ")
    .replace(/[иїы]/g, "і")
    .replace(/є/g, "е")
    .replace(/ґ/g, "г")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * City search (ТЗ §5.1): the list appears only after the first letters are
 * typed, so an empty query returns nothing. Names beat aliases, prefixes
 * beat substrings.
 */
export function searchCities(locations: PublicLocation[], query: string, limit = 8): PublicLocation[] {
  const q = normalizeSearch(query);
  if (!q) return [];
  const scored: { location: PublicLocation; rank: number }[] = [];
  for (const location of locations) {
    if (location.kind !== "city") continue;
    const name = normalizeSearch(location.name);
    let rank = 99;
    if (name.startsWith(q)) rank = 0;
    else if (name.includes(q)) rank = 1;
    else {
      const aliases = location.aliases.map(normalizeSearch);
      if (aliases.some((a) => a.startsWith(q))) rank = 2;
      else if (aliases.some((a) => a.includes(q))) rank = 3;
    }
    if (rank < 99) scored.push({ location, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || a.location.name.localeCompare(b.location.name, "uk"));
  return scored.slice(0, limit).map((s) => s.location);
}

/** Regions for the "Не знайшли своє місто?" picker, alphabetically. */
export function listRegions(locations: PublicLocation[]): PublicLocation[] {
  return locations.filter((l) => l.kind === "region").sort((a, b) => a.name.localeCompare(b.name, "uk"));
}
