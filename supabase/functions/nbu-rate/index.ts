/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — Deno / Supabase Edge Runtime.
// Щоденне оновлення курсів НБУ (EUR, USD → UAH) у currency_rates.
// Виклик: POST із заголовком `Authorization: Bearer <SERVICE_ROLE_KEY>` (див. supabase/README.md — розклад).
import { createClient } from "npm:@supabase/supabase-js@2";
import { NBU_URL, parseNbuRate } from "../_shared/nbu.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey || req.headers.get("authorization") !== `Bearer ${serviceKey}`) {
    return json(401, { error: "unauthorized" });
  }

  const rates = [];
  const errors = [];
  for (const code of ["EUR", "USD"]) {
    try {
      const res = await fetch(NBU_URL(code), { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`NBU http ${res.status}`);
      const rate = parseNbuRate(await res.json(), code);
      if (!rate) throw new Error("unexpected NBU response");
      rates.push(rate);
    } catch (e) {
      errors.push({ currency: code, error: String(e?.message ?? e) });
    }
  }

  if (rates.length > 0) {
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), serviceKey, { auth: { persistSession: false } });
    const { error } = await supabase.from("currency_rates").upsert(rates, { onConflict: "currency,rate_date" });
    if (error) return json(500, { error: error.message, rates });
  }
  return json(errors.length > 0 ? 502 : 200, { rates, errors });
});
