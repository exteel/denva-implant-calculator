/**
 * DENVA AI v2 — shared contracts between the Supabase backend
 * (`supabase/`), the patient calculator (`src/engine/v2`,
 * `src/components/calculator`) and the admin panel (`src/app/admin`).
 * Spec: docs/TZ_v2_DENVA_AI.txt · design: docs/ARCHITECTURE_v2.md.
 *
 * Changing anything here is a cross-team change: the SQL in
 * `supabase/migrations` must stay in sync.
 */

// ───────────────────────── Catalog ─────────────────────────

/** ТЗ §3.2 / §7.4: "Спільний" + the three patient-facing levels. */
export type Tier = "common" | "minimum" | "classic" | "premium";
export type PatientTier = Exclude<Tier, "common">;
export const PATIENT_TIERS: readonly PatientTier[] = ["minimum", "classic", "premium"];

/** ТЗ §4 roles. Only implant, crown and arch_final are tiered. */
export type ServiceRole =
  | "implant"
  | "healing"
  | "scan"
  | "superstructure"
  | "crown"
  | "temporary"
  | "multiunit"
  | "arch_temp"
  | "arch_final"
  | "addon";

/** Canonical service codes seeded by the backend (ТЗ §4). */
export const SERVICE_CODES = {
  IMPLANT_INSTALL: "IMPLANT_INSTALL",
  HEALING_ABUTMENT: "HEALING_ABUTMENT",
  SCAN_BOTH: "SCAN_BOTH",
  SUPERSTRUCTURE_SET: "SUPERSTRUCTURE_SET",
  CROWN_IMPLANT: "CROWN_IMPLANT",
  TEMP_CROWN_UNIT: "TEMP_CROWN_UNIT",
  MULTIUNIT: "MULTIUNIT",
  ARCH_TEMP: "ARCH_TEMP",
  ARCH_FINAL: "ARCH_FINAL",
  // addons — never in the total (ТЗ §4, §5.4)
  EXTRACTION_SIMPLE: "EXTRACTION_SIMPLE",
  EXTRACTION_COMPLEX: "EXTRACTION_COMPLEX",
  AUGMENT: "AUGMENT",
  SINUS: "SINUS",
  SOFT_TISSUE: "SOFT_TISSUE",
  SEDATION: "SEDATION",
  SURGICAL_GUIDE: "SURGICAL_GUIDE",
} as const;
export type ServiceCode = (typeof SERVICE_CODES)[keyof typeof SERVICE_CODES] | (string & {});

export interface PublicService {
  service_code: ServiceCode;
  name: string;
  role: ServiceRole;
  /** e.g. "за імплант", "за зуб", "за щелепу", "за етап", "за годину". */
  unit: string;
  tiered: boolean;
  included_text: string | null;
  sort: number;
}

// ───────────────────────── Locations ─────────────────────────

export type LocationKind = "city" | "region";

export interface PublicLocation {
  kind: LocationKind;
  id: string;
  name: string;
  /** For cities: the region used as fallback. */
  region_id: string | null;
  region_name: string | null;
  aliases: string[];
}

// ───────────────────────── Published prices (ТЗ §2.2–2.3, §8) ─────────────────────────

export type SourceType = "aggregate" | "manual" | "manual_override" | "regional_fallback";

export interface PublicPrice {
  service_code: ServiceCode;
  tier: Tier;
  /** In `currency` (UAH for Ukraine). */
  value: number;
  currency: string;
  source_type: SourceType;
  /** Number of clinics behind an aggregate; null for manual / fallback. */
  clinic_count: number | null;
  /** When the aggregate snapshot was computed; null for manual values. */
  calculated_at: string | null;
  published_at: string;
  /** Seed/demo values — the UI must label them. */
  is_demo: boolean;
}

/**
 * RPC `public.get_location_prices(p_kind text, p_id text)` (anon-callable).
 * Returns only PUBLISHED values — never clinic prices or clinic names.
 */
export interface LocationPricesResponse {
  location: PublicLocation;
  currency: string;
  /** NBU UAH per 1 EUR with its date, for the second-currency line (ТЗ §4.4). */
  eur_rate: { rate: number; date: string } | null;
  services: PublicService[];
  prices: PublicPrice[];
}

