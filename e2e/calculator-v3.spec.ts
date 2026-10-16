/**
 * DENVA AI v3 (ТЗ 3.3) patient calculator — click-through e2e (mobile, Pixel 7).
 * Runs against a build made with NEXT_PUBLIC_DATA_SOURCE=fixture, whose demo
 * prices are Appendix A of docs/ARCHITECTURE_v3.md. Expected amounts are
 * computed with the engine from the same fixture prices (the engine itself is
 * covered by hand-checked unit tests), plus a few literal sanity figures.
 *
 * Where the calculator is mounted:
 *   E2E_CALC_PATH  — page with the full flow (default /implant-calculator/)
 *   E2E_CITY_PATH  — a city page with `initialLocation` = Київ (default /implant-calculator/kyiv/)
 */
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import type { JawInput } from "../src/lib/contracts";
import { calculateQuote, createPriceBook } from "../src/engine/v3";
import { moneyLines } from "../src/engine/v3/format";
import { fixturePricesResponse } from "../src/lib/data/fixture";

const CALC_PATH = process.env.E2E_CALC_PATH ?? "/implant-calculator/";
const CITY_PATH = process.env.E2E_CITY_PATH ?? "/implant-calculator/kyiv/";

// ───────────────────────── fixtures ─────────────────────────

const test = base.extend<{ pageGuard: void }>({
  pageGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
      });
      // Every navigation starts from a clean localStorage, unless a test opts in to persistence.
      await page.addInitScript(() => {
        if (!window.sessionStorage.getItem("keep-ls")) window.localStorage.clear();
      });
      await use();
      expect(errors, "console / page errors").toEqual([]);
    },
    { auto: true },
  ],
});

// ───────────────────────── expectations from the fixture ─────────────────────────

const nb = (s: string | null) => (s ?? "").replace(/ /g, " ");

function jawInput(jaw: "upper" | "lower", patch: Partial<JawInput> = {}): JawInput {
  return {
    jaw,
    tooth_count: 1,
    location: null,
    status: "removed",
    installed_implant_count: null,
    scenario: null,
    implant_tier: "classic",
    crown_or_arch_tier: "classic",
    include_temporary: false,
    ...patch,
  };
}

function quote(city: string, upper: JawInput | null, lower: JawInput | null = null, kind: "city" | "region" = "city") {
  return calculateQuote(upper, lower, createPriceBook(fixturePricesResponse(kind, city)));
}

/** "36 800 ₴" for a range, main currency. */
function uah(range: { low: number; high: number } | null | undefined, currency: "UAH" | "EUR" = "UAH", city = "kyiv"): string {
  if (!range) throw new Error("no range");
  const rate = fixturePricesResponse("city", city).eur_rate;
  return nb(moneyLines(range, currency, rate).main);
}

// ───────────────────────── page helpers ─────────────────────────

/** The current step title (an <h1>, or an <h2> when embedded in a host page). */
const h1 = (page: Page) => page.getByTestId("step-heading");
const COUNTS_TITLE = "Скільки зубів потрібно замінити імплантами?";
const JAW = { upper: "Верхня щелепа", lower: "Нижня щелепа" } as const;
const countSlider = (page: Page, jaw: "upper" | "lower") => page.getByRole("slider", { name: `${JAW[jaw]}: кількість зубів`, exact: true });
const text = async (loc: Locator) => nb(await loc.innerText());

async function openCity(page: Page, id: string, query: string) {
  await page.goto(CALC_PATH);
  await page.getByLabel("Оберіть місто лікування").fill(query);
  await page.getByTestId(`location-city-${id}`).click();
  await expect(h1(page)).toHaveText(COUNTS_TITLE);
}

async function setCount(page: Page, jaw: "upper" | "lower", n: number) {
  const s = countSlider(page, jaw);
  await s.focus();
  await s.press("Home");
  for (let i = 0; i < n; i += 1) await s.press("ArrowRight");
  await expect(s).toHaveAttribute("aria-valuenow", String(n));
}

async function counts(page: Page, upper: number, lower: number) {
  await setCount(page, "upper", upper);
  await setCount(page, "lower", lower);
  await page.getByRole("button", { name: "Продовжити" }).click();
}

const opt = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

async function expectResult(page: Page) {
  await expect(h1(page)).toHaveText("Орієнтовна вартість імплантації");
}

const LOC = { adjacent: "Поруч", separate: "У різних місцях", unknown: "Не знаю" } as const;

/** Runs the whole flow for given counts and answers, ending on the result. */
async function flow(
  page: Page,
  city: [string, string],
  upper: { n: number; location?: keyof typeof LOC; status?: string; installed?: number | "unknown" } | null,
  lower: { n: number; location?: keyof typeof LOC; status?: string; installed?: number | "unknown" } | null,
) {
  await openCity(page, city[0], city[1]);
  await counts(page, upper?.n ?? 0, lower?.n ?? 0);
  for (const jaw of [upper, lower]) {
    if (!jaw || jaw.n === 0) continue;
    if (jaw.n >= 2 && jaw.n <= 6) await opt(page, LOC[jaw.location ?? "unknown"]).click();
    await opt(page, jaw.status ?? statusLabelFor(jaw.n, "removed")).click();
    if (jaw.installed !== undefined) {
      if (jaw.installed === "unknown") await opt(page, "Не знаю").click();
      else {
        const s = page.getByRole("slider", { name: /кількість встановлених імплантів/ });
        await s.focus();
        await s.press("Home");
        for (let i = 1; i < jaw.installed; i += 1) await s.press("ArrowRight");
        await page.getByRole("button", { name: "Продовжити" }).click();
      }
    }
  }
  await expectResult(page);
}

function statusLabelFor(n: number, status: "removed" | "partly" | "extraction" | "installed" | "unknown"): string {
  const one = n === 1;
  return {
    removed: one ? "Зуб уже видалений" : "Зуби вже видалені",
    partly: one ? "Залишилась частина зуба" : "Частина зубів залишилась",
    extraction: "Лікар рекомендував видалення",
    installed: one ? "Імплант уже встановлений" : "Імпланти вже встановлені",
    unknown: "Не знаю",
  }[status];
}

const tier = (page: Page, jaw: "upper" | "lower", which: "implant" | "crown", name: string) =>
  page.getByTestId(`tier-${jaw}-${which}`).getByRole("button", { name, exact: true });

