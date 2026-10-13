/**
 * DENVA AI v2 patient calculator — click-through e2e (mobile, Pixel 7).
 * Runs against a build made with NEXT_PUBLIC_DATA_SOURCE=fixture, whose demo
 * prices are asserted below (Львів ×1.0, Київ ×1.15, Чернівці ×0.9, ...).
 */
import { test as base, expect, type Locator, type Page } from "@playwright/test";

// ───────────────────────── fixtures: fail on console / page errors ─────────────────────────

const test = base.extend<{ pageGuard: void }>({
  pageGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
      });
      await use();
      expect(errors, "console / page errors").toEqual([]);
    },
    { auto: true },
  ],
});

// ───────────────────────── helpers ─────────────────────────

const nb = (s: string | null) => (s ?? "").replace(/ /g, " ");

const Q = {
  scope: "Які зуби потрібно замінити імплантами?",
  toothState: "Що зараз із цим зубом?",
  arrangement: "Як розташовані ці зуби?",
  sevenWhere: "Де розташовані ці зуби?",
  jawState: "Яка зараз ситуація?",
  approx: "Скільки приблизно зубів відсутні або потребують видалення?",
};

const h1 = (page: Page) => page.getByRole("heading", { level: 1 });
const slider = (page: Page) => page.getByRole("slider", { name: "Кількість зубів" });
const price = (page: Page, tier: "minimum" | "classic" | "premium") => page.getByTestId(`price-${tier}`);

async function expectPrice(page: Page, tier: "minimum" | "classic" | "premium", text: string) {
  await expect(price(page, tier)).toHaveText(new RegExp(`^${text.replace(/ /g, "[\\s\\u00a0]")}$`));
}

async function pickCity(page: Page, id: string, query: string, path = "/") {
  await page.goto(path);
  await page.getByLabel("Оберіть місто лікування").fill(query);
  await page.getByTestId(`location-city-${id}`).click();
  await expect(h1(page)).toHaveText(Q.scope);
}

async function chooseOption(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name, exact: typeof name === "string" }).click();
}

/** Open "Окремі зуби", set the slider with the keyboard, continue. */
async function individual(page: Page, count: number) {
  await chooseOption(page, "Окремі зуби");
  const s = slider(page);
  await expect(s).toBeVisible();
  await s.focus();
  await s.press("Home");
  for (let i = 1; i < count; i += 1) await s.press("ArrowRight");
  await expect(s).toHaveAttribute("aria-valuenow", String(count));
  await page.getByRole("button", { name: "Продовжити" }).click();
}

async function openResult(page: Page) {
  await expect(h1(page)).toHaveText("Орієнтовна вартість імплантації");
}

/** Lviv, individual teeth, then the follow-up answer. */
async function lvivTeeth(page: Page, count: number, question: string, answer: string) {
  await pickCity(page, "lviv", "льв");
  await individual(page, count);
  await expect(h1(page)).toHaveText(question);
  await chooseOption(page, answer);
  await openResult(page);
}

async function lvivJaws(page: Page, scope: string, answer = "Зубів немає") {
  await pickCity(page, "lviv", "льв");
  await chooseOption(page, scope);
  await expect(h1(page)).toHaveText(Q.jawState);
  await chooseOption(page, answer);
  await openResult(page);
}

const group = (page: Page, name: string) => page.getByRole("group", { name, exact: true });
const tierButton = (page: Page, groupName: string, tier: string) =>
  group(page, groupName).getByRole("button", { name: tier, exact: true });

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function sliderPoint(s: Locator, value: number) {
  const box = await s.boundingBox();
  if (!box) throw new Error("slider has no box");
  return { x: box.x + (box.width * (value - 0.5)) / 7, y: box.y + box.height / 2 };
}

// ───────────────────────── 1. city screen (ТЗ §5.1) ─────────────────────────

test.describe("city screen", () => {
  test("texts, search appears after typing, no city → oblast", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Калькулятор імплантації — DENVA AI");
    await expect(h1(page)).toHaveText("Калькулятор імплантації");
    await expect(page.getByText("Дізнайтеся орієнтовну вартість імплантації у вашому місті")).toBeVisible();
    await expect(page.getByRole("link", { name: /DENVA AI/ })).toBeVisible();

    const input = page.getByLabel("Оберіть місто лікування");
    await expect(input).toBeVisible();
    // The list appears only after the first letters are typed.
    await expect(page.getByRole("list", { name: "Знайдені міста" })).toHaveCount(0);
    await input.fill("в");
    await expect(page.getByTestId("location-city-lviv")).toBeVisible();
    await input.fill("kyiv");
    await expect(page.getByTestId("location-city-kyiv")).toBeVisible();
    await input.fill("zzzz");
    await expect(page.getByText("Такого міста немає в списку.")).toBeVisible();

    await page.getByRole("button", { name: "Немає мого міста — оберіть область" }).click();
    await expect(page.getByRole("list", { name: "Області" })).toBeVisible();
    await page.getByTestId("location-region-zakarpatska").click();
    await expect(h1(page)).toHaveText(Q.scope);
    await expect(page.getByTestId("city-chip")).toHaveText("Закарпатська область");
  });

  test("is server-rendered and /calculator/ renders the same app", async ({ page, request }) => {
    const html = await (await request.get("/")).text();
    expect(html).toContain("Калькулятор імплантації");
    expect(html).toContain("Оберіть місто лікування");

    await page.goto("/calculator/");
    await expect(h1(page)).toHaveText("Калькулятор імплантації");
    await page.getByLabel("Оберіть місто лікування").fill("льв");
    await page.getByTestId("location-city-lviv").click();
    await expect(h1(page)).toHaveText(Q.scope);
  });
});

