/**
 * Typed data layer for the admin panel. Every Supabase call lives here so pages
 * stay declarative and the "not configured" state is handled in one place.
 *
 * Table / column names follow `supabase/migrations` (schema 20261013000001, API 20261013000004,
 * grants 20261013000006). If the backend changes, only this file needs to change.
 *
 * Audit reasons ("Причина зміни"): the backend reads `denva.reason` per transaction, which
 * PostgREST cannot set, so every admin write goes through an RPC that takes `p_reason`:
 * admin_upsert_row (regions, cities, services, clinics, settings), admin_save_clinic_price,
 * admin_set_clinic_price_status, admin_set_city/region_manual_price, admin_set_price_mode.
 */
import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type {
  AdminPriceMatrixRow,
  AggregateDetail,
  AggregationMethod,
  ClinicPriceStatus,
  ClinicStatus,
  ImportPayload,
  ImportReport,
  PriceMode,
  ServiceRole,
  SubmitLeadResponse,
  Tier,
} from "@/lib/contracts";

export { isSupabaseConfigured };

// ───────────── row types ─────────────

export interface Region {
  id: string;
  name: string;
  active: boolean;
}
export interface City {
  id: string;
  name: string;
  region_id: string;
  currency: string;
  active: boolean;
  aliases: string[] | null;
  min_clinics: number | null;
}
export interface Service {
  service_code: string;
  name: string;
  role: ServiceRole;
  unit: string;
  tiered: boolean;
  included_text: string | null;
  active: boolean;
  sort: number;
}
export interface Clinic {
  id: string;
  name: string;
  city_id: string;
  network_id: string | null;
  status: ClinicStatus;
  verified_at: string | null;
  contacts: unknown;
  is_demo?: boolean;
}
export interface ClinicPrice {
  id: string;
  clinic_id: string;
  /** null until DENVA maps an imported row (ТЗ §7.4). */
  service_code: string | null;
  tier: Tier | null;
  price_from: number;
  price_to: number | null;
  value: number | null;
  currency: string;
  offer_name: string | null;
  brand_material: string | null;
  included_text: string | null;
  exclusions: string | null;
  valid_from: string | null;
  verified_at: string | null;
  status: ClinicPriceStatus;
  include_in_aggregate: boolean;
  exclude_reason: string | null;
  source_url: string | null;
  document_path: string | null;
  import_batch_id: string | null;
  is_demo?: boolean;
  created_at?: string;
}
/** View `admin_clinic_prices` (id is mapped from `clinic_price_id`). */
export interface AdminClinicPrice extends ClinicPrice {
  clinic_name: string;
  city_id: string;
  city_name: string;
  network_id: string | null;
  clinic_status: ClinicStatus;
  service_name: string | null;
  value_city_currency: number | null;
  aggregate_value: number | null;
  aggregate_clinic_count: number | null;
  /** (price in city currency − aggregate) / aggregate × 100. */
  deviation_pct: number | null;
  /** |deviation| above settings.deviation_warning_pct (ТЗ §7.3). */
  warning: boolean;
}
export interface ManualPrice {
  service_code: string;
  tier: Tier;
  value: number;
  value_from?: number | null;
  value_to?: number | null;
  is_demo?: boolean;
}
export interface PriceModeRow {
  city_id: string;
  service_code: string;
  tier: Tier;
  mode: PriceMode;
}
export interface AdminUser {
  user_id: string;
  email: string | null;
}
export interface Settings {
  min_clinics: number;
  aggregation_method: AggregationMethod;
  stale_after_months: number;
  deviation_warning_pct: number;
}
export interface CurrencyRate {
  currency: string;
  rate_to_uah: number;
  rate_date: string;
}
export interface ImportBatch {
  id: string;
  file_name?: string | null;
  clinic_id?: string | null;
  row_count?: number | null;
  created_at?: string;
  created_by?: string | null;
  report?: unknown;
}
export interface AuditEntry {
  id: number;
  /** auth user id */
  actor: string | null;
  table_name: string;
  record_pk: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_data: unknown;
  new_data: unknown;
  reason: string | null;
  at: string;
}
export interface Lead {
  id: string;
  payload: Record<string, unknown> | null;
  phone: string | null;
  location_kind: string | null;
  location_id: string | null;
  intent: string | null;
  telegram_status: "pending" | "sent" | "failed";
  telegram_error: string | null;
  attempts: number | null;
  created_at: string;
}
export interface AggregateSnapshot {
  id: string;
  city_id: string;
  service_code: string;
  tier: Tier;
  value: number | null;
  clinic_count: number;
  method: AggregationMethod;
  calculated_at: string;
  seq?: number;
  included?: AggregateDetail["included"];
  excluded?: AggregateDetail["excluded"];
}
export interface PublishedHistoryRow {
  id: number;
  change_type: "set" | "removed";
  value: number | null;
  previous_value: number | null;
  currency: string | null;
  source_type: string | null;
  clinic_count: number | null;
  aggregation_method: string | null;
  calculated_at: string | null;
  published_at: string;
}