async function expectMain(page: Page, jaw: "upper" | "lower", expected: string) {
  await expect(page.getByTestId(`main-${jaw}`)).toHaveText(expected);
}
async function expectOverall(page: Page, expected: string) {
  await expect(page.getByTestId("overall-main")).toHaveText(expected);
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Viewport point of a mark (scrolls the slider into view first — host pages put it below the fold). */
async function sliderPoint(s: Locator, value: number, min: number, max: number) {
  await s.scrollIntoViewIfNeeded();
  const box = await s.boundingBox();
  if (!box) throw new Error("slider has no box");
  return { x: box.x + (box.width * (value - min + 0.5)) / (max - min + 1), y: box.y + box.height / 2 };
}

// ───────────────────────── 1. city screen ─────────────────────────

test.describe("city screen (ТЗ §5.1)", () => {
  test("texts; the list appears after typing and shows city + oblast; auto-advance", async ({ page }) => {
    await page.goto(CALC_PATH);
    await expect(h1(page)).toHaveText("Калькулятор імплантації");
    await expect(page.getByText("Дізнайтеся орієнтовну вартість імплантації у вашому місті")).toBeVisible();
    await expect(page.getByText("Без реєстрації. Результат одразу після відповідей")).toBeVisible();
    await expect(page.getByRole("link", { name: /DENVA AI/ }).first()).toBeVisible();

    const input = page.getByLabel("Оберіть місто лікування");
    await expect(page.getByRole("list", { name: "Знайдені міста" })).toHaveCount(0);
    await input.fill("л");
    const lviv = page.getByTestId("location-city-lviv");
    await expect(lviv).toBeVisible();
    await expect(lviv).toContainText("Львів");
    await expect(lviv).toContainText("Львівська область");
    await input.fill("kyiv");
    await expect(page.getByTestId("location-city-kyiv")).toBeVisible();
    await input.fill("zzzz");
    await expect(page.getByText("Такого міста немає в списку.")).toBeVisible();

    // No "Продовжити": picking the city moves on by itself.
    await input.fill("львів");
    await page.getByTestId("location-city-lviv").click();
    await expect(h1(page)).toHaveText(COUNTS_TITLE);
    await expect(page.getByTestId("city-chip-name")).toHaveText("Львів");
  });

  test("«Не знайшли своє місто? Оберіть область»", async ({ page }) => {
    await page.goto(CALC_PATH);
    await page.getByRole("button", { name: "Не знайшли своє місто? Оберіть область" }).click();
    await expect(page.getByRole("list", { name: "Області" })).toBeVisible();
    await page.getByTestId("location-region-zakarpatska").click();
    await expect(h1(page)).toHaveText(COUNTS_TITLE);
    await expect(page.getByTestId("city-chip-name")).toHaveText("Закарпатська область");
  });

  test("the server-rendered HTML already contains the city step", async ({ request }) => {
    const html = await (await request.get(CALC_PATH)).text();
    expect(html).toContain("Оберіть місто лікування");
    expect(html).toContain("Без реєстрації");
  });
});

// ───────────────────────── 2. two sliders (ТЗ §5.2) ─────────────────────────

test.describe("counts screen (ТЗ §5.2)", () => {
  test("two always-visible 0–14 sliders with numbers, −/+ and the explanation", async ({ page }) => {
    await openCity(page, "lviv", "льв");
    await expect(
      page.getByText("Враховуйте лише відсутні зуби або ті, які потрібно видалити. Не враховуйте власні зуби, на які плануються коронки."),
    ).toBeVisible();
    for (const jaw of ["upper", "lower"] as const) {
      const s = countSlider(page, jaw);
      await expect(s).toBeVisible();
      await expect(s).toHaveAttribute("aria-valuemin", "0");
      await expect(s).toHaveAttribute("aria-valuemax", "14");
      await expect(s).toHaveAttribute("aria-valuenow", "0");
      await expect(page.getByTestId(`count-${jaw}`)).toContainText("0");
    }
    // No accordion / 1–7+ slider / four-option screen of the old versions.
    await expect(page.getByRole("button", { name: "Окремі зуби" })).toHaveCount(0);
    await expect(page.getByText("7+")).toHaveCount(0);
    await expect(opt(page, "Не знаю точно")).toBeVisible();
  });

  test("tap, drag, keyboard and −/+ change the number, which is always visible", async ({ page }) => {
    await openCity(page, "lviv", "льв");
    const s = countSlider(page, "upper");
    const value = page.getByTestId("count-upper");

    // tap on a mark (touch)
    const sliderBox = (await s.boundingBox())!;
    await s.tap({ position: { x: (sliderBox.width * 9.5) / 15, y: sliderBox.height / 2 } });
    await expect(s).toHaveAttribute("aria-valuenow", "9");
    await expect(value).toContainText("9");
    await expect(s).toHaveAttribute("aria-valuetext", "9 зубів");

    // click on a mark with the mouse
    await page.getByTestId("slider-upper").locator('[data-mark="3"]').click();
    await expect(s).toHaveAttribute("aria-valuenow", "3");
    await expect(s).toHaveAttribute("aria-valuetext", "3 зуби");

    // drag / swipe to 14
    const from = await sliderPoint(s, 3, 0, 14);
    const to = await sliderPoint(s, 14, 0, 14);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 14 });
    await page.mouse.up();
    await expect(s).toHaveAttribute("aria-valuenow", "14");
    await expect(value).toContainText("14");

    // keyboard
    await s.focus();
    await s.press("ArrowLeft");
    await expect(s).toHaveAttribute("aria-valuenow", "13");
    await s.press("Home");
    await expect(s).toHaveAttribute("aria-valuenow", "0");
    await expect(page.getByRole("button", { name: "Продовжити" })).toBeDisabled();
    await s.press("ArrowLeft");
    await expect(s).toHaveAttribute("aria-valuenow", "0");
    await s.press("End");
    await expect(s).toHaveAttribute("aria-valuenow", "14");
    await s.press("ArrowRight");
    await expect(s).toHaveAttribute("aria-valuenow", "14");

    // − and +
    const minus = page.getByRole("button", { name: "Нижня щелепа: кількість зубів: менше" });
    const plus = page.getByRole("button", { name: "Нижня щелепа: кількість зубів: більше" });
    await expect(minus).toBeDisabled();
    await plus.click();
    await plus.click();
    await expect(countSlider(page, "lower")).toHaveAttribute("aria-valuenow", "2");
    await minus.click();
    await expect(countSlider(page, "lower")).toHaveAttribute("aria-valuenow", "1");
    // the buttons have a large hit area
    const box = await plus.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test("moving a slider never shifts the layout", async ({ page }) => {
    await openCity(page, "lviv", "льв");
    const lowerCard = page.getByTestId("slider-lower");
    const next = page.getByRole("button", { name: "Продовжити" });
    // document-relative positions: scrolling must not count as a shift
    const docY = async (loc: Locator) => loc.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    const y0 = await docY(lowerCard);
    const button0 = await docY(next);
    for (const n of [1, 9, 14, 0, 7]) {
      await setCount(page, "upper", n);
      expect(await docY(lowerCard)).toBe(y0);
      expect(await docY(next)).toBe(button0);
    }
  });

  test("cannot continue with two zeros; one jaw is enough; the other jaw is skipped", async ({ page }) => {
    await openCity(page, "lviv", "льв");
    const next = page.getByRole("button", { name: "Продовжити" });
    await expect(next).toBeDisabled();
    await expect(page.getByTestId("counts-hint")).toBeVisible();
    await setCount(page, "lower", 2);
    await expect(next).toBeEnabled();
    await next.click();
    // upper = 0 is skipped: the first question is about the lower jaw
    await expect(page.getByTestId("question-jaw")).toHaveText(JAW.lower);
    await expect(page.getByText(JAW.upper)).toHaveCount(0);
  });
});

// ───────────────────────── 3. «Не знаю точно» ─────────────────────────

test.describe("«Не знаю точно» (ТЗ §5.2, ARCHITECTURE §3)", () => {
  async function unknown(page: Page, label: string) {
    await openCity(page, "kyiv", "київ");
    await opt(page, "Не знаю точно").click();
    await expect(page.getByTestId("count-sliders")).toHaveCount(0);
    for (const o of ["Один або кілька окремих зубів", "Значна частина зубів", "Можливо, всі зуби", "Зовсім не знаю"]) {
      await expect(opt(page, o)).toBeVisible();
    }
    await opt(page, label).click();
    await page.getByRole("button", { name: "Продовжити" }).click();
    await expectResult(page);
    await expect(page.getByTestId("unknown-note")).toContainText(label);
  }

  test("replaces both sliders, needs a choice, and can be left", async ({ page }) => {
    await openCity(page, "kyiv", "київ");
    await opt(page, "Не знаю точно").click();
    await expect(page.getByRole("button", { name: "Продовжити" })).toBeDisabled();
    await opt(page, "← Повернутися до бігунків").click();
    await expect(countSlider(page, "upper")).toBeVisible();
    await expect(countSlider(page, "lower")).toBeVisible();
  });

  test("окремі зуби → 1–3 separate teeth as a range", async ({ page }) => {
    await unknown(page, "Один або кілька окремих зубів");
    const low = quote("kyiv", jawInput("upper", { tooth_count: 1 })).overallTotal;
    const high = quote("kyiv", jawInput("upper", { tooth_count: 3, location: "separate", status: "unknown" })).overallTotal;
    await expectMain(page, "upper", uah({ low: low!.low, high: high!.high }));
    await expect(page.getByTestId("jaw-lower")).toHaveCount(0);
  });

  test("значна частина → 10 teeth with the scenario comparison", async ({ page }) => {
    await unknown(page, "Значна частина зубів");
    await expect(page.getByTestId("strip-upper")).toBeVisible();
    await expect(page.getByTestId("jaw-upper-summary")).toContainText("10 зубів");
  });

  test("можливо всі → 14 teeth", async ({ page }) => {
    await unknown(page, "Можливо, всі зуби");
    await expect(page.getByTestId("jaw-upper-summary")).toContainText("14 зубів");
    await expect(page.getByTestId("strip-upper")).toBeVisible();
  });

  test("зовсім не знаю → the reference price of one tooth", async ({ page }) => {
    await unknown(page, "Зовсім не знаю");
    await expect(page.getByTestId("jaw-upper-summary")).toContainText("довідкова ціна одного зуба");
    const ref = quote("kyiv", jawInput("upper", { tooth_count: 1, status: "unknown", location: "unknown" }));
    await expectMain(page, "upper", uah(ref.overallTotal));
  });

  test("the guess can be refined on the result: pick another scale or give exact counts", async ({ page }) => {
    await unknown(page, "Зовсім не знаю");
    await page.getByRole("button", { name: "Змінити параметри" }).click();
    await page.getByTestId("params-panel").getByRole("button", { name: "Можливо, всі зуби", exact: true }).click();
    await expect(page.getByTestId("jaw-upper-summary")).toContainText("14 зубів");
    await page.getByRole("button", { name: "Вказати кількість зубів точно" }).click();
    await expect(page.getByTestId("unknown-note")).toHaveCount(0);
    await expect(page.getByTestId("params-count-upper")).toHaveText("14");
    await expect(page.getByTestId("params-count-lower")).toHaveText("0");
  });
});

// ───────────────────────── 4. questions per jaw (ТЗ §5.3–5.4) ─────────────────────────

test.describe("per-jaw questions", () => {
  test("1 tooth: only the status question, with all five answers; each leads to a result", async ({ page }) => {
    for (const status of ["removed", "partly", "extraction", "unknown"] as const) {
      await openCity(page, "kyiv", "київ");
      await counts(page, 1, 0);
      await expect(page.getByTestId("question-jaw")).toHaveText(JAW.upper);
      await expect(page.getByTestId("question-progress")).toContainText("питання 1 з 1");
      await expect(h1(page)).toContainText("Ці зуби вже видалені, частина залишилась, лікар рекомендував видалення, імпланти вже встановлені чи ви не знаєте?");
      for (const s of ["removed", "partly", "extraction", "installed", "unknown"] as const) {
        await expect(opt(page, statusLabelFor(1, s))).toBeVisible();
      }
      await opt(page, statusLabelFor(1, status)).click();
      await expectResult(page);
      // the status never changes the single-tooth total
      await expectMain(page, "upper", uah(quote("kyiv", jawInput("upper")).overallTotal));
    }
  });

  test("2–6 teeth: location, then status", async ({ page }) => {
    await openCity(page, "kyiv", "київ");
    await counts(page, 4, 0);
    await expect(page.getByTestId("question-progress")).toContainText("питання 1 з 2");
    await expect(h1(page)).toContainText("Як розташовані ці зуби?");
    for (const l of Object.values(LOC)) await expect(opt(page, l)).toBeVisible();
    await opt(page, LOC.adjacent).click();
    await expect(page.getByTestId("question-progress")).toContainText("питання 2 з 2");
    await opt(page, statusLabelFor(4, "removed")).click();
    await expectResult(page);
    const q = quote("kyiv", jawInput("upper", { tooth_count: 4, location: "adjacent" }));
    await expectMain(page, "upper", uah(q.overallTotal));
    await expect(page.getByTestId("counts-upper")).toContainText("Імплантів: 2");
    await expect(page.getByTestId("counts-upper")).toContainText("Коронкових одиниць: 4");
  });

  for (const [location, label] of [
    ["adjacent", "Поруч"],
    ["separate", "У різних місцях"],
    ["unknown", "Не знаю"],
  ] as const) {
    test(`2–6 teeth, location «${label}»`, async ({ page }) => {
      await flow(page, ["kyiv", "київ"], { n: 5, location }, null);
      const q = quote("kyiv", jawInput("upper", { tooth_count: 5, location }));
      await expectMain(page, "upper", uah(q.overallTotal));
      if (location === "unknown") await expect(page.getByTestId("range-note-upper")).toBeVisible();
    });
  }

  test("7–14 teeth: only the status question", async ({ page }) => {
    await openCity(page, "kyiv", "київ");
    await counts(page, 9, 0);
    await expect(page.getByTestId("question-progress")).toContainText("питання 1 з 1");
    await expect(h1(page)).toContainText("Ці зуби вже видалені");
    await opt(page, statusLabelFor(9, "removed")).click();
    await expectResult(page);
    await expect(page.getByTestId("strip-upper")).toBeVisible();
  });

  test("jaws are asked one after the other, upper first, each named", async ({ page }) => {
    await openCity(page, "kyiv", "київ");
    await counts(page, 3, 1);
    const seen: string[] = [];
    for (const answer of [LOC.adjacent, statusLabelFor(3, "removed"), statusLabelFor(1, "removed")]) {
      seen.push(`${await page.getByTestId("question-jaw").innerText()}: ${nb(await page.getByTestId("question-progress").innerText())}`);
      await opt(page, answer).click();
    }
    expect(seen[0]).toContain("Верхня щелепа");
    expect(seen[1]).toContain("Верхня щелепа");
    expect(seen[2]).toContain("Нижня щелепа");
    expect(seen[2]).toContain("питання 3 з 3");
    await expectResult(page);
    await expect(page.getByTestId("jaw-upper")).toBeVisible();
    await expect(page.getByTestId("jaw-lower")).toBeVisible();
  });

  test("implants already installed: a count slider 1…teeth, or «Не знаю»", async ({ page }) => {
    await openCity(page, "kyiv", "київ");
    await counts(page, 4, 0);
    await opt(page, LOC.adjacent).click();
    await opt(page, statusLabelFor(4, "installed")).click();
    await expect(page.getByTestId("question-progress")).toContainText("питання 3 з 3");
    await expect(h1(page)).toContainText("Скільки імплантів уже встановлено?");
    const s = page.getByRole("slider", { name: /кількість встановлених імплантів/ });
    await expect(s).toHaveAttribute("aria-valuemin", "1");
    await expect(s).toHaveAttribute("aria-valuemax", "4");
    await s.focus();
    await s.press("End");
    await expect(page.getByTestId("installed-value")).toContainText("4");
    await s.press("ArrowLeft");
    await page.getByRole("button", { name: "Продовжити" }).click();
    await expectResult(page);
    const q = quote("kyiv", jawInput("upper", { tooth_count: 4, location: "adjacent", status: "implants_installed", installed_implant_count: 3 }));
    await expectMain(page, "upper", uah(q.overallTotal));
    await expect(page.getByTestId("counts-upper")).toContainText("Імплантів: 3");
    // no implant / healing lines when they are already in the bone
    await expect(page.getByTestId("line-upper-IMPLANT_INSTALL")).toHaveCount(0);
    await expect(page.getByTestId("line-upper-HEALING_ABUTMENT")).toHaveCount(0);
  });

  test("installed implants, count unknown → a range", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 4, location: "adjacent", status: statusLabelFor(4, "installed"), installed: "unknown" }, null);
    const q = quote("kyiv", jawInput("upper", { tooth_count: 4, location: "adjacent", status: "implants_installed", installed_implant_count: "unknown" }));
    expect(q.overallTotal!.low).toBeLessThan(q.overallTotal!.high);
    await expectMain(page, "upper", uah(q.overallTotal));
    await expect(page.getByTestId("counts-upper")).toContainText("Імплантів: 2–4");
  });

  test("a single installed implant for 1 tooth", async ({ page }) => {
    await openCity(page, "kyiv", "київ");
    await counts(page, 1, 0);
    await opt(page, statusLabelFor(1, "installed")).click();
    const s = page.getByRole("slider", { name: /кількість встановлених імплантів/ });
    await expect(s).toHaveAttribute("aria-valuemax", "1");
    await page.getByRole("button", { name: "Продовжити" }).click();
    await expectResult(page);
    const q = quote("kyiv", jawInput("upper", { status: "implants_installed", installed_implant_count: 1 }));
    await expectMain(page, "upper", uah(q.overallTotal));
  });

  test("both jaws, every combination of branches reaches the right totals", async ({ page }) => {
    test.setTimeout(120_000);
    const cases: { upper: { n: number; location?: keyof typeof LOC }; lower: { n: number; location?: keyof typeof LOC } }[] = [
      { upper: { n: 1 }, lower: { n: 2, location: "adjacent" } },
      { upper: { n: 6, location: "separate" }, lower: { n: 7 } },
      { upper: { n: 14 }, lower: { n: 14 } },
    ];
    for (const c of cases) {
      await flow(page, ["kyiv", "київ"], c.upper, c.lower);
      const q = quote(
        "kyiv",
        jawInput("upper", { tooth_count: c.upper.n, location: c.upper.n >= 2 && c.upper.n <= 6 ? (c.upper.location ?? "unknown") : null, scenario: c.upper.n >= 7 ? "bridges" : null }),
        jawInput("lower", { tooth_count: c.lower.n, location: c.lower.n >= 2 && c.lower.n <= 6 ? (c.lower.location ?? "unknown") : null, scenario: c.lower.n >= 7 ? "bridges" : null }),
      );
      await expectMain(page, "upper", uah(q.upperJawCalculation!.total));
      await expectMain(page, "lower", uah(q.lowerJawCalculation!.total));
      await expectOverall(page, uah(q.overallTotal));
    }
  });
});

