/**
 * Geography for the price engine (ТЗ §3, §17).
 *
 * Fallback chain: місто → область → макрорегіон → Україна.
 *
 * A "location id" is either a city id (e.g. "kyiv") or `oblast:<oblastId>`
 * for users whose city isn't in the list and who picked their oblast instead.
 */
import type { City, GeoLevel, GeoScope, Macroregion, Oblast } from "./types";

export const COUNTRY_SCOPE: GeoScope = { level: "country", id: "UA" };

/** Specificity rank: lower = more specific. */
export const GEO_LEVEL_RANK: Record<GeoLevel, number> = {
  city: 0,
  oblast: 1,
  macroregion: 2,
  country: 3,
};

export const MACROREGIONS: Macroregion[] = [
  { id: "kyiv", name: "Київ" },
  { id: "west", name: "Західний регіон" },
  { id: "center", name: "Центральний регіон" },
  { id: "north", name: "Північний регіон" },
  { id: "south", name: "Південний регіон" },
  { id: "east", name: "Східний регіон" },
];

export const OBLASTS: Oblast[] = [
  { id: "kyiv-city", name: "м. Київ", macroregionId: "kyiv" },
  // west
  { id: "lvivska", name: "Львівська область", macroregionId: "west" },
  { id: "ivano-frankivska", name: "Івано-Франківська область", macroregionId: "west" },
  { id: "ternopilska", name: "Тернопільська область", macroregionId: "west" },
  { id: "zakarpatska", name: "Закарпатська область", macroregionId: "west" },
  { id: "chernivetska", name: "Чернівецька область", macroregionId: "west" },
  { id: "volynska", name: "Волинська область", macroregionId: "west" },
  { id: "rivnenska", name: "Рівненська область", macroregionId: "west" },
  { id: "khmelnytska", name: "Хмельницька область", macroregionId: "west" },
  // center
  { id: "vinnytska", name: "Вінницька область", macroregionId: "center" },
  { id: "cherkaska", name: "Черкаська область", macroregionId: "center" },
  { id: "kirovohradska", name: "Кіровоградська область", macroregionId: "center" },
  { id: "poltavska", name: "Полтавська область", macroregionId: "center" },
  { id: "kyivska", name: "Київська область", macroregionId: "center" },
  // north
  { id: "zhytomyrska", name: "Житомирська область", macroregionId: "north" },
  { id: "chernihivska", name: "Чернігівська область", macroregionId: "north" },
  { id: "sumska", name: "Сумська область", macroregionId: "north" },
  // south
  { id: "odeska", name: "Одеська область", macroregionId: "south" },
  { id: "mykolaivska", name: "Миколаївська область", macroregionId: "south" },
  { id: "khersonska", name: "Херсонська область", macroregionId: "south" },
  { id: "zaporizka", name: "Запорізька область", macroregionId: "south" },
  // east
  { id: "dnipropetrovska", name: "Дніпропетровська область", macroregionId: "east" },
  { id: "kharkivska", name: "Харківська область", macroregionId: "east" },
  { id: "donetska", name: "Донецька область", macroregionId: "east" },
  { id: "luhanska", name: "Луганська область", macroregionId: "east" },
];

function city(
  id: string,
  name: string,
  oblastId: string,
  aliases: string[] = [],
): City {
  const oblast = OBLASTS.find((o) => o.id === oblastId);
  if (!oblast) throw new Error(`Unknown oblast "${oblastId}" for city "${id}"`);
  return { id, name, oblastId, macroregionId: oblast.macroregionId, aliases };
}