// ───────────── plumbing ─────────────

export class AdminApiError extends Error {
  readonly code?: string;
  constructor(error: PostgrestError | { message: string; code?: string }) {
    super(error.message);
    this.name = "AdminApiError";
    this.code = error.code;
  }
}

type Res<T> = PromiseLike<{ data: T | null; error: PostgrestError | null }>;

async function unwrap<T>(q: Res<T>): Promise<T> {
  const { data, error } = await q;
  if (error) throw new AdminApiError(error);
  return data as T;
}

async function unwrapList<T>(q: Res<T[]>): Promise<T[]> {
  return (await unwrap(q)) ?? [];
}

async function exec(q: PromiseLike<{ error: PostgrestError | null }>): Promise<void> {
  const { error } = await q;
  if (error) throw new AdminApiError(error);
}

const db = () => getSupabase();
const clean = (reason?: string | null) => reason?.trim() || null;

/** admin_upsert_row: a row whose primary key exists is updated (only the keys passed), otherwise inserted. */
async function upsertRow<T>(table: "regions" | "cities" | "services" | "clinics" | "settings", row: object, reason?: string): Promise<T> {
  return unwrap<T>(db().rpc("admin_upsert_row", { p_table: table, p_row: row, p_reason: clean(reason) }));
}

// ───────────── auth ─────────────

export async function getSession() {
  const { data } = await db().auth.getSession();
  return data.session;
}

/** Subscribes to sign-in / sign-out; returns an unsubscribe function. */
export function onAuthChange(cb: (session: Awaited<ReturnType<typeof getSession>>) => void): () => void {
  const { data } = db().auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
    // supabase-js forbids awaiting other client calls inside this callback — defer.
    setTimeout(() => cb(session), 0);
  });
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string) {
  const { error } = await db().auth.signInWithPassword({ email, password });
  if (error) throw new AdminApiError(error);
}

export async function signOut() {
  await db().auth.signOut();
}

/** RLS lets an admin read admin_users; a non-admin sees no rows (or is denied). */
export async function checkIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await db().from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) {
    if (error.code === "42501" || error.code === "PGRST301") return false;
    throw new AdminApiError(error);
  }
  return Boolean(data);
}

export const listAdminUsers = () => unwrapList<AdminUser>(db().from("admin_users").select("user_id,email"));

// ───────────── regions / cities ─────────────
// regions.id / cities.id are text keys without a default — the caller supplies a slug on create.

export const listRegions = () => unwrapList<Region>(db().from("regions").select("*").order("name"));

export const saveRegion = (region: Region, reason?: string) => upsertRow<Region>("regions", region, reason);

export const listCities = () => unwrapList<City>(db().from("cities").select("*").order("name"));

export const saveCity = (city: City, reason?: string) => upsertRow<City>("cities", city, reason);

// ───────────── services ─────────────

export const listServices = () => unwrapList<Service>(db().from("services").select("*").order("sort").order("service_code"));

/** service_code is immutable: on edit the key identifies the row and is never changed. */
export const saveService = (service: Service, reason?: string) => upsertRow<Service>("services", service, reason);

// ───────────── clinics ─────────────