// ───────────────────────── 5. back keeps answers ─────────────────────────

test("back never loses answers", async ({ page }) => {
  await openCity(page, "kyiv", "київ");
  await counts(page, 3, 5);
  await opt(page, LOC.separate).click();
  await opt(page, statusLabelFor(3, "partly")).click();
  await opt(page, LOC.adjacent).click();
  await opt(page, statusLabelFor(5, "extraction")).click();
  await expectResult(page);

  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page.getByTestId("question-jaw")).toHaveText(JAW.lower);
  await expect(opt(page, statusLabelFor(5, "extraction"))).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(opt(page, LOC.adjacent)).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page.getByTestId("question-jaw")).toHaveText(JAW.upper);
  await expect(opt(page, statusLabelFor(3, "partly"))).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(opt(page, LOC.separate)).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(h1(page)).toHaveText(COUNTS_TITLE);
  await expect(countSlider(page, "upper")).toHaveAttribute("aria-valuenow", "3");
  await expect(countSlider(page, "lower")).toHaveAttribute("aria-valuenow", "5");
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page.getByLabel("Оберіть місто лікування")).toBeVisible();
});

test("changing the city from the header keeps the answers and returns to the result", async ({ page }) => {
  await flow(page, ["kyiv", "київ"], { n: 1 }, null);
  await expectMain(page, "upper", uah(quote("kyiv", jawInput("upper")).overallTotal));
  await page.getByTestId("city-chip").click();
  await page.getByLabel("Оберіть місто лікування").fill("чернів");
  await page.getByTestId("location-city-chernivtsi").click();
  await expectResult(page);
  await expectMain(page, "upper", uah(quote("chernivtsi", jawInput("upper")).overallTotal, "UAH", "chernivtsi"));
  await expect(page.getByTestId("source-city")).toHaveText("Чернівці");
});

