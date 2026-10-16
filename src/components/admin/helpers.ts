import type {
  AggregationMethod,
  ClinicPriceStatus,
  ClinicStatus,
  GeoScope,
  PriceMode,
  SeoStatus,
  ServiceRole,
  SourceType,
  Tier,
  TierSource,
} from "@/lib/contracts";

// ───────────── labels ─────────────

export const TIER_LABEL: Record<Tier, string> = {
  common: "Спільний",
  minimum: "Мінімальний",
  classic: "Класичний",
  premium: "Преміальний",
};
export const TIERS: readonly Tier[] = ["common", "minimum", "classic", "premium"];
export const PATIENT_TIER_LIST: readonly Tier[] = ["minimum", "classic", "premium"];

export const CLINIC_STATUS_LABEL: Record<ClinicStatus, string> = {
  draft: "Чернетка",
  active: "Активна",
  excluded: "Виключена",
};

export const PRICE_STATUS_LABEL: Record<ClinicPriceStatus, string> = {
  pending: "На перевірці",
  approved: "Підтверджено",
  rejected: "Відхилено",
  stale: "Застаріла",
};

export const MODE_LABEL: Record<PriceMode, string> = {
  auto: "Авто (за формулою)",
  manual_override: "Ручне значення (override)",
};

/** ТЗ §2.2 — all six publication modes. */
export const SOURCE_LABEL: Record<SourceType, string> = {
  aggregate: "Медіана клінік (3+)",
  hybrid: "Гібрид (клініки + базова)",
  manual_baseline: "Базовий орієнтир міста",
  manual_override: "Ручний override",
  regional_fallback: "Орієнтир області",
  national_fallback: "Орієнтир України",
};

export const SOURCE_HELP: Record<SourceType, string> = {
  aggregate: "3 і більше перевірених клінік — публікується медіана їхніх цін.",
  hybrid: "1–2 перевірені клініки змішуються з базовим орієнтиром.",
  manual_baseline: "Немає локальних клінік — публікується ручний орієнтир міста.",
  manual_override: "Адміністратор тимчасово зафіксував значення (потрібна причина).",
  regional_fallback: "Немає міських даних — використано ручний орієнтир області.",
  national_fallback: "Немає міських та обласних даних — використано орієнтир України.",
};

export const SCOPE_LABEL: Record<GeoScope, string> = {
  city: "місто",
  region: "область",
  country: "Україна",
};

export const METHOD_LABEL: Record<AggregationMethod, string> = {
  median: "Медіана",
};

export const ROLE_LABEL: Record<ServiceRole, string> = {
  implant: "Імплант",
  healing: "Формувач ясен",
  scan: "Сканування",
  superstructure: "Супраструктура",
  crown: "Коронка",
  temporary: "Тимчасова коронка",
  final_abutment: "Фінальний абатмент",
  multiunit: "Мультиюніт",
  arch: "Повнощелепна конструкція",
  diagnostic: "Діагностика",
  removal: "Видалення",
  addon: "Додаткова процедура",
};
export const ROLES = Object.keys(ROLE_LABEL) as ServiceRole[];

export const TIER_SOURCE_LABEL: Record<TierSource, string> = {
  implant_tier: "За рівнем імпланта",
  crown_or_arch_tier: "За рівнем коронки / конструкції",
  common: "Спільний (без рівнів)",
};

/** ТЗ §11.3 — city page states and what each one does. */
export const SEO_STATUS_LABEL: Record<SeoStatus, string> = {
  draft: "Чернетка",
  review: "На перевірці",
  published: "Опубліковано",
  stale: "Застаріла",
  removed: "Знято",
};

export const SEO_STATUS_HELP: Record<SeoStatus, string> = {
  draft: "Місто створено, але цін або контенту недостатньо. noindex; немає у sitemap та каталозі міст.",
  review: "Формули рахуються, сторінка проходить медичну й SEO-перевірку. noindex; доступ лише команді.",
  published:
    "Є валідні ціни для ключових сценаріїв, унікальний контент і рецензент. HTTP 200, index, self-canonical, sitemap.",
  stale: "Критичні ціни втратили актуальність або джерел недостатньо. URL лишається, показується статус; за потреби тимчасово noindex.",
  removed: "Місто більше не підтримується. Сторінка «місто більше не підтримується» з посиланням на область (301/410 — з власним доменом).",
};
export const SEO_STATUSES = Object.keys(SEO_STATUS_LABEL) as SeoStatus[];

