/**
 * Повідомлення про заявку для Telegram (ТЗ 3.3 §6.3) — чистий TypeScript, без Deno-специфіки,
 * щоб його можна було тестувати у Vitest і виконувати в Edge Functions.
 */
import type { JawCalculation, JawInput, LeadPayload, MoneyRange, PatientTier } from "./lead-types.ts";

export type { LeadPayload } from "./lead-types.ts";

export const INTENT_LABELS: Record<string, string> = {
  dental_tender: "Хоче персональні пропозиції клінік (Dental Tender)",
  refine: "Уточнити розрахунок",
  send_calculation: "Надіслати розрахунок і питання", // заявки v2
};

export const TIER_LABELS: Record<PatientTier, string> = {
  minimum: "Мінімальний",
  classic: "Класичний",
  premium: "Преміальний",
};

export const JAW_LABELS = { upper: "Верхня щелепа", lower: "Нижня щелепа" } as const;

export const SCENARIO_LABELS: Record<string, string> = {
  single: "Один зуб",
  adjacent: "Зуби поруч (міст)",
  separate: "Окремі імпланти",
  adjacent_or_separate: "Діапазон: поруч або окремо",
  installed: "Протезування на встановлених імплантах",
  bridges: "Сегментне відновлення мостами",
  aox4: "All-on-4",
  aox6: "All-on-6",
  aox8: "All-on-8",
  reference_single: "Довідкова ціна одного зуба",
};

/** Telegram HTML parse mode: екрануємо лише & < >. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const groupDigits = (n: number): string => `${n < 0 ? "-" : ""}${String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")}`;

/** 123456 → «123 456 грн» (нерозривні пробіли). */
export function formatUah(value: number): string {
  return `${groupDigits(value)}\u00a0грн`;
}

/** Діапазон: однакові після округлення межі → одна сума; інакше «100 000–120 000 грн». */
export function formatMoney(range: MoneyRange): string {
  const lo = Math.round(range.low);
  const hi = Math.round(range.high);
  return lo === hi ? formatUah(lo) : `${groupDigits(lo)}–${groupDigits(hi)}\u00a0грн`;
}

const formatCount = (c: { low: number; high: number }): string =>
  c.low === c.high ? String(c.low) : `${c.low}–${c.high}`;

/** Повнощелепні сценарії: замість рівня коронки — рівень постійної конструкції. */
export const isArchScenario = (kind: string | undefined): boolean => kind === "aox4" || kind === "aox6" || kind === "aox8";

