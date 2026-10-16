// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { LeadPayload as ContractLead, SubmitLeadResponse } from "../../src/lib/contracts";
import {
  formatLeadMessage, escapeHtml, formatUah, formatMoney, sendTelegramMessage, parseMigrateToChatId,
} from "../functions/_shared/telegram";
import type { FetchLike } from "../functions/_shared/telegram";
import type { JawCalculation, JawInput, LeadPayload } from "../functions/_shared/lead-types";
import { validateLead } from "../functions/_shared/lead";
import {
  handleSubmitLead, isOriginAllowed, RateLimitedError, PUBLIC_RETRY_WINDOW_MS,
  type HandlerDeps, type LeadStore, type StoredLead,
} from "../functions/_shared/handler";
import { parseNbuDate, parseNbuRate } from "../functions/_shared/nbu";

// Типи функції мають бути взаємно сумісні з контрактом v3
const _toShared = (l: ContractLead): LeadPayload => l;
const _toContract = (l: LeadPayload): ContractLead => l;
void _toShared; void _toContract;

const jawInput = (over: Partial<JawInput> = {}): JawInput => ({
  jaw: "upper", tooth_count: 3, location: "adjacent", status: "removed", installed_implant_count: null, scenario: null,
  implant_tier: "classic", crown_or_arch_tier: "minimum", include_temporary: false, ...over,
});
const calc = (over: Partial<JawCalculation> = {}): JawCalculation => ({
  jaw: "upper", tooth_count: 3, scenario: "adjacent", implant_count: { low: 2, high: 2 }, prosthetic_units: 3,
  first_stage: null, permanent_stage: null, total: { low: 123456, high: 123456 }, components: [], alternatives: [], missing_codes: [], ...over,
});
const lead = (over: Partial<LeadPayload> = {}): LeadPayload => ({
  intent: "dental_tender",
  phone: "+380671234567",
  location: { kind: "city", id: "kyiv", name: "Київ" },
  answers: { "Стан зубів": "уже видалені", "Розташування": "поруч" },
  scenario_label: "Верхня: 3 зуби поруч",
  upperJawInput: jawInput(),
  lowerJawInput: null,
  upperJawCalculation: calc(),
  lowerJawCalculation: null,
  overallTotal: { low: 123456, high: 123456 },
  price_source: "Розраховано на основі перевірених прайсів 3 клінік міста",
  page_url: "https://exteel.github.io/denva-implant-calculator/implant-calculator/kyiv/?utm_source=ig",
  utm: { utm_source: "ig", utm_campaign: "autumn" },
  created_at: "2026-10-17T10:00:00.000Z",
  ...over,
});
const plain = (t: string) => t.replace(/\u00a0/g, " ");