export const CITIES: City[] = [
  city("kyiv", "Київ", "kyiv-city", ["kyiv", "kiev", "kijev", "Киев"]),
  city("lviv", "Львів", "lvivska", ["lviv", "lvov", "lwow", "Львов"]),
  city("odesa", "Одеса", "odeska", ["odesa", "odessa", "Одесса"]),
  city("dnipro", "Дніпро", "dnipropetrovska", ["dnipro", "dnepr", "dnipropetrovsk", "Дніпропетровськ", "Днепр"]),
  city("kharkiv", "Харків", "kharkivska", ["kharkiv", "kharkov", "Харьков"]),
  city("ivano-frankivsk", "Івано-Франківськ", "ivano-frankivska", ["ivano-frankivsk", "frankivsk", "ivano frankovsk", "Франківськ", "Станіслав"]),
  city("chernivtsi", "Чернівці", "chernivetska", ["chernivtsi", "chernovtsy", "czernowitz", "Черновцы"]),
  city("vinnytsia", "Вінниця", "vinnytska", ["vinnytsia", "vinnitsa", "vinnitsia", "Винница"]),
  city("zaporizhzhia", "Запоріжжя", "zaporizka", ["zaporizhzhia", "zaporozhye", "zaporizhia", "Запорожье"]),
  city("poltava", "Полтава", "poltavska", ["poltava"]),
  city("cherkasy", "Черкаси", "cherkaska", ["cherkasy", "cherkassy", "Черкассы"]),
  city("zhytomyr", "Житомир", "zhytomyrska", ["zhytomyr", "zhitomir"]),
  city("chernihiv", "Чернігів", "chernihivska", ["chernihiv", "chernigov", "Чернигов"]),
  city("sumy", "Суми", "sumska", ["sumy"]),
  city("mykolaiv", "Миколаїв", "mykolaivska", ["mykolaiv", "nikolaev", "nikolayev", "Николаев"]),
  city("kherson", "Херсон", "khersonska", ["kherson"]),
  city("rivne", "Рівне", "rivnenska", ["rivne", "rovno", "Ровно"]),
  city("lutsk", "Луцьк", "volynska", ["lutsk", "Луцк"]),
  city("ternopil", "Тернопіль", "ternopilska", ["ternopil", "ternopol", "Тернополь"]),
  city("khmelnytskyi", "Хмельницький", "khmelnytska", ["khmelnytskyi", "khmelnitsky", "khmelnitskiy", "Хмельницкий"]),
  city("uzhhorod", "Ужгород", "zakarpatska", ["uzhhorod", "uzhgorod"]),
  city("kropyvnytskyi", "Кропивницький", "kirovohradska", ["kropyvnytskyi", "kropivnitsky", "kirovograd", "Кіровоград"]),
  city("kryvyi-rih", "Кривий Ріг", "dnipropetrovska", ["kryvyi rih", "kryvyi-rih", "krivoy rog", "kryvyj rih", "Кривой Рог"]),
  city("kamianske", "Кам’янське", "dnipropetrovska", ["kamianske", "kamenskoe", "Дніпродзержинськ"]),
  city("bila-tserkva", "Біла Церква", "kyivska", ["bila tserkva", "bila-tserkva", "belaya tserkov", "Белая Церковь"]),
  city("brovary", "Бровари", "kyivska", ["brovary"]),
  city("irpin", "Ірпінь", "kyivska", ["irpin", "irpen"]),
  city("kremenchuk", "Кременчук", "poltavska", ["kremenchuk", "kremenchug"]),
  city("mukachevo", "Мукачево", "zakarpatska", ["mukachevo", "mukacheve"]),
  city("kamianets-podilskyi", "Кам’янець-Подільський", "khmelnytska", ["kamianets-podilskyi", "kamianets podilskyi", "kamenets-podolsky", "Каменец-Подольский"]),
  city("drohobych", "Дрогобич", "lvivska", ["drohobych", "drogobych"]),
  city("uman", "Умань", "cherkaska", ["uman"]),
  city("kramatorsk", "Краматорськ", "donetska", ["kramatorsk"]),
];

/** Shown first when the search box is empty. */
const POPULAR_CITY_IDS = [
  "kyiv",
  "lviv",
  "odesa",
  "dnipro",
  "kharkiv",
  "ivano-frankivsk",
  "chernivtsi",
  "vinnytsia",
];