const clip = (value: unknown, max = 300): string => {
  const s = String(value ?? "").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

const MAX_MESSAGE = 4000; // ліміт Telegram — 4096

function jawBlock(label: string, input: JawInput | null, calc: JawCalculation | null): string[] {
  const line = (name: string, value: unknown) => `• ${name}: ${escapeHtml(clip(value))}`;
  const out: string[] = [`<b>${label}</b>`];
  const teeth = input?.tooth_count ?? calc?.tooth_count;
  if (teeth != null) out.push(line("Зубів", teeth));
  if (calc) {
    out.push(line("Сценарій", SCENARIO_LABELS[calc.scenario] ?? calc.scenario));
    out.push(line("Імплантів", formatCount(calc.implant_count)));
  }
  if (input) {
    out.push(line("Рівень імпланта", TIER_LABELS[input.implant_tier] ?? input.implant_tier));
    out.push(
      line(
        isArchScenario(calc?.scenario) ? "Рівень постійної конструкції" : "Рівень коронки",
        TIER_LABELS[input.crown_or_arch_tier] ?? input.crown_or_arch_tier,
      ),
    );
    if (input.include_temporary) out.push(line("Тимчасове протезування", "враховано"));
  }
  if (calc && (calc.missing_codes?.length ?? 0) > 0) {
    // рушій ставить total = 0, коли бракує опублікованих цін — суму не показуємо (ТЗ §2.3: не вигадувати)
    out.push(line("Розрахунок", `недоступний (бракує цін: ${calc.missing_codes.join(", ")})`));
  } else if (calc) {
    if (calc.first_stage) out.push(line("Перший етап", formatMoney(calc.first_stage)));
    if (calc.permanent_stage) out.push(line("Постійна конструкція", formatMoney(calc.permanent_stage)));
    out.push(line("Разом", formatMoney(calc.total)));
  } else {
    out.push(line("Розрахунок", "недоступний (бракує цін)"));
  }
  return out;
}

export function formatLeadMessage(lead: LeadPayload): string {
  const line = (label: string, value: unknown) => `<b>${label}:</b> ${escapeHtml(clip(value))}`;

  const lines: string[] = [
    "<b>Нова заявка DENVA AI</b>",
    line("Запит", INTENT_LABELS[lead.intent] ?? lead.intent),
    line("Телефон", lead.phone),
    line(lead.location.kind === "region" ? "Область" : "Місто", lead.location.name),
  ];
  if (lead.scenario_label) lines.push(line("Сценарій", lead.scenario_label));

  const answers = Object.entries(lead.answers ?? {});
  if (answers.length > 0) {
    lines.push("<b>Відповіді:</b>");
    for (const [k, v] of answers.slice(0, 20)) {
      lines.push(`• ${escapeHtml(clip(k, 80))}: ${escapeHtml(clip(v, 200))}`);
    }
  }

  let jawBlocks = 0;
  for (const [jaw, input, calc] of [
    ["upper", lead.upperJawInput, lead.upperJawCalculation],
    ["lower", lead.lowerJawInput, lead.lowerJawCalculation],
  ] as const) {
    if ((input && input.tooth_count > 0) || calc) {
      lines.push(...jawBlock(JAW_LABELS[jaw], input, calc));
      jawBlocks += 1;
    }
  }
  if (jawBlocks === 0) lines.push(...legacyLines(lead));

  lines.push(line("Загальна сума", lead.overallTotal ? formatMoney(lead.overallTotal) : "не розрахована"));
  lines.push(line("Джерело ціни", lead.price_source));
  lines.push(line("Сторінка", lead.page_url));

  const utm = Object.entries(lead.utm ?? {});
  if (utm.length > 0) {
    lines.push(line("UTM", utm.slice(0, 10).map(([k, v]) => `${clip(k, 40)}=${clip(v, 100)}`).join(", ")));
  }
  lines.push(line("Створено", lead.created_at));

  let text = lines.join("\n");
  if (text.length > MAX_MESSAGE) {
    const cut = text.slice(0, MAX_MESSAGE);
    text = `${cut.slice(0, cut.lastIndexOf("\n"))}\n…`;
  }
  return text;
}

/** Заявки v2 (без блоків щелеп) при повторній відправці з адмінки: показуємо те, що є. */
function legacyLines(lead: LeadPayload): string[] {
  const old = lead as unknown as { implant_tier?: string; crown_or_arch_tier?: string; total_uah?: number | null };
  const out: string[] = [];
  const tier = (t?: string) => TIER_LABELS[t as PatientTier] ?? t;
  if (old.implant_tier) out.push(`<b>Рівень імпланта:</b> ${escapeHtml(tier(old.implant_tier))}`);
  if (old.crown_or_arch_tier) out.push(`<b>Рівень коронки/конструкції:</b> ${escapeHtml(tier(old.crown_or_arch_tier))}`);
  if (typeof old.total_uah === "number") out.push(`<b>Сума:</b> ${escapeHtml(formatUah(old.total_uah))}`);
  return out;
}

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface TelegramResult {
  ok: boolean;
  error?: string;
  /** Telegram: звичайну групу перетворено на супергрупу — новий chat id (parameters.migrate_to_chat_id). */
  migrateToChatId?: string;
}

/** Дістає parameters.migrate_to_chat_id з тіла помилки Telegram, якщо воно є. */
export function parseMigrateToChatId(body: string): string | undefined {
  try {
    const id = (JSON.parse(body) as { parameters?: { migrate_to_chat_id?: unknown } })?.parameters?.migrate_to_chat_id;
    return typeof id === "number" || (typeof id === "string" && /^-?\d+$/.test(id)) ? String(id) : undefined;
  } catch {
    return undefined;
  }
}

/** Надсилає повідомлення. Токен ніколи не потрапляє в текст помилки. */
export async function sendTelegramMessage(
  fetchImpl: FetchLike,
  token: string,
  chatId: string,
  text: string,
  timeoutMs = 8000,
): Promise<TelegramResult> {
  const scrub = (s: string) => s.split(token).join("***");
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => "");
    const migrateToChatId = res.status === 400 ? parseMigrateToChatId(body) : undefined;
    return { ok: false, error: scrub(`telegram http ${res.status}: ${body}`).slice(0, 500), migrateToChatId };
  } catch (e) {
    return { ok: false, error: scrub(`telegram request failed: ${(e as Error)?.message ?? String(e)}`).slice(0, 500) };
  }
}
