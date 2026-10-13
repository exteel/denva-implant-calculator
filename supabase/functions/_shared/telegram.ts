/**
 * Повідомлення про заявку для Telegram (ТЗ §6.3) — чистий TypeScript, без Deno-специфіки,
 * щоб його можна було тестувати у Vitest і виконувати в Edge Functions.
 *
 * Типи заявки дзеркалять `LeadPayload` із src/lib/contracts.ts (сумісність перевіряє
 * supabase/tests/functions.test.ts). Імпорту з src/ немає навмисно: функція деплоїться
 * з каталогу supabase/functions без решти репозиторію.
 */

export type PatientTier = "minimum" | "classic" | "premium";
export type LeadIntent = "refine" | "send_calculation";

export interface LeadPayload {
  intent: LeadIntent;
  phone: string;
  location: { kind: "city" | "region"; id: string; name: string };
  scenario: Record<string, unknown>;
  scenario_label: string;
  answers: Record<string, string | number>;
  implant_tier: PatientTier;
  crown_or_arch_tier: PatientTier;
  total_uah: number | null;
  full_treatment_uah?: number | null;
  price_source: string;
  page_url: string;
  utm: Record<string, string>;
  created_at: string;
}

export const INTENT_LABELS: Record<LeadIntent, string> = {
  refine: "Уточнити розрахунок",
  send_calculation: "Надіслати розрахунок і питання",
};

export const TIER_LABELS: Record<PatientTier, string> = {
  minimum: "Мінімальний",
  classic: "Класичний",
  premium: "Преміальний",
};

/** Telegram HTML parse mode: екрануємо лише & < >. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 123456 → «123 456 грн» (нерозривні пробіли). */
export function formatUah(value: number): string {
  const n = Math.round(value);
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return `${n < 0 ? "-" : ""}${digits}\u00a0грн`;
}

/** Повна щелепа: показуємо також повне лікування, а рівень коронки замінюється рівнем конструкції. */
export function isArchLead(lead: Pick<LeadPayload, "scenario" | "full_treatment_uah">): boolean {
  // Калькулятор (src/engine/v2) шле kind "arch" або "seven_plus" (теж All-on-N); full_treatment_uah
  // буває null, коли бракує ціни постійної конструкції — тож покладатися лише на нього не можна.
  const kind = String(lead.scenario?.kind ?? "");
  return lead.full_treatment_uah != null || /arch|jaw|all[-_ ]?on|seven[-_ ]?plus/i.test(kind);
}

const clip = (value: unknown, max = 300): string => {
  const s = String(value ?? "").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

const MAX_MESSAGE = 4000; // ліміт Telegram — 4096

export function formatLeadMessage(lead: LeadPayload): string {
  const arch = isArchLead(lead);
  const line = (label: string, value: unknown) => `<b>${label}:</b> ${escapeHtml(clip(value))}`;

  const lines: string[] = [
    "<b>Нова заявка DENVA AI</b>",
    line("Запит", INTENT_LABELS[lead.intent] ?? lead.intent),
    line("Телефон", lead.phone),
    line(lead.location.kind === "region" ? "Область" : "Місто", lead.location.name),
    line("Сценарій", lead.scenario_label),
  ];

  const answers = Object.entries(lead.answers ?? {});
  if (answers.length > 0) {
    lines.push("<b>Відповіді:</b>");
    for (const [k, v] of answers.slice(0, 20)) {
      lines.push(`• ${escapeHtml(clip(k, 80))}: ${escapeHtml(clip(v, 200))}`);
    }
  }

  lines.push(line("Рівень імпланта", TIER_LABELS[lead.implant_tier] ?? lead.implant_tier));
  lines.push(
    line(arch ? "Рівень постійної конструкції" : "Рівень коронки", TIER_LABELS[lead.crown_or_arch_tier] ?? lead.crown_or_arch_tier),
  );

  // Діапазон (напр. «зуби поруч» … «окремі імпланти»): калькулятор кладе його в scenario.total_range_uah,
  // а total_uah — нижня межа.
  const range = lead.scenario?.total_range_uah;
  const hasRange =
    Array.isArray(range) && range.length === 2 && range.every((v) => typeof v === "number" && Number.isFinite(v)) &&
    (range[1] as number) > (range[0] as number);
  if (hasRange) {
    lines.push(line(arch ? "Сума (перший етап)" : "Сума", `${formatUah(range[0] as number)} – ${formatUah(range[1] as number)}`));
  } else if (lead.total_uah != null) {
    lines.push(line(arch ? "Сума (перший етап)" : "Сума", formatUah(lead.total_uah)));
  } else {
    lines.push(line("Сума", "не розрахована"));
  }
  if (arch && lead.full_treatment_uah != null) {
    lines.push(line("Повне лікування", formatUah(lead.full_treatment_uah)));
  }

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