// ───────────────────────── 2. scope screen + inline slider (ТЗ §5.2) ─────────────────────────

test.describe("scope screen", () => {
  test("four options and the explanation", async ({ page }) => {
    await pickCity(page, "lviv", "льв");
    await expect(
      page.getByText(
        "Враховуйте лише відсутні зуби або ті, які потрібно видалити. Не враховуйте власні зуби, на які плануються коронки.",
      ),
    ).toBeVisible();
    for (const label of ["Окремі зуби", "Усі зуби на одній щелепі", "Усі зуби на обох щелепах", "Не знаю точно"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    await expect(slider(page)).toBeHidden();
  });

  test("slider expands inline; tap, drag and keyboard; no auto-advance", async ({ page }) => {
    await pickCity(page, "lviv", "льв");
    await chooseOption(page, "Окремі зуби");

    // Same screen, slider appears below.
    await expect(h1(page)).toHaveText(Q.scope);
    const s = slider(page);
    await expect(s).toBeVisible();
    await expect(s).toHaveAttribute("aria-valuemin", "1");
    await expect(s).toHaveAttribute("aria-valuemax", "7");
    await expect(s).toHaveAttribute("aria-valuenow", "1");
    await expect(s).toHaveAttribute("aria-valuetext", "1 зуб");
    await expect(page.getByTestId("teeth-value")).toContainText("1 зуб");

    // Tap on a mark (touch).
    const p5 = await sliderPoint(s, 5);
    await page.touchscreen.tap(p5.x, p5.y);
    await expect(s).toHaveAttribute("aria-valuenow", "5");
    await expect(page.getByTestId("teeth-value")).toContainText("5 зубів");

    // Click with the mouse on the "3" mark.
    await page.locator('[data-mark="3"]').click();
    await expect(s).toHaveAttribute("aria-valuenow", "3");
    await expect(s).toHaveAttribute("aria-valuetext", "3 зуби");

    // Drag to 7+.
    const from = await sliderPoint(s, 3);
    const to = await sliderPoint(s, 7);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    await expect(s).toHaveAttribute("aria-valuenow", "7");
    await expect(s).toHaveAttribute("aria-valuetext", "7 і більше зубів");
    await expect(page.getByTestId("teeth-value")).toContainText("7+");

    // Keyboard.
    await s.focus();
    await s.press("ArrowLeft");
    await expect(s).toHaveAttribute("aria-valuenow", "6");
    await s.press("Home");
    await expect(s).toHaveAttribute("aria-valuenow", "1");
    await s.press("End");
    await expect(s).toHaveAttribute("aria-valuenow", "7");
    await s.press("ArrowRight");
    await expect(s).toHaveAttribute("aria-valuenow", "7");
    await s.press("ArrowDown");
    await expect(s).toHaveAttribute("aria-valuenow", "6");

    // No automatic transition: still on the same screen after a pause.
    await page.waitForTimeout(700);
    await expect(h1(page)).toHaveText(Q.scope);

    // Only the button moves on.
    await page.getByRole("button", { name: "Продовжити" }).click();
    await expect(h1(page)).toHaveText(Q.arrangement);
  });

  test("another option collapses the slider and moves on", async ({ page }) => {
    await pickCity(page, "lviv", "льв");
    await chooseOption(page, "Окремі зуби");
    await expect(slider(page)).toBeVisible();
    await chooseOption(page, "Усі зуби на одній щелепі");
    await expect(h1(page)).toHaveText(Q.jawState);
  });
});

// ───────────────────────── 3. every branch (ТЗ §5.3) ─────────────────────────

test.describe("follow-up branches", () => {
  const cases: { name: string; count: number; question: string; options: string[] }[] = [
    {
      name: "1 tooth",
      count: 1,
      question: Q.toothState,
      options: ["Зуб уже видалений", "Зуб ще є (потрібно видалити)", "Імплант уже встановлений", "Не знаю"],
    },
    {
      name: "2–6 teeth",
      count: 4,
      question: Q.arrangement,
      options: ["Поруч", "У різних місцях", "Частина поруч, частина окремо", "Не знаю"],
    },
    {
      name: "7+ teeth",
      count: 7,
      question: Q.sevenWhere,
      options: ["Переважно на одній щелепі", "На обох щелепах", "Не знаю"],
    },
  ];

  for (const c of cases) {
    test(`${c.name}: question, every option leads to a result`, async ({ page }) => {
      for (const option of c.options) {
        await pickCity(page, "lviv", "льв");
        await individual(page, c.count);
        await expect(h1(page)).toHaveText(c.question);
        for (const o of c.options) await expect(page.getByRole("button", { name: o, exact: true })).toBeVisible();
        await chooseOption(page, option);
        await openResult(page);
        await expect(price(page, "classic")).not.toHaveText("Даних поки недостатньо");
      }
    });
  }

  for (const scope of ["Усі зуби на одній щелепі", "Усі зуби на обох щелепах"]) {
    test(`${scope}: question and every option`, async ({ page }) => {
      for (const option of ["Зубів немає", "Зуби ще є", "Є знімна або інша конструкція", "Не знаю"]) {
        await pickCity(page, "lviv", "льв");
        await chooseOption(page, scope);
        await expect(h1(page)).toHaveText(Q.jawState);
        await chooseOption(page, option);
        await openResult(page);
        await expect(page.getByRole("tab", { name: "All-on-4" })).toHaveAttribute("aria-selected", "true");
      }
    });
  }

  test("Не знаю точно: one / several / most / unknown", async ({ page }) => {
    const open = async () => {
      await pickCity(page, "lviv", "льв");
      await chooseOption(page, "Не знаю точно");
      await expect(h1(page)).toHaveText(Q.approx);
    };
    await open();
    for (const o of ["Один", "Кілька", "Більшість на одній щелепі", "Не знаю"]) {
      await expect(page.getByRole("button", { name: o, exact: true })).toBeVisible();
    }

    // Один → one tooth, state unknown.
    await chooseOption(page, "Один");
    await openResult(page);
    await expect(page.getByTestId("scenario-label")).toHaveText("1 зуб");
    await expectPrice(page, "classic", "36 800 грн");

    // Кілька → 3 teeth, range, note that the count can be changed.
    await open();
    await chooseOption(page, "Кілька");
    await openResult(page);
    await expect(page.getByText(/Ви вказали «кілька» зубів/)).toBeVisible();
    await expect(page.getByTestId("scenario-label")).toContainText("3 зуби");
    await expectPrice(page, "classic", "82 100–107 400 грн");

    // Більшість → All-on, one jaw.
    await open();
    await chooseOption(page, "Більшість на одній щелепі");
    await openResult(page);
    await expect(page.getByRole("tab", { name: "All-on-4" })).toBeVisible();
    await expect(page.getByTestId("scenario-label")).toContainText("Усі зуби на одній щелепі");

    // Не знаю → reference price of ONE tooth.
    await open();
    await chooseOption(page, "Не знаю");
    await expect(h1(page)).toHaveText("Довідкова ціна одного зуба");
    await expectPrice(page, "classic", "36 800 грн");
  });

  test("never asks about CT, sedation, bone, sinus, guide or extraction complexity", async ({ page }) => {
    await pickCity(page, "lviv", "льв");
    const screens: string[] = [nb(await page.locator("main").innerText())];
    await individual(page, 1);
    screens.push(nb(await page.locator("main").innerText()));
    await chooseOption(page, "Не знаю");
    await page.getByRole("button", { name: "Назад" }).click();
    await page.getByRole("button", { name: "Назад" }).click();
    await chooseOption(page, "Не знаю точно");
    screens.push(nb(await page.locator("main").innerText()));
    for (const text of screens) {
      expect(text).not.toMatch(/(^|\s)КТ(\s|$)|седаці|кістков|синус|шаблон|складн/i);
    }
  });
});

// ───────────────────────── 4. back keeps the answers (ТЗ §10) ─────────────────────────

test("back navigation never loses answers", async ({ page }) => {
  await pickCity(page, "lviv", "льв");
  await individual(page, 4);
  await chooseOption(page, "У різних місцях");
  await openResult(page);

  await page.getByRole("button", { name: "Назад" }).click();
  await expect(h1(page)).toHaveText(Q.arrangement);
  await expect(page.getByRole("button", { name: "У різних місцях", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Назад" }).click();
  await expect(h1(page)).toHaveText(Q.scope);
  await expect(page.getByRole("button", { name: "Окремі зуби" })).toHaveAttribute("aria-pressed", "true");
  await expect(slider(page)).toHaveAttribute("aria-valuenow", "4");

  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page.getByLabel("Оберіть місто лікування")).toBeVisible();

  // Forward again: the same answers are still there.
  await page.getByLabel("Оберіть місто лікування").fill("льв");
  await page.getByTestId("location-city-lviv").click();
  await expect(slider(page)).toHaveAttribute("aria-valuenow", "4");
  await page.getByRole("button", { name: "Продовжити" }).click();
  await expect(page.getByRole("button", { name: "У різних місцях", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("changing the city from the header keeps the answers and returns to the result", async ({ page }) => {
  await lvivTeeth(page, 1, Q.toothState, "Зуб уже видалений");
  await expectPrice(page, "classic", "36 800 грн");
  await page.getByTestId("city-chip").click();
  await page.getByLabel("Оберіть місто лікування").fill("київ");
  await page.getByTestId("location-city-kyiv").click();
  await openResult(page);
  await expectPrice(page, "classic", "40 100 грн");
});

// ───────────────────────── 5. result: presets, toggles, EUR (ТЗ §6.1) ─────────────────────────

test.describe("result: one tooth", () => {
  test("three preset cards, default Класичний, EUR with rate and date", async ({ page }) => {
    await lvivTeeth(page, 1, Q.toothState, "Зуб уже видалений");

    for (const [tier, name, caption] of [
      ["minimum", "Мінімальний", "Нижній перевірений ринковий рівень"],
      ["classic", "Класичний", "Типовий збалансований ринковий рівень"],
      ["premium", "Преміальний", "Вищий рівень систем, матеріалів і лабораторії"],
    ] as const) {
      const card = page.getByTestId(`card-${tier}`);
      await expect(card).toContainText(name);
      await expect(card).toContainText(caption);
    }
    await expect(page.getByTestId("card-classic").getByRole("button").first()).toHaveAttribute("aria-pressed", "true");
    await expectPrice(page, "minimum", "27 800 грн");
    await expectPrice(page, "classic", "36 800 грн");
    await expectPrice(page, "premium", "51 800 грн");

    // 36 800 / 50.1385 ≈ 734 → 730 €
    await expect(page.getByTestId("eur-classic")).toHaveText(/^≈\s730\s€$/);
    const rate = nb(await page.getByTestId("eur-rate").innerText());
    expect(rate).toContain("50,14");
    expect(rate).toContain("9 жовтня 2026");

    // Breakdown: components, no clinic names.
    const breakdown = nb(await page.getByTestId("breakdown").innerText());
    for (const part of ["Встановлення імпланта", "Формувач ясен", "Цифрове сканування", "Абатмент і кріплення", "Коронка на імпланті"]) {
      expect(breakdown).toContain(part);
    }
    await expect(page.getByTestId("source-city")).toHaveText("Львів");
    await expect(page.getByTestId("source-date")).toHaveText("9 жовтня 2026");
    await expect(page.getByTestId("source-note")).toContainText("демо-дані");
  });

  test("implant and crown toggles are independent and update sum, breakdown and EUR", async ({ page }) => {
    await lvivTeeth(page, 1, Q.toothState, "Зуб уже видалений");
    await expectPrice(page, "classic", "36 800 грн");

    await tierButton(page, "Рівень імпланта", "Преміальний").click();
    await expectPrice(page, "classic", "46 800 грн"); // 28 000 + 1 800 + 1 500 + 5 500 + 10 000
    await expect(page.getByTestId("eur-classic")).toHaveText(/^≈\s930\s€$/);

    await tierButton(page, "Рівень коронки", "Мінімальний").click();
    await expectPrice(page, "classic", "43 800 грн"); // premium implant + minimum crown

    await tierButton(page, "Рівень імпланта", "Мінімальний").click();
    await tierButton(page, "Рівень коронки", "Преміальний").click();
    await expectPrice(page, "classic", "35 800 грн"); // minimum implant + premium crown
    await expect(page.getByTestId("eur-classic")).toHaveText(/^≈\s710\s€$/);
    expect(nb(await page.getByTestId("breakdown").innerText())).toMatch(/12 000 грн/);

    // Other preset cards stay untouched; picking one resets both toggles to its level.
    await expectPrice(page, "premium", "51 800 грн");
    await page.getByTestId("card-premium").getByRole("button").first().click();
    await expectPrice(page, "premium", "51 800 грн");
    await expect(tierButton(page, "Рівень імпланта", "Преміальний")).toHaveAttribute("aria-pressed", "true");
    await expect(tierButton(page, "Рівень коронки", "Преміальний")).toHaveAttribute("aria-pressed", "true");
    await expectPrice(page, "classic", "36 800 грн");
  });

  test("already placed implant: only superstructure + crown + scan, no implant toggle", async ({ page }) => {
    await lvivTeeth(page, 1, Q.toothState, "Імплант уже встановлений");
    await expectPrice(page, "classic", "17 000 грн"); // 5 500 + 10 000 + 1 500
    await expect(group(page, "Рівень імпланта")).toHaveCount(0);
    await expect(group(page, "Рівень коронки")).toBeVisible();
    const breakdown = nb(await page.getByTestId("breakdown").innerText());
    expect(breakdown).not.toContain("Встановлення імпланта");
    expect(breakdown).not.toContain("Формувач");
  });

  test("tooth still present highlights extraction in add-ons, never in the total", async ({ page }) => {
    await lvivTeeth(page, 1, Q.toothState, "Зуб ще є (потрібно видалити)");
    await expectPrice(page, "classic", "36 800 грн");
    await expect(page.getByTestId("addon-EXTRACTION_SIMPLE")).toHaveAttribute("data-highlight", "true");
    await expect(page.getByTestId("addon-EXTRACTION_COMPLEX")).toHaveAttribute("data-highlight", "true");
    await expect(page.getByTestId("addon-AUGMENT")).toHaveAttribute("data-highlight", "false");
    await expect(page.getByText(/Ви вказали, що зуби ще є/)).toBeVisible();
  });

  test("add-ons block lists extra costs apart from the total", async ({ page }) => {
    await lvivTeeth(page, 1, Q.toothState, "Зуб уже видалений");
    const addons = page.getByTestId("addons");
    await expect(addons.getByRole("heading", { name: "Можливі додаткові витрати" })).toBeVisible();
    for (const [code, amount] of [
      ["EXTRACTION_SIMPLE", "1 100 грн"],
      ["EXTRACTION_COMPLEX", "2 500 грн"],
      ["TEMP_CROWN_UNIT", "2 500 грн"],
      ["AUGMENT", "12 000 грн"],
      ["SINUS", "18 000 грн"],
      ["SOFT_TISSUE", "7 500 грн"],
      ["SEDATION", "4 000 грн"],
      ["SURGICAL_GUIDE", "4 500 грн"],
    ]) {
      expect(nb(await page.getByTestId(`addon-${code}`).innerText())).toContain(amount);
    }
    await expect(addons).toContainText("Не входять у суму");
    // The total stays the pure 4.1 formula, whatever add-ons exist.
    await expectPrice(page, "classic", "36 800 грн");
    await expect(page.getByTestId("disclaimer")).toContainText("консультації лікаря та КТ");
  });
});

test.describe("result: several teeth", () => {
  test("adjacent 3 → 2 implants + 3 crowns; separate 3 → 3 + 3; mixed → range", async ({ page }) => {
    await lvivTeeth(page, 3, Q.arrangement, "Поруч");
    // 2×18 000 + 2×1 800 + 1 500 + 2×5 500 + 3×10 000
    await expectPrice(page, "classic", "82 100 грн");

    await page.getByRole("button", { name: "Назад" }).click();
    await chooseOption(page, "У різних місцях");
    await openResult(page);
    // 3×18 000 + 3×1 800 + 1 500 + 3×5 500 + 3×10 000
    await expectPrice(page, "classic", "107 400 грн");

    for (const answer of ["Частина поруч, частина окремо", "Не знаю"]) {
      await page.getByRole("button", { name: "Назад" }).click();
      await chooseOption(page, answer);
      await openResult(page);
      await expectPrice(page, "classic", "82 100–107 400 грн");
      await expect(page.getByTestId("range-note")).toContainText("визначає лікар");
      await expect(page.getByTestId("eur-classic")).toHaveText(/^≈\s1\s640–2\s140\s€$/);
    }
  });

  test("2 teeth: ranges collapse to one amount", async ({ page }) => {
    await lvivTeeth(page, 2, Q.arrangement, "Не знаю");
    // 2×18 000 + 2×1 800 + 1 500 + 2×5 500 + 2×10 000 = 72 100 for both variants.
    await expectPrice(page, "classic", "72 100 грн");
  });
});

// ───────────────────────── 6. full arch (ТЗ §6.2) ─────────────────────────

test.describe("result: full arch", () => {
  test("one jaw: All-on tabs, first stage as the main figure, permanent and total below", async ({ page }) => {
    await lvivJaws(page, "Усі зуби на одній щелепі");

    const tabs = page.getByRole("tablist", { name: "Кількість імплантів на щелепі" });
    await expect(tabs.getByRole("tab")).toHaveText(["All-on-4", "All-on-6", "All-on-8"]);
    await expect(page.getByTestId("card-classic")).toContainText("Перший етап (з тимчасовими зубами)");
    await expect(page.getByText("Постійна конструкція", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Загальний бюджет лікування")).toBeVisible();
    // Nothing is called "recommended".
    await expect(page.getByText(/не є медичною\s+рекомендацією/)).toBeVisible();

    // All-on-4: first stage 4×18 000 + 4×6 500 + 38 000 + 1 500 = 137 500
    await expectPrice(page, "classic", "137 500 грн");
    expect(nb(await page.getByTestId("arch-permanent").innerText())).toContain("131 500 грн"); // 130 000 + 1 500
    expect(nb(await page.getByTestId("arch-full").innerText())).toContain("269 000 грн");
    await expect(page.getByTestId("eur-classic")).toHaveText(/^≈\s2\s740\s€$/);

    await page.getByRole("tab", { name: "All-on-6" }).click();
    await expect(page.getByRole("tab", { name: "All-on-6" })).toHaveAttribute("aria-selected", "true");
    await expectPrice(page, "classic", "186 500 грн"); // 6×18 000 + 6×6 500 + 38 000 + 1 500
    expect(nb(await page.getByTestId("arch-full").innerText())).toContain("318 000 грн");

    await page.getByRole("tab", { name: "All-on-8" }).click();
    await expectPrice(page, "classic", "235 500 грн");
    expect(nb(await page.getByTestId("arch-full").innerText())).toContain("367 000 грн");

    // Each tab shows all three levels.
    await expectPrice(page, "minimum", "187 500 грн"); // 8×12 000 + 8×6 500 + 38 000 + 1 500
    await expectPrice(page, "premium", "315 500 грн"); // 8×28 000 + 8×6 500 + 38 000 + 1 500
  });

  test("arch toggles are 'Рівень імплантів' and 'Рівень постійної конструкції'", async ({ page }) => {
    await lvivJaws(page, "Усі зуби на одній щелепі");
    await expect(group(page, "Рівень імплантів")).toBeVisible();
    await expect(group(page, "Рівень постійної конструкції")).toBeVisible();
    await tierButton(page, "Рівень постійної конструкції", "Преміальний").click();
    await expectPrice(page, "classic", "137 500 грн"); // first stage unchanged
    expect(nb(await page.getByTestId("arch-permanent").innerText())).toContain("211 500 грн"); // 210 000 + 1 500
    expect(nb(await page.getByTestId("arch-full").innerText())).toContain("349 000 грн");
    await tierButton(page, "Рівень імплантів", "Мінімальний").click();
    // first stage: 4×12 000 + 4×6 500 + 38 000 + 1 500 = 113 500
    await expectPrice(page, "classic", "113 500 грн");
    expect(nb(await page.getByTestId("arch-full").innerText())).toContain("325 000 грн");
  });

  test("both jaws: implants, multiunits and structures double, the scan is counted once per stage", async ({ page }) => {
    await lvivJaws(page, "Усі зуби на обох щелепах");
    // first stage: 8×18 000 + 8×6 500 + 2×38 000 + 1 500 = 273 500 (doubled scan would be 275 000)
    await expectPrice(page, "classic", "273 500 грн");
    // permanent: 2×130 000 + 1 500 = 261 500 → total 535 000
    expect(nb(await page.getByTestId("arch-permanent").innerText())).toContain("261 500 грн");
    expect(nb(await page.getByTestId("arch-full").innerText())).toContain("535 000 грн");
    await expect(page.getByTestId("breakdown")).toContainText("Цифрове сканування");
    // The scan line is ×1 in both stages: no "× 2" next to it.
    const scanRows = page.getByTestId("breakdown").locator("li", { hasText: "Цифрове сканування" });
    await expect(scanRows).toHaveCount(2);
    for (const row of await scanRows.all()) expect(nb(await row.innerText())).not.toContain("× 2");
  });

  test("7+ teeth: All-on only plus a sentence about a segmental bridge", async ({ page }) => {
    await pickCity(page, "lviv", "льв");
    await individual(page, 7);
    await chooseOption(page, "Переважно на одній щелепі");
    await openResult(page);
    await expect(page.getByTestId("segment-note")).toContainText("сегментний міст");
    await expect(page.getByTestId("segment-note")).toContainText("схему визначає лікар");
    await expectPrice(page, "classic", "137 500 грн");

    // "На обох щелепах" → two jaws.
    await page.getByRole("button", { name: "Назад" }).click();
    await chooseOption(page, "На обох щелепах");
    await openResult(page);
    await expectPrice(page, "classic", "273 500 грн");
  });
});

// ───────────────────────── 7. changing parameters on the result ─────────────────────────

test("parameters can be changed on the result page without redoing the flow", async ({ page }) => {
  await lvivTeeth(page, 1, Q.toothState, "Зуб уже видалений");
  await expectPrice(page, "classic", "36 800 грн");
  await tierButton(page, "Рівень коронки", "Мінімальний").click(); // 33 800

  await page.getByRole("button", { name: "Змінити параметри" }).click();
  const panel = page.getByTestId("params-panel");
  await expect(panel).toBeVisible();

  // tooth state → implant already placed
  await panel.getByRole("button", { name: "Імплант уже встановлений", exact: true }).click();
  await expectPrice(page, "classic", "14 000 грн"); // 5 500 + 7 000 + 1 500, crown level kept
  await expect(page.getByTestId("scenario-label")).toContainText("імплант уже встановлений");

  // slider → 4 teeth, arrangement adjacent
  await slider(page).focus();
  for (let i = 1; i < 4; i += 1) await slider(page).press("ArrowRight");
  await panel.getByRole("button", { name: "Поруч", exact: true }).click();
  // 2×18 000 + 2×1 800 + 1 500 + 2×5 500 + 4×7 000 (crowns still minimum)
  await expectPrice(page, "classic", "80 100 грн");
  await expect(page.getByTestId("scenario-label")).toHaveText("4 зуби · поруч");

  // → all teeth on both jaws → All-on tabs appear
  await panel.getByRole("button", { name: "Обидві щелепи", exact: true }).click();
  await expect(page.getByRole("tab", { name: "All-on-4" })).toBeVisible();
  await expect(page.getByTestId("scenario-label")).toContainText("обох щелепах");

  // → back to single teeth
  await panel.getByRole("button", { name: "Окремі зуби", exact: true }).click();
  await expect(page.getByRole("tab", { name: "All-on-4" })).toHaveCount(0);

  // the CTA text of the lead block follows the final scenario
  await expect(page.getByTestId("lead-block")).toBeVisible();
});

// ───────────────────────── 8. price sources and missing data ─────────────────────────

test.describe("price sources (ТЗ §6.1, §2.3)", () => {
  test("manual city → статистичний орієнтир Denva, date and city", async ({ page }) => {
    await pickCity(page, "chernivtsi", "чернів");
    await individual(page, 1);
    await chooseOption(page, "Зуб уже видалений");
    await openResult(page);
    await expect(page.getByTestId("source-label")).toHaveText("статистичний орієнтир Denva");
    await expect(page.getByTestId("source-city")).toHaveText("Чернівці");
    // ×0.9, rounded to 100: 16 200 + 1 600 + 1 400 + 5 000 + 9 000
    await expectPrice(page, "classic", "33 200 грн");
  });

  test("regional fallback → середня ціна регіону (city without own data)", async ({ page }) => {
    await pickCity(page, "vinnytsia", "вінн");
    await individual(page, 1);
    await chooseOption(page, "Зуб уже видалений");
    await openResult(page);
    await expect(page.getByTestId("source-label")).toHaveText("середня ціна регіону");
    await expect(page.getByTestId("source-note")).toContainText("власних даних поки немає");
    await expectPrice(page, "classic", "34 000 грн");
  });

  test("regional fallback via the oblast picker", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Немає мого міста — оберіть область" }).click();
    await page.getByTestId("location-region-vinnytska").click();
    await individual(page, 1);
    await chooseOption(page, "Зуб уже видалений");
    await openResult(page);
    await expect(page.getByTestId("source-label")).toHaveText("середня ціна регіону");
    await expect(page.getByTestId("source-city")).toHaveText("Вінницька область");
  });

  test("aggregate lines → clinic count; Kyiv shows '3 клінік' on the implant line", async ({ page }) => {
    await pickCity(page, "kyiv", "київ");
    await individual(page, 1);
    await chooseOption(page, "Зуб уже видалений");
    await openResult(page);
    // 18 500 (aggregate) + 2 100 + 1 700 + 6 300 + 11 500
    await expectPrice(page, "classic", "40 100 грн");
    // Mixed sources → the strongest caveat in the headline…
    await expect(page.getByTestId("source-label")).toHaveText("статистичний орієнтир Denva");
    // …and the aggregate line says where it comes from.
    const implantLine = page.getByTestId("breakdown").locator("li", { hasText: "Встановлення імпланта" });
    await expect(implantLine).toContainText("на основі прайсів 3 клінік");
    // The minimum implant is a manual value: no aggregate hint there.
    await tierButton(page, "Рівень імпланта", "Мінімальний").click();
    await expect(implantLine).not.toContainText("на основі прайсів");
  });

  test("all lines aggregate → на основі прайсів 4 клінік", async ({ page }) => {
    await pickCity(page, "dnipro", "дніпр");
    await individual(page, 1);
    await chooseOption(page, "Зуб уже видалений");
    await openResult(page);
    await expect(page.getByTestId("source-label")).toHaveText("на основі прайсів 4 клінік");
    await expectPrice(page, "classic", "38 700 грн");
  });

  test("city without any published prices → «Даних поки недостатньо», no invented numbers", async ({ page }) => {
    await pickCity(page, "uzhhorod", "ужг");
    await individual(page, 1);
    await chooseOption(page, "Зуб уже видалений");
    await openResult(page);
    for (const tier of ["minimum", "classic", "premium"] as const) {
      await expect(price(page, tier)).toHaveText("Даних поки недостатньо");
    }
    await expect(page.getByTestId("addons")).toHaveCount(0);
    expect(nb(await page.locator("main").innerText())).not.toMatch(/\d\s?\d{3}\s?грн/);
    // The lead block is still available.
    await expect(page.getByTestId("lead-block")).toBeVisible();

    // The same for a full arch.
    await page.getByRole("button", { name: "Змінити параметри" }).click();
    await page.getByTestId("params-panel").getByRole("button", { name: "Одна щелепа", exact: true }).click();
    await expect(price(page, "classic")).toHaveText("Даних поки недостатньо");
  });
});

// ───────────────────────── 9. wording rules ─────────────────────────

test("no «під ключ», no brand names as tiers, no clinic names", async ({ page }) => {
  await lvivTeeth(page, 3, Q.arrangement, "Не знаю");
  const text = nb(await page.locator("body").innerText());
  expect(text).not.toMatch(/під\s+ключ/i);
  expect(text).not.toMatch(/Nobel|Straumann|Osstem|Megagen|Alpha\s?Bio/i);
  expect(text).not.toMatch(/Базовий|Оптимальний/);
  expect(text).not.toMatch(/\bNaN\b|undefined|\bnull\b|Infinity/);
});

// ───────────────────────── 10. lead block (ТЗ §6.3) ─────────────────────────

test.describe("lead block", () => {
  const phone = "+380 50 123 45 67";

  async function resultWithLead(page: Page, search = "") {
    await pickCity(page, "lviv", "льв", `/${search}`);
    await individual(page, 1);
    await chooseOption(page, "Зуб уже видалений");
    await openResult(page);
  }

  test("sits below the result, is not a modal, asks only for a phone", async ({ page }) => {
    await resultWithLead(page);
    const block = page.getByTestId("lead-block");
    await expect(block).toContainText("Уточнити мій розрахунок");
    await expect(block).toContainText(
      "Координатор DENVA допоможе врахувати можливі видалення, тимчасові зуби, кісткову пластику та інші етапи, які неможливо визначити без додаткових даних",
    );
    await expect(page.getByRole("button", { name: "Уточнити мій розрахунок" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Надіслати мені розрахунок і список запитань для консультації" })).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page.getByTestId("lead-form")).toHaveCount(0);

    // The result is not blurred or covered.
    const filter = await page.getByTestId("card-classic").evaluate((el) => getComputedStyle(el).filter);
    expect(filter).toBe("none");

    // Below the result in the DOM and on the page.
    const resultBox = await page.getByTestId("card-premium").boundingBox();
    const leadBox = await block.boundingBox();
    expect((leadBox?.y ?? 0) > (resultBox?.y ?? 0)).toBe(true);

    await page.getByRole("button", { name: "Уточнити мій розрахунок" }).click();
    const form = page.getByTestId("lead-form");
    await expect(form).toBeVisible();
    expect(await form.locator("input").count()).toBe(1);
    await expect(form.getByLabel("Ваш номер телефону")).toBeFocused();
    await expect(form).toContainText("SMS-код не потрібен");
    // Still the same result on screen.
    await expectPrice(page, "classic", "36 800 грн");
  });

  test("invalid phone is rejected without sending", async ({ page }) => {
    await resultWithLead(page);
    await page.getByRole("button", { name: "Уточнити мій розрахунок" }).click();
    await page.getByLabel("Ваш номер телефону").fill("123");
    await page.getByRole("button", { name: "Надіслати заявку", exact: true }).click();
    await expect(page.getByText("Введіть номер телефону повністю")).toBeVisible();
    await expect(page.getByTestId("lead-form")).toBeVisible();
    await expect(page.getByText("Дякуємо! Заявку отримано.")).toHaveCount(0);
  });

  test("success: payload carries city, scenario, both levels, total, source, URL and UTM", async ({ page }) => {
    await resultWithLead(page, "?utm_source=google&utm_campaign=implants");
    await tierButton(page, "Рівень імпланта", "Преміальний").click();
    await tierButton(page, "Рівень коронки", "Мінімальний").click();

    await page.getByRole("button", { name: "Надіслати мені розрахунок і список запитань для консультації" }).click();
    await page.getByLabel("Ваш номер телефону").fill(phone);
    await page.getByRole("button", { name: "Надіслати розрахунок", exact: true }).click();
    await expect(page.getByText("Дякуємо! Заявку отримано.")).toBeVisible();

    const leads = await page.evaluate(
      () => (window as unknown as { __denvaFixtureLeads: { lead: Record<string, unknown> }[] }).__denvaFixtureLeads,
    );
    expect(leads).toHaveLength(1);
    const lead = leads[0].lead;
    expect(lead).toMatchObject({
      intent: "send_calculation",
      phone,
      location: { kind: "city", id: "lviv", name: "Львів" },
      scenario_label: "1 зуб · зуб уже видалений",
      implant_tier: "premium",
      crown_or_arch_tier: "minimum",
      total_uah: 43800,
      price_source: "статистичний орієнтир Denva",
      utm: { utm_source: "google", utm_campaign: "implants" },
    });
    expect(String(lead.page_url)).toContain("utm_source=google");
    expect(typeof lead.created_at).toBe("string");
    expect(lead.answers).toMatchObject({ scope: "individual", teeth_count: 1, tooth_state: "removed" });
  });

  test("Telegram failure: result stays usable, retry succeeds", async ({ page }) => {
    await resultWithLead(page);
    await page.getByRole("button", { name: "Уточнити мій розрахунок" }).click();
    await page.getByLabel("Ваш номер телефону").fill("+380 50 000 0000");
    await page.getByRole("button", { name: "Надіслати заявку", exact: true }).click();

    const error = page.getByTestId("lead-error");
    await expect(error).toContainText("Не вдалося доставити заявку");
    await expect(page.getByRole("button", { name: "Надіслати ще раз" })).toBeVisible();

    // Result is still fully usable.
    await tierButton(page, "Рівень коронки", "Преміальний").click();
    await expectPrice(page, "classic", "41 800 грн");

    await page.getByRole("button", { name: "Надіслати ще раз", exact: true }).click();
    await expect(page.getByText("Дякуємо! Заявку отримано.")).toBeVisible();
    const attempts = await page.evaluate(
      () => (window as unknown as { __denvaFixtureLeads: { attempts: number }[] }).__denvaFixtureLeads[0].attempts,
    );
    expect(attempts).toBe(2); // retried by lead_id, not duplicated
  });

  test("network failure: message, retry with a corrected number", async ({ page }) => {
    await resultWithLead(page);
    await page.getByRole("button", { name: "Уточнити мій розрахунок" }).click();
    await page.getByLabel("Ваш номер телефону").fill("+380 50 111 1111");
    await page.getByRole("button", { name: "Надіслати заявку", exact: true }).click();
    await expect(page.getByTestId("lead-error")).toContainText("Не вдалося доставити заявку");
    await expectPrice(page, "classic", "36 800 грн");

    await page.getByLabel("Ваш номер телефону").fill(phone);
    await page.getByRole("button", { name: "Надіслати ще раз", exact: true }).click();
    await expect(page.getByText("Дякуємо! Заявку отримано.")).toBeVisible();
  });
});

// ───────────────────────── 11. layout at 360 px ─────────────────────────

test("no horizontal overflow at 360 px on every screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await noHorizontalOverflow(page);
  await page.getByLabel("Оберіть місто лікування").fill("в");
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "Немає мого міста — оберіть область" }).click();
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "← Повернутися до пошуку міста" }).click();
  await page.getByLabel("Оберіть місто лікування").fill("київ");
  await page.getByTestId("location-city-kyiv").click();
  await noHorizontalOverflow(page);
  await chooseOption(page, "Окремі зуби");
  await expect(slider(page)).toBeVisible();
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "Продовжити" }).click();
  await noHorizontalOverflow(page);
  await chooseOption(page, "Не знаю");
  await openResult(page);
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "Змінити параметри" }).click();
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "Уточнити мій розрахунок" }).click();
  await noHorizontalOverflow(page);
  // Full arch, both jaws — the widest numbers.
  await page.getByTestId("params-panel").getByRole("button", { name: "Обидві щелепи", exact: true }).click();
  await noHorizontalOverflow(page);
  await page.getByRole("tab", { name: "All-on-8" }).click();
  await noHorizontalOverflow(page);
});