export interface ClinicFilter {
  cityId?: string;
  status?: ClinicStatus | "";
  search?: string;
}

export async function listClinics(filter: ClinicFilter = {}): Promise<Clinic[]> {
  let q = db().from("clinics").select("*").order("name");
  if (filter.cityId) q = q.eq("city_id", filter.cityId);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.search?.trim()) q = q.ilike("name", `%${filter.search.trim().replace(/[%_]/g, "")}%`);
  return unwrapList<Clinic>(q);
}

export const saveClinic = (clinic: Partial<Clinic> & { name: string; city_id: string }, reason?: string) =>
  upsertRow<Clinic>("clinics", clinic, reason);

/** Deactivation never deletes (ТЗ §9) — status only. The DB queues a recalculation. */
export async function setClinicStatus(id: string, status: ClinicStatus, reason?: string): Promise<void> {
  await upsertRow("clinics", { id, status }, reason);
}

export async function verifyClinic(id: string, reason?: string): Promise<void> {
  await upsertRow("clinics", { id, verified_at: new Date().toISOString() }, reason);
}

// ───────────── clinic prices ─────────────

export interface PriceFilter {
  cityId?: string;
  clinicId?: string;
  serviceCode?: string;
  tier?: Tier | "";
  status?: ClinicPriceStatus | "";
  batchId?: string;
  limit?: number;
}

export async function listClinicPrices(filter: PriceFilter = {}): Promise<AdminClinicPrice[]> {
  let q = db()
    .from("admin_clinic_prices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 500);
  if (filter.cityId) q = q.eq("city_id", filter.cityId);
  if (filter.clinicId) q = q.eq("clinic_id", filter.clinicId);
  if (filter.serviceCode) q = q.eq("service_code", filter.serviceCode);
  if (filter.tier) q = q.eq("tier", filter.tier);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.batchId) q = q.eq("import_batch_id", filter.batchId);
  const rows = await unwrapList<AdminClinicPrice & { clinic_price_id: string }>(q);
  return rows.map((r) => ({ ...r, id: r.clinic_price_id }));
}

export interface ClinicPriceInput {
  id?: string;
  clinic_id: string;
  service_code: string;
  tier: Tier;
  price_from: number;
  price_to: number | null;
  currency: string;
  offer_name: string | null;
  brand_material: string | null;
  included_text: string | null;
  exclusions: string | null;
  /** null → DB default (today) on insert, unchanged on update. */
  valid_from: string | null;
  verified_at: string | null;
  include_in_aggregate: boolean;
  exclude_reason: string | null;
  source_url: string | null;
  document_path: string | null;
  status?: ClinicPriceStatus;
}

/** admin_save_clinic_price: partial row, null id = create. Returns the price id. */
export async function saveClinicPrice(input: ClinicPriceInput, reason?: string): Promise<string> {
  const { id, valid_from, ...rest } = input;
  const row = valid_from ? { ...rest, valid_from } : rest; // valid_from is NOT NULL: omit when empty
  return unwrap<string>(db().rpc("admin_save_clinic_price", { p_id: id ?? null, p_row: row, p_reason: clean(reason) }));
}

/**
 * Moderation through `admin_set_clinic_price_status` so the reason reaches audit_log.
 * Approving requires service_code + tier (DB check); returns how many rows changed.
 */
export async function moderatePrices(ids: string[], status: ClinicPriceStatus, reason?: string): Promise<number> {
  if (ids.length === 0) return 0;
  return unwrap<number>(db().rpc("admin_set_clinic_price_status", { p_ids: ids, p_status: status, p_reason: clean(reason) }));
}

export interface BatchApproval {
  approved: number;
  /** Pending rows not approved because DENVA has not mapped service_code / tier yet. */
  unmapped: number;
}

/** Approves every pending, mapped price of an import batch. */
export async function approveBatch(batchId: string, reason?: string): Promise<BatchApproval> {
  const pending = await unwrapList<{ id: string; service_code: string | null; tier: string | null }>(
    db().from("clinic_prices").select("id,service_code,tier").eq("import_batch_id", batchId).eq("status", "pending"),
  );
  const mapped = pending.filter((p) => p.service_code && p.tier).map((p) => p.id);
  const approved = await moderatePrices(mapped, "approved", reason);
  return { approved, unmapped: pending.length - mapped.length };
}