// ───────────────────────── 6. result structure & tiers (ТЗ §6.1–6.2) ─────────────────────────

test.describe("result", () => {
  test("blocks: one jaw hides the other; overall = plain sum; classic by default", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], null, { n: 1 });
    await expect(page.getByTestId("jaw-upper")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Нижня щелепа" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Загальна орієнтовна вартість" })).toBeVisible();
    await expect(page.getByTestId("tier-chip-lower")).toHaveText("Класичний рівень");
    // Kyiv, 1 tooth, classic: 18 500 + 2 100 + 1 400 + 6 300 + 11 500
    await expectMain(page, "lower", "39 800 ₴");
    await expectOverall(page, "39 800 ₴");
    await expect(page.getByTestId("two-jaws-note")).toHaveCount(0);
    await expect(page.getByTestId("disclaimer")).toContainText("консультації лікаря та КТ");
  });

  test("two jaws: independent blocks, own scan each, the sum, the shared-scheme note", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 1 }, { n: 1 });
    await expectOverall(page, "79 600 ₴");
    await expect(page.getByTestId("two-jaws-note")).toContainText("Точну спільну схему уточнить клініка");
    for (const jaw of ["upper", "lower"] as const) {
      await expect(page.getByTestId(`line-${jaw}-SCAN_JAW_STAGE`)).toBeVisible();
    }
  });

  test("tiers are independent per jaw and per axis; sums update; presets apply both", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 1 }, { n: 1 });
    const base = quote("kyiv", jawInput("upper"), jawInput("lower"));

    await tier(page, "upper", "implant", "Преміальний").click();
    const a = quote("kyiv", jawInput("upper", { implant_tier: "premium" }), jawInput("lower"));
    await expectMain(page, "upper", uah(a.upperJawCalculation!.total));
    // the other jaw is untouched
    await expectMain(page, "lower", uah(base.lowerJawCalculation!.total));
    await expectOverall(page, uah(a.overallTotal));
    await expect(page.getByTestId("tier-chip-upper")).toHaveText("Свій набір рівнів");

    await tier(page, "upper", "crown", "Мінімальний").click();
    const b = quote("kyiv", jawInput("upper", { implant_tier: "premium", crown_or_arch_tier: "minimum" }), jawInput("lower"));
    await expectMain(page, "upper", uah(b.upperJawCalculation!.total));
    await expectOverall(page, uah(b.overallTotal));

    // lower jaw: the opposite combination
    await tier(page, "lower", "implant", "Мінімальний").click();
    await tier(page, "lower", "crown", "Преміальний").click();
    const c = quote("kyiv", jawInput("upper", { implant_tier: "premium", crown_or_arch_tier: "minimum" }), jawInput("lower", { implant_tier: "minimum", crown_or_arch_tier: "premium" }));
    await expectMain(page, "lower", uah(c.lowerJawCalculation!.total));
    await expectOverall(page, uah(c.overallTotal));
    await expect(tier(page, "upper", "implant", "Преміальний")).toHaveAttribute("aria-pressed", "true");
    await expect(tier(page, "upper", "crown", "Мінімальний")).toHaveAttribute("aria-pressed", "true");

    // compact rows show the minimum / premium presets and apply them to that jaw only
    const minimum = quote("kyiv", jawInput("upper", { implant_tier: "minimum", crown_or_arch_tier: "minimum" })).overallTotal;
    await expect(page.getByTestId("preset-upper-minimum-price")).toHaveText(uah(minimum));
    await page.getByTestId("preset-upper-premium").click();
    await expect(tier(page, "upper", "implant", "Преміальний")).toHaveAttribute("aria-pressed", "true");
    await expect(tier(page, "upper", "crown", "Преміальний")).toHaveAttribute("aria-pressed", "true");
    await expect(tier(page, "lower", "implant", "Мінімальний")).toHaveAttribute("aria-pressed", "true");
  });

  test("the implant tier drives implant + healing + superstructure; the crown tier only the crown", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 1 }, null);
    await tier(page, "upper", "implant", "Мінімальний").click();
    const line = (code: string) => page.getByTestId(`line-upper-${code}`);
    // minimum implant 13 800 + healing 1 700 + superstructure 5 200
    await expect(line("IMPLANT_INSTALL")).toContainText("13 800");
    await expect(line("HEALING_ABUTMENT")).toContainText("1 700");
    await expect(line("SUPERSTRUCTURE_SET")).toContainText("5 200");
    await expect(line("CROWN_IMPLANT")).toContainText("11 500");
    await tier(page, "upper", "crown", "Мінімальний").click();
    await expect(line("CROWN_IMPLANT")).toContainText("8 000");
    await expect(line("IMPLANT_INSTALL")).toContainText("13 800");
  });

  test("no clinic names, brands or «під ключ»", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 3, location: "unknown" }, { n: 9 });
    const body = nb(await page.locator("body").innerText());
    expect(body).not.toMatch(/під\s+ключ/i);
    expect(body).not.toMatch(/Nobel|Straumann|Osstem|Megagen|Alpha\s?Bio/i);
    expect(body).not.toMatch(/\bNaN\b|undefined|\bnull\b|Infinity/);
  });
});

// ───────────────────────── 7. 7–14 teeth: comparison + tabs (ТЗ §4.4–4.5, §6.2) ─────────────────────────

