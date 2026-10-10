import { test as base, expect, type Locator, type Page } from "@playwright/test";

/**
 * E2E click-through for the S02 "teeth" branches (ТЗ §6.1–6.4), the result
 * page (§11/§13), the comparison flow (§14) and Q00 routing (§15).
 *
 * Everything is self-contained in this file (no shared helpers).
 */

// ───────────────────────── fixture: fail on console / page errors ─────────────────────────

const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      errors.push(`console.error: ${m.text()} @ ${m.location().url}`);
    });
    await use(page);
    expect(errors, "console / page errors").toEqual([]);
  },
});

// ───────────────────────── constants ─────────────────────────

const TEETH_Q = "Скільки зубів потрібно відновити?";
const SINGLE_Q = "Що зараз із цим зубом?";
const SYSTEM_Q = "Чи відома система імпланта (є паспорт імпланта)?";
const OLD_Q = "Що саме турбує?";
const ADJ_2_3_Q = "Скільки зубів поруч потрібно відновити?";
const ADJ_STATE_Q = "Який зараз стан цих зубів?";
const SEP_COUNT_Q = "Скільки зубів у різних місцях потрібно відновити?";
const SEP_STATE_Q = "Який зараз стан цих зубів?";
const EXISTING_Q = "Скільки імплантів уже встановлено?";
const Q00 = "Що у вас уже є?";

const CTA = {
  massExtraction: "Перевірити план перед лікуванням",
  unclearOffer: "Розібрати мою пропозицію по пунктах",
  plan: "Перевірити мій план",
  ct: "Перевірити ситуацію за КТ",
  consultation: "Розібрати мою ситуацію",
  tender: "Отримати пропозиції від клінік",
} as const;
const CTA_LABELS: string[] = Object.values(CTA);

type Step = [question: string, option: string];

// ───────────────────────── page helpers ─────────────────────────

async function selectCity(page: Page, city: string) {
  await page.goto("/calculator/");
  await page.waitForLoadState("load");
  const input = page.getByPlaceholder("Почніть вводити назву міста");
  await expect(input).toBeVisible();
  await expect(async () => {
    await input.fill(city);
    await page.getByRole("button", { name: city, exact: true }).click({ timeout: 1500 });
    await expect(page.locator("main h1")).toHaveText(TEETH_Q, { timeout: 1500 });
  }).toPass({ timeout: 15_000 });
}

async function selectOblast(page: Page, oblast: string) {
  await page.goto("/calculator/");
  await page.waitForLoadState("load");
  const link = page.getByRole("button", { name: "Мого міста немає — оберу область" });
  await expect(async () => {
    await link.click({ timeout: 1500 });
    await page.getByRole("button", { name: oblast, exact: true }).click({ timeout: 1500 });
    await expect(page.locator("main h1")).toHaveText(TEETH_Q, { timeout: 1500 });
  }).toPass({ timeout: 15_000 });
}

async function runSteps(page: Page, steps: Step[]) {
  for (const [question, option] of steps) {
    await expect(page.locator("main h1")).toHaveText(question);
    await page.getByRole("button", { name: option, exact: true }).click();
  }
}

/** Answers Q00: `null` → "Пропустити", otherwise ticks the given checkboxes. */
async function answerQ00(page: Page, picks: string[] | null) {
  await expect(page.locator("main h1")).toHaveText(Q00);
  if (picks === null) {
    await page.getByRole("button", { name: "Пропустити", exact: true }).click();
  } else {
    for (const label of picks) await page.getByRole("checkbox", { name: label, exact: true }).check();
    await page.getByRole("button", { name: "Показати результат", exact: true }).click();
  }
  await expect(page.getByText("Що робити далі", { exact: true })).toBeVisible();
}

async function toResult(page: Page, city: string, steps: Step[], picks: string[] | null = null) {
  await selectCity(page, city);
  await runSteps(page, steps);
  await answerQ00(page, picks);
}

const mainText = (page: Page) => page.locator("main").innerText();

// ───────────────────────── price parsing ─────────────────────────

type Range = [number, number];
const toNum = (s: string) => Number(s.replace(/\D/g, ""));

function parseRanges(text: string): Range[] {
  const out: Range[] = [];
  for (const m of text.matchAll(/(\d+(?:[   ]\d{3})*)–(\d+(?:[   ]\d{3})*)\s*грн/g)) out.push([toNum(m[1]), toNum(m[2])]);
  return out;
}

const lastRange = (text: string): Range => {
  const r = parseRanges(text);
  expect(r.length, `no "грн" range in: ${text}`).toBeGreaterThan(0);
  return r[r.length - 1];
};

const cardsLocator = (page: Page) =>
  page.getByRole("radiogroup", { name: "Ринковий сегмент" }).getByRole("radio");

async function readCards(page: Page) {
  const cards = cardsLocator(page);
  await expect(cards).toHaveCount(3);
  const out: { label: string; text: string; total: Range; ranges: Range[] }[] = [];
  for (let i = 0; i < 3; i++) {
    const text = await cards.nth(i).innerText();
    const ranges = parseRanges(text);
    out.push({
      label: text.split("\n")[0].trim(),
      text,
      ranges,
      total: ranges[ranges.length - 1] ?? [NaN, NaN],
    });
  }
  return out;
}

const cardsSignature = async (page: Page) => (await readCards(page)).map((c) => c.text).join("|");

/** "Ваш варіант" price in the package customiser. */
async function customTotal(page: Page): Promise<Range> {
  const block = page.getByText("Ваш варіант", { exact: true }).locator("..");
  return lastRange(await block.innerText());
}

const ctaBlock = (page: Page) => page.getByText("Що робити далі", { exact: true }).locator("..");

async function ctaLabelOf(page: Page): Promise<string> {
  const text = await ctaBlock(page).innerText();
  const found = CTA_LABELS.filter((l) => text.includes(l));
  expect(found, `exactly one CTA label expected in dark block, got: ${text}`).toHaveLength(1);
  await expect(ctaBlock(page).getByRole("button")).toHaveCount(1);
  return found[0];
}

// ───────────────────────── leaf model ─────────────────────────

interface Leaf {
  name: string;
  steps: Step[];
  kind: "priced" | "no_basket";
  title: string;
  /** number of scenario tabs expected (0 = no tablist) */
  tabs: number;
  mass?: boolean;
  unsure?: boolean;
  /** "Потрібна тимчасова коронка" checkbox expected */
  temp?: boolean;
  /** scenarios are full-arch (stage rows instead of one range per card) */
  arch?: boolean;
  /** referenceNote card "На чому базується оцінка" expected */
  refNote?: boolean;
  /** comparison card "Вам уже назвали вартість?" expected */
  comparison?: boolean;
}

