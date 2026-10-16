/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — Deno / Supabase Edge Runtime (типи Deno недоступні в Node-перевірці репозиторію).
// Публічний API розрахунку (ТЗ §8.1, verify_jwt = false). Логіка — у _shared/calculate.ts,
// рушій — згенерована копія src/engine/v3 (scripts/sync-engine.mjs).
import { createClient } from "npm:@supabase/supabase-js@2";
import { CalculateInputError, handleCalculate } from "../_shared/calculate.ts";
import { corsHeaders } from "../_shared/handler.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), {
  auth: { persistSession: false },
});

async function fetchPrices(kind, id) {
  const { data, error } = await supabase.rpc("get_location_prices", { p_kind: kind, p_id: id });
  if (error) throw new Error(error.message);
  return data ?? null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = { ...corsHeaders(origin, Deno.env.get("ALLOWED_ORIGINS")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers });
  try {
    const body = await req.json().catch(() => null);
    const result = await handleCalculate(body, fetchPrices);
    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (e) {
    const status = e instanceof CalculateInputError ? 400 : 500;
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status, headers });
  }
});