test.describe("7–14 teeth", () => {
  test("a comparison of four budgets first, then the four tabs; no medical recommendation", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 10 }, null);
    const strip = page.getByTestId("strip-upper");
    for (const choice of ["bridges", "aox4", "aox6", "aox8"] as const) {
      const q = quote("kyiv", jawInput("upper", { tooth_count: 10, scenario: choice }));
      await expect(page.getByTestId(`strip-upper-${choice}`)).toContainText(uah(q.overallTotal));
    }
    await expect(strip.locator("li")).toHaveCount(4);
    // strip comes before the tabs, tabs before the main card
    const stripY = (await strip.boundingBox())!.y;
    const tabsY = (await page.getByRole("tablist").boundingBox())!.y;
    const cardY = (await page.getByTestId("main-card-upper").boundingBox())!.y;
    expect(stripY).toBeLessThan(tabsY);
    expect(tabsY).toBeLessThan(cardY);

    await expect(page.getByRole("tablist").getByRole("tab")).toHaveText(["Мости", "All-on-4", "All-on-6", "All-on-8"]);
    await expect(page.getByRole("tab", { name: "Мости" })).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByText("Можливі різні варіанти відновлення. Відповідний варіант визначить лікар після діагностики"),
    ).toBeVisible();
    expect(nb(await page.locator("main").innerText())).not.toMatch(/рекомендуємо|рекомендований варіант/i);
  });

  test("bridges: 4 implants and tooth_count crown units", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 10 }, null);
    const q = quote("kyiv", jawInput("upper", { tooth_count: 10, scenario: "bridges" }));
    await expectMain(page, "upper", uah(q.overallTotal));
    await expect(page.getByTestId("counts-upper")).toContainText("Імплантів: 4");
    await expect(page.getByTestId("counts-upper")).toContainText("Коронкових одиниць: 10");
    await expect(page.getByTestId("line-upper-CROWN_IMPLANT")).toContainText("× 10");
  });

  test("All-on tabs: first stage is the main figure, permanent stage and full budget below", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 10 }, null);
    for (const [tab, choice, implants] of [
      ["All-on-4", "aox4", 4],
      ["All-on-6", "aox6", 6],
      ["All-on-8", "aox8", 8],
    ] as const) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
      const calc = quote("kyiv", jawInput("upper", { tooth_count: 10, scenario: choice })).upperJawCalculation!;
      await expectMain(page, "upper", uah(calc.first_stage));
      await expect(page.getByTestId("permanent-upper")).toHaveText(uah(calc.permanent_stage));
      await expect(page.getByTestId("full-upper")).toHaveText(uah(calc.total));
      await expect(page.getByTestId("main-card-upper")).toContainText("Перший етап (з тимчасовими зубами)");
      await expect(page.getByTestId("counts-upper")).toContainText(`Імплантів: ${implants}`);
      await expect(page.getByTestId("breakdown-upper")).toContainText("Мультиюніт");
    }
    // the overall total of an All-on jaw is its full budget
    await expectOverall(page, uah(quote("kyiv", jawInput("upper", { tooth_count: 10, scenario: "aox8" })).overallTotal));
  });

  test("All-on tiers: «Рівень імплантів» and «Рівень постійної конструкції», independent", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 12 }, null);
    await page.getByRole("tab", { name: "All-on-4" }).click();
    await expect(page.getByText("Рівень імплантів", { exact: true })).toBeVisible();
    await expect(page.getByText("Рівень постійної конструкції", { exact: true })).toBeVisible();
    await tier(page, "upper", "crown", "Преміальний").click();
    let calc = quote("kyiv", jawInput("upper", { tooth_count: 12, scenario: "aox4", crown_or_arch_tier: "premium" })).upperJawCalculation!;
    // first stage does not depend on the construction level
    await expectMain(page, "upper", uah(quote("kyiv", jawInput("upper", { tooth_count: 12, scenario: "aox4" })).upperJawCalculation!.first_stage));
    await expect(page.getByTestId("full-upper")).toHaveText(uah(calc.total));
    await tier(page, "upper", "implant", "Мінімальний").click();
    calc = quote("kyiv", jawInput("upper", { tooth_count: 12, scenario: "aox4", crown_or_arch_tier: "premium", implant_tier: "minimum" })).upperJawCalculation!;
    await expectMain(page, "upper", uah(calc.first_stage));
    await expect(page.getByTestId("full-upper")).toHaveText(uah(calc.total));
  });

  test("two jaws: each has its own tabs and scenario; the overall total is the sum", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 8 }, { n: 14 });
    await page.getByTestId("jaw-upper").getByRole("tab", { name: "All-on-6" }).click();
    await page.getByTestId("jaw-lower").getByRole("tab", { name: "All-on-4" }).click();
    const q = quote("kyiv", jawInput("upper", { tooth_count: 8, scenario: "aox6" }), jawInput("lower", { tooth_count: 14, scenario: "aox4" }));
    await expectMain(page, "upper", uah(q.upperJawCalculation!.first_stage));
    await expectMain(page, "lower", uah(q.lowerJawCalculation!.first_stage));
    await expectOverall(page, uah(q.overallTotal));
    await expect(page.getByTestId("jaw-upper").getByRole("tab", { name: "All-on-6" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("jaw-lower").getByRole("tab", { name: "Мости" })).toHaveAttribute("aria-selected", "false");
    // two All-on jaws: the scan is counted once per stage per jaw — separately
    for (const jaw of ["upper", "lower"] as const) {
      await expect(page.getByTestId(`breakdown-${jaw}`).locator("li", { hasText: "SCAN_JAW_STAGE" })).toHaveCount(0);
    }
  });

  test("tabs work with the keyboard", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 10 }, null);
    await page.getByRole("tab", { name: "Мости" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "All-on-4" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "All-on-6" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: "All-on-4" })).toHaveAttribute("aria-selected", "true");
  });
});

// ───────────────────────── 8. temporary prosthetics ─────────────────────────

test.describe("temporary prosthetics toggle (ТЗ §4.4)", () => {
  test("adds teeth × temporary crown + repeat scan + implants × final abutment; off by default", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 3, location: "adjacent" }, null);
    const toggle = page.getByLabel("Врахувати можливе тимчасове протезування");
    await expect(toggle).not.toBeChecked();
    await expectMain(page, "upper", uah(quote("kyiv", jawInput("upper", { tooth_count: 3, location: "adjacent" })).overallTotal));
    await expect(page.getByTestId("line-upper-TEMP_CROWN_UNIT")).toHaveCount(0);

    await toggle.check();
    const withTemp = quote("kyiv", jawInput("upper", { tooth_count: 3, location: "adjacent", include_temporary: true }));
    await expectMain(page, "upper", uah(withTemp.overallTotal));
    await expect(page.getByTestId("line-upper-TEMP_CROWN_UNIT")).toContainText("× 3");
    await expect(page.getByTestId("line-upper-REPEAT_SCAN_JAW")).toBeVisible();
    await expect(page.getByTestId("line-upper-ABUTMENT_FINAL")).toContainText("× 2");
    await expectOverall(page, uah(withTemp.overallTotal));

    await toggle.uncheck();
    await expect(page.getByTestId("line-upper-TEMP_CROWN_UNIT")).toHaveCount(0);
  });

  test("does not change an All-on jaw (ARCH_TEMP is included)", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 10 }, null);
    await page.getByRole("tab", { name: "All-on-4" }).click();
    const before = await text(page.getByTestId("main-upper"));
    const fullBefore = await text(page.getByTestId("full-upper"));
    await page.getByLabel("Врахувати можливе тимчасове протезування").check();
    expect(await text(page.getByTestId("main-upper"))).toBe(before);
    expect(await text(page.getByTestId("full-upper"))).toBe(fullBefore);
    await expect(page.getByTestId("line-upper-TEMP_CROWN_UNIT")).toHaveCount(0);
    // …but the bridges scenario in the comparison does include it
    await page.getByRole("tab", { name: "Мости" }).click();
    await expectMain(page, "upper", uah(quote("kyiv", jawInput("upper", { tooth_count: 10, scenario: "bridges", include_temporary: true })).overallTotal));
  });

  test("applies to both jaws", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 1 }, { n: 2, location: "separate" });
    await page.getByLabel("Врахувати можливе тимчасове протезування").check();
    const q = quote("kyiv", jawInput("upper", { include_temporary: true }), jawInput("lower", { tooth_count: 2, location: "separate", include_temporary: true }));
    await expectOverall(page, uah(q.overallTotal));
    await expect(page.getByTestId("line-upper-TEMP_CROWN_UNIT")).toBeVisible();
    await expect(page.getByTestId("line-lower-TEMP_CROWN_UNIT")).toBeVisible();
  });
});

// ───────────────────────── 9. currency (ТЗ §4.7) ─────────────────────────