const CITY_BY_ID = new Map(CITIES.map((c) => [c.id, c]));
const OBLAST_BY_ID = new Map(OBLASTS.map((o) => [o.id, o]));
const MACRO_BY_ID = new Map(MACROREGIONS.map((m) => [m.id, m]));

export function findCity(id: string): City | undefined {
  return CITY_BY_ID.get(id);
}

export function findOblast(id: string): Oblast | undefined {
  return OBLAST_BY_ID.get(id);
}

export function findMacroregion(id: string): Macroregion | undefined {
  return MACRO_BY_ID.get(id);
}

// ───────────────────────── Search ─────────────────────────

/** Lower-case, drop apostrophes, fold hyphens, loosely fold і/и/ї/ы and є/е. */
function normalize(s: string): string {
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

export function searchCities(query: string, limit = 8): City[] {
  const q = normalize(query);
  if (!q) {
    return POPULAR_CITY_IDS.map((id) => CITY_BY_ID.get(id)!)
      .filter(Boolean)
      .slice(0, limit);
  }
  const popularRank = (id: string) => {
    const i = POPULAR_CITY_IDS.indexOf(id);
    return i === -1 ? POPULAR_CITY_IDS.length : i;
  };
  const scored: { c: City; tier: number }[] = [];
  for (const c of CITIES) {
    const name = normalize(c.name);
    let tier = 99;
    if (name.startsWith(q)) tier = 0;
    else if (name.includes(q)) tier = 1;
    else {
      const aliases = (c.aliases ?? []).map(normalize);
      if (aliases.some((a) => a.startsWith(q))) tier = 2;
      else if (aliases.some((a) => a.includes(q))) tier = 3;
    }
    if (tier < 99) scored.push({ c, tier });
  }
  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      popularRank(a.c.id) - popularRank(b.c.id) ||
      a.c.name.localeCompare(b.c.name, "uk"),
  );
  return scored.slice(0, limit).map((s) => s.c);
}

// ───────────────────────── Location ids ─────────────────────────

const OBLAST_PREFIX = "oblast:";

export function oblastLocationId(oblastId: string): string {
  return `${OBLAST_PREFIX}${oblastId}`;
}

function parseOblastLocation(locationId: string): Oblast | undefined {
  if (!locationId.startsWith(OBLAST_PREFIX)) return undefined;
  return OBLAST_BY_ID.get(locationId.slice(OBLAST_PREFIX.length));
}

export function locationLabel(locationId: string): string {
  const c = CITY_BY_ID.get(locationId);
  if (c) return c.name;
  const o = parseOblastLocation(locationId);
  if (o) return o.name;
  return locationId;
}

/** Most specific first: city → oblast → macroregion → country. */
export function geoChain(locationId: string): GeoScope[] {
  const chain: GeoScope[] = [];
  const c = CITY_BY_ID.get(locationId);
  if (c) {
    chain.push({ level: "city", id: c.id });
    chain.push({ level: "oblast", id: c.oblastId });
    chain.push({ level: "macroregion", id: c.macroregionId });
  } else {
    const o = parseOblastLocation(locationId);
    if (o) {
      chain.push({ level: "oblast", id: o.id });
      chain.push({ level: "macroregion", id: o.macroregionId });
    }
  }
  chain.push({ ...COUNTRY_SCOPE });
  return chain;
}

export function geoScopeLabel(scope: GeoScope): string {
  switch (scope.level) {
    case "city": {
      const c = CITY_BY_ID.get(scope.id);
      return c ? `м. ${c.name}` : scope.id;
    }
    case "oblast":
      return OBLAST_BY_ID.get(scope.id)?.name ?? scope.id;
    case "macroregion":
      return MACRO_BY_ID.get(scope.id)?.name ?? scope.id;
    case "country":
      return "Україна";
  }
}
