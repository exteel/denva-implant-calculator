// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { LeadPayload as ContractLead, SubmitLeadResponse } from "../../src/lib/contracts";
import { formatLeadMessage, escapeHtml, formatUah, sendTelegramMessage, isArchLead, parseMigrateToChatId } from "../functions/_shared/telegram";
import type { LeadPayload, FetchLike } from "../functions/_shared/telegram";
import { validateLead } from "../functions/_shared/lead";
import {
  handleSubmitLead, isOriginAllowed, RateLimitedError, PUBLIC_RETRY_WINDOW_MS,
  type HandlerDeps, type LeadStore, type StoredLead,
} from "../functions/_shared/handler";
import { parseNbuDate, parseNbuRate } from "../functions/_shared/nbu";

// Типи функції мають бути взаємно сумісні з контрактом
const _toShared = (l: ContractLead): LeadPayload => l;
const _toContract = (l: LeadPayload): ContractLead => l;
void _toShared; void _toContract;

const lead = (over: Partial<LeadPayload> = {}): LeadPayload => ({
  intent: "refine",
  phone: "+380671234567",
  location: { kind: "city", id: "kyiv", name: "Київ" },
  scenario: { kind: "teeth", count: 3, arrangement: "adjacent" },
  scenario_label: "3 зуби поруч (міст)",
  answers: { teeth: 3, arrangement: "adjacent" },
  implant_tier: "classic",
  crown_or_arch_tier: "minimum",
  total_uah: 123456,
  price_source: "на основі прайсів 3 клінік",
  page_url: "https://exteel.github.io/denva-implant-calculator/calculator/?utm_source=ig",
  utm: { utm_source: "ig", utm_campaign: "autumn" },
  created_at: "2026-10-13T10:00:00.000Z",
  ...over,
});

describe("Telegram: форматування заявки (ТЗ §6.3)", () => {
  it("містить усі поля", () => {
    const t = formatLeadMessage(lead());
    for (const part of [
      "Нова заявка DENVA AI", "Уточнити розрахунок", "+380671234567", "Місто:</b> Київ", "3 зуби поруч (міст)",
      "teeth: 3", "arrangement: adjacent", "Рівень імпланта:</b> Класичний", "Рівень коронки:</b> Мінімальний",
      "123 456 грн", "на основі прайсів 3 клінік", "https://exteel.github.io/denva-implant-calculator/calculator/?utm_source=ig",
      "utm_source=ig, utm_campaign=autumn", "2026-10-13T10:00:00.000Z",
    ]) expect(t, part).toContain(part);
  });

  it("intent «Надіслати розрахунок і питання»; область замість міста", () => {
    const t = formatLeadMessage(lead({ intent: "send_calculation", location: { kind: "region", id: "lvivska", name: "Львівська область" } }));
    expect(t).toContain("Надіслати розрахунок і питання");
    expect(t).toContain("Область:</b> Львівська область");
  });

  it("повна щелепа: перший етап, повне лікування, рівень конструкції", () => {
    const l = lead({ scenario: { kind: "arch", jaws: 1, variant: "all-on-4" }, total_uah: 300000, full_treatment_uah: 480000, crown_or_arch_tier: "premium" });
    expect(isArchLead(l)).toBe(true);
    const t = formatLeadMessage(l);
    expect(t).toContain("Рівень постійної конструкції:</b> Преміальний");
    expect(t).toContain("Сума (перший етап):</b> 300 000 грн");
    expect(t).toContain("Повне лікування:</b> 480 000 грн");
    expect(t).not.toContain("Рівень коронки");
  });

  it("діапазон суми зі scenario.total_range_uah", () => {
    const t = formatLeadMessage(lead({ scenario: { kind: "multi", total_range_uah: [82100, 107400] }, total_uah: 82100 }));
    expect(t.replace(/\u00a0/g, " ")).toContain("Сума:</b> 82 100 грн – 107 400 грн");
  });

  it("7+ зубів (kind seven_plus від калькулятора) — теж повна щелепа, навіть без full_treatment_uah", () => {
    expect(isArchLead(lead({ scenario: { kind: "seven_plus", all_on: 4 }, full_treatment_uah: null }))).toBe(true);
    expect(isArchLead(lead({ scenario: { kind: "multi" }, full_treatment_uah: null }))).toBe(false);
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

  it("escapeHtml / formatUah", () => {
    expect(escapeHtml(`<a href="x">&</a>`)).toBe(`&lt;a href="x"&gt;&amp;&lt;/a&gt;`);
    expect(formatUah(1234567.4)).toBe("1 234 567 грн");
    expect(formatUah(900)).toBe("900 грн");
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

describe("Валідація заявки", () => {
  it("приймає коректну і нормалізує", () => {
    const r = validateLead({ ...lead(), junk: "x" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lead).not.toHaveProperty("junk");
  });
  it("відхиляє короткий телефон, невідомий intent, відсутні поля", () => {
    expect(validateLead(lead({ phone: "12345" }))).toMatchObject({ ok: false });
    expect(validateLead({ ...lead(), intent: "buy" })).toMatchObject({ ok: false });
    const r = validateLead({ intent: "refine", phone: "0671234567" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(3);
    expect(validateLead(null)).toMatchObject({ ok: false });
    expect(validateLead({ ...lead(), implant_tier: "gold" })).toMatchObject({ ok: false });
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