describe("Telegram v3: форматування заявки (ТЗ §6.3)", () => {
  it("заголовок: intent, телефон, місто, відповіді; блок щелепи; загальна сума; джерело, URL, UTM", () => {
    const t = plain(formatLeadMessage(lead()));
    for (const part of [
      "Нова заявка DENVA AI", "Запит:</b> Хоче персональні пропозиції клінік (Dental Tender)", "+380671234567",
      "Місто:</b> Київ", "• Стан зубів: уже видалені", "• Розташування: поруч",
      "<b>Верхня щелепа</b>", "• Зубів: 3", "• Сценарій: Зуби поруч (міст)", "• Імплантів: 2",
      "• Рівень імпланта: Класичний", "• Рівень коронки: Мінімальний", "• Разом: 123 456 грн",
      "Загальна сума:</b> 123 456 грн", "Джерело ціни:</b> Розраховано на основі перевірених прайсів 3 клінік міста",
      "https://exteel.github.io/denva-implant-calculator/implant-calculator/kyiv/?utm_source=ig",
      "utm_source=ig, utm_campaign=autumn", "2026-10-17T10:00:00.000Z",
    ]) expect(t, part).toContain(part);
    expect(t).not.toContain("Нижня щелепа");
    // порядок: шапка → відповіді → щелепи → сума → джерело
    expect(t.indexOf("Відповіді")).toBeLessThan(t.indexOf("Верхня щелепа"));
    expect(t.indexOf("Верхня щелепа")).toBeLessThan(t.indexOf("Загальна сума"));
    expect(t.indexOf("Загальна сума")).toBeLessThan(t.indexOf("Джерело ціни"));
  });

  it("intent refine = «Уточнити розрахунок»; область замість міста", () => {
    const t = formatLeadMessage(lead({ intent: "refine", location: { kind: "region", id: "lvivska", name: "Львівська область" } }));
    expect(t).toContain("Запит:</b> Уточнити розрахунок");
    expect(t).toContain("Область:</b> Львівська область");
  });

  it("дві щелепи: окремі блоки з власними рівнями; All-on-N — перший етап, постійна конструкція, разом", () => {
    const t = plain(formatLeadMessage(lead({
      upperJawInput: jawInput({ jaw: "upper", tooth_count: 14, implant_tier: "premium", crown_or_arch_tier: "premium", scenario: "aox4", include_temporary: true }),
      upperJawCalculation: calc({
        scenario: "aox4", tooth_count: 14, implant_count: { low: 4, high: 4 },
        first_stage: { low: 300000, high: 300000 }, permanent_stage: { low: 180000, high: 210000 }, total: { low: 480000, high: 510000 },
      }),
      lowerJawInput: jawInput({ jaw: "lower", tooth_count: 1, implant_tier: "minimum", crown_or_arch_tier: "classic" }),
      lowerJawCalculation: calc({ jaw: "lower", scenario: "single", tooth_count: 1, implant_count: { low: 1, high: 1 }, total: { low: 30000, high: 30000 } }),
      overallTotal: { low: 510000, high: 540000 },
    })));
    const upper = t.slice(t.indexOf("Верхня щелепа"), t.indexOf("Нижня щелепа"));
    const lower = t.slice(t.indexOf("Нижня щелепа"), t.indexOf("Загальна сума"));
    expect(upper).toContain("• Сценарій: All-on-4");
    expect(upper).toContain("• Рівень постійної конструкції: Преміальний");
    expect(upper).not.toContain("Рівень коронки");
    expect(upper).toContain("• Тимчасове протезування: враховано");
    expect(upper).toContain("• Перший етап: 300 000 грн");
    expect(upper).toContain("• Постійна конструкція: 180 000–210 000 грн");
    expect(upper).toContain("• Разом: 480 000–510 000 грн");
    expect(lower).toContain("• Зубів: 1");
    expect(lower).toContain("• Сценарій: Один зуб");
    expect(lower).toContain("• Рівень імпланта: Мінімальний");
    expect(lower).toContain("• Рівень коронки: Класичний");
    expect(lower).not.toContain("Перший етап");
    expect(t).toContain("Загальна сума:</b> 510 000–540 000 грн");
  });

  it("лише нижня щелепа; діапазон кількості імплантів; без ціни — «розрахунок недоступний»", () => {
    const t = plain(formatLeadMessage(lead({
      upperJawInput: jawInput({ jaw: "upper", tooth_count: 0 }), upperJawCalculation: null,
      lowerJawInput: jawInput({ jaw: "lower", tooth_count: 4 }),
      lowerJawCalculation: calc({ jaw: "lower", scenario: "adjacent_or_separate", implant_count: { low: 2, high: 4 }, total: { low: 80000, high: 120000 } }),
      overallTotal: { low: 80000, high: 120000 },
    })));
    expect(t).not.toContain("Верхня щелепа");
    expect(t).toContain("• Імплантів: 2–4");
    expect(t).toContain("• Сценарій: Діапазон: поруч або окремо");
    const noPrice = plain(formatLeadMessage(lead({ upperJawCalculation: null, overallTotal: null })));
    expect(noPrice).toContain("• Розрахунок: недоступний (бракує цін)");
    expect(noPrice).toContain("Загальна сума:</b> не розрахована");
  });

  it("стара заявка v2 (без блоків щелеп) не ламає відправку", () => {
    const legacy = { intent: "send_calculation", phone: "0671234567", location: { kind: "city", id: "kyiv", name: "Київ" },
      answers: {}, implant_tier: "classic", crown_or_arch_tier: "minimum", total_uah: 99000, price_source: "x", page_url: "u", utm: {},
      created_at: "2026-10-13T10:00:00Z", scenario_label: "1 зуб" } as unknown as LeadPayload;
    const t = plain(formatLeadMessage(legacy));
    expect(t).toContain("Надіслати розрахунок і питання");
    expect(t).toContain("Рівень імпланта:</b> Класичний");
    expect(t).toContain("Сума:</b> 99 000 грн");
  });

  it("екранує HTML у всіх вільних полях", () => {
    const t = formatLeadMessage(lead({
      phone: "<b>0671234567</b>",
      scenario_label: "a & b <script>alert(1)</script>",
      answers: { "<k>": "x<y>&z" },
      price_source: "<i>src</i>",
      page_url: "https://x.test/?a=1&b=<2>",
      utm: { "u<": "v>&" },
      location: { kind: "city", id: "x", name: "М<i>істо" },
    }));
    expect(t).not.toMatch(/<script|<k>|<i>src|<2>|<\/b>0671234567/);
    expect(t).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(t).toContain("&lt;k&gt;: x&lt;y&gt;&amp;z");
    expect(t).toContain("a=1&amp;b=&lt;2&gt;");
    // жодних сторонніх тегів: лише наші <b>…</b>
    const tags = t.match(/<[^>]+>/g) ?? [];
    expect(new Set(tags)).toEqual(new Set(["<b>", "</b>"]));
  });

  it("не перевищує ліміт Telegram", () => {
    const answers = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`q${i}`, "я".repeat(250)]));
    expect(formatLeadMessage(lead({ answers })).length).toBeLessThanOrEqual(4096);
  });

  it("escapeHtml / formatUah / formatMoney", () => {
    expect(escapeHtml(`<a href="x">&</a>`)).toBe(`&lt;a href="x"&gt;&amp;&lt;/a&gt;`);
    expect(plain(formatUah(1234567.4))).toBe("1 234 567 грн");
    expect(plain(formatMoney({ low: 100000.2, high: 100000.4 }))).toBe("100 000 грн");
    expect(plain(formatMoney({ low: 100000, high: 120500 }))).toBe("100 000–120 500 грн");
  });

  it("sendTelegramMessage: HTML parse mode, токен не витікає в помилку", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const ok: FetchLike = async (url, init) => {
      calls.push({ url, body: JSON.parse(init?.body ?? "{}") });
      return { ok: true, status: 200, text: async () => "{}" };
    };
    expect(await sendTelegramMessage(ok, "SECRET", "-100", "hi")).toEqual({ ok: true });
    expect(calls[0].url).toBe("https://api.telegram.org/botSECRET/sendMessage");
    expect(calls[0].body).toMatchObject({ chat_id: "-100", text: "hi", parse_mode: "HTML" });

    const bad: FetchLike = async () => ({ ok: false, status: 401, text: async () => "Unauthorized token SECRET" });
    const r1 = await sendTelegramMessage(bad, "SECRET", "-100", "hi");
    expect(r1.ok).toBe(false);
    expect(r1.error).toContain("401");
    expect(r1.error).not.toContain("SECRET");
    const boom: FetchLike = async () => { throw new Error("connect to botSECRET failed"); };
    const r2 = await sendTelegramMessage(boom, "SECRET", "-100", "hi");
    expect(r2.error).not.toContain("SECRET");
  });
});