test("the ₴/€ toggle swaps the main currency; the rate and its date are shown", async ({ page }) => {
  await flow(page, ["kyiv", "київ"], { n: 1 }, null);
  const group = page.getByRole("group", { name: "Валюта" });
  await expect(group.getByRole("button", { name: "Гривня" })).toHaveAttribute("aria-pressed", "true");
  const range = quote("kyiv", jawInput("upper")).overallTotal;
  await expectMain(page, "upper", uah(range));
  // 39 800 / 50.1385 ≈ 794 → 790 €
  await expect(page.getByTestId("main-upper-second")).toHaveText(/^≈\s790\s€$/);

  await group.getByRole("button", { name: "Євро" }).click();
  await expectMain(page, "upper", uah(range, "EUR"));
  await expect(page.getByTestId("main-upper")).toHaveText("790 €");
  await expect(page.getByTestId("main-upper-second")).toHaveText("39 800 ₴");
  await expect(page.getByTestId("overall-main")).toHaveText("790 €");
  await expect(page.getByTestId("eur-rate")).toContainText("50,14");
  await expect(page.getByTestId("eur-rate")).toContainText("9 жовтня 2026");

  await group.getByRole("button", { name: "Гривня" }).click();
  await expectMain(page, "upper", "39 800 ₴");
});

// ───────────────────────── 10. price sources (ТЗ §6.1) ─────────────────────────

test.describe("source sentences", () => {
  async function sentenceFor(page: Page, id: string, query: string) {
    await flow(page, [id, query], { n: 1 }, null);
    return nb(await page.getByTestId("source-sentence").innerText());
  }

  test("3+ clinics (Київ, aggregate) → «Розраховано на основі перевірених прайсів 3 клінік міста»", async ({ page }) => {
    expect(await sentenceFor(page, "kyiv", "київ")).toBe("Розраховано на основі перевірених прайсів 3 клінік міста");
    // the aggregate was calculated on 8 жовтня
    await expect(page.getByTestId("source-date")).toHaveText("8 жовтня 2026");
    await expect(page.getByTestId("source-city")).toHaveText("Київ");
    await expect(page.getByTestId("demo-badge")).toBeVisible();
  });

  test("2 clinics (Львів, hybrid)", async ({ page }) => {
    expect(await sentenceFor(page, "lviv", "львів")).toBe("Враховано перевірені прайси 2 клінік міста та середні ринкові дані міста");
  });

  test("1 clinic (Одеса, hybrid)", async ({ page }) => {
    expect(await sentenceFor(page, "odesa", "одес")).toBe("Враховано перевірені прайси 1 клініки міста та середні ринкові дані міста");
  });

  test("0 clinics, city baseline (Дніпро)", async ({ page }) => {
    expect(await sentenceFor(page, "dnipro", "дніпр")).toBe("Використано середній ринковий орієнтир міста");
    await expect(page.getByTestId("source-date")).toHaveText("9 жовтня 2026");
  });

  test("0 clinics, region baseline (Вінниця → Вінницька область)", async ({ page }) => {
    expect(await sentenceFor(page, "vinnytsia", "вінн")).toBe("Використано середній ринковий орієнтир області");
  });

  test("0 clinics, national baseline (Ужгород → Закарпатська область has no prices)", async ({ page }) => {
    expect(await sentenceFor(page, "uzhhorod", "ужг")).toBe("Використано середній ринковий орієнтир України");
    // national fallback = the raw baseline: 18 000 + 1 800 + 1 200 + 5 500 + 10 000 = 36 500
    await expectMain(page, "upper", "36 500 ₴");
  });

  test("a region picked from the oblast list", async ({ page }) => {
    await page.goto(CALC_PATH);
    await page.getByRole("button", { name: "Не знайшли своє місто? Оберіть область" }).click();
    await page.getByTestId("location-region-lvivska").click();
    await counts(page, 1, 0);
    await opt(page, statusLabelFor(1, "removed")).click();
    await expectResult(page);
    await expect(page.getByTestId("source-sentence")).toHaveText("Використано середній ринковий орієнтир області");
    await expect(page.getByTestId("source-city")).toHaveText("Львівська область");
  });

  test("a city with no prices → «Даних поки недостатньо», no invented numbers, lead still available", async ({ page }) => {
    await flow(page, ["kramatorsk", "краматор"], { n: 2, location: "adjacent" }, { n: 1 });
    await expect(page.getByTestId("nodata-upper")).toContainText("Даних поки недостатньо");
    await expect(page.getByTestId("nodata-lower")).toContainText("Даних поки недостатньо");
    await expect(page.getByTestId("overall-main")).toHaveText("Даних поки недостатньо");
    await expect(page.getByTestId("source-note")).toHaveCount(0);
    await expect(page.getByTestId("additional")).toHaveCount(0);
    expect(nb(await page.locator("main").innerText())).not.toMatch(/\d\s?\d{3}\s?₴/);
    await expect(page.getByTestId("lead-block")).toBeVisible();
  });
});

// ───────────────────────── 11. additional services (ТЗ §5.5, §6.1) ─────────────────────────

test.describe("«Що може знадобитися додатково»", () => {
  test("lists every additional service with city prices and never changes the total", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 1, status: statusLabelFor(1, "extraction") }, null);
    const before = await text(page.getByTestId("overall-main"));
    await expect(page.getByRole("heading", { name: "Що може знадобитися додатково" })).toBeVisible();
    await expect(page.getByTestId("additional")).toContainText("Не входить у суму");

    // 18 additional services of the catalog, Kyiv prices (×1.15, rounded to 100)
    const rows = page.getByTestId("additional").locator("li");
    await expect(rows).toHaveCount(18);
    const expected: Record<string, string> = {
      REMOVAL_SIMPLE: "1 300 ₴",
      REMOVAL_COMPLEX: "2 900 ₴",
      AUGMENT_SEGMENT: "13 800 ₴",
      SINUS_LIFT: "20 700 ₴",
      SOFT_TISSUE: "8 600 ₴",
      SEDATION_30_MIN: "2 900 ₴",
      SURGICAL_GUIDE_STANDARD: "5 200 ₴",
      CT_ONE_JAW: "1 000 ₴",
    };
    const prices = fixturePricesResponse("city", "kyiv").prices;
    for (const [code, amount] of Object.entries(expected)) {
      const fixture = prices.find((p) => p.service_code === code)!;
      expect(`${Math.round(fixture.value).toLocaleString("en").replace(/,/g, " ")} ₴`, code).toBe(amount);
      expect(await text(page.getByTestId(`additional-${code}`))).toContain(amount);
    }
    // the status "лікар рекомендував видалення" highlights extraction
    await expect(page.getByTestId("additional-REMOVAL_SIMPLE")).toHaveAttribute("data-highlight", "true");
    await expect(page.getByTestId("additional-REMOVAL_COMPLEX")).toHaveAttribute("data-highlight", "true");
    await expect(page.getByTestId("additional-SINUS_LIFT")).toHaveAttribute("data-highlight", "false");
    expect(await text(page.getByTestId("overall-main"))).toBe(before);
    expect(before).toBe("39 800 ₴");
  });

  test("CT highlight follows the number of jaws; cement removal follows installed implants; prices follow the currency", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 2, location: "adjacent", status: statusLabelFor(2, "installed"), installed: 2 }, { n: 1 });
    await expect(page.getByTestId("additional-CT_BOTH_JAWS")).toHaveAttribute("data-highlight", "true");
    await expect(page.getByTestId("additional-CT_ONE_JAW")).toHaveAttribute("data-highlight", "false");
    await expect(page.getByTestId("additional-CEMENT_RESTORATION_REMOVAL")).toHaveAttribute("data-highlight", "true");
    await page.getByRole("group", { name: "Валюта" }).getByRole("button", { name: "Євро" }).click();
    expect(await text(page.getByTestId("additional-REMOVAL_SIMPLE"))).toContain("€");
  });
});

// ───────────────────────── 12. editing on the result ─────────────────────────