export const CURRENCIES = ["UAH", "EUR", "USD"] as const;

// ───────────── formatting ─────────────

const dateTimeFmt = new Intl.DateTimeFormat("uk-UA", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFmt = new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : dateTimeFmt.format(d);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : dateFmt.format(d);
}

export function formatMoney(value: number | null | undefined, currency = "UAH"): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  const text = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(n);
  return `${text} ${currency === "UAH" ? "₴" : currency}`;
}

export function formatPlain(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(Number(value));
}

/** "2026-10-13T10:00:00Z" → "2026-10-13" for <input type=date>. */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

/** Local date input → ISO date or null. */
export function fromDateInput(value: string): string | null {
  return value ? value : null;
}

/** Parses a user-typed decimal ("1 200,5") → number | null (empty) | NaN (garbage). */
export function parseDecimal(raw: string): number | null {
  const cleaned = raw.replace(/[\s ]/g, "").replace(",", ".");
  if (cleaned === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ye", ж: "zh", з: "z", и: "y", і: "i", ї: "yi",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh",
  ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "yu", я: "ya", "'": "", "’": "", "ʼ": "",
};

/** "Івано-Франківськ" → "ivano-frankivsk" — default text id for new cities/regions. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseAliases(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** contacts may be text or jsonb: always render as plain text. */
export function contactsToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ───────────── errors ─────────────

export function describeError(error: unknown): string {
  if (!error) return "Невідома помилка";
  const e = error as { code?: string; message?: string; details?: string; hint?: string; name?: string };
  const message = e.message ?? String(error);
  switch (e.code) {
    case "42501":
      return "Недостатньо прав для цієї дії (працює лише для адміністраторів).";
    case "23505":
      return "Такий запис уже існує (порушено унікальність).";
    case "23503":
      return "Пов'язаний запис не знайдено або він використовується в інших даних.";
    case "23514":
      return `Значення не проходить перевірку бази даних. ${e.details ?? message}`;
    case "23502":
      return `Не заповнено обов'язкове поле. ${e.details ?? ""}`.trim();
    case "PGRST301":
      return "Сесія завершилась. Увійдіть знову.";
    default:
      break;
  }
  if (/clinic_prices_approved_mapped/.test(message)) {
    return "Не можна підтвердити ціну без service_code і рівня: спершу зіставте її зі довідником (відкрийте картку ціни).";
  }
  if (/jwt expired/i.test(message)) return "Сесія завершилась. Увійдіть знову.";
  if (/failed to fetch|networkerror|load failed/i.test(message)) return "Немає зв'язку із сервером. Перевірте інтернет і повторіть.";
  return message;
}

// ───────────── audit diff ─────────────

export interface DiffEntry {
  field: string;
  before: unknown;
  after: unknown;
}

const NOISE_FIELDS = new Set(["updated_at", "created_at"]);

/** Field-level diff between two audit snapshots (old → new). Insert/delete diff against {}. */
export function diffRecords(oldRow: unknown, newRow: unknown): DiffEntry[] {
  const a = isRecord(oldRow) ? oldRow : {};
  const b = isRecord(newRow) ? newRow : {};
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const out: DiffEntry[] = [];
  for (const k of keys) {
    if (NOISE_FIELDS.has(k) && isRecord(oldRow) && isRecord(newRow)) continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push({ field: k, before: a[k], after: b[k] });
  }
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v === "" ? "«»" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// ───────────── clinic price validation (ТЗ §7.2) ─────────────

/** One-off services (diagnostics, removals) need no composition; everything else does (template instruction 4). */
export function compositionRequired(role: ServiceRole): boolean {
  return role !== "diagnostic" && role !== "removal";
}

export interface PriceFormValues {
  clinic_id: string;
  service_code: string;
  tier: Tier | "";
  price_from: string;
  price_to: string;
  currency: string;
  included_text: string;
  valid_from: string;
}

export interface ServiceLite {
  service_code: string;
  tiered: boolean;
  role: ServiceRole;
}

export type PriceFormErrors = Partial<Record<keyof PriceFormValues, string>>;

/** Pure validation of the clinic price card. */
export function validatePriceForm(
  values: PriceFormValues,
  services: readonly ServiceLite[],
  currencies: readonly string[] = CURRENCIES,
): PriceFormErrors {
  const errors: PriceFormErrors = {};
  if (!values.clinic_id) errors.clinic_id = "Оберіть клініку.";
  const service = services.find((s) => s.service_code === values.service_code);
  if (!values.service_code) errors.service_code = "Оберіть послугу зі довідника.";
  else if (!service) errors.service_code = "Невідомий service_code.";

  if (service) {
    if (service.tiered) {
      if (!values.tier || values.tier === "common") errors.tier = "Для цієї послуги оберіть Мінімальний, Класичний або Преміальний рівень.";
    } else if (values.tier && values.tier !== "common") {
      errors.tier = "Ця послуга не має рівнів — використовуйте «Спільний».";
    }
  }
  if (!values.tier) errors.tier ??= "Оберіть рівень.";

  const from = parseDecimal(values.price_from);
  const to = parseDecimal(values.price_to);
  if (from === null) errors.price_from = "Вкажіть ціну.";
  else if (Number.isNaN(from)) errors.price_from = "Ціна має бути числом.";
  else if (from <= 0) errors.price_from = "Ціна має бути більшою за нуль.";
  if (to !== null) {
    if (Number.isNaN(to)) errors.price_to = "Ціна має бути числом.";
    else if (to <= 0) errors.price_to = "Ціна має бути більшою за нуль.";
    else if (from !== null && !Number.isNaN(from) && to < from) errors.price_to = "«Ціна до» не може бути меншою за «Ціна від».";
  }
  if (!currencies.includes(values.currency)) errors.currency = `Дозволені валюти: ${currencies.join(", ")}.`;
  if (service && compositionRequired(service.role) && !values.included_text.trim()) {
    errors.included_text = "Вкажіть, що входить у ціну: рекламна ціна без складу не допускається до агрегату.";
  }
  if (values.valid_from && Number.isNaN(Date.parse(values.valid_from))) errors.valid_from = "Некоректна дата.";
  return errors;
}

/** Midpoint technical value (ТЗ §7.4): fixed price when "до" is empty. */
export function midpoint(from: number, to: number | null): number {
  return to === null ? from : (from + to) / 2;
}

// ───────────── matrix ─────────────

export interface MatrixCellLike {
  service_code: string;
  tier: Tier;
}

/** Stable key for a service × tier cell. */
export const cellKey = (service_code: string, tier: Tier): string => `${service_code}|${tier}`;

/** Deviation of a clinic value vs the current aggregate, in percent (null when not comparable). */
export function deviationPct(value: number | null, aggregate: number | null): number | null {
  if (value === null || aggregate === null || aggregate === 0) return null;
  return Math.round(((value - aggregate) / aggregate) * 1000) / 10;
}

// ───────────── blend weights (ТЗ §3.3) ─────────────

function weightLabel(w: number): string {
  if (Math.abs(w - 1) < 0.005) return "100%";
  if (Math.abs(w) < 0.005) return "0%";
  if (Math.abs(w - 1 / 3) < 0.01) return "⅓";
  if (Math.abs(w - 2 / 3) < 0.01) return "⅔";
  return `${Math.round(w * 100)}%`;
}

/** {local: 1/3, baseline: 2/3} → "⅓ локальна + ⅔ базова"; pure cases collapse to one part. */
export function formatBlend(weights: { local: number; baseline: number } | null | undefined): string {
  if (!weights) return "—";
  const { local, baseline } = weights;
  if (baseline < 0.005) return "100% локальна медіана";
  if (local < 0.005) return "100% базова";
  return `${weightLabel(local)} локальна + ${weightLabel(baseline)} базова`;
}