async function checkLeaf(page: Page, leaf: Leaf) {
  await expect(page.getByText("Що робити далі", { exact: true })).toBeVisible();

  // heading + title
  const h1 = page.locator("main h1");
  await expect(h1).toHaveCount(1);
  await expect(h1).toHaveText(leaf.title);

  // bad tokens / wording
  const visible = await mainText(page);
  const all = (await page.locator("main").textContent()) ?? "";
  for (const text of [visible, all]) {
    expect(text).not.toMatch(/\bNaN\b/);
    expect(text).not.toMatch(/undefined/);
    expect(text).not.toMatch(/\bnull\b/);
    expect(text).not.toMatch(/переплач/i);
    expect(text).not.toMatch(/\[object/);
    // Ukrainian plural agreement (зуб / імплант)
    expect(text).not.toMatch(/(?<![\d–-])1 (зуби|зубів|імпланти|імплантів)/);
    expect(text).not.toMatch(/(?<![\d–-])[2-4] (зубів|імплантів)/);
    expect(text).not.toMatch(/(?<![\d–-])(?:[5-9]|1[0-9]) (зуби|імпланти)/);
  }

  // no horizontal overflow at 412px
  const overflow = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(overflow.sw, "horizontal overflow").toBeLessThanOrEqual(overflow.cw);

  // flags
  const massNote = page.getByText("Спершу — перевірка плану", { exact: true });
  await expect(massNote).toHaveCount(leaf.mass ? 1 : 0);
  await expect(page.getByText("Цей розрахунок має сенс лише якщо")).toHaveCount(leaf.unsure ? 1 : 0);

  // confidence section
  const conf = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Наскільки точна ця оцінка" }) });
  await expect(conf).toHaveCount(1);
  await expect(conf).toContainText("Клінічний сценарій");
  const badges = conf.locator("span.rounded-full");
  const badgeTexts = (await badges.allInnerTexts()).map((t) => t.trim());
  const clinicalBadge = badgeTexts[0];
  expect(["Висока", "Середня–висока", "Середня", "Низька–середня", "Низька"]).toContain(clinicalBadge);

  if (leaf.kind === "priced") {
    await expect(conf).toContainText("Ринкові дані");
    expect(badgeTexts.length, `badges: ${badgeTexts}`).toBeGreaterThanOrEqual(2);
    expect(["Висока", "Середня", "Низька"]).toContain(badgeTexts[1]);

    // segment cards
    const cards = await readCards(page);
    expect(cards.map((c) => c.label)).toEqual(["Базовий", "Оптимальний", "Преміальний"]);
    for (const c of cards) {
      expect(c.ranges.length, `card ${c.label}: ${c.text}`).toBeGreaterThanOrEqual(leaf.arch ? 3 : 1);
      for (const [lo, hi] of c.ranges) {
        expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true);
        expect(lo, `${c.label}: ${c.text}`).toBeLessThan(hi);
      }
    }
    if (leaf.arch) {
      for (const c of cards) {
        expect(c.text).toContain("Етап 1");
        expect(c.text).toContain("Етап 2");
        expect(c.text).toContain("Повне лікування");
      }
    }
    // Базовий <= Оптимальний <= Преміальний
    expect(cards[0].total[0]).toBeLessThanOrEqual(cards[1].total[0]);
    expect(cards[1].total[0]).toBeLessThanOrEqual(cards[2].total[0]);
    expect(cards[0].total[1]).toBeLessThanOrEqual(cards[1].total[1]);
    expect(cards[1].total[1]).toBeLessThanOrEqual(cards[2].total[1]);
    // Оптимальний is the default selected card
    await expect(cardsLocator(page).nth(1)).toHaveAttribute("aria-checked", "true");

    // included + reference note + extras
    await expect(page.getByRole("heading", { name: "Що входить у розрахунок" })).toBeVisible();
    await expect(
      page.locator("section").filter({ has: page.getByRole("heading", { name: "Що входить у розрахунок" }) }).locator("li"),
    ).not.toHaveCount(0);
    await expect(page.getByRole("heading", { name: "На чому базується оцінка" })).toHaveCount(leaf.refNote ? 1 : 0);
    await expect(page.getByText("Потрібна тимчасова коронка", { exact: true })).toHaveCount(leaf.temp ? 1 : 0);
    await expect(page.getByRole("heading", { name: "Вам уже назвали вартість?" })).toHaveCount(
      leaf.comparison === false ? 0 : 1,
    );
    await expect(page.getByRole("heading", { name: "Чому ми не показуємо ціну" })).toHaveCount(0);

    const extrasHeading = page.getByRole("heading", { name: "Можливі додаткові витрати" });
    if ((await extrasHeading.count()) > 0) {
      const items = page
        .locator("section")
        .filter({ has: extrasHeading })
        .locator("li");
      const n = await items.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const t = await items.nth(i).innerText();
        const r = parseRanges(t);
        expect(r.length, `extra row has no range: ${t}`).toBeGreaterThan(0);
        expect(r[0][0], t).toBeLessThan(r[0][1]);
      }
    }

    // scenario tabs
    const tablist = page.getByRole("tablist", { name: "Сценарій" });
    if (leaf.tabs > 1) {
      const tabs = tablist.getByRole("tab");
      await expect(tabs).toHaveCount(leaf.tabs);
      const sigs: string[] = [];
      for (let i = 0; i < leaf.tabs; i++) {
        await tabs.nth(i).click();
        await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true");
        sigs.push(await cardsSignature(page));
      }
      expect(new Set(sigs).size, "each scenario tab should show a different price").toBe(leaf.tabs);
      await tabs.nth(0).click();
    } else {
      await expect(tablist).toHaveCount(0);
    }
  } else {
    await expect(page.getByRole("heading", { name: "Чому ми не показуємо ціну" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Ринковий сегмент" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Що входить у розрахунок" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Ринковий орієнтир" })).toHaveCount(0);
    await expect(page.getByRole("tablist")).toHaveCount(0);
    expect(visible).not.toMatch(/\d\s*–\s*\d[\d\s]*грн/);
    expect(badges, "no market badge for no_basket").toHaveCount(1);
  }

  // single CTA, consistent with routing rules (no qualification answered)
  const lowConf = clinicalBadge === "Низька" || clinicalBadge === "Низька–середня";
  const expectedCta = leaf.mass
    ? CTA.massExtraction
    : leaf.kind === "no_basket" || leaf.unsure || lowConf
      ? CTA.consultation
      : CTA.tender;
  expect(await ctaLabelOf(page), `clinical badge ${clinicalBadge}`).toBe(expectedCta);
}

async function runLeaf(page: Page, leaf: Leaf, city = "Львів") {
  await selectCity(page, city);
  await runSteps(page, leaf.steps);
  await answerQ00(page, null);
  await checkLeaf(page, leaf);
}

// ───────────────────────── leaf tables ─────────────────────────

const teethWord = (n: number) => `${n} ${n === 1 ? "зуб" : n < 5 ? "зуби" : "зубів"}`;

const leaves: { group: string; leaf: Leaf }[] = [];
const add = (group: string, leaf: Leaf) => leaves.push({ group, leaf });

// ---- "1 зуб" ----
{
  const t1: Step = [TEETH_Q, "1 зуб"];
  const single = (name: string, state: string, extra: Partial<Leaf> & { title: string }, sub: Step[] = []) =>
    add("1 зуб", {
      name,
      steps: [t1, [SINGLE_Q, state], ...sub],
      kind: "priced",
      tabs: 0,
      comparison: true,
      ...extra,
    });
  single("already_removed", "Зуб уже видалений", { title: "Один зуб, який уже видалений", temp: true });
  single("extraction_recommended", "Зуб ще є, лікар рекомендує видалити", {
    title: "Один зуб, який рекомендують видалити",
    temp: true,
  });
  single("unsure_save", "Не знаю, чи можна його зберегти", {
    title: "Один зуб — чи потрібне видалення, ще не ясно",
    temp: true,
    unsure: true,
  });
  single("unknown", "Не знаю", { title: "Один зуб", temp: true });
  for (const [sys, label] of [
    ["yes", "Так"],
    ["no", "Ні або не пам’ятаю"],
  ] as const) {
    single(
      `implant_placed / system ${sys}`,
      "Імплант уже встановлений",
      { title: "Один зуб, імплант уже встановлений" },
      [[SYSTEM_Q, label]],
    );
  }
  single(
    "old_problem / crown_only",
    "Проблема зі старою коронкою або імплантом",
    { title: "Заміна старої коронки на імпланті" },
    [[OLD_Q, "Лише коронка (імплант у порядку)"]],
  );
  for (const [label, title] of [
    ["Проблема з самим імплантом", "Проблема зі старим імплантом"],
    ["Не знаю", "Проблема зі старою коронкою або імплантом"],
  ] as const) {
    add("1 зуб", {
      name: `old_problem / ${label}`,
      steps: [t1, [SINGLE_Q, "Проблема зі старою коронкою або імплантом"], [OLD_Q, label]],
      kind: "no_basket",
      title,
      tabs: 0,
    });
  }
}

// ---- adjacent 2–3 / 4–6 ----
const ADJ_STATES: { label: string; id: string }[] = [
  { label: "Усі вже видалені", id: "all_removed" },
  { label: "Частина видалена", id: "part_removed" },
  { label: "Рекомендують видалення", id: "extraction_recommended" },
  { label: "Не знаю, чи можна зберегти", id: "unsure_save" },
  { label: "Імпланти вже встановлені", id: "implants_placed" },
  { label: "Не знаю", id: "unknown" },
];

{
  const groups: { teeth: string; countQ: string; counts: { label: string; units: number[] }[]; unknownTitle: string }[] = [
    {
      teeth: "2–3 зуби поруч",
      countQ: ADJ_2_3_Q,
      counts: [
        { label: "2 зуби", units: [2] },
        { label: "3 зуби", units: [3] },
        { label: "Не знаю", units: [2, 3] },
      ],
      unknownTitle: "2–3 зуби поруч",
    },
    {
      teeth: "4–6 зубів поруч",
      countQ: ADJ_2_3_Q,
      counts: [
        { label: "4 зуби", units: [4] },
        { label: "5 зубів", units: [5] },
        { label: "6 зубів", units: [6] },
        { label: "Не знаю", units: [4, 6] },
      ],
      unknownTitle: "4–6 зубів поруч",
    },
  ];
  for (const g of groups) {
    for (const c of g.counts) {
      for (const s of ADJ_STATES) {
        add(g.teeth, {
          name: `${c.label} × ${s.label}`,
          steps: [
            [TEETH_Q, g.teeth],
            [g.countQ, c.label],
            [ADJ_STATE_Q, s.label],
          ],
          kind: "priced",
          title: c.units.length > 1 ? g.unknownTitle : `${teethWord(c.units[0])} поруч`,
          tabs: c.units.length > 1 ? 2 : 0,
          mass: s.id === "extraction_recommended" && Math.max(...c.units) >= 5,
          unsure: s.id === "unsure_save",
          refNote: true,
          comparison: true,
        });
      }
    }
  }
}

// ---- separate ----
const SEP_STATES: { label: string; id: string }[] = [
  { label: "Усі відсутні", id: "all_missing" },
  { label: "Частина відсутня", id: "part_missing" },
  { label: "Рекомендують видалення", id: "extraction_recommended" },
  { label: "Не знаю, чи можна зберегти", id: "unsure_save" },
  { label: "Частина імплантів уже встановлена", id: "some_implants_placed" },
  { label: "Не знаю", id: "unknown" },
];
const SEP_COUNTS: { label: string; id: string; counts: number[]; title: string }[] = [
  { label: "2 зуби", id: "two", counts: [2], title: "2 зуби у різних місцях" },
  { label: "3 зуби", id: "three", counts: [3], title: "3 зуби у різних місцях" },
  { label: "4 зуби", id: "four", counts: [4], title: "4 зуби у різних місцях" },
  { label: "5–6 зубів", id: "five_six", counts: [5, 6], title: "5–6 зубів у різних місцях" },
  { label: "Більше 6", id: "more_than_six", counts: [], title: "Багато зубів у різних місцях" },
  { label: "Не знаю", id: "unknown", counts: [2, 4], title: "Кілька зубів у різних місцях" },
];
const EXISTING: string[] = ["1", "2", "3 і більше", "Не знаю"];
const SYSTEM: string[] = ["Так", "Ні або не пам’ятаю"];

for (const c of SEP_COUNTS) {
  for (const s of SEP_STATES) {
    const base = (name: string, extraSteps: Step[]): Leaf => {
      const many = c.id === "more_than_six";
      const noBasket = c.id === "unknown" && s.id === "unknown";
      return {
        name,
        steps: [[TEETH_Q, "Кілька зубів у різних місцях"], [SEP_COUNT_Q, c.label], [SEP_STATE_Q, s.label], ...extraSteps],
        kind: noBasket ? "no_basket" : "priced",
        title: c.title,
        tabs: noBasket ? 0 : many ? 2 : c.counts.length > 1 ? 2 : 0,
        arch: many,
        mass: s.id === "extraction_recommended" && (many || Math.max(...c.counts) >= 5),
        unsure: s.id === "unsure_save",
        refNote: !noBasket,
        comparison: !many,
      };
    };
    if (s.id === "some_implants_placed" && c.id !== "more_than_six") {
      for (const e of EXISTING) {
        for (const sys of SYSTEM) {
          add("Кілька зубів у різних місцях", base(`${c.label} × ${s.label} × імплантів ${e} × система ${sys}`, [
            [EXISTING_Q, e],
            [SYSTEM_Q, sys],
          ]));
        }
      }
    } else {
      add("Кілька зубів у різних місцях", base(`${c.label} × ${s.label}`, []));
    }
  }
}

for (const { group, leaf } of leaves) {
  test(`[${group}] ${leaf.name}`, async ({ page }) => {
    await runLeaf(page, leaf);
  });
}

// ───────────────────────── cities ─────────────────────────

test.describe("cities", () => {
  const simple: Leaf = {
    name: "single already_removed",
    steps: [
      [TEETH_Q, "1 зуб"],
      [SINGLE_Q, "Зуб уже видалений"],
    ],
    kind: "priced",
    title: "Один зуб, який уже видалений",
    tabs: 0,
    temp: true,
    comparison: true,
  };

  test("Чернівці: fallback note about insufficient local prices", async ({ page }) => {
    await runLeaf(page, simple, "Чернівці");
    await expect(page.getByRole("button", { name: /Змінити місто: Чернівці/ })).toBeVisible();
    await expect(page.locator("main")).toContainText("Даних по території «м. Чернівці» поки замало");
  });

  test("Волинська область via 'Мого міста немає — оберу область'", async ({ page }) => {
    await selectOblast(page, "Волинська область");
    await expect(page.getByRole("button", { name: /Змінити місто: Волинська область/ })).toBeVisible();
    await runSteps(page, simple.steps);
    await answerQ00(page, null);
    await checkLeaf(page, simple);
    await expect(page.locator("main")).toContainText("Волинська область");
  });

  test("Львів: no fallback note", async ({ page }) => {
    await runLeaf(page, simple, "Львів");
    await expect(page.locator("main")).not.toContainText("Даних по території «м. Чернівці» поки замало");
  });

  test("city search: unknown name, latin alias, Enter selects first result", async ({ page }) => {
    await page.goto("/calculator/");
    await page.waitForLoadState("load");
    const input = page.getByPlaceholder("Почніть вводити назву міста");
    await expect(async () => {
      await input.fill("ЯЯЯЯЯ");
      await expect(page.getByText("Такого міста немає в списку.")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10_000 });
    await input.fill("lviv");
    await expect(page.getByRole("button", { name: "Львів", exact: true })).toBeVisible();
    await input.press("Enter");
    await expect(page.locator("main h1")).toHaveText(TEETH_Q);
    await expect(page.getByRole("button", { name: /Змінити місто: Львів/ })).toBeVisible();
  });

  test("oblast picker: back link returns to city search; header city button resets to city step", async ({ page }) => {
    await page.goto("/calculator/");
    await page.waitForLoadState("load");
    const link = page.getByRole("button", { name: "Мого міста немає — оберу область" });
    await expect(async () => {
      await link.click({ timeout: 1500 });
      await expect(page.getByRole("list", { name: "Області" })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 10_000 });
    expect(await page.getByRole("list", { name: "Області" }).getByRole("button").count()).toBeGreaterThanOrEqual(24);
    await page.getByRole("button", { name: "← Повернутися до пошуку міста" }).click();
    await expect(page.getByPlaceholder("Почніть вводити назву міста")).toBeVisible();
    await page.getByPlaceholder("Почніть вводити назву міста").fill("Львів");
    await page.getByRole("button", { name: "Львів", exact: true }).click();
    await page.getByRole("button", { name: /Змінити місто/ }).click();
    await expect(page.locator("main h1")).toHaveText("У якому місті плануєте лікування?");
  });
});

// ───────────────────────── interactions on a single-tooth result ─────────────────────────

const SINGLE_REMOVED: Step[] = [
  [TEETH_Q, "1 зуб"],
  [SINGLE_Q, "Зуб уже видалений"],
];

test.describe("result interactions", () => {
  const TEMP_STATES = [
    "Зуб уже видалений",
    "Зуб ще є, лікар рекомендує видалити",
    "Не знаю, чи можна його зберегти",
    "Не знаю",
  ];
  for (const state of TEMP_STATES) {
    test(`temp crown checkbox raises all prices (${state})`, async ({ page }) => {
      await toResult(page, "Львів", [[TEETH_Q, "1 зуб"], [SINGLE_Q, state]]);
      const before = await readCards(page);
      const box = page.getByRole("checkbox", { name: /Потрібна тимчасова коронка/ });
      await expect(box).not.toBeChecked();
      await box.check();
      const after = await readCards(page);
      for (let i = 0; i < 3; i++) {
        expect(after[i].total[0], `${after[i].label} low`).toBeGreaterThan(before[i].total[0]);
        expect(after[i].total[1], `${after[i].label} high`).toBeGreaterThan(before[i].total[1]);
        expect(after[i].total[0]).toBeLessThan(after[i].total[1]);
      }
      // breakdown mentions the temporary crown
      await page.getByText(/Деталізація за складовими/).click();
      await expect(page.locator("details table")).toContainText(/тимчас/i);
      await box.uncheck();
      const restored = await readCards(page);
      expect(restored.map((c) => c.total)).toEqual(before.map((c) => c.total));
    });
  }

  test("temp crown checkbox is absent for implant_placed", async ({ page }) => {
    await toResult(page, "Львів", [
      [TEETH_Q, "1 зуб"],
      [SINGLE_Q, "Імплант уже встановлений"],
      [SYSTEM_Q, "Так"],
    ]);
    await expect(page.getByText("Потрібна тимчасова коронка", { exact: true })).toHaveCount(0);
  });

  test("segment card click toggles aria-checked and updates summary", async ({ page }) => {
    await toResult(page, "Львів", SINGLE_REMOVED);
    const cards = cardsLocator(page);
    await expect(cards.nth(1)).toHaveAttribute("aria-checked", "true");
    await expect(cards.nth(0)).toHaveAttribute("aria-checked", "false");
    await expect(cards.nth(2)).toHaveAttribute("aria-checked", "false");
    const priced = await readCards(page);

    await cards.nth(2).click();
    await expect(cards.nth(2)).toHaveAttribute("aria-checked", "true");
    await expect(cards.nth(1)).toHaveAttribute("aria-checked", "false");
    await expect(page.locator("details summary")).toContainText("Преміальний");
    await expect(page.locator("p[aria-live=polite]")).toContainText("Преміальний");

    await cards.nth(0).click();
    await expect(cards.nth(0)).toHaveAttribute("aria-checked", "true");
    await expect(cards.nth(2)).toHaveAttribute("aria-checked", "false");
    await expect(page.locator("details summary")).toContainText("Базовий");
    // card prices themselves do not change when selecting
    expect((await readCards(page)).map((c) => c.total)).toEqual(priced.map((c) => c.total));
  });

  test("breakdown 'Деталізація за складовими' expands and follows the selected segment", async ({ page }) => {
    await toResult(page, "Львів", SINGLE_REMOVED);
    const details = page.locator("details");
    const table = details.locator("table");
    await expect(details).not.toHaveAttribute("open", "");
    await expect(table).toBeHidden();
    await page.getByText(/Деталізація за складовими/).click();
    await expect(details).toHaveAttribute("open", "");
    await expect(table).toBeVisible();
    const rows = table.locator("tr");
    expect(await rows.count()).toBeGreaterThan(1);
    const optimalTotal = (await readCards(page))[1].total;
    const rowRanges = parseRanges(await table.innerText());
    expect(rowRanges.length).toBe(await rows.count());
    // line ranges sum (p25) is consistent with the card total
    const sumLo = rowRanges.reduce((s, r) => s + r[0], 0);
    const sumHi = rowRanges.reduce((s, r) => s + r[1], 0);
    expect(Math.abs(sumLo - optimalTotal[0]), `sum of lines ${sumLo} vs card ${optimalTotal[0]}`).toBeLessThanOrEqual(rowRanges.length * 5);
    expect(Math.abs(sumHi - optimalTotal[1]), `sum of lines ${sumHi} vs card ${optimalTotal[1]}`).toBeLessThanOrEqual(rowRanges.length * 5);

    const before = await table.innerText();
    await cardsLocator(page).nth(2).click();
    await expect(details).toHaveAttribute("open", ""); // stays open
    expect(await table.innerText()).not.toBe(before);
  });

  test("customiser: implant and prosthetic segments change 'Ваш варіант'", async ({ page }) => {
    await toResult(page, "Львів", SINGLE_REMOVED);
    const cards = await readCards(page);
    await expect(page.getByText("Ваш варіант", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Налаштувати варіант" }).click();
    await expect(page.getByText("Ваш варіант", { exact: true })).toBeVisible();
    // cards are dimmed / nothing selected while customising
    for (let i = 0; i < 3; i++) await expect(cardsLocator(page).nth(i)).toHaveAttribute("aria-checked", "false");

    const implant = page.getByRole("group", { name: "Імплантаційна система" });
    const prosthetic = page.getByRole("group", { name: "Коронки / протезування" });
    await expect(implant.getByRole("button", { name: "Оптимальний" })).toHaveAttribute("aria-pressed", "true");
    await expect(prosthetic.getByRole("button", { name: "Оптимальний" })).toHaveAttribute("aria-pressed", "true");

    const p0 = await customTotal(page);
    expect(p0).toEqual(cards[1].total);

    await implant.getByRole("button", { name: "Преміальний" }).click();
    const p1 = await customTotal(page);
    expect(p1[0]).toBeGreaterThan(p0[0]);
    expect(p1[1]).toBeGreaterThan(p0[1]);
    await expect(page.locator("details summary")).toContainText("імплант преміальний, протезування оптимальний");

    await prosthetic.getByRole("button", { name: "Преміальний" }).click();
    const p2 = await customTotal(page);
    expect(p2[0]).toBeGreaterThan(p1[0]);
    expect(p2).toEqual(cards[2].total);

    await implant.getByRole("button", { name: "Базовий" }).click();
    const p3 = await customTotal(page);
    expect(p3[0]).toBeLessThan(p2[0]);
    await expect(page.locator("details summary")).toContainText("імплант базовий, протезування преміальний");

    await prosthetic.getByRole("button", { name: "Базовий" }).click();
    const p4 = await customTotal(page);
    expect(p4[0]).toBeLessThan(p3[0]);
    expect(p4).toEqual(cards[0].total);

    // mixed package differs from both aligned ones
    await prosthetic.getByRole("button", { name: "Преміальний" }).click();
    const mixed = await customTotal(page);
    expect(mixed[0]).toBeGreaterThan(cards[0].total[0]);
    expect(mixed[0]).toBeLessThan(cards[2].total[0]);

    // back to standard packages
    await page.getByRole("button", { name: "Повернутися до стандартних пакетів" }).click();
    await expect(page.getByText("Ваш варіант", { exact: true })).toHaveCount(0);
    await expect(cardsLocator(page).nth(1)).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("button", { name: "Налаштувати варіант" })).toBeVisible();
  });

  test("customiser: starts from the selected segment's card after returning", async ({ page }) => {
    await toResult(page, "Львів", SINGLE_REMOVED);
    await cardsLocator(page).nth(2).click();
    await page.getByRole("button", { name: "Налаштувати варіант" }).click();
    // NOTE: customiser opens with the last customPkg (aligned with the selected segment)
    const implant = page.getByRole("group", { name: "Імплантаційна система" });
    await expect(implant.getByRole("button", { name: "Преміальний" })).toHaveAttribute("aria-pressed", "true");
  });

  test("customiser works for a multi-tooth scenario (3 teeth bridge)", async ({ page }) => {
    await toResult(page, "Львів", [
      [TEETH_Q, "2–3 зуби поруч"],
      [ADJ_2_3_Q, "3 зуби"],
      [ADJ_STATE_Q, "Усі вже видалені"],
    ]);
    await page.getByRole("button", { name: "Налаштувати варіант" }).click();
    const p0 = await customTotal(page);
    await page
      .getByRole("group", { name: "Імплантаційна система" })
      .getByRole("button", { name: "Преміальний" })
      .click();
    expect((await customTotal(page))[0]).toBeGreaterThan(p0[0]);
  });

  test("more than 6 teeth (arch): customiser shows stage rows", async ({ page }) => {
    await toResult(page, "Львів", [
      [TEETH_Q, "Кілька зубів у різних місцях"],
      [SEP_COUNT_Q, "Більше 6"],
      [SEP_STATE_Q, "Усі відсутні"],
    ]);
    await page.getByRole("button", { name: "Налаштувати варіант" }).click();
    const block = page.getByText("Ваш варіант", { exact: true }).locator("..");
    await expect(block).toContainText("Етап 1");
    await expect(block).toContainText("Етап 2");
    await expect(block).toContainText("Повне лікування");
  });

  test("scenario tabs: unknown 2–3 changes price and 'На чому базується оцінка'", async ({ page }) => {
    await toResult(page, "Львів", [
      [TEETH_Q, "2–3 зуби поруч"],
      [ADJ_2_3_Q, "Не знаю"],
      [ADJ_STATE_Q, "Усі вже видалені"],
    ]);
    const tabs = page.getByRole("tablist", { name: "Сценарій" }).getByRole("tab");
    await expect(tabs).toHaveText(["2 зуби", "3 зуби"]);
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
    const a = (await readCards(page))[1].total;
    const noteA = await page.getByRole("heading", { name: "На чому базується оцінка" }).locator("..").innerText();
    await tabs.nth(1).click();
    const b = (await readCards(page))[1].total;
    expect(b[0]).toBeGreaterThan(a[0]);
    const noteB = await page.getByRole("heading", { name: "На чому базується оцінка" }).locator("..").innerText();
    expect(noteB).not.toBe(noteA);
  });

  test("EUR currency toggle: amount converted to UAH", async ({ page }) => {
    await toResult(page, "Львів", SINGLE_REMOVED, ["Мені вже назвали вартість"]);
    const amount = page.getByLabel("Яку суму вам назвали?");
    const eur = page.getByRole("group", { name: "Валюта" }).getByRole("button", { name: "€" });
    const uah = page.getByRole("group", { name: "Валюта" }).getByRole("button", { name: "грн" });
    await expect(uah).toHaveAttribute("aria-pressed", "true");
    await eur.click();
    await expect(eur).toHaveAttribute("aria-pressed", "true");
    await expect(uah).toHaveAttribute("aria-pressed", "false");
    await amount.fill("1500");
    await page.getByRole("button", { name: "Імпланти", exact: true }).click();
    await page.getByRole("button", { name: "Коронки / міст", exact: true }).click();
    await page.getByRole("button", { name: "Порівняти з ринком" }).click();
    const offer = page.getByText("Ваша пропозиція", { exact: true }).locator("xpath=following-sibling::dd");
    await expect(offer).toBeVisible();
    expect(toNum(await offer.innerText())).toBe(75208); // 1500 × 50.1385, rounded
    const pctEur = await page.getByText("Відхилення від медіани", { exact: true }).locator("xpath=following-sibling::dd").innerText();

    // same amount in UAH → same result
    await page.getByRole("button", { name: "Змінити дані пропозиції" }).click();
    await uah.click();
    await amount.fill("75208");
    await page.getByRole("button", { name: "Порівняти з ринком" }).click();
    const pctUah = await page.getByText("Відхилення від медіани", { exact: true }).locator("xpath=following-sibling::dd").innerText();
    expect(pctUah).toBe(pctEur);
  });
});

// ───────────────────────── comparison flow ─────────────────────────

test.describe("comparison", () => {
  const amountInput = (page: Page) => page.getByLabel("Яку суму вам назвали?");
  const chip = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
  const submit = (page: Page) => page.getByRole("button", { name: "Порівняти з ринком" });
  const dd = (page: Page, label: string) =>
    page.getByText(label, { exact: true }).locator("xpath=following-sibling::dd");

  async function openWithQuote(page: Page) {
    await toResult(page, "Львів", SINGLE_REMOVED, ["Мені вже назвали вартість"]);
    await expect(amountInput(page)).toBeVisible(); // panel is open immediately
  }

  test("Q00 'Мені вже назвали вартість' opens comparison immediately; otherwise it is collapsed", async ({ page }) => {
    await toResult(page, "Львів", SINGLE_REMOVED);
    await expect(amountInput(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Порівняти пропозицію клініки" })).toBeVisible();
    await page.getByRole("button", { name: "Порівняти пропозицію клініки" }).click();
    await expect(amountInput(page)).toBeVisible();
  });

  test("68 000 + Імпланти + Коронки / міст → deviation, range and headline", async ({ page }) => {
    await openWithQuote(page);
    await amountInput(page).fill("68000");
    await chip(page, "Імпланти").click();
    await chip(page, "Коронки / міст").click();
    await expect(chip(page, "Імпланти")).toHaveAttribute("aria-pressed", "true");
    await submit(page).click();

    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Вам уже назвали вартість?" }) });
    await expect(section.getByText("Відхилення від медіани", { exact: true })).toBeVisible();
    await expect(section.getByText("Типовий ринковий діапазон", { exact: true })).toBeVisible();
    await expect(section.getByText("Медіана", { exact: true })).toBeVisible();
    expect(toNum(await dd(page, "Ваша пропозиція").innerText())).toBe(68000);
    const pct = await dd(page, "Відхилення від медіани").innerText();
    expect(pct).toMatch(/^[+−]?\d+%$/);
    const text = await section.innerText();
    expect(text).toMatch(/Ваша пропозиція (—|вища|нижча)/);
    expect(text).toContain("Порівнюємо з:");
    expect(text).not.toMatch(/NaN|undefined|переплач/i);
    // sign of deviation is consistent with the position wording
    if (text.includes("вища за типовий")) expect(pct.startsWith("+")).toBe(true);
    if (text.includes("нижча за типовий")) expect(pct.startsWith("−")).toBe(true);
    const range = parseRanges(await dd(page, "Типовий ринковий діапазон").innerText())[0];
    expect(range[0]).toBeLessThan(range[1]);
    // the compared range equals the Оптимальний card (default)
    expect(range).toEqual((await readCards(page))[1].total);
  });

  test("offer in the middle of the range → 'у межах' headline, CTA stays tender", async ({ page }) => {
    await openWithQuote(page);
    const mid = (await readCards(page))[1].total;
    await amountInput(page).fill(String(Math.round((mid[0] + mid[1]) / 2)));
    await chip(page, "Імпланти").click();
    await chip(page, "Коронки / міст").click();
    await submit(page).click();
    await expect(page.getByText(/Ваша пропозиція — у межах типового ринкового діапазону/)).toBeVisible();
    expect(await ctaLabelOf(page)).toBe(CTA.tender);
  });

  test("offer far above the range → 'вища' + CTA 'Розібрати мою пропозицію по пунктах'", async ({ page }) => {
    await openWithQuote(page);
    await amountInput(page).fill("900000");
    await chip(page, "Імпланти").click();
    await chip(page, "Коронки / міст").click();
    await submit(page).click();
    await expect(page.getByText(/Ваша пропозиція вища за типовий ринковий діапазон/)).toBeVisible();
    expect(await ctaLabelOf(page)).toBe(CTA.unclearOffer);
    expect(await dd(page, "Відхилення від медіани").innerText()).toMatch(/^\+\d+%$/);
  });

  test("offer far below the range → 'нижча'", async ({ page }) => {
    await openWithQuote(page);
    await amountInput(page).fill("5000");
    await chip(page, "Імпланти").click();
    await chip(page, "Коронки / міст").click();
    await submit(page).click();
    await expect(page.getByText(/Ваша пропозиція нижча за типовий ринковий діапазон/)).toBeVisible();
    expect(await dd(page, "Відхилення від медіани").innerText()).toMatch(/^−\d+%$/);
    expect(await ctaLabelOf(page)).toBe(CTA.tender);
  });

  test("'Не знаю' scope → 'некоректно порівнювати' and CTA 'Розібрати мою пропозицію по пунктах'", async ({ page }) => {
    await openWithQuote(page);
    await amountInput(page).fill("68000");
    await chip(page, "Не знаю").click();
    await submit(page).click();
    await expect(page.getByText("некоректно порівнювати", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Відхилення від медіани", { exact: true })).toHaveCount(0);
    expect(await ctaLabelOf(page)).toBe(CTA.unclearOffer);
    // sticky / duplicate CTA buttons must carry the same label
    await expect(page.getByRole("button", { name: CTA.unclearOffer }).first()).toBeVisible();
  });

  test("only 'Імпланти' → not comparable, CTA 'Розібрати мою пропозицію по пунктах'", async ({ page }) => {
    await openWithQuote(page);
    await amountInput(page).fill("68000");
    await chip(page, "Імпланти").click();
    await submit(page).click();
    await expect(page.getByText("некоректно порівнювати", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Відхилення від медіани", { exact: true })).toHaveCount(0);
    expect(await ctaLabelOf(page)).toBe(CTA.unclearOffer);
  });

  test("only 'Коронки / міст' → not comparable", async ({ page }) => {
    await openWithQuote(page);
    await amountInput(page).fill("68000");
    await chip(page, "Коронки / міст").click();
    await submit(page).click();
    await expect(page.getByText("некоректно порівнювати", { exact: false }).first()).toBeVisible();
    expect(await ctaLabelOf(page)).toBe(CTA.unclearOffer);
  });

  test("adding 'Видалення' raises the compared range; 'Не знаю' is exclusive", async ({ page }) => {
    await openWithQuote(page);
    await amountInput(page).fill("68000");
    await chip(page, "Імпланти").click();
    await chip(page, "Коронки / міст").click();
    await submit(page).click();
    const base = parseRanges(await dd(page, "Типовий ринковий діапазон").innerText())[0];
    const baseMedian = toNum(await dd(page, "Медіана").innerText());

    await page.getByRole("button", { name: "Змінити дані пропозиції" }).click();
    // input state is retained
    await expect(amountInput(page)).toHaveValue("68000");
    await expect(chip(page, "Імпланти")).toHaveAttribute("aria-pressed", "true");
    await chip(page, "Видалення").click();
    await submit(page).click();
    const withExtraction = parseRanges(await dd(page, "Типовий ринковий діапазон").innerText())[0];
    expect(withExtraction[0]).toBeGreaterThan(base[0]);
    expect(withExtraction[1]).toBeGreaterThan(base[1]);
    expect(toNum(await dd(page, "Медіана").innerText())).toBeGreaterThan(baseMedian);
    await expect(page.getByText(/Порівнюємо з: .*видалення/)).toBeVisible();

    // exclusivity of "Не знаю"
    await page.getByRole("button", { name: "Змінити дані пропозиції" }).click();
    await chip(page, "Не знаю").click();
    await expect(chip(page, "Не знаю")).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page, "Імпланти")).toHaveAttribute("aria-pressed", "false");
    await expect(chip(page, "Видалення")).toHaveAttribute("aria-pressed", "false");
    await chip(page, "Імпланти").click();
    await expect(chip(page, "Не знаю")).toHaveAttribute("aria-pressed", "false");
  });

  test("every extra scope chip (bone, sinus, temp, sedation) raises the range", async ({ page }) => {
    await openWithQuote(page);
    await amountInput(page).fill("68000");
    await chip(page, "Імпланти").click();
    await chip(page, "Коронки / міст").click();
    await submit(page).click();
    const base = parseRanges(await dd(page, "Типовий ринковий діапазон").innerText())[0];
    for (const extra of ["Кісткова пластика", "Синус-ліфтинг", "Тимчасові зуби", "Седація"]) {
      await page.getByRole("button", { name: "Змінити дані пропозиції" }).click();
      // reset: untick the previously ticked extras
      for (const other of ["Видалення", "Кісткова пластика", "Синус-ліфтинг", "Тимчасові зуби", "Седація"]) {
        if ((await chip(page, other).getAttribute("aria-pressed")) === "true") await chip(page, other).click();
      }
      await chip(page, extra).click();
      await submit(page).click();
      const r = parseRanges(await dd(page, "Типовий ринковий діапазон").innerText())[0];
      // "Тимчасові зуби" is already in the basket for a single tooth with temp crown only when ticked in result;
      // here it is not → expect increase for all
      expect(r[1], `${extra}`).toBeGreaterThan(base[1]);
    }
  });

  test("validation: empty amount and empty scope show errors", async ({ page }) => {
    await openWithQuote(page);
    await submit(page).click();
    await expect(page.getByText("Вкажіть суму пропозиції.")).toBeVisible();
    await expect(page.getByText("Позначте, що входить у пропозицію.")).toBeVisible();
    await amountInput(page).fill("68000");
    await submit(page).click();
    await expect(page.getByText("Вкажіть суму пропозиції.")).toHaveCount(0);
    await expect(page.getByText("Позначте, що входить у пропозицію.")).toBeVisible();
  });

  test("amount input strips non-numeric characters", async ({ page }) => {
    await openWithQuote(page);
    await amountInput(page).fill("68abc 000!");
    await expect(amountInput(page)).toHaveValue("68 000");
  });

  test("comparison respects the selected segment (Преміальний card)", async ({ page }) => {
    await openWithQuote(page);
    await cardsLocator(page).nth(2).click();
    await amountInput(page).fill("68000");
    await chip(page, "Імпланти").click();
    await chip(page, "Коронки / міст").click();
    await expect(page.getByText(/Порівнюватимемо з: .*Преміальний/)).toBeVisible();
    await submit(page).click();
    expect(parseRanges(await dd(page, "Типовий ринковий діапазон").innerText())[0]).toEqual(
      (await readCards(page))[2].total,
    );
  });

  test("multi-tooth comparison (3 teeth bridge): compares with the selected scenario", async ({ page }) => {
    await toResult(
      page,
      "Львів",
      [
        [TEETH_Q, "2–3 зуби поруч"],
        [ADJ_2_3_Q, "Не знаю"],
        [ADJ_STATE_Q, "Усі вже видалені"],
      ],
      ["Мені вже назвали вартість"],
    );
    await page.getByRole("tablist", { name: "Сценарій" }).getByRole("tab").nth(1).click();
    await amountInput(page).fill("90000");
    await chip(page, "Імпланти").click();
    await chip(page, "Коронки / міст").click();
    await expect(page.getByText(/Порівнюватимемо з: 3 зуби/)).toBeVisible();
    await submit(page).click();
    expect(parseRanges(await dd(page, "Типовий ринковий діапазон").innerText())[0]).toEqual(
      (await readCards(page))[1].total,
    );
  });

  test("'>6 teeth' (no standard basket) + 'Мені вже назвали вартість': explanatory card instead of a form", async ({ page }) => {
    await toResult(
      page,
      "Львів",
      [
        [TEETH_Q, "Кілька зубів у різних місцях"],
        [SEP_COUNT_Q, "Більше 6"],
        [SEP_STATE_Q, "Усі відсутні"],
      ],
      ["Мені вже назвали вартість"],
    );
    const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Вам уже назвали вартість?" }) });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("немає стандартизованого кошика");
    await expect(page.getByLabel("Яку суму вам назвали?")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Порівняти з ринком" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Порівняти пропозицію клініки" })).toHaveCount(0);
  });

  test("'>6 teeth' without quote: no comparison card at all", async ({ page }) => {
    await toResult(page, "Львів", [
      [TEETH_Q, "Кілька зубів у різних місцях"],
      [SEP_COUNT_Q, "Більше 6"],
      [SEP_STATE_Q, "Усі відсутні"],
    ]);
    await expect(page.getByRole("heading", { name: "Вам уже назвали вартість?" })).toHaveCount(0);
  });

  test("comparison recomputes live when scenario tab, segment, package or temp crown change", async ({ page }) => {
    await toResult(
      page,
      "Львів",
      [
        [TEETH_Q, "2–3 зуби поруч"],
        [ADJ_2_3_Q, "Не знаю"],
        [ADJ_STATE_Q, "Усі вже видалені"],
      ],
      ["Мені вже назвали вартість"],
    );
    await amountInput(page).fill("70000");
    await chip(page, "Імпланти").click();
    await chip(page, "Коронки / міст").click();
    await submit(page).click();
    const rangeOf = async () => parseRanges(await dd(page, "Типовий ринковий діапазон").innerText())[0];
    const pctOf = () => dd(page, "Відхилення від медіани").innerText();

    const r2 = await rangeOf();
    expect(r2).toEqual((await readCards(page))[1].total);
    const pct2 = await pctOf();

    // scenario tab
    await page.getByRole("tablist", { name: "Сценарій" }).getByRole("tab").nth(1).click();
    await expect(dd(page, "Типовий ринковий діапазон")).not.toHaveText(new RegExp(`^${r2[0].toLocaleString("uk-UA")}`));
    const r3 = await rangeOf();
    expect(r3[0]).toBeGreaterThan(r2[0]);
    expect(r3).toEqual((await readCards(page))[1].total);
    expect(await pctOf()).not.toBe(pct2);

    // segment card
    await cardsLocator(page).nth(2).click();
    const rPrem = await rangeOf();
    expect(rPrem[0]).toBeGreaterThan(r3[0]);
    expect(rPrem).toEqual((await readCards(page))[2].total);

    // custom package
    await page.getByRole("button", { name: "Налаштувати варіант" }).click();
    await page.getByRole("group", { name: "Імплантаційна система" }).getByRole("button", { name: "Базовий" }).click();
    const rMixed = await rangeOf();
    expect(rMixed[0]).toBeLessThan(rPrem[0]);
    expect(rMixed).toEqual(await customTotal(page));
    await expect(page.getByText(/Порівнюємо з: .*імплант базовий, протезування преміальний/)).toBeVisible();
  });

  test("comparison recomputes live when the temp crown is ticked (single tooth)", async ({ page }) => {
    await openWithQuote(page);
    await amountInput(page).fill("68000");
    await chip(page, "Імпланти").click();
    await chip(page, "Коронки / міст").click();
    await submit(page).click();
    const before = parseRanges(await dd(page, "Типовий ринковий діапазон").innerText())[0];
    await page.getByRole("checkbox", { name: /Потрібна тимчасова коронка/ }).check();
    await expect
      .poll(async () => parseRanges(await dd(page, "Типовий ринковий діапазон").innerText())[0][0])
      .toBeGreaterThan(before[0]);
    expect(parseRanges(await dd(page, "Типовий ринковий діапазон").innerText())[0]).toEqual(
      (await readCards(page))[1].total,
    );
  });

  test("amount formats '68.000' and '68,000' are read as 68 000; tiny amounts are flagged", async ({ page }) => {
    await openWithQuote(page);
    await chip(page, "Імпланти").click();
    await chip(page, "Коронки / міст").click();
    for (const raw of ["68.000", "68,000"]) {
      await amountInput(page).fill(raw);
      await submit(page).click();
      expect(toNum(await dd(page, "Ваша пропозиція").innerText())).toBe(68000);
      await page.getByRole("button", { name: "Змінити дані пропозиції" }).click();
    }
    await amountInput(page).fill("500");
    await submit(page).click();
    await expect(page.getByText("Сума виглядає замалою — вкажіть повну вартість лікування.")).toBeVisible();
  });
});

// ───────────────────────── back navigation ─────────────────────────

test.describe("back navigation", () => {
  const back = (page: Page) => page.getByRole("button", { name: "Назад", exact: true });

  test("back returns to the previous question (heading only)", async ({ page }) => {
    await selectCity(page, "Львів");
    await runSteps(page, [
      [TEETH_Q, "2–3 зуби поруч"],
      [ADJ_2_3_Q, "3 зуби"],
    ]);
    await expect(page.locator("main h1")).toHaveText(ADJ_STATE_Q);
    await back(page).click();
    await expect(page.locator("main h1")).toHaveText(ADJ_2_3_Q);
    await back(page).click();
    await expect(page.locator("main h1")).toHaveText(TEETH_Q);
  });

  test("back returns to the previous question with the prior answer marked (aria-pressed)", async ({ page }) => {
    await selectCity(page, "Львів");
    await runSteps(page, [
      [TEETH_Q, "2–3 зуби поруч"],
      [ADJ_2_3_Q, "3 зуби"],
    ]);
    await back(page).click();
    await expect(page.locator("main h1")).toHaveText(ADJ_2_3_Q);
    await expect(page.getByRole("button", { name: "3 зуби", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "2 зуби", exact: true })).toHaveAttribute("aria-pressed", "false");
    await back(page).click();
    await expect(page.locator("main h1")).toHaveText(TEETH_Q);
    await expect(page.getByRole("button", { name: "2–3 зуби поруч", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "1 зуб", exact: true })).toHaveAttribute("aria-pressed", "false");
  });

  test("re-answering an earlier question switches branch and drops stale answers", async ({ page }) => {
    await selectCity(page, "Львів");
    await runSteps(page, [
      [TEETH_Q, "2–3 зуби поруч"],
      [ADJ_2_3_Q, "3 зуби"],
    ]);
    await back(page).click();
    await back(page).click();
    await runSteps(page, [[TEETH_Q, "1 зуб"]]);
    await expect(page.locator("main h1")).toHaveText(SINGLE_Q);
    for (const l of ["Зуб уже видалений", "Не знаю"]) {
      await expect(page.getByRole("button", { name: l, exact: true })).toHaveAttribute("aria-pressed", "false");
    }
    await runSteps(page, [[SINGLE_Q, "Зуб уже видалений"]]);
    await answerQ00(page, null);
    await expect(page.locator("main h1")).toHaveText("Один зуб, який уже видалений");
  });

  test("changing the answer after back changes the result", async ({ page }) => {
    await selectCity(page, "Львів");
    await runSteps(page, [
      [TEETH_Q, "1 зуб"],
      [SINGLE_Q, "Імплант уже встановлений"],
      [SYSTEM_Q, "Так"],
    ]);
    await back(page).click(); // system question
    await expect(page.locator("main h1")).toHaveText(SYSTEM_Q);
    await back(page).click(); // single_state
    await runSteps(page, [[SINGLE_Q, "Проблема зі старою коронкою або імплантом"]]);
    // implant_system_known must NOT be asked now; old_problem_kind is
    await expect(page.locator("main h1")).toHaveText(OLD_Q);
    await runSteps(page, [[OLD_Q, "Проблема з самим імплантом"]]);
    await answerQ00(page, null);
    await expect(page.getByRole("heading", { name: "Чому ми не показуємо ціну" })).toBeVisible();
  });

  test("back from the first question returns to city step; from result returns to Q00, then to the last question", async ({ page }) => {
    await selectCity(page, "Львів");
    await back(page).click();
    await expect(page.locator("main h1")).toHaveText("У якому місті плануєте лікування?");

    await toResult(page, "Львів", SINGLE_REMOVED, ["Маю КТ", "Мені вже назвали вартість"]);
    await back(page).click();
    await expect(page.locator("main h1")).toHaveText(Q00);
    await back(page).click();
    await expect(page.locator("main h1")).toHaveText(SINGLE_Q);
  });

  test("back from the result restores the Q00 checkboxes and the last single-choice answer", async ({ page }) => {
    await toResult(page, "Львів", SINGLE_REMOVED, ["Маю КТ", "Мені вже назвали вартість"]);
    await back(page).click();
    await expect(page.locator("main h1")).toHaveText(Q00);
    await expect(page.getByRole("checkbox", { name: "Маю КТ" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Мені вже назвали вартість" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Маю план лікування / кошторис" })).not.toBeChecked();
    await back(page).click();
    await expect(page.locator("main h1")).toHaveText(SINGLE_Q);
    await expect(page.getByRole("button", { name: "Зуб уже видалений", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("the 'Назад' button is not rendered on the city step", async ({ page }) => {
    await page.goto("/calculator/");
    await expect(page.getByRole("button", { name: "Назад", exact: true })).toHaveCount(0);
  });
});

// ───────────────────────── Q00 routing ─────────────────────────

test.describe("Q00 routing", () => {
  const cases: [string, string[] | null, string][] = [
    ["skip", null, CTA.tender],
    ["Маю план", ["Маю план лікування / кошторис"], CTA.plan],
    ["Маю КТ", ["Маю КТ"], CTA.ct],
    ["КТ + план → план", ["Маю КТ", "Маю план лікування / кошторис"], CTA.plan],
    ["Мені вже назвали вартість", ["Мені вже назвали вартість"], CTA.tender],
    ["Нічого з цього", ["Нічого з цього"], CTA.tender],
    ["КТ + вартість", ["Маю КТ", "Мені вже назвали вартість"], CTA.ct],
  ];
  for (const [name, picks, expected] of cases) {
    test(`clear scenario: ${name} → ${expected}`, async ({ page }) => {
      await toResult(page, "Львів", SINGLE_REMOVED, picks);
      expect(await ctaLabelOf(page)).toBe(expected);
    });
  }

  test("mass extraction wins over plan / КТ", async ({ page }) => {
    await toResult(
      page,
      "Львів",
      [
        [TEETH_Q, "4–6 зубів поруч"],
        [ADJ_2_3_Q, "6 зубів"],
        [ADJ_STATE_Q, "Рекомендують видалення"],
      ],
      ["Маю план лікування / кошторис", "Маю КТ"],
    );
    expect(await ctaLabelOf(page)).toBe(CTA.massExtraction);
  });

  test("low-confidence scenario: КТ → КТ CTA, nothing → consultation", async ({ page }) => {
    const steps: Step[] = [
      [TEETH_Q, "1 зуб"],
      [SINGLE_Q, "Не знаю, чи можна його зберегти"],
    ];
    await toResult(page, "Львів", steps, ["Маю КТ"]);
    expect(await ctaLabelOf(page)).toBe(CTA.ct);
  });

  test("'Нічого з цього' is exclusive, both directions; button disabled when nothing is ticked", async ({ page }) => {
    await selectCity(page, "Львів");
    await runSteps(page, SINGLE_REMOVED);
    await expect(page.locator("main h1")).toHaveText(Q00);
    const show = page.getByRole("button", { name: "Показати результат", exact: true });
    const ct = page.getByRole("checkbox", { name: "Маю КТ" });
    const plan = page.getByRole("checkbox", { name: "Маю план лікування / кошторис" });
    const quote = page.getByRole("checkbox", { name: "Мені вже назвали вартість" });
    const none = page.getByRole("checkbox", { name: "Нічого з цього" });

    await expect(show).toBeDisabled();
    await expect(page.getByRole("button", { name: "Пропустити", exact: true })).toBeEnabled();
    await ct.check();
    await plan.check();
    await quote.check();
    await expect(show).toBeEnabled();
    await none.check();
    await expect(none).toBeChecked();
    for (const c of [ct, plan, quote]) await expect(c).not.toBeChecked();
    await ct.check();
    await expect(none).not.toBeChecked();
    await expect(ct).toBeChecked();
    await ct.uncheck();
    await expect(show).toBeDisabled();
  });

  test("'Мені вже назвали вартість' + 'Нічого з цього' result does not open comparison", async ({ page }) => {
    await toResult(page, "Львів", SINGLE_REMOVED, ["Нічого з цього"]);
    await expect(page.getByLabel("Яку суму вам назвали?")).toHaveCount(0);
  });

  test("CTA button opens the lead dialog with the same service; dialog closes", async ({ page }) => {
    await toResult(page, "Львів", SINGLE_REMOVED, ["Маю КТ"]);
    await ctaBlock(page).getByRole("button", { name: CTA.ct }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("КТ");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

// ───────────────────────── layout at 412px ─────────────────────────

test.describe("layout", () => {
  const samples: [string, Step[], string[] | null][] = [
    ["4–6 не знаю × рекомендують видалення (mass)", [[TEETH_Q, "4–6 зубів поруч"], [ADJ_2_3_Q, "Не знаю"], [ADJ_STATE_Q, "Рекомендують видалення"]], null],
    ["separate >6 (arch rows)", [[TEETH_Q, "Кілька зубів у різних місцях"], [SEP_COUNT_Q, "Більше 6"], [SEP_STATE_Q, "Рекомендують видалення"]], null],
    ["separate unknown × some implants (long copy)", [[TEETH_Q, "Кілька зубів у різних місцях"], [SEP_COUNT_Q, "Не знаю"], [SEP_STATE_Q, "Частина імплантів уже встановлена"], [EXISTING_Q, "Не знаю"], [SYSTEM_Q, "Ні або не пам’ятаю"]], ["Мені вже назвали вартість"]],
    ["single removed with quote", SINGLE_REMOVED, ["Мені вже назвали вартість"]],
  ];
  for (const [name, steps, picks] of samples) {
    test(`no horizontal overflow, customiser + details + comparison open: ${name}`, async ({ page }) => {
      await toResult(page, "Львів", steps, picks);
      const custom = page.getByRole("button", { name: "Налаштувати варіант" });
      if (await custom.count()) await custom.click();
      await page.getByText(/Деталізація за складовими/).click();
      const compare = page.getByRole("button", { name: "Порівняти пропозицію клініки" });
      if (await compare.count()) await compare.click();
      const ow = await page.evaluate(() => {
        const bad: string[] = [];
        const vw = document.documentElement.clientWidth;
        document.querySelectorAll("main *").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
            // elements inside an intentionally scrollable container are fine
            if (el.closest(".overflow-x-auto")) return;
            bad.push(`${el.tagName}.${(el.getAttribute("class") ?? "").slice(0, 40)} [${Math.round(r.left)}..${Math.round(r.right)}] ${(el.textContent ?? "").slice(0, 30)}`);
          }
        });
        return { bad, sw: document.documentElement.scrollWidth, vw };
      });
      expect(ow.sw, JSON.stringify(ow.bad.slice(0, 5))).toBeLessThanOrEqual(ow.vw);
      expect(ow.bad.slice(0, 5)).toEqual([]);
    });
  }
});

// ───────────────────────── content issues found while clicking through ─────────────────────────

test.describe("existing implants in 'separate' branch", () => {
  const steps: Step[] = [
    [TEETH_Q, "Кілька зубів у різних місцях"],
    [SEP_COUNT_Q, "2 зуби"],
    [SEP_STATE_Q, "Частина імплантів уже встановлена"],
    [EXISTING_Q, "2"],
    [SYSTEM_Q, "Так"],
  ];

  test("1 new + 1 existing implant wording (no '0 ...' term)", async ({ page }) => {
    await toResult(page, "Львів", [
      [TEETH_Q, "Кілька зубів у різних місцях"],
      [SEP_COUNT_Q, "2 зуби"],
      [SEP_STATE_Q, "Частина імплантів уже встановлена"],
      [EXISTING_Q, "1"],
      [SYSTEM_Q, "Так"],
    ]);
    await expect(page.getByText(/Референс для оцінки/)).toContainText("1 новий імплант + 1 вже встановлений імплант + 2 ортопедичні одиниці");
  });

  test("reference note does not mention '0 імплантів нових'", async ({ page }) => {
    await toResult(page, "Львів", steps);
    const note = page.getByText(/Референс для оцінки/);
    await expect(note).not.toContainText(/(^|\s)0 /);
    await expect(note).toContainText("2 вже встановлені імпланти + 2 ортопедичні одиниці");
  });

  test("'Що входить у розрахунок' lists only the prosthetic stage when all implants are already placed", async ({ page }) => {
    await toResult(page, "Львів", steps);
    const included = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Що входить у розрахунок" }) });
    await expect(included).not.toContainText("Імпланти та їх встановлення");
    await expect(included).not.toContainText("Місцева анестезія");
    await expect(included).toContainText("Абатмент / компоненти");
    await expect(included).toContainText("Сканування / відбиток");
    await expect(included).toContainText("Постійна коронка");
  });
});
