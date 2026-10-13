/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — Deno / Supabase Edge Runtime (типи Deno недоступні в Node-перевірці репозиторію).
// Публічна функція (verify_jwt = false): форма заявки на GitHub Pages. Логіка — у _shared/handler.ts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleSubmitLead, RateLimitedError } from "../_shared/handler.ts";
import { validateLead } from "../_shared/lead.ts";
import { formatLeadMessage, sendTelegramMessage } from "../_shared/telegram.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const store = {
  async insertLead(lead) {
    const { data, error } = await supabase.rpc("submit_lead_record", { p_payload: lead });
    if (error) {
      if (String(error.message).includes("rate_limited")) throw new RateLimitedError();
      throw new Error(error.message);
    }
    return { lead_id: data.lead_id };
  },
  async getLead(id) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, payload, telegram_status, attempts, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
  async getChatIdOverride() {
    const { data } = await supabase.from("settings").select("telegram_chat_id_override").maybeSingle();
    return data?.telegram_chat_id_override ?? null;
  },
  async setChatIdOverride(chatId) {
    const { error } = await supabase.from("settings").update({ telegram_chat_id_override: chatId }).eq("id", true);
    if (error) throw new Error(error.message);
  },
  async setTelegramStatus(id, status, errorText) {
    const { error } = await supabase.rpc("update_lead_telegram_status", {
      p_lead_id: id,
      p_status: status,
      p_error: errorText ?? null,
    });
    if (error) throw new Error(error.message);
  },
};

// Чи належить JWT з Authorization адміністратору (anon-ключ чи сміття → false).
async function isAdmin(authorization) {
  const token = /^Bearer (.+)$/i.exec(authorization ?? "")?.[1];
  if (!token) return false;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return false;
  const { data: row } = await supabase.from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return Boolean(row);
}

Deno.serve(async (req) => {
  let body = null;
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      body = null;
    }
  }
  const res = await handleSubmitLead(
    { method: req.method, origin: req.headers.get("origin"), authorization: req.headers.get("authorization"), body },
    {
      store,
      validateLead,
      formatMessage: formatLeadMessage,
      sendMessage: sendTelegramMessage,
      fetch: (url, init) => fetch(url, init),
      isAdmin,
      env: {
        TELEGRAM_BOT_TOKEN: Deno.env.get("TELEGRAM_BOT_TOKEN"),
        TELEGRAM_CHAT_ID: Deno.env.get("TELEGRAM_CHAT_ID"),
        ALLOWED_ORIGINS: Deno.env.get("ALLOWED_ORIGINS"),
      },
    },
  );
  return new Response(res.body === null ? null : JSON.stringify(res.body), { status: res.status, headers: res.headers });
});
