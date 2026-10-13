/**
 * Ядро Edge Function submit-lead (ТЗ §6.3, §8): CORS, валідація, збереження, Telegram.
 * Усі залежності передаються ззовні (index.ts підставляє Supabase/Deno), тож логіка
 * тестується у Vitest без мережі. Заявка спершу зберігається, потім йде в Telegram —
 * збій Telegram ніколи не губить заявку і не блокує відповідь.
 */
import type { FetchLike, LeadPayload, TelegramResult } from "./telegram.ts";
import type { ValidationResult } from "./lead.ts";

export const DEFAULT_ALLOWED_ORIGINS = ["https://exteel.github.io"];
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_TELEGRAM_ATTEMPTS = 10;
/** Публічна форма може повторити відправку лише для заявки, створеної не раніше ніж годину тому. */
export const PUBLIC_RETRY_WINDOW_MS = 60 * 60 * 1000;

export class RateLimitedError extends Error {
  constructor() {
    super("rate_limited");
  }
}

export interface StoredLead {
  id: string;
  payload: LeadPayload;
  telegram_status: "pending" | "sent" | "failed";
  attempts: number;
  created_at: string;
}

export interface LeadStore {
  /** Зберігає заявку; кидає RateLimitedError, якщо перевищено ліміт на телефон. */
  insertLead(lead: LeadPayload): Promise<{ lead_id: string }>;
  getLead(id: string): Promise<StoredLead | null>;
  setTelegramStatus(id: string, status: "sent" | "failed", error?: string): Promise<void>;
  /** Chat id, збережений після міграції групи в супергрупу (settings.telegram_chat_id_override). */
  getChatIdOverride(): Promise<string | null>;
  setChatIdOverride(chatId: string): Promise<void>;
}

export interface HandlerDeps {
  store: LeadStore;
  validateLead(input: unknown): ValidationResult;
  formatMessage(lead: LeadPayload): string;
  sendMessage(fetchImpl: FetchLike, token: string, chatId: string, text: string): Promise<TelegramResult>;
  fetch: FetchLike;
  /** true, якщо Authorization-заголовок містить JWT адміністратора (admin_users). */
  isAdmin(authorization: string | null): Promise<boolean>;
  now?: () => number;
  env: { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string; ALLOWED_ORIGINS?: string };
}

export interface HandlerRequest {
  method: string;
  origin: string | null;
  authorization?: string | null;
  body: unknown;
}

export interface HandlerResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export function isOriginAllowed(origin: string | null, extra?: string): boolean {
  if (!origin) return true; // не-браузерні клієнти; браузер завжди надсилає Origin
  const allowed = [...DEFAULT_ALLOWED_ORIGINS, ...(extra ?? "").split(",").map((s) => s.trim()).filter(Boolean)];
  return allowed.includes(origin) || LOCAL_ORIGIN.test(origin);
}

export function corsHeaders(origin: string | null, extra?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && isOriginAllowed(origin, extra)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export async function handleSubmitLead(req: HandlerRequest, deps: HandlerDeps): Promise<HandlerResponse> {
  const headers = { ...corsHeaders(req.origin, deps.env.ALLOWED_ORIGINS), "Content-Type": "application/json" };
  const reply = (status: number, body: unknown): HandlerResponse => ({ status, headers, body });

  if (!isOriginAllowed(req.origin, deps.env.ALLOWED_ORIGINS)) return reply(403, { error: "origin_not_allowed" });
  if (req.method === "OPTIONS") return { status: 204, headers, body: null };
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const body = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) return reply(400, { error: "invalid_body" });
  const input = body as { lead?: unknown; retry_lead_id?: unknown };

  // Повторна відправка в Telegram вже збереженої заявки
  if (input.retry_lead_id !== undefined) {
    if (typeof input.retry_lead_id !== "string" || !UUID.test(input.retry_lead_id)) {
      return reply(400, { error: "invalid_retry_lead_id" });
    }
    const stored = await deps.store.getLead(input.retry_lead_id);
    if (!stored) return reply(404, { error: "lead_not_found" });
    // Адмін (кнопка «Надіслати ще раз») — без обмежень за віком; публічна форма — лише свіжа заявка
    const admin = req.authorization ? await deps.isAdmin(req.authorization).catch(() => false) : false;
    if (!admin) {
      const age = (deps.now?.() ?? Date.now()) - new Date(stored.created_at).getTime();
      if (!(age >= 0 && age <= PUBLIC_RETRY_WINDOW_MS)) return reply(403, { error: "retry_window_expired" });
    }
    if (stored.telegram_status === "sent") return reply(200, { lead_id: stored.id, telegram: "sent" });
    if (!admin && stored.attempts >= MAX_TELEGRAM_ATTEMPTS) return reply(429, { error: "too_many_attempts" });
    const telegram = await forward(stored.id, stored.payload, deps);
    return reply(200, { lead_id: stored.id, telegram });
  }

  const checked = deps.validateLead(input.lead);
  if (!checked.ok) return reply(400, { error: "validation_failed", details: checked.errors });

  let leadId: string;
  try {
    leadId = (await deps.store.insertLead(checked.lead)).lead_id;
  } catch (e) {
    if (e instanceof RateLimitedError) return reply(429, { error: "rate_limited" });
    return reply(500, { error: "storage_failed" });
  }
  const telegram = await forward(leadId, checked.lead, deps);
  return reply(200, { lead_id: leadId, telegram });
}

async function forward(leadId: string, lead: LeadPayload, deps: HandlerDeps): Promise<"sent" | "failed"> {
  const token = deps.env.TELEGRAM_BOT_TOKEN;
  const override = await deps.store.getChatIdOverride().catch(() => null);
  const chatId = override || deps.env.TELEGRAM_CHAT_ID;
  let result: TelegramResult;
  if (!token || !chatId) {
    result = { ok: false, error: "telegram not configured" };
  } else {
    const text = deps.formatMessage(lead);
    result = await deps.sendMessage(deps.fetch, token, chatId, text);
    // Групу перетворено на супергрупу: запам'ятовуємо новий id і пробуємо ще раз (один раз)
    if (!result.ok && result.migrateToChatId && result.migrateToChatId !== chatId) {
      await deps.store.setChatIdOverride(result.migrateToChatId).catch(() => undefined);
      result = await deps.sendMessage(deps.fetch, token, result.migrateToChatId, text);
    }
  }
  try {
    await deps.store.setTelegramStatus(leadId, result.ok ? "sent" : "failed", result.error);
  } catch {
    // статус не оновився — заявка все одно збережена; відповідаємо за фактом відправки
  }
  return result.ok ? "sent" : "failed";
}