// ───────────── Excel import ─────────────

export const importClinicPrices = (payload: ImportPayload) =>
  unwrap<ImportReport>(db().rpc("import_clinic_prices", { p_payload: payload }));

export const listImportBatches = () =>
  unwrapList<ImportBatch>(db().from("import_batches").select("*").order("created_at", { ascending: false }).limit(30));

// ───────────── manual benchmarks + modes ─────────────

export type BenchmarkScope = "city" | "region";

export const listManualPrices = (scope: BenchmarkScope, id: string) =>
  unwrapList<ManualPrice>(
    scope === "city"
      ? db().from("city_manual_prices").select("*").eq("city_id", id)
      : db().from("region_manual_prices").select("*").eq("region_id", id),
  );

export const listPriceModes = (cityId: string) =>
  unwrapList<PriceModeRow>(db().from("price_modes").select("*").eq("city_id", cityId));

export interface BenchmarkChange {
  service_code: string;
  tier: Tier;
  /** undefined = untouched, null = clear, number = set */
  value?: number | null;
  mode?: PriceMode;
}

/** Applies cell changes for one city/region through the admin_set_* RPCs (they carry the reason). */
export async function saveBenchmarks(scope: BenchmarkScope, id: string, changes: BenchmarkChange[], reason?: string): Promise<void> {
  const p_reason = clean(reason);
  for (const c of changes) {
    if (c.value !== undefined) {
      const fn = scope === "city" ? "admin_set_city_manual_price" : "admin_set_region_manual_price";
      await exec(
        db().rpc(fn, {
          [scope === "city" ? "p_city_id" : "p_region_id"]: id,
          p_service_code: c.service_code,
          p_tier: c.tier,
          p_value: c.value,
          p_value_from: null,
          p_value_to: null,
          p_reason,
        }),
      );
    }
    if (scope === "city" && c.mode !== undefined) {
      await exec(
        db().rpc("admin_set_price_mode", {
          p_city_id: id,
          p_service_code: c.service_code,
          p_tier: c.tier,
          p_mode: c.mode,
          p_reason,
        }),
      );
    }
  }
}

// ───────────── aggregates ─────────────

export const getPriceMatrix = (cityId: string) =>
  unwrapList<AdminPriceMatrixRow>(db().from("admin_price_matrix").select("*").eq("city_id", cityId));

export const getAggregateDetail = (cityId: string, serviceCode: string, tier: Tier) =>
  unwrap<AggregateDetail>(
    db().rpc("admin_aggregate_detail", { p_city_id: cityId, p_service_code: serviceCode, p_tier: tier }),
  );

/** Recomputes one city × service × tier now (snapshot + publication). Returns the source type. */
export const recalculateNow = (cityId: string, serviceCode: string, tier: Tier) =>
  unwrap<string>(db().rpc("recalculate_now", { p_city_id: cityId, p_service_code: serviceCode, p_tier: tier }));

/** Recomputes every combination of one city at once; returns the number of combinations. */
export const recalculateCity = (cityId: string) => unwrap<number>(db().rpc("recalculate_city", { p_city_id: cityId }));

/** Drains the recalculation queue immediately; returns processed count. */
export const processQueueNow = () => unwrap<number>(db().rpc("process_queue_now"));

// ───────────── history ─────────────