test.describe("editing parameters on the result", () => {
  test("counts, location, status and installed implants, each jaw independently", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 1 }, { n: 1 });
    await expect(page.getByTestId("scenario-label")).toContainText("Верхня: 1 зуб");
    await page.getByRole("button", { name: "Змінити параметри" }).click();
    const panel = page.getByTestId("params-panel");
    const lowerBefore = await text(page.getByTestId("main-lower"));

    // upper: 1 → 4 teeth, location chips appear
    const slider = page.getByRole("slider", { name: "Верхня щелепа: кількість зубів", exact: true });
    await slider.focus();
    for (let i = 0; i < 3; i += 1) await slider.press("ArrowRight");
    await expect(page.getByTestId("params-count-upper")).toHaveText("4");
    await panel.getByRole("group", { name: "Верхня щелепа: розташування" }).getByRole("button", { name: "Поруч", exact: true }).click();
    await expectMain(page, "upper", uah(quote("kyiv", jawInput("upper", { tooth_count: 4, location: "adjacent" })).overallTotal));
    // the lower jaw did not move
    expect(await text(page.getByTestId("main-lower"))).toBe(lowerBefore);

    // status → installed implants → count slider appears
    await panel.getByRole("group", { name: "Верхня щелепа: стан зубів" }).getByRole("button", { name: "Імпланти вже встановлені", exact: true }).click();
    await expect(page.getByTestId("line-upper-IMPLANT_INSTALL")).toHaveCount(0);
    const installed = page.getByRole("slider", { name: "Верхня щелепа: кількість встановлених імплантів" });
    await installed.focus();
    await installed.press("End");
    await expectMain(page, "upper", uah(quote("kyiv", jawInput("upper", { tooth_count: 4, location: "adjacent", status: "implants_installed", installed_implant_count: 4 })).overallTotal));
    await page.getByTestId("params-upper").getByRole("button", { name: "Не знаю", exact: true }).last().click();
    await expect(page.getByTestId("counts-upper")).toContainText("Імплантів: 2–4");

    // lower: up to 9 teeth → scenario tabs appear for the lower jaw only
    const lowerSlider = page.getByRole("slider", { name: "Нижня щелепа: кількість зубів", exact: true });
    await lowerSlider.focus();
    await lowerSlider.press("End");
    for (let i = 0; i < 5; i += 1) await lowerSlider.press("ArrowLeft");
    await expect(page.getByTestId("params-count-lower")).toHaveText("9");
    await expect(page.getByTestId("jaw-lower").getByRole("tab", { name: "All-on-4" })).toBeVisible();
    await expect(page.getByTestId("jaw-upper").getByRole("tab")).toHaveCount(0);
  });

  test("a jaw can be switched off, but never both", async ({ page }) => {
    await flow(page, ["kyiv", "київ"], { n: 1 }, { n: 1 });
    await page.getByRole("button", { name: "Змінити параметри" }).click();
    const lower = page.getByRole("slider", { name: "Нижня щелепа: кількість зубів", exact: true });
    await lower.focus();
    await lower.press("Home");
    await expect(page.getByTestId("jaw-lower")).toHaveCount(0);
    await expectOverall(page, uah(quote("kyiv", jawInput("upper")).overallTotal));
    // the last active jaw cannot go to 0
    const upper = page.getByRole("slider", { name: "Верхня щелепа: кількість зубів", exact: true });
    await upper.focus();
    await upper.press("Home");
    await expect(page.getByTestId("params-count-upper")).toHaveText("1");
    await expect(page.getByTestId("jaw-upper")).toBeVisible();
  });
});

// ───────────────────────── 13. persistence (localStorage only) ─────────────────────────

test.describe("persistence", () => {
  test("the state survives a reload through localStorage, and never touches the URL", async ({ page }) => {
    await page.goto(CALC_PATH);
    await page.evaluate(() => window.sessionStorage.setItem("keep-ls", "1"));
    await page.getByLabel("Оберіть місто лікування").fill("київ");
    await page.getByTestId("location-city-kyiv").click();
    await counts(page, 3, 0);
    await opt(page, LOC.adjacent).click();
    await opt(page, statusLabelFor(3, "removed")).click();
    await expectResult(page);
    await tier(page, "upper", "implant", "Преміальний").click();
    await page.getByRole("group", { name: "Валюта" }).getByRole("button", { name: "Євро" }).click();
    const url = page.url();
    expect(new URL(url).search).toBe("");
    expect(new URL(url).hash).toBe("");

    await page.reload();
    await expectResult(page);
    await expect(page.getByTestId("city-chip-name")).toHaveText("Київ");
    await expect(tier(page, "upper", "implant", "Преміальний")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("main-upper")).toContainText("€");
    const q = quote("kyiv", jawInput("upper", { tooth_count: 3, location: "adjacent", implant_tier: "premium" }));
    await expectMain(page, "upper", uah(q.overallTotal, "EUR"));
    expect(page.url()).toBe(url);

    // "Почати розрахунок заново" forgets the answers
    await page.getByTestId("restart").click();
    await expect(h1(page)).toHaveText(COUNTS_TITLE);
    await expect(countSlider(page, "upper")).toHaveAttribute("aria-valuenow", "0");
    // the city is kept, the answers are not
    await page.reload();
    await expect(h1(page)).toHaveText(COUNTS_TITLE);
    await expect(page.getByTestId("city-chip-name")).toHaveText("Київ");
    await expect(countSlider(page, "upper")).toHaveAttribute("aria-valuenow", "0");
  });

  test("a broken stored value does not crash the calculator", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("denva-calculator-v3", '{"v":3,"state":{"counts":{"upper":"x"}},"step":"result"'));
    await page.goto(CALC_PATH);
    await expect(h1(page)).toHaveText("Калькулятор імплантації");
  });
});

// ───────────────────────── 14. city pages (initialLocation) ─────────────────────────

test("a city page skips the city step; the header offers «змінити»", async ({ page }) => {
  await page.goto(CITY_PATH);
  await expect(h1(page)).toContainText(COUNTS_TITLE);
  await expect(page.getByLabel("Оберіть місто лікування")).toHaveCount(0);
  await expect(page.getByTestId("city-chip-name")).toHaveText("Київ");
  await expect(page.getByTestId("city-chip")).toContainText("змінити");
  // no "Назад" to a city step on the first screen
  await expect(page.getByRole("button", { name: "Назад" })).toHaveCount(0);

  await counts(page, 1, 0);
  await opt(page, statusLabelFor(1, "removed")).click();
  await expectResult(page);
  await expectMain(page, "upper", "39 800 ₴");

  await page.getByTestId("city-chip").click();
  await page.getByLabel("Оберіть місто лікування").fill("львів");
  await page.getByTestId("location-city-lviv").click();
  await expectResult(page);
  await expect(page.getByTestId("source-city")).toHaveText("Львів");
});

// ───────────────────────── 14b. embedded in a host page ─────────────────────────

test("embedded: no site header, a <section> inside the host's <main>, no scroll jump on landing", async ({ page }) => {
  test.skip(!process.env.E2E_EMBED_PATH, "set E2E_EMBED_PATH to a page that renders <CalculatorApp embedded />");
  await page.goto(process.env.E2E_EMBED_PATH ?? "/");
  await expect(h1(page)).toContainText(COUNTS_TITLE);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const root = page.getByTestId("calculator-root");
  await expect(root.locator("header")).toHaveCount(0);
  await expect(root.getByRole("link", { name: /DENVA AI/ })).toHaveCount(0);
  await expect(root.locator("main")).toHaveCount(0);
  await expect(page.locator("main")).toHaveCount(1);
  // the host owns the page <h1>: the calculator uses <h2> for its steps
  await expect(root.locator("h1")).toHaveCount(0);
  await expect(h1(page)).toHaveJSProperty("tagName", "H2");
  await expect(page.getByTestId("calculator-root").locator("section").first()).toBeVisible();
  expect(await page.getByTestId("calculator-root").evaluate((el) => getComputedStyle(el).minHeight)).not.toBe("100dvh");
  await expect(page.getByTestId("city-chip-name")).toHaveText("Київ");
  await counts(page, 1, 0);
  await expect(page.getByTestId("question-jaw")).toHaveText(JAW.upper);
});

// ───────────────────────── 15. lead block (ТЗ §6.3) ─────────────────────────

