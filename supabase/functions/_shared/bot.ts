/**
 * Replies of the leads bot (@denva_ai_leads_bot). The bot's job is to post
 * leads into the team group; when someone opens it directly it explains
 * where the leads are, instead of staying silent.
 */

export interface TelegramUpdate {
  message?: {
    chat: { id: number; type: string };
    text?: string;
  };
}

export interface BotReply {
  chat_id: number;
  text: string;
}

export const CALCULATOR_URL = "https://exteel.github.io/denva-implant-calculator/";

export const PRIVATE_GREETING = [
  "Вітаю! Це бот заявок калькулятора імплантації DENVA AI.",
  "",
  "Нові заявки з калькулятора автоматично надходять у робочу групу «DENVA — заявки». Щоб їх бачити, попросіть адміністратора додати вас у цю групу.",
  "",
  `Калькулятор: ${CALCULATOR_URL}`,
].join("\n");

export const GROUP_HELP =
  "Я надсилаю сюди нові заявки з калькулятора імплантації DENVA AI. Окремо нічого робити не потрібно.";

/** `/start`, `/help`, optionally addressed as `/start@denva_ai_leads_bot`. */
function isCommand(text: string | undefined, ...names: string[]): boolean {
  const first = (text ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const bare = first.split("@")[0];
  return names.includes(bare);
}

export function botReply(update: TelegramUpdate): BotReply | null {
  const message = update.message;
  if (!message) return null;
  const { chat, text } = message;
  if (chat.type === "private") return { chat_id: chat.id, text: PRIVATE_GREETING };
  // Groups: answer only explicit commands — never chatter on every message.
  if (isCommand(text, "/start", "/help")) return { chat_id: chat.id, text: GROUP_HELP };
  return null;
}

/** Webhook secret derived from the bot token, so nothing extra must be stored. */
export async function webhookSecret(botToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${botToken}:webhook`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}