describe("Валідація заявки v3", () => {
  it("приймає коректну, відкидає сторонні поля", () => {
    const r = validateLead({ ...lead(), junk: "x" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lead).not.toHaveProperty("junk");
      expect(r.lead.upperJawCalculation?.total).toEqual({ low: 123456, high: 123456 });
    }
  });

  it("intent: dental_tender і refine; старий send_calculation відхиляється", () => {
    expect(validateLead(lead({ intent: "refine" })).ok).toBe(true);
    expect(validateLead({ ...lead(), intent: "send_calculation" }).ok).toBe(false);
    expect(validateLead({ ...lead(), intent: "buy" }).ok).toBe(false);
  });

  it("телефон ≥ 10 цифр, обов'язкові поля, джерело ціни", () => {
    expect(validateLead(lead({ phone: "12345" })).ok).toBe(false);
    const r = validateLead({ intent: "refine", phone: "0671234567" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(2);
    expect(validateLead(null).ok).toBe(false);
    expect(validateLead(lead({ price_source: "" })).ok).toBe(false);
  });

  it("щелепи: tooth_count 0–14, хоча б одна активна, рівні лише для активної щелепи", () => {
    expect(validateLead(lead({ upperJawInput: jawInput({ tooth_count: 15 }) })).ok).toBe(false);
    expect(validateLead(lead({ upperJawInput: jawInput({ tooth_count: 2.5 }) })).ok).toBe(false);
    expect(validateLead(lead({ upperJawInput: jawInput({ tooth_count: 0 }), lowerJawInput: null })).ok).toBe(false);
    expect(validateLead(lead({ upperJawInput: null, lowerJawInput: null })).ok).toBe(false);
    expect(validateLead({ ...lead(), upperJawInput: { ...jawInput(), implant_tier: "gold" } }).ok).toBe(false);
    // 0 зубів: рівні не обов'язкові
    const zero = validateLead({ ...lead(), upperJawInput: { jaw: "upper", tooth_count: 0 }, lowerJawInput: jawInput({ jaw: "lower", tooth_count: 2 }),
      lowerJawCalculation: calc({ jaw: "lower" }) });
    expect(zero.ok).toBe(true);
    // jaw має відповідати полю
    expect(validateLead({ ...lead(), upperJawInput: { ...jawInput(), jaw: "lower" } }).ok).toBe(false);
  });

  it("розрахунок і сума: коректні діапазони, інакше помилка", () => {
    expect(validateLead(lead({ overallTotal: { low: 10, high: 5 } })).ok).toBe(false);
    expect(validateLead(lead({ overallTotal: { low: -1, high: 5 } })).ok).toBe(false);
    expect(validateLead(lead({ overallTotal: null })).ok).toBe(true);
    expect(validateLead({ ...lead(), upperJawCalculation: { scenario: "x" } }).ok).toBe(false);
    expect(validateLead({ ...lead(), upperJawCalculation: { ...calc(), total: "100" } }).ok).toBe(false);
    const withAlt = validateLead(lead({ upperJawCalculation: calc({ alternatives: [calc(), calc({ scenario: "aox4" })] }) }));
    expect(withAlt.ok && withAlt.lead.upperJawCalculation?.alternatives).toHaveLength(2);
  });
});

describe("handleSubmitLead", () => {
  const stored = (over: Partial<StoredLead> = {}): StoredLead => ({
    id: "11111111-1111-4111-8111-111111111111", payload: lead(), telegram_status: "failed", attempts: 1,
    created_at: new Date().toISOString(), ...over,
  });

  function setup(opts: { tg?: "ok" | "fail" | "none"; rate?: boolean; row?: StoredLead | null; admin?: boolean; override?: string | null; migrate?: boolean } = {}) {
    const statuses: { id: string; status: string; error?: string }[] = [];
    const sent: string[] = [];
    const chats: string[] = [];
    const store: LeadStore = {
      insertLead: vi.fn(async () => {
        if (opts.rate) throw new RateLimitedError();
        return { lead_id: "22222222-2222-4222-8222-222222222222" };
      }),
      getLead: vi.fn(async () => (opts.row === undefined ? stored() : opts.row)),
      setTelegramStatus: vi.fn(async (id, status, error) => { statuses.push({ id, status, error }); }),
      getChatIdOverride: vi.fn(async () => opts.override ?? null),
      setChatIdOverride: vi.fn(async () => undefined),
    };
    const deps: HandlerDeps = {
      store,
      validateLead,
      formatMessage: formatLeadMessage,
      sendMessage: async (_f, _t, chat, text) => {
        sent.push(text);
        chats.push(chat);
        if (opts.migrate && chat === "c") return { ok: false, error: "telegram http 400", migrateToChatId: "-1001234567890" };
        return opts.tg === "fail" ? { ok: false, error: "telegram http 500" } : { ok: true };
      },
      fetch: async () => ({ ok: true, status: 200, text: async () => "" }),
      isAdmin: async () => Boolean(opts.admin),
      env: opts.tg === "none" ? {} : { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "c" },
    };
    return { deps, statuses, sent, chats, store };
  }
  const post = (body: unknown, extra: Record<string, unknown> = {}) => ({ method: "POST", origin: "https://exteel.github.io", body, ...extra });

  it("успіх: зберігає, шле в Telegram, відповідає SubmitLeadResponse", async () => {
    const { deps, statuses, sent } = setup();
    const res = await handleSubmitLead(post({ lead: lead() }), deps);
    expect(res.status).toBe(200);
    const body = res.body as SubmitLeadResponse;
    expect(body).toEqual({ lead_id: "22222222-2222-4222-8222-222222222222", telegram: "sent" });
    expect(sent).toHaveLength(1);
    expect(statuses).toEqual([{ id: body.lead_id, status: "sent", error: undefined }]);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://exteel.github.io");
  });

  it("збій Telegram → 200, telegram: failed, заявка збережена", async () => {
    const { deps, statuses, store } = setup({ tg: "fail" });
    const res = await handleSubmitLead(post({ lead: lead() }), deps);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ telegram: "failed" });
    expect(store.insertLead).toHaveBeenCalledOnce();
    expect(statuses[0]).toMatchObject({ status: "failed", error: "telegram http 500" });
  });

  it("групу мігровано в супергрупу: повтор з новим chat id і збереження override", async () => {
    const { deps, chats, store, statuses } = setup({ migrate: true });
    const res = await handleSubmitLead(post({ lead: lead() }), deps);
    expect(res.body).toMatchObject({ telegram: "sent" });
    expect(chats).toEqual(["c", "-1001234567890"]);
    expect(store.setChatIdOverride).toHaveBeenCalledWith("-1001234567890");
    expect(statuses[0].status).toBe("sent");
  });

  it("збережений override має пріоритет над секретом і міграція не зациклюється", async () => {
    const a = setup({ override: "-1001234567890", migrate: true });
    await handleSubmitLead(post({ lead: lead() }), a.deps);
    expect(a.chats).toEqual(["-1001234567890"]);
    expect(a.store.setChatIdOverride).not.toHaveBeenCalled();
    // якщо новий chat id теж відповідає міграцією на себе — один повтор, без циклу
    const b = setup({ migrate: true });
    b.deps.sendMessage = async (_f, _t, chat) => { b.chats.push(chat); return { ok: false, error: "x", migrateToChatId: "-100999" }; };
    const res = await handleSubmitLead(post({ lead: lead() }), b.deps);
    expect(b.chats).toEqual(["c", "-100999"]);
    expect(res.body).toMatchObject({ telegram: "failed" });
  });

  it("parseMigrateToChatId / sendTelegramMessage розпізнають migrate_to_chat_id", async () => {
    const body = JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: group chat was upgraded to a supergroup chat", parameters: { migrate_to_chat_id: -1001234567890 } });
    expect(parseMigrateToChatId(body)).toBe("-1001234567890");
    expect(parseMigrateToChatId("not json")).toBeUndefined();
    expect(parseMigrateToChatId("{}")).toBeUndefined();
    const f: FetchLike = async () => ({ ok: false, status: 400, text: async () => body });
    expect(await sendTelegramMessage(f, "T", "-5583246047", "hi")).toMatchObject({ ok: false, migrateToChatId: "-1001234567890" });
    const f403: FetchLike = async () => ({ ok: false, status: 403, text: async () => body });
    expect((await sendTelegramMessage(f403, "T", "c", "hi")).migrateToChatId).toBeUndefined();
  });

  it("немає секретів → failed з «telegram not configured»", async () => {
    const { deps, statuses, sent } = setup({ tg: "none" });
    const res = await handleSubmitLead(post({ lead: lead() }), deps);
    expect(res.body).toMatchObject({ telegram: "failed" });
    expect(sent).toHaveLength(0);
    expect(statuses[0]).toMatchObject({ status: "failed", error: "telegram not configured" });
  });

  it("помилка запису статусу не ламає відповідь", async () => {
    const { deps, store } = setup();
    (store.setTelegramStatus as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("db down"));
    const res = await handleSubmitLead(post({ lead: lead() }), deps);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ telegram: "sent" });
  });

  it("валідація → 400; ліміт → 429; збій БД → 500 (у Telegram нічого не йде)", async () => {
    const a = setup();
    expect((await handleSubmitLead(post({ lead: lead({ phone: "123" }) }), a.deps)).status).toBe(400);
    expect((await handleSubmitLead(post({}), a.deps)).status).toBe(400);
    expect((await handleSubmitLead(post("x"), a.deps)).status).toBe(400);
    const b = setup({ rate: true });
    const res = await handleSubmitLead(post({ lead: lead() }), b.deps);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "rate_limited" });
    expect(b.sent).toHaveLength(0);
    const c = setup();
    (c.store.insertLead as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("db"));
    expect((await handleSubmitLead(post({ lead: lead() }), c.deps)).status).toBe(500);
    expect(c.sent).toHaveLength(0);
  });

  it("CORS: GitHub Pages і localhost дозволені, чужі — 403; OPTIONS → 204", async () => {
    expect(isOriginAllowed("https://exteel.github.io")).toBe(true);
    expect(isOriginAllowed("http://localhost:3000")).toBe(true);
    expect(isOriginAllowed("http://127.0.0.1:4173")).toBe(true);
    expect(isOriginAllowed("https://evil.example")).toBe(false);
    expect(isOriginAllowed("https://exteel.github.io.evil.example")).toBe(false);
    const { deps } = setup();
    expect((await handleSubmitLead({ method: "POST", origin: "https://evil.example", body: { lead: lead() } }, deps)).status).toBe(403);
    const pre = await handleSubmitLead({ method: "OPTIONS", origin: "http://localhost:3000", body: null }, deps);
    expect(pre.status).toBe(204);
    expect(pre.headers["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
    expect(pre.headers["Access-Control-Allow-Headers"]).toContain("authorization");
    expect((await handleSubmitLead({ method: "GET", origin: null, body: null }, deps)).status).toBe(405);
  });

  it("retry_lead_id: свіжа заявка — повторна відправка", async () => {
    const { deps, statuses } = setup({ row: stored() });
    const res = await handleSubmitLead(post({ retry_lead_id: stored().id }), deps);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ lead_id: stored().id, telegram: "sent" });
    expect(statuses[0].status).toBe("sent");
  });

  it("retry: публічний виклик лише для заявки не старшої за годину; адмін (JWT) — будь-якої", async () => {
    const old = stored({ created_at: new Date(Date.now() - PUBLIC_RETRY_WINDOW_MS - 60_000).toISOString() });
    const pub = setup({ row: old });
    const denied = await handleSubmitLead(post({ retry_lead_id: old.id }), pub.deps);
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: "retry_window_expired" });
    expect(pub.sent).toHaveLength(0);
    // Authorization з не-адмін токеном (anon-ключ) не дає прав
    const anon = setup({ row: old, admin: false });
    expect((await handleSubmitLead(post({ retry_lead_id: old.id }, { authorization: "Bearer anon" }), anon.deps)).status).toBe(403);
    const adm = setup({ row: old, admin: true });
    const ok = await handleSubmitLead(post({ retry_lead_id: old.id }, { authorization: "Bearer adminjwt" }), adm.deps);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ telegram: "sent" });
    expect(adm.sent).toHaveLength(1);
  });

  it("retry: уже надіслану не шлемо вдруге; ліміт спроб для публічних; 404; невалідний id", async () => {
    const sentRow = setup({ row: stored({ telegram_status: "sent" }) });
    expect((await handleSubmitLead(post({ retry_lead_id: stored().id }), sentRow.deps)).body).toMatchObject({ telegram: "sent" });
    expect(sentRow.sent).toHaveLength(0);
    const many = setup({ row: stored({ attempts: 10 }) });
    expect((await handleSubmitLead(post({ retry_lead_id: stored().id }), many.deps)).status).toBe(429);
    expect((await handleSubmitLead(post({ retry_lead_id: stored().id }), setup({ row: null }).deps)).status).toBe(404);
    expect((await handleSubmitLead(post({ retry_lead_id: "nope" }), setup().deps)).status).toBe(400);
  });
});

describe("nbu-rate: розбір відповіді НБУ", () => {
  it("парсить курс і дату", () => {
    const json = [{ r030: 978, txt: "Євро", rate: 50.1385, cc: "EUR", exchangedate: "09.10.2026" }];
    expect(parseNbuRate(json, "EUR")).toEqual({ currency: "EUR", rate_to_uah: 50.1385, rate_date: "2026-10-09" });
    expect(parseNbuRate(json, "USD")).toBeNull();
    expect(parseNbuRate([{ cc: "EUR", rate: -1, exchangedate: "09.10.2026" }], "EUR")).toBeNull();
    expect(parseNbuRate({}, "EUR")).toBeNull();
    expect(parseNbuDate("31.02.2026")).toBeNull();
    expect(parseNbuDate("2026-10-09")).toBeNull();
  });
});