test.describe("lead block", () => {
  const phone = "+380 50 123 45 67";
  type StoredLead = { lead: Record<string, unknown>; attempts: number; telegram: string };
  const leads = (page: Page) => page.evaluate(() => (window as unknown as { __denvaFixtureLeads: StoredLead[] }).__denvaFixtureLeads);

  async function resultWithLead(page: Page, search = "") {
    await page.goto(`${CALC_PATH}${search}`);
    await page.getByLabel("Оберіть місто лікування").fill("київ");
    await page.getByTestId("location-city-kyiv").click();
    await counts(page, 3, 1);
    await opt(page, LOC.adjacent).click();
    await opt(page, statusLabelFor(3, "removed")).click();
    await opt(page, statusLabelFor(1, "removed")).click();
    await expectResult(page);
  }

  test("sits below the result, is not a modal, asks only for a phone", async ({ page }) => {
    await resultWithLead(page);
    const block = page.getByTestId("lead-block");
    await expect(page.getByRole("button", { name: "Отримати персональні пропозиції від перевірених клінік" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Уточнити мій розрахунок" })).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page.getByTestId("lead-form")).toHaveCount(0);
    expect(await page.getByTestId("jaw-upper").evaluate((el) => getComputedStyle(el).filter)).toBe("none");
    expect((await block.boundingBox())!.y).toBeGreaterThan((await page.getByTestId("overall").boundingBox())!.y);

    await page.getByTestId("cta-tender").click();
    const form = page.getByTestId("lead-form");
    await expect(form).toBeVisible();
    expect(await form.locator("input").count()).toBe(1);
    await expect(form.getByLabel("Ваш номер телефону")).toBeFocused();
    await expect(form).toContainText("SMS-код не потрібен");
    // the result is still there
    await expectOverall(page, uah(quote("kyiv", jawInput("upper", { tooth_count: 3, location: "adjacent" }), jawInput("lower")).overallTotal));
  });

  test("invalid phone is rejected without sending", async ({ page }) => {
    await resultWithLead(page);
    await page.getByTestId("cta-refine").click();
    await page.getByLabel("Ваш номер телефону").fill("123");
    await page.getByRole("button", { name: "Надіслати заявку", exact: true }).click();
    await expect(page.getByText("Введіть номер телефону повністю")).toBeVisible();
    await expect(page.getByText("Дякуємо! Заявку отримано.")).toHaveCount(0);
  });

  test("dental_tender: payload carries both jaw inputs/calculations, overallTotal, readable answers, source, URL, UTM", async ({ page }) => {
    await resultWithLead(page, "?utm_source=google&utm_campaign=implants");
    await tier(page, "upper", "implant", "Преміальний").click();
    await page.getByTestId("cta-tender").click();
    await page.getByLabel("Ваш номер телефону").fill(phone);
    await page.getByRole("button", { name: "Надіслати заявку", exact: true }).click();
    await expect(page.getByText("Дякуємо! Заявку отримано.")).toBeVisible();

    const stored = await leads(page);
    expect(stored).toHaveLength(1);
    const lead = stored[0].lead as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const q = quote("kyiv", jawInput("upper", { tooth_count: 3, location: "adjacent", implant_tier: "premium" }), jawInput("lower"));
    expect(lead).toMatchObject({
      intent: "dental_tender",
      phone,
      location: { kind: "city", id: "kyiv", name: "Київ" },
      // the premium implant of the upper jaw has no local clinics → the weakest main line decides
      price_source: "Використано середній ринковий орієнтир міста",
      utm: { utm_source: "google", utm_campaign: "implants" },
    });
    expect(lead.overallTotal.low).toBeCloseTo(q.overallTotal!.low, 6);
    expect(lead.upperJawInput).toMatchObject({ jaw: "upper", tooth_count: 3, location: "adjacent", status: "removed", implant_tier: "premium", crown_or_arch_tier: "classic" });
    expect(lead.lowerJawInput).toMatchObject({ jaw: "lower", tooth_count: 1, implant_tier: "classic" });
    expect(lead.upperJawCalculation.total.low).toBeCloseTo(q.upperJawCalculation!.total.low, 6);
    expect(lead.lowerJawCalculation.total.low).toBeCloseTo(q.lowerJawCalculation!.total.low, 6);
    expect(lead.upperJawCalculation.components.length).toBeGreaterThan(3);
    expect(lead.scenario_label).toContain("Верхня щелепа: 3 зуби, поруч");
    expect(lead.scenario_label).toContain("Нижня щелепа: 1 зуб");
    expect(lead.answers).toMatchObject({
      "Верхня щелепа: скільки зубів потрібно замінити?": 3,
      "Верхня щелепа: як розташовані зуби?": "Поруч",
      "Верхня щелепа: стан зубів": "Зуби вже видалені",
      "Верхня щелепа: рівень імпланта": "Преміальний",
      "Верхня щелепа: рівень коронки": "Класичний",
      "Нижня щелепа: скільки зубів потрібно замінити?": 1,
      "Нижня щелепа: стан зубів": "Зуб уже видалений",
      "Врахувати тимчасове протезування": "Ні",
    });
    expect(String(lead.page_url)).toContain("utm_source=google");
    expect(typeof lead.created_at).toBe("string");
  });

  test("refine: the second CTA sends intent=refine", async ({ page }) => {
    await resultWithLead(page);
    await page.getByTestId("cta-refine").click();
    await page.getByLabel("Ваш номер телефону").fill(phone);
    await page.getByRole("button", { name: "Надіслати заявку", exact: true }).click();
    await expect(page.getByText("Дякуємо! Заявку отримано.")).toBeVisible();
    expect(((await leads(page))[0].lead as { intent: string }).intent).toBe("refine");
  });

  test("Telegram failure: the result stays usable, retry (by lead id) succeeds", async ({ page }) => {
    await resultWithLead(page);
    await page.getByTestId("cta-tender").click();
    await page.getByLabel("Ваш номер телефону").fill("+380 50 000 0000");
    await page.getByRole("button", { name: "Надіслати заявку", exact: true }).click();
    await expect(page.getByTestId("lead-error")).toContainText("Не вдалося доставити заявку");
    await expect(page.getByRole("button", { name: "Надіслати ще раз", exact: true })).toBeVisible();

    // the result is still fully usable
    await tier(page, "lower", "crown", "Преміальний").click();
    await expectMain(page, "lower", uah(quote("kyiv", null, jawInput("lower", { crown_or_arch_tier: "premium" })).overallTotal));

    await page.getByRole("button", { name: "Надіслати ще раз", exact: true }).click();
    await expect(page.getByText("Дякуємо! Заявку отримано.")).toBeVisible();
    const stored = await leads(page);
    expect(stored).toHaveLength(1);
    expect(stored[0].attempts).toBe(2);
  });

  test("network failure: message, retry with a corrected number", async ({ page }) => {
    await resultWithLead(page);
    await page.getByTestId("cta-refine").click();
    await page.getByLabel("Ваш номер телефону").fill("+380 50 111 1111");
    await page.getByRole("button", { name: "Надіслати заявку", exact: true }).click();
    await expect(page.getByTestId("lead-error")).toContainText("Не вдалося доставити заявку");
    await expectOverall(page, uah(quote("kyiv", jawInput("upper", { tooth_count: 3, location: "adjacent" }), jawInput("lower")).overallTotal));
    await page.getByLabel("Ваш номер телефону").fill(phone);
    await page.getByRole("button", { name: "Надіслати ще раз", exact: true }).click();
    await expect(page.getByText("Дякуємо! Заявку отримано.")).toBeVisible();
  });
});

// ───────────────────────── 16. layout at 360 px ─────────────────────────

test("no horizontal overflow at 360 px on every screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(CALC_PATH);
  await noHorizontalOverflow(page);
  await page.getByLabel("Оберіть місто лікування").fill("л");
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "Не знайшли своє місто? Оберіть область" }).click();
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "← Повернутися до пошуку міста" }).click();
  await page.getByLabel("Оберіть місто лікування").fill("київ");
  await page.getByTestId("location-city-kyiv").click();
  await noHorizontalOverflow(page);
  await setCount(page, "upper", 14);
  await setCount(page, "lower", 14);
  await noHorizontalOverflow(page);
  await opt(page, "Не знаю точно").click();
  await noHorizontalOverflow(page);
  await opt(page, "← Повернутися до бігунків").click();
  await page.getByRole("button", { name: "Продовжити" }).click();
  await noHorizontalOverflow(page);
  await opt(page, statusLabelFor(14, "removed")).click();
  await noHorizontalOverflow(page);
  await opt(page, statusLabelFor(14, "removed")).click();
  await expectResult(page);
  await noHorizontalOverflow(page);
  await page.getByRole("tab", { name: "All-on-8" }).first().click();
  await page.getByRole("tab", { name: "All-on-4" }).last().click();
  await page.getByLabel("Врахувати можливе тимчасове протезування").check();
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "Змінити параметри" }).click();
  await noHorizontalOverflow(page);
  await page.getByRole("group", { name: "Валюта" }).getByRole("button", { name: "Євро" }).click();
  await noHorizontalOverflow(page);
  await page.getByTestId("cta-tender").click();
  await noHorizontalOverflow(page);
});