/** RPC `public.list_locations()` (anon-callable): active cities + regions. */
export type ListLocationsResponse = PublicLocation[];

// ───────────────────────── Leads (ТЗ §6.3) ─────────────────────────

export type LeadIntent = "refine" | "send_calculation";

export interface LeadPayload {
  intent: LeadIntent;
  phone: string;
  location: { kind: LocationKind; id: string; name: string };
  /** Machine-readable scenario, e.g. { kind: "teeth", count: 3, arrangement: "adjacent" }. */
  scenario: Record<string, unknown>;
  /** Human-readable scenario line for Telegram, e.g. "3 зуби поруч (міст)". */
  scenario_label: string;
  answers: Record<string, string | number>;
  implant_tier: PatientTier;
  crown_or_arch_tier: PatientTier;
  /** Main figure in UAH (first stage for full arch). */
  total_uah: number | null;
  /** Full arch only. */
  full_treatment_uah?: number | null;
  /** e.g. "на основі прайсів 4 клінік" / "статистичний орієнтир Denva". */
  price_source: string;
  page_url: string;
  utm: Record<string, string>;
  created_at: string;
}

/**
 * Edge Function `POST /functions/v1/submit-lead`.
 * Body: `{ lead: LeadPayload }` or `{ retry_lead_id: string }` (re-send to Telegram).
 * The lead is stored first, then forwarded; a Telegram failure never loses it.
 */
export interface SubmitLeadResponse {
  lead_id: string;
  telegram: "sent" | "failed";
}

// ───────────────────────── Admin (RLS: admins only) ─────────────────────────

export type PriceMode = "auto" | "manual" | "manual_override";
export type ClinicStatus = "draft" | "active" | "excluded";
export type ClinicPriceStatus = "pending" | "approved" | "rejected" | "stale";
export type AggregationMethod = "median" | "arithmetic_mean";

/** View `public.admin_price_matrix` — one row per city × service × tier. */
export interface AdminPriceMatrixRow {
  city_id: string;
  city_name: string;
  service_code: string;
  service_name: string;
  tier: Tier;
  mode: PriceMode;
  manual_value: number | null;
  region_value: number | null;
  aggregate_value: number | null;
  aggregate_clinic_count: number | null;
  aggregate_calculated_at: string | null;
  aggregate_method: AggregationMethod | null;
  published_value: number | null;
  published_source_type: SourceType | null;
  published_at: string | null;
  min_clinics: number;
}

/** RPC `public.admin_aggregate_detail(p_city_id, p_service_code, p_tier)`. */
export interface AggregateDetail {
  snapshot: {
    id: string;
    value: number | null;
    clinic_count: number;
    method: AggregationMethod;
    calculated_at: string;
  } | null;
  included: Array<{ clinic_price_id: string; clinic_id: string; clinic_name: string; value_uah: number; valid_from: string | null }>;
  excluded: Array<{ clinic_price_id: string; clinic_id: string; clinic_name: string; value_uah: number | null; reason: string }>;
}

/** One normalised row from the "DENVA шаблон цін клініки" Excel file (ТЗ §7.4). */
export interface ImportPriceRow {
  row_number: number;
  offer_name: string;
  brand_material: string | null;
  price_from: number | null;
  price_to: number | null;
  currency: string;
  included_text: string | null;
  exclusions: string | null;
  source: string | null;
  /** Filled by DENVA moderators; may be empty on import. */
  service_code: string | null;
  tier: Tier | null;
}

/** RPC `public.import_clinic_prices(p_payload jsonb)` input. */
export interface ImportPayload {
  file_name: string;
  clinic: {
    /** Existing clinic, or null to create a draft clinic from the card below. */
    clinic_id: string | null;
    name: string;
    city_id: string;
    contacts: string | null;
    valid_from: string | null;
    currency: string;
  };
  rows: ImportPriceRow[];
}

/** RPC `public.import_clinic_prices` output — the import protocol (ТЗ §8). */
export interface ImportReport {
  batch_id: string;
  clinic_id: string;
  accepted: number[];
  errors: Array<{ row_number: number; message: string }>;
  duplicates: number[];
  unknown_service_code: number[];
  /** Every accepted row starts as "На перевірці" (status pending). */
  pending_moderation: number[];
}