export interface AuditFilter {
  table?: string;
  actor?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function listAudit(filter: AuditFilter = {}): Promise<AuditEntry[]> {
  let q = db().from("audit_log").select("*").order("at", { ascending: false }).limit(filter.limit ?? 200);
  if (filter.table) q = q.eq("table_name", filter.table);
  if (filter.actor) q = q.eq("actor", filter.actor);
  if (filter.from) q = q.gte("at", `${filter.from}T00:00:00`);
  if (filter.to) q = q.lt("at", `${filter.to}T23:59:59.999`);
  return unwrapList<AuditEntry>(q);
}

/** Audited tables (fixed by the triggers in migration 000003). */
export const AUDIT_TABLES = [
  "regions",
  "cities",
  "services",
  "clinics",
  "clinic_prices",
  "city_manual_prices",
  "region_manual_prices",
  "price_modes",
  "settings",
  "currency_rates",
  "admin_users",
  "import_batches",
] as const;

export const listSnapshots = (cityId: string, serviceCode: string, tier: Tier) =>
  unwrapList<AggregateSnapshot>(
    db()
      .from("city_aggregates")
      .select("*")
      .eq("city_id", cityId)
      .eq("service_code", serviceCode)
      .eq("tier", tier)
      .order("seq", { ascending: false })
      .limit(100),
  );

export const listPublishedHistory = (cityId: string, serviceCode: string, tier: Tier) =>
  unwrapList<PublishedHistoryRow>(
    db()
      .from("published_price_history")
      .select("*")
      .eq("location_kind", "city")
      .eq("location_id", cityId)
      .eq("service_code", serviceCode)
      .eq("tier", tier)
      .order("id", { ascending: false })
      .limit(100),
  );

// ───────────── leads ─────────────

export const listLeads = (limit = 200) =>
  unwrapList<Lead>(db().from("leads").select("*").order("created_at", { ascending: false }).limit(limit));

/** ТЗ §6.3: re-send to Telegram through the same Edge Function. */
export async function retryLead(leadId: string): Promise<SubmitLeadResponse> {
  const { data, error } = await db().functions.invoke<SubmitLeadResponse>("submit-lead", { body: { retry_lead_id: leadId } });
  if (error) throw new AdminApiError({ message: error.message });
  if (!data) throw new AdminApiError({ message: "Порожня відповідь від submit-lead" });
  return data;
}

// ───────────── settings ─────────────

export const DEFAULT_SETTINGS: Settings = {
  min_clinics: 3,
  aggregation_method: "median",
  stale_after_months: 12,
  deviation_warning_pct: 30,
};

/** `settings` holds exactly one row (id = true). */
export async function getSettings(): Promise<Settings> {
  const row = await unwrap<Record<string, unknown> | null>(db().from("settings").select("*").limit(1).maybeSingle());
  return {
    min_clinics: Number(row?.min_clinics ?? DEFAULT_SETTINGS.min_clinics),
    aggregation_method: (row?.aggregation_method as AggregationMethod) ?? DEFAULT_SETTINGS.aggregation_method,
    stale_after_months: Number(row?.stale_after_months ?? DEFAULT_SETTINGS.stale_after_months),
    deviation_warning_pct: Number(row?.deviation_warning_pct ?? DEFAULT_SETTINGS.deviation_warning_pct),
  };
}

export async function saveSettings(next: Settings, reason?: string): Promise<void> {
  await upsertRow("settings", next, reason);
}

export const listCurrencyRates = () =>
  unwrapList<CurrencyRate>(db().from("currency_rates").select("*").order("rate_date", { ascending: false }).limit(60));

// ───────────── dashboard ─────────────

export interface DashboardCounts {
  pendingPrices: number;
  failedLeads: number;
  citiesWithoutPrices: City[];
}

async function count(q: PromiseLike<{ count: number | null; error: PostgrestError | null }>): Promise<number> {
  const { count: n, error } = await q;
  if (error) throw new AdminApiError(error);
  return n ?? 0;
}

export async function getDashboardCounts(): Promise<DashboardCounts> {
  const [pendingPrices, failedLeads, cities, published] = await Promise.all([
    count(db().from("clinic_prices").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(db().from("leads").select("id", { count: "exact", head: true }).eq("telegram_status", "failed")),
    unwrapList<City>(db().from("cities").select("*").eq("active", true).order("name")),
    unwrapList<{ location_id: string }>(db().from("published_prices").select("location_id").eq("location_kind", "city").limit(20000)),
  ]);
  const withPrices = new Set(published.map((p) => p.location_id));
  return { pendingPrices, failedLeads, citiesWithoutPrices: cities.filter((c) => !withPrices.has(c.id)) };
}
