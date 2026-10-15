/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — Deno / Supabase Edge Runtime (типи Deno недоступні в Node-перевірці репозиторію).
// Webhook бота заявок (verify_jwt = false — Telegram не надсилає JWT; запити
// перевіряються секретом X-Telegram-Bot-Api-Secret-Token). GET ?setup=1
// (повторно безпечний) реєструє webhook на адресу цієї ж функції.
import { botReply, webhookSecret } from "../_shared/bot.ts";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SELF_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-bot`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (!TOKEN) return json({ ok: false, error: "telegram not configured" }, 503);
  const secret = await webhookSecret(TOKEN);
  const url = new URL(req.url);

  if (req.method === "GET" && url.searchParams.get("setup") === "1") {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: SELF_URL, secret_token: secret, allowed_updates: ["message"] }),
    });
    const body = await res.json().catch(() => ({}));
    return json({ ok: Boolean(body.ok), description: body.description ?? null });
  }

  if (req.method !== "POST") return json({ ok: true });
  if (req.headers.get("x-telegram-bot-api-secret-token") !== secret) return json({ ok: false }, 403);

  const update = await req.json().catch(() => null);
  const reply = update ? botReply(update) : null;
  if (reply) {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...reply, disable_web_page_preview: true }),
    }).catch(() => undefined);
  }
  // Always 200 so Telegram doesn't retry the same update forever.
  return json({ ok: true });
});
