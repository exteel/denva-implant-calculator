/**
 * Click-through e2e: full-arch / both-jaws / "Не знаю" triage leaves, ТЗ §12,
 * §14.2, §15, §19, lead form, analytics and navigation (mobile, Pixel 7).
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

// ───────────────────────── constants (labels from src/engine) ─────────────────────────

const CTA = {
  mass: "Перевірити план перед лікуванням",
  unclear: "Розібрати мою пропозицію по пунктах",
  plan: "Перевірити мій план",
  ct: "Перевірити ситуацію за КТ",
  consult: "Розібрати мою ситуацію",
  tender: "Отримати пропозиції від клінік",
} as const;
const ALL_CTA = Object.values(CTA) as string[];

const BAD_TEXT = /\bNaN\b|undefined|\bnull\b|\bInfinity\b|переплач/i;

const T_TEETH = "Скільки зубів потрібно відновити?";
const L_FULL = "Більшість або всі зуби на одній щелепі";
const L_BOTH = "Обидві щелепи";
const L_UNKNOWN = "Не знаю";

type Pair = [id: string, label: string];

const ARCH_SIT: Pair[] = [
  ["no_teeth", "Зубів немає"],
  ["few_left", "Залишилося лише кілька зубів"],
  ["mostly_destroyed", "Більшість зубів сильно зруйновані або рухомі"],
  ["removable_denture", "Ношу знімний протез"],
  ["unknown", "Не знаю"],
];
const ARCH_PLAN: Pair[] = [
  ["no", "Ні"],
  ["aox4", "Так, All-on-4"],
  ["aox6", "Так, All-on-6"],
  ["aox8", "Так, All-on-8"],
  ["offered_unknown", "Пропонували, але не знаю яке"],
];
const BOTH_SIT: Pair[] = [
  ["almost_none_both", "Майже немає зубів на обох щелепах"],
  ["one_none_other_partial", "На одній майже немає, на іншій частина зубів збережена"],
  ["many_problem_both", "Багато проблемних зубів на обох щелепах"],
  ["removable_dentures", "Ношу знімні протези"],
  ["unknown", "Не знаю"],
];
const JAW_PLAN: Pair[] = [
  ["aox4", "All-on-4"],
  ["aox6", "All-on-6"],
  ["aox8", "All-on-8"],
  ["other", "Інше"],
  ["unknown", "Не знаю"],
];
const ARCH_NAME: Record<string, string> = { aox4: "All-on-4", aox6: "All-on-6", aox8: "All-on-8" };
const isPlan = (v: string) => v in ARCH_NAME;
const implantsOf = (id: string) => Number(id.replace("aox", ""));
const implantsWord = (n: number) => `${n} ${n === 4 ? "імпланти" : "імплантів"}`;

// ───────────────────────── page helpers ─────────────────────────

const h1 = (page: Page, name?: string | RegExp) =>
  name === undefined ? page.getByRole("heading", { level: 1 }) : page.getByRole("heading", { level: 1, name });
const btn = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

async function pickCity(page: Page, city: string, expectHeading: string | RegExp) {
  await expect(async () => {
    const input = page.getByPlaceholder("Почніть вводити назву міста");
    await input.fill(city);
    await input.press("Enter");
    await expect(h1(page, expectHeading)).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
}

async function openCalculator(page: Page, city = "Львів") {
  await page.goto("/calculator/");
  await pickCity(page, city, T_TEETH);
}

async function pick(page: Page, ...labels: string[]) {
  for (const label of labels) await btn(page, label).click();
}

const resultReady = (page: Page) => expect(page.getByText("Що робити далі", { exact: true })).toBeVisible();

/** Q00: skip (no picks) or tick the given options and press "Показати результат". */
async function finishQualification(page: Page, picks: string[] = []) {
  await expect(h1(page, "Що у вас уже є?")).toBeVisible();
  if (picks.length === 0) {
    await btn(page, "Пропустити").click();
  } else {
    for (const p of picks) await page.getByRole("checkbox", { name: p }).check();
    await btn(page, "Показати результат").click();
  }
  await resultReady(page);
}

async function goArch(page: Page, sit = "Зубів немає", plan = "Ні", qual: string[] = [], city = "Львів") {
  await openCalculator(page, city);
  await pick(page, L_FULL, sit, plan);
  await finishQualification(page, qual);
}

/** Keep answering the first option (or "Ні" for the plan yes/no) until the result; skips Q00. */
async function finishDefault(page: Page) {
  for (let i = 0; i < 14; i++) {
    if (await page.getByText("Що робити далі", { exact: true }).isVisible()) return;
    const title = (await h1(page).innerText()).trim();
    if (title === "Що у вас уже є?") {
      await btn(page, "Пропустити").click();
    } else if (title === "Чи вже є план лікування від лікаря?") {
      await btn(page, "Ні").click();
    } else {
      await page.locator("main ul[role=list] li button").first().click();
    }
    await expect(h1(page)).not.toHaveText(title);
  }
  await resultReady(page);
}

// ───────────────────────── number parsing ─────────────────────────

interface Range {
  lo: number;
  hi: number;
}
const digits = (s: string) => Number(s.replace(/\D/g, ""));
function parseRange(s: string): Range {
  const m = s.match(/(\d[\d\s ]*?)\s*[–-]\s*(\d[\d\s ]*)/);
  if (!m) throw new Error(`no range in "${s}"`);
  return { lo: digits(m[1]), hi: digits(m[2]) };
}

/** Stage rows (Етап 1 / Етап 2 / Повне лікування) rendered as span.flex rows inside a card or the customiser. */
async function dlRows(scope: Locator): Promise<{ label: string; value: string }[]> {
  return scope.evaluate((el) => {
    const out: { label: string; value: string }[] = [];
    el.querySelectorAll("span.flex").forEach((row) => {
      const first = row.firstElementChild as HTMLElement | null;
      const last = row.lastElementChild as HTMLElement | null;
      if (!first || !last || first === last) return;
      const label = first.innerText.trim();
      if (/^(Етап 1|Етап 2|Повне лікування)$/.test(label)) out.push({ label, value: last.innerText.trim() });
    });
    return out;
  });
}

function expectStagesConsistent(rows: { label: string; value: string }[], where: string) {
  expect(rows.map((r) => r.label), `${where}: stage rows`).toEqual(["Етап 1", "Етап 2", "Повне лікування"]);
  const [s1, s2, full] = rows.map((r) => parseRange(r.value));
  expect(s1.lo, `${where}: stage1 > 0`).toBeGreaterThan(0);
  expect(s2.lo, `${where}: stage2 > 0`).toBeGreaterThan(0);
  expect(s1.lo, `${where}: stage1 lo<=hi`).toBeLessThanOrEqual(s1.hi);
  expect(Math.abs(s1.lo + s2.lo - full.lo), `${where}: p25 sum ${s1.lo}+${s2.lo} vs ${full.lo}`).toBeLessThanOrEqual(200);
  expect(Math.abs(s1.hi + s2.hi - full.hi), `${where}: p75 sum ${s1.hi}+${s2.hi} vs ${full.hi}`).toBeLessThanOrEqual(200);
  return full;
}

const segmentCards = (page: Page) =>
  page.getByRole("radiogroup", { name: "Ринковий сегмент" }).getByRole("radio");

/** Every segment card of the currently selected scenario: stages + totals, ordered Базовий ≤ Оптимальний ≤ Преміальний. */
async function checkArchCards(page: Page, where: string) {
  const cards = segmentCards(page);
  await expect(cards).toHaveCount(3);
  const totals: Range[] = [];
  for (let i = 0; i < 3; i++) {
    const card = cards.nth(i);
    for (const l of ["Етап 1", "Етап 2", "Повне лікування"]) await expect(card).toContainText(l);
    totals.push(expectStagesConsistent(await dlRows(card), `${where} card#${i}`) as unknown as Range);
  }
  for (let i = 1; i < 3; i++) {
    expect(totals[i].lo, `${where}: p25 not decreasing across segments`).toBeGreaterThanOrEqual(totals[i - 1].lo);
    expect(totals[i].hi, `${where}: p75 not decreasing across segments`).toBeGreaterThanOrEqual(totals[i - 1].hi);
  }
  return totals;
}

async function checkPlainCards(page: Page, where: string) {
  const cards = segmentCards(page);
  await expect(cards).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const t = await cards.nth(i).innerText();
    const r = parseRange(t);
    expect(r.hi, `${where}: card#${i} range`).toBeGreaterThanOrEqual(r.lo);
    expect(r.lo).toBeGreaterThan(0);
  }
}

// ───────────────────────── generic result checks ─────────────────────────

interface Exp {
  priced: boolean;
  title?: string;
  mass?: boolean;
  /** Clinical confidence label shown in R00-6. */
  clinical?: string;
  /** Explicit CTA label; default derived from routing rules (mass > low confidence > tender). */
  cta?: string;
  /** Skip strict CTA derivation (only "one of the known CTAs, exactly one"). */
  looseCta?: boolean;
}

const clinicalShown = (page: Page) =>
  page.getByText("Клінічний сценарій", { exact: true }).locator("xpath=following-sibling::span[1]");

async function checkResultCommon(page: Page, exp: Exp, where: string) {
  const text = await page.locator("main").innerText();
  expect(text, `${where}: bad token in page text`).not.toMatch(BAD_TEXT);
  for (const m of text.matchAll(/(\d[\d  ]*)–(\d[\d  ]*)\s*грн/g)) {
    expect(digits(m[2]), `${where}: range ${m[0]}`).toBeGreaterThanOrEqual(digits(m[1]));
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${where}: horizontal overflow at mobile width`).toBeLessThanOrEqual(1);

  if (exp.title) await expect(h1(page)).toHaveText(exp.title);

  if (exp.priced) {
    await expect(page.getByText("Ринковий орієнтир", { exact: true })).toBeVisible();
    await expect(page.getByText("Чому ми не показуємо ціну")).toHaveCount(0);
  } else {
    await expect(page.getByText("Чому ми не показуємо ціну")).toBeVisible();
    await expect(page.getByText("Ринковий орієнтир", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Етап 1")).toHaveCount(0);
    expect(text, `${where}: no_basket must not show prices`).not.toMatch(/\d\s?грн/);
  }

  const clinical = (await clinicalShown(page).innerText()).trim();
  if (exp.clinical) expect(clinical, `${where}: clinical confidence`).toBe(exp.clinical);

  // mass-extraction block
  const massBlock = page.getByText("Спершу — перевірка плану", { exact: true });
  const massShown = (await massBlock.count()) > 0;
  if (exp.mass !== undefined) expect(massShown, `${where}: massExtraction block`).toBe(exp.mass);
  if (massShown) {
    await expect(massBlock).toBeVisible();
    if (exp.priced) {
      const above = await page.evaluate(() => {
        const find = (t: string) =>
          Array.from(document.querySelectorAll("main *")).find(
            (e) => e.children.length === 0 && e.textContent?.trim() === t,
          );
        const a = find("Спершу — перевірка плану");
        const b = find("Ринковий орієнтир");
        return !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      expect(above, `${where}: mass warning must be above "Ринковий орієнтир"`).toBe(true);
    }
    const note = page.getByRole("note").filter({ hasText: "Спершу — перевірка плану" });
    await expect(note).toContainText("Якщо вам рекомендують видалити багато зубів");
    await expect(note.getByRole("button"), `${where}: P-06 card must not carry its own CTA`).toHaveCount(0);
  }

  // single primary CTA
  const block = page.getByText("Що робити далі", { exact: true }).locator("xpath=..");
  await expect(block.getByRole("button")).toHaveCount(1);
  const shownCta = ((await block.getByRole("button").innerText()) as string).replace(/\s*→\s*$/, "").trim();
  expect(ALL_CTA, `${where}: unknown CTA "${shownCta}"`).toContain(shownCta);
  if (!exp.looseCta) {
    const low = /^Низька/.test(clinical);
    const expected = exp.cta ?? (massShown ? CTA.mass : low ? CTA.consult : CTA.tender);
    expect(shownCta, `${where}: CTA`).toBe(expected);
  }
  if (massShown) expect(shownCta, `${where}: mass block implies mass CTA`).toBe(CTA.mass);
  for (const other of ALL_CTA.filter((l) => l !== shownCta)) {
    await expect(btn(page, other), `${where}: foreign CTA "${other}"`).toHaveCount(0);
  }
  return { shownCta, clinical };
}

const tabs = (page: Page) => page.getByRole("tablist", { name: "Сценарій" }).getByRole("tab");
const refNote = (page: Page) => page.getByText(/^Референс для оцінки:/);
const showAlso = (page: Page) => page.getByRole("button", { name: /^Показати також:/ });

async function tabLabels(page: Page): Promise<string[]> {
  if ((await tabs(page).count()) === 0) return [];
  return (await tabs(page).allInnerTexts()).map((s) => s.trim());
}

// ───────────────────────── expectations ─────────────────────────

function archExpectation(sit: string, plan: string): Exp {
  const base = sit === "no_teeth" || sit === "removable_denture" ? "Середня" : "Низька";
  const withPlan = isPlan(plan);
  const clinical = withPlan ? (base === "Середня" ? "Середня–висока" : "Низька–середня") : base;
  return {
    priced: true,
    title: "Повне відновлення однієї щелепи",
    mass: sit === "few_left" || sit === "mostly_destroyed",
    clinical,
  };
}

/** Scenario tab labels for both-jaws, or null for no_basket. `single` = exactly one scenario (no tabs). */
function bothScenarios(sit: string, hasPlan: boolean, U: string, L: string): string[] | null {
  if (hasPlan && U === "other" && L === "other") return null;
  if (sit === "one_none_other_partial") {
    const known: string[] = [];
    if (hasPlan) for (const p of [U, L]) if (isPlan(p) && !known.includes(p)) known.push(p);
    return (known.length ? known : ["aox4", "aox6"]).map((p) => `${ARCH_NAME[p]} на одній щелепі`);
  }
  if (!hasPlan) return ["All-on-4 + All-on-4", "All-on-6 + All-on-6"];
  const uk = isPlan(U);
  const lk = isPlan(L);
  if (uk && lk) return [`${ARCH_NAME[U]} + ${ARCH_NAME[L]}`];
  if (!uk && !lk) return ["All-on-4 + All-on-4", "All-on-6 + All-on-6"];
  return uk
    ? [`${ARCH_NAME[U]} + All-on-4`, `${ARCH_NAME[U]} + All-on-6`]
    : [`All-on-4 + ${ARCH_NAME[L]}`, `All-on-6 + ${ARCH_NAME[L]}`];
}

function bothExpectation(sit: string, hasPlan: boolean, U: string, L: string): Exp {
  const scenarios = bothScenarios(sit, hasPlan, U, L);
  if (scenarios === null) {
    const mass = sit === "many_problem_both";
    return { priced: false, title: "Обидві щелепи", clinical: "Низька", mass, cta: mass ? CTA.mass : CTA.consult };
  }
  const base = sit === "almost_none_both" || sit === "removable_dentures" ? "Середня" : "Низька";
  let clinical = base;
  if (sit === "one_none_other_partial") {
    const anyKnown = hasPlan && (isPlan(U) || isPlan(L));
    clinical = anyKnown ? "Низька–середня" : "Низька";
  } else if (hasPlan && isPlan(U) && isPlan(L)) {
    clinical = base === "Середня" ? "Середня–висока" : "Низька–середня";
  }
  return {
    priced: true,
    title: "Обидві щелепи",
    mass: sit === "many_problem_both",
    clinical,
  };
}

// ───────────────────────── 6.5 one jaw: every situation × every plan answer ─────────────────────────

test.describe("6.5 Більшість або всі зуби на одній щелепі", () => {
  for (const [sid, slabel] of ARCH_SIT) {
    for (const [pid, plabel] of ARCH_PLAN) {
      test(`${sid} × plan ${pid}`, async ({ page }) => {
        await openCalculator(page);
        await pick(page, L_FULL);
        await expect(h1(page, "Яка зараз ситуація на цій щелепі?")).toBeVisible();
        await pick(page, slabel);
        await expect(h1(page, "Чи вам уже пропонували повне відновлення щелепи?")).toBeVisible();
        await pick(page, plabel);
        await finishQualification(page);

        const where = `arch ${sid}/${pid}`;
        const exp = archExpectation(sid, pid);
        await checkResultCommon(page, exp, where);

        // tabs / hidden All-on-8
        const order = isPlan(pid) ? [pid, ...["aox4", "aox6", "aox8"].filter((p) => p !== pid)] : ["aox4", "aox6", "aox8"];
        const primary = isPlan(pid) ? [pid] : ["aox4", "aox6"];
        const secondary = order.filter((p) => !primary.includes(p));
        const names = (ids: string[]) => ids.map((p) => ARCH_NAME[p]);

        expect(await tabLabels(page), `${where}: primary tabs`).toEqual(primary.length > 1 ? names(primary) : []);
        if (!isPlan(pid)) {
          await expect(page.getByRole("tab", { name: "All-on-8" }), `${where}: All-on-8 hidden`).toHaveCount(0);
        }
        await expect(showAlso(page)).toHaveText(`Показати також: ${names(secondary).join(", ")}`);

        // default scenario reference
        await expect(refNote(page)).toContainText(`Референс для оцінки: ${implantsWord(implantsOf(primary[0]))}`);
        await checkArchCards(page, `${where} default`);

        // expand → every scenario consistent; plan = default selected
        await showAlso(page).click();
        expect(await tabLabels(page)).toEqual(names(order));
        await expect(page.getByRole("tab", { name: ARCH_NAME[order[0]], exact: true })).toHaveAttribute("aria-selected", "true");
        for (const p of order) {
          await page.getByRole("tab", { name: ARCH_NAME[p], exact: true }).click();
          await expect(refNote(page)).toContainText(`Референс для оцінки: ${implantsWord(implantsOf(p))}`);
          await checkArchCards(page, `${where} ${ARCH_NAME[p]}`);
        }
        await expect(btn(page, "Сховати додаткові сценарії")).toBeVisible();
        await checkResultCommon(page, exp, `${where} (expanded)`);
      });
    }
  }
});

// ───────────────────────── 6.6 both jaws ─────────────────────────

async function runBoth(page: Page, sid: string, slabel: string, hasPlan: boolean, U = "", L = "", ulabel = "", llabel = "") {
  await openCalculator(page);
  await pick(page, L_BOTH);
  await expect(h1(page, "Яка зараз ситуація на щелепах?")).toBeVisible();
  await pick(page, slabel);
  await expect(h1(page, "Чи вже є план лікування від лікаря?")).toBeVisible();
  if (hasPlan) {
    await pick(page, "Так");
    await expect(h1(page, "Що запропонували для верхньої щелепи?")).toBeVisible();
    await pick(page, ulabel);
    await expect(h1(page, "Що запропонували для нижньої щелепи?")).toBeVisible();
    await pick(page, llabel);
  } else {
    await pick(page, "Ні");
  }
  await finishQualification(page);

  const where = `both ${sid} plan=${hasPlan ? `${U}/${L}` : "no"}`;
  const exp = bothExpectation(sid, hasPlan, U, L);
  await checkResultCommon(page, exp, where);

  const scenarios = bothScenarios(sid, hasPlan, U, L);
  if (scenarios === null) return; // no_basket fully verified by checkResultCommon

  const labels = await tabLabels(page);
  expect(labels, `${where}: scenario tabs`).toEqual(scenarios.length > 1 ? scenarios : []);
  await expect(showAlso(page)).toHaveCount(0);

  const single = sid === "one_none_other_partial";
  for (const label of scenarios) {
    if (scenarios.length > 1) {
      await page.getByRole("tab", { name: label, exact: true }).click();
      await expect(page.getByRole("tab", { name: label, exact: true })).toHaveAttribute("aria-selected", "true");
    }
    await expect(refNote(page)).toBeVisible();
    const note = await refNote(page).innerText();
    if (!single) {
      const [a, b] = label.split(" + ");
      if (a === b) {
        const n = implantsOf(Object.keys(ARCH_NAME).find((k) => ARCH_NAME[k] === a)!) * 2;
        expect(note, `${where} ${label}`).toContain(`${a} на кожній щелепі (${implantsWord(n)} разом)`);
      } else {
        expect(note, `${where} ${label}`).toContain(`${a} на верхній щелепі + ${b} на нижній`);
      }
    }
    await checkArchCards(page, `${where} ${label}`);
  }
  if (!single) {
    // both jaws are priced as two arch parts
    const details = page.locator("details").first();
    const content = (await details.textContent()) ?? "";
    expect(content, `${where}: breakdown has upper arch`).toContain("верхня");
    expect(content, `${where}: breakdown has lower arch`).toContain("нижня");
  } else {
    await expect(page.getByText("Для другої щелепи вартість залежить від плану часткового відновлення.")).toBeVisible();
  }
}

test.describe("6.6 Обидві щелепи — плану немає", () => {
  for (const [sid, slabel] of BOTH_SIT) {
    test(`${sid} × plan no`, async ({ page }) => {
      await runBoth(page, sid, slabel, false);
    });
  }
});

test.describe("6.6 Обидві щелепи — план є: верхня × нижня", () => {
  for (const [sid, slabel] of BOTH_SIT) {
    for (const [u, ulabel] of JAW_PLAN) {
      for (const [l, llabel] of JAW_PLAN) {
        test(`${sid} × upper ${u} × lower ${l}`, async ({ page }) => {
          await runBoth(page, sid, slabel, true, u, l, ulabel, llabel);
        });
      }
    }
  }
});

// ───────────────────────── 6.7 "Не знаю" triage ─────────────────────────

test.describe("6.7 Не знаю — тріаж", () => {
  test("тріаж показує 6 варіантів", async ({ page }) => {
    await openCalculator(page);
    await pick(page, L_UNKNOWN);
    await expect(h1(page, "Що найкраще описує вашу ситуацію?")).toBeVisible();
    const labels = await page.locator("main ul[role=list] li button").allInnerTexts();
    expect(labels.map((s) => s.replace(/\s*→\s*$/, "").trim())).toEqual([
      "Немає одного або кількох зубів",
      "Є сильно зруйновані або рухомі зуби",
      "Лікар уже говорив про імпланти",
      "Ношу знімний протез і розглядаю незнімні зуби",
      "Проблема зі старими імплантами або коронками",
      "Важко сказати",
    ]);
  });

  interface Leaf {
    l1: string;
    sub?: string;
    subTitle?: string;
    exp: Exp;
  }
  const TITLE_ARCH = "Повне відновлення однієї щелепи";
  const leaves: Leaf[] = [
    // missing teeth
    { l1: "Немає одного або кількох зубів", sub: "1 зуб", subTitle: "Скільки приблизно зубів немає?", exp: { priced: true, title: "Один зуб, який уже видалений", mass: false } },
    { l1: "Немає одного або кількох зубів", sub: "2–3 поруч", subTitle: "Скільки приблизно зубів немає?", exp: { priced: true, mass: false } },
    { l1: "Немає одного або кількох зубів", sub: "Кілька в різних місцях", subTitle: "Скільки приблизно зубів немає?", exp: { priced: true, mass: false } },
    { l1: "Немає одного або кількох зубів", sub: "Більшість на одній щелепі", subTitle: "Скільки приблизно зубів немає?", exp: { priced: true, title: TITLE_ARCH, mass: false, clinical: "Середня" } },
    // destroyed / mobile
    { l1: "Є сильно зруйновані або рухомі зуби", sub: "1 зуб", subTitle: "Скільки таких зубів?", exp: { priced: true, mass: false, looseCta: true } },
    { l1: "Є сильно зруйновані або рухомі зуби", sub: "Кілька", subTitle: "Скільки таких зубів?", exp: { priced: true, looseCta: true } },
    { l1: "Є сильно зруйновані або рухомі зуби", sub: "Більшість на одній щелепі", subTitle: "Скільки таких зубів?", exp: { priced: true, title: TITLE_ARCH, mass: true, clinical: "Низька" } },
    { l1: "Є сильно зруйновані або рухомі зуби", sub: "Багато на обох щелепах", subTitle: "Скільки таких зубів?", exp: { priced: true, title: "Обидві щелепи", mass: true, clinical: "Низька" } },
    // doctor mentioned
    { l1: "Лікар уже говорив про імпланти", sub: "1 зуб", subTitle: "Про скільки зубів ішлося?", exp: { priced: true, looseCta: true } },
    { l1: "Лікар уже говорив про імпланти", sub: "2–3 зуби поруч", subTitle: "Про скільки зубів ішлося?", exp: { priced: true, looseCta: true } },
    { l1: "Лікар уже говорив про імпланти", sub: "4–6 зубів поруч", subTitle: "Про скільки зубів ішлося?", exp: { priced: true, looseCta: true } },
    { l1: "Лікар уже говорив про імпланти", sub: "Кілька зубів у різних місцях", subTitle: "Про скільки зубів ішлося?", exp: { priced: true, looseCta: true } },
    { l1: "Лікар уже говорив про імпланти", sub: L_FULL, subTitle: "Про скільки зубів ішлося?", exp: { priced: true, title: TITLE_ARCH, mass: false, clinical: "Середня" } },
    { l1: "Лікар уже говорив про імпланти", sub: L_BOTH, subTitle: "Про скільки зубів ішлося?", exp: { priced: true, title: "Обидві щелепи", mass: false, clinical: "Середня" } },
    { l1: "Лікар уже говорив про імпланти", sub: "Не пам’ятаю", subTitle: "Про скільки зубів ішлося?", exp: { priced: false, title: "Лікар згадував імпланти", mass: false, clinical: "Низька", cta: CTA.consult } },
    // denture
    { l1: "Ношу знімний протез і розглядаю незнімні зуби", sub: "Одна щелепа", subTitle: "Одна щелепа чи обидві?", exp: { priced: true, title: TITLE_ARCH, mass: false, clinical: "Середня" } },
    { l1: "Ношу знімний протез і розглядаю незнімні зуби", sub: "Обидві щелепи", subTitle: "Одна щелепа чи обидві?", exp: { priced: true, title: "Обидві щелепи", mass: false, clinical: "Середня" } },
    // hard to say
    { l1: "Важко сказати", exp: { priced: false, title: "Ситуацію важко описати", mass: false, clinical: "Низька", cta: CTA.consult } },
  ];

  for (const leaf of leaves) {
    test(`${leaf.l1} → ${leaf.sub ?? "(без уточнення)"}`, async ({ page }) => {
      await openCalculator(page);
      await pick(page, L_UNKNOWN);
      await expect(h1(page, "Що найкраще описує вашу ситуацію?")).toBeVisible();
      await pick(page, leaf.l1);
      if (leaf.sub) {
        await expect(h1(page, leaf.subTitle!)).toBeVisible();
        await pick(page, leaf.sub);
      }
      await finishDefault(page);
      const where = `triage ${leaf.l1} / ${leaf.sub ?? ""}`;
      await checkResultCommon(page, leaf.exp, where);
      if (leaf.exp.priced) {
        if (leaf.exp.title === TITLE_ARCH || leaf.exp.title === "Обидві щелепи") {
          await checkArchCards(page, where);
        } else {
          await checkPlainCards(page, where);
        }
      }
    });
  }

  for (const [kind, kindTitle] of [
    ["Лише коронка (імплант у порядку)", "crown"],
    ["Проблема з самим імплантом", "implant"],
    ["Не знаю", "unknown"],
  ] as const) {
    test(`Проблема зі старими імплантами або коронками → ${kindTitle}`, async ({ page }) => {
      await openCalculator(page);
      await pick(page, L_UNKNOWN);
      await pick(page, "Проблема зі старими імплантами або коронками");
      await expect(h1(page, "Що саме турбує?")).toBeVisible();
      await pick(page, kind);
      await finishQualification(page);
      const text = await page.locator("main").innerText();
      expect(text).not.toMatch(BAD_TEXT);
      const priced = (await page.getByText("Чому ми не показуємо ціну").count()) === 0;
      await checkResultCommon(page, { priced, mass: false, looseCta: true }, `triage old_implants/${kindTitle}`);
      if (priced) await checkPlainCards(page, `triage old_implants/${kindTitle}`);
    });
  }

  test("Назад із тріажу повертає до питання S02", async ({ page }) => {
    await openCalculator(page);
    await pick(page, L_UNKNOWN, "Немає одного або кількох зубів");
    await expect(h1(page, "Скільки приблизно зубів немає?")).toBeVisible();
    await btn(page, "← Назад").or(page.getByRole("button", { name: /Назад/ })).first().click();
    await expect(h1(page, "Що найкраще описує вашу ситуацію?")).toBeVisible();
    await page.getByRole("button", { name: /Назад/ }).click();
    await expect(h1(page, T_TEETH)).toBeVisible();
  });
});

// ───────────────────────── full-arch quote comparison (ТЗ §14.2) ─────────────────────────

const compareBtn = (page: Page) => btn(page, "Порівняти з ринком");
const radio = (page: Page, name: string) => page.getByRole("radio", { name, exact: true });
const amountInput = (page: Page) => page.getByPlaceholder("Наприклад, 68 000");
const comparisonRow = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).locator("xpath=following-sibling::dd[1]");

async function openCompare(page: Page) {
  await btn(page, "Порівняти пропозицію клініки").click();
  await expect(amountInput(page)).toBeVisible();
}

async function optimalRows(page: Page) {
  return dlRows(segmentCards(page).nth(1));
}

test.describe("Порівняння пропозиції: повна щелепа", () => {
  test("«Імпланти + тимчасові незнімні зуби» порівнюється з Етапом 1", async ({ page }) => {
    await goArch(page);
    const rows = await optimalRows(page);
    const s1 = parseRange(rows[0].value);
    await openCompare(page);
    await amountInput(page).fill(String(Math.round((s1.lo + s1.hi) / 2)));
    await radio(page, "Імпланти + тимчасові незнімні зуби").check();
    await compareBtn(page).click();

    await expect(page.getByText(/^Порівнюємо з:/)).toContainText("Етап 1");
    const range = parseRange(await comparisonRow(page, "Типовий ринковий діапазон").innerText());
    expect(range).toEqual(s1);
    await expect(page.getByText("Ваша пропозиція вища")).toHaveCount(0);
    await expect(page.getByText(/у межах типового ринкового діапазону/).first()).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(BAD_TEXT);
    await expect(page.getByText("Спершу — перевірка плану", { exact: true })).toHaveCount(0);

    const dl = await dataLayerEvents(page);
    expect(dl).toContain("quote_entered");
    expect(dl).toContain("quote_compared");
    expect(dl.indexOf("quote_entered")).toBeLessThan(dl.indexOf("quote_compared"));
  });

  test("«Повне лікування до постійних зубів»: чіпи збільшують діапазон", async ({ page }) => {
    await goArch(page);
    const full = parseRange((await optimalRows(page))[2].value);
    await openCompare(page);
    await amountInput(page).fill(String(Math.round((full.lo + full.hi) / 2)));
    await radio(page, "Повне лікування до постійних зубів").check();
    await expect(page.getByText("Чи входять у суму також:")).toBeVisible();
    await compareBtn(page).click();

    await expect(page.getByText(/^Порівнюємо з:/)).toContainText("Повне лікування до постійних зубів");
    let prev = parseRange(await comparisonRow(page, "Типовий ринковий діапазон").innerText());
    expect(prev).toEqual(full);

    const chips = ["Видалення зубів", "Кісткові процедури", "Синус-ліфтинг", "Седація"];
    for (const chip of chips) {
      await btn(page, "Змінити дані пропозиції").click();
      await btn(page, chip).click();
      await expect(btn(page, chip)).toHaveAttribute("aria-pressed", "true");
      await compareBtn(page).click();
      const next = parseRange(await comparisonRow(page, "Типовий ринковий діапазон").innerText());
      expect(next.lo, `${chip}: p25 grows`).toBeGreaterThan(prev.lo);
      expect(next.hi, `${chip}: p75 grows`).toBeGreaterThan(prev.hi);
      prev = next;
    }
    await expect(page.getByText(/^Порівнюємо з:/)).toContainText("видалення + кісткова пластика + синус-ліфтинг + седація");
  });

  test("«Лише імплантація» — неспівставно, CTA не змінюється", async ({ page }) => {
    await goArch(page);
    await openCompare(page);
    await amountInput(page).fill("30000");
    await radio(page, "Лише імплантація").check();
    await compareBtn(page).click();
    await expect(page.getByText("Цю пропозицію некоректно порівнювати напряму")).toBeVisible();
    await expect(page.getByText("Типовий ринковий діапазон")).toHaveCount(0);
    await checkResultCommon(page, { priced: true, mass: false, clinical: "Середня", cta: CTA.tender }, "implants_only");
  });

  test("«Не знаю» — неспівставно, CTA «Розібрати мою пропозицію по пунктах»", async ({ page }) => {
    await goArch(page);
    await openCompare(page);
    await amountInput(page).fill("90000");
    await radio(page, "Не знаю").check();
    await compareBtn(page).click();
    await expect(page.getByText("Цю пропозицію некоректно порівнювати напряму")).toBeVisible();
    await checkResultCommon(page, { priced: true, mass: false, cta: CTA.unclear }, "arch unknown quote");
  });

  test("massExtraction має пріоритет над «Не знаю»", async ({ page }) => {
    await goArch(page, "Залишилося лише кілька зубів");
    await openCompare(page);
    await amountInput(page).fill("90000");
    await radio(page, "Не знаю").check();
    await compareBtn(page).click();
    await expect(page.getByText("Цю пропозицію некоректно порівнювати напряму")).toBeVisible();
    await checkResultCommon(page, { priced: true, mass: true, cta: CTA.mass }, "mass + unknown quote");
  });

  test("валідація: порожня сума / не обрано обсяг", async ({ page }) => {
    await goArch(page);
    await openCompare(page);
    await compareBtn(page).click();
    await expect(page.getByText("Вкажіть суму пропозиції.")).toBeVisible();
    await expect(page.getByText("Оберіть, що входить у пропозицію.")).toBeVisible();
  });

  test("пропозиція вища за діапазон → CTA «Розібрати мою пропозицію по пунктах», без «переплачуєте»", async ({ page }) => {
    await goArch(page);
    await openCompare(page);
    await amountInput(page).fill("5000000");
    await radio(page, "Повне лікування до постійних зубів").check();
    await compareBtn(page).click();
    await expect(page.getByText("Ваша пропозиція вища за типовий ринковий діапазон для співставного сценарію.")).toBeVisible();
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/переплач/i);
    expect(text).not.toMatch(BAD_TEXT);
    await checkResultCommon(page, { priced: true, mass: false, cta: CTA.unclear }, "above");
  });

  test("пропозиція нижча за діапазон", async ({ page }) => {
    await goArch(page);
    await openCompare(page);
    await amountInput(page).fill("10000");
    await radio(page, "Повне лікування до постійних зубів").check();
    await compareBtn(page).click();
    await expect(page.getByText("Ваша пропозиція нижча за типовий ринковий діапазон для співставного сценарію.")).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(BAD_TEXT);
  });

  test("EUR перераховується у гривні, а сума в «Ваша пропозиція» розумна", async ({ page }) => {
    await goArch(page);
    await openCompare(page);
    await amountInput(page).fill("1000");
    await page.getByRole("button", { name: "€", exact: true }).click();
    await radio(page, "Повне лікування до постійних зубів").check();
    await compareBtn(page).click();
    expect(digits(await comparisonRow(page, "Ваша пропозиція").innerText())).toBe(Math.round(1000 * 50.1385));
  });

  test("«Я вже маю вартість» у Q00 відкриває порівняння одразу", async ({ page }) => {
    await goArch(page, "Зубів немає", "Ні", ["Мені вже назвали вартість"]);
    await expect(amountInput(page)).toBeVisible();
    await expect(btn(page, "Порівняти пропозицію клініки")).toHaveCount(0);
  });

  test("зміна сегмента не ламає порівняння (порівнюємо з вибраним сегментом)", async ({ page }) => {
    await goArch(page);
    await segmentCards(page).nth(2).click();
    const full = parseRange((await dlRows(segmentCards(page).nth(2)))[2].value);
    await openCompare(page);
    await amountInput(page).fill(String(Math.round((full.lo + full.hi) / 2)));
    await radio(page, "Повне лікування до постійних зубів").check();
    await compareBtn(page).click();
    expect(parseRange(await comparisonRow(page, "Типовий ринковий діапазон").innerText())).toEqual(full);
    await expect(page.getByText(/^Порівнюємо з:/)).toContainText("Преміальний");
  });
});

// ───────────────────────── segments + customizer ─────────────────────────

test.describe("Сегменти і «Налаштувати варіант» (повна щелепа)", () => {
  test("segment_changed + package_customized + 3×3 узгоджені етапи", async ({ page }) => {
    await goArch(page);
    await expect(segmentCards(page).nth(1)).toHaveAttribute("aria-checked", "true");
    await segmentCards(page).nth(2).click();
    await expect(segmentCards(page).nth(2)).toHaveAttribute("aria-checked", "true");
    expect(await dataLayerEvents(page)).toContain("segment_changed");

    await btn(page, "Налаштувати варіант").click();
    const yours = page.getByText("Ваш варіант", { exact: true }).locator("xpath=..");
    const implantGroup = page.getByRole("group", { name: "Імплантаційна система" });
    const prosGroup = page.getByRole("group", { name: "Коронки / протезування" });
    const names = ["Базовий", "Оптимальний", "Преміальний"];
    const fulls: Range[][] = [];
    for (const [i, imp] of names.entries()) {
      fulls[i] = [];
      for (const [j, pro] of names.entries()) {
        await implantGroup.getByRole("button", { name: imp, exact: true }).click();
        await prosGroup.getByRole("button", { name: pro, exact: true }).click();
        await expect(implantGroup.getByRole("button", { name: imp, exact: true })).toHaveAttribute("aria-pressed", "true");
        const rows = await dlRows(yours);
        fulls[i][j] = expectStagesConsistent(rows, `3x3 ${imp}+${pro}`) as unknown as Range;
      }
    }
    // upgrading either axis never lowers the price
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (i > 0) expect(fulls[i][j].lo).toBeGreaterThanOrEqual(fulls[i - 1][j].lo);
        if (j > 0) expect(fulls[i][j].lo).toBeGreaterThanOrEqual(fulls[i][j - 1].lo);
      }
    }
    expect(await dataLayerEvents(page)).toContain("package_customized");
    await btn(page, "Повернутися до стандартних пакетів").click();
    await expect(btn(page, "Налаштувати варіант")).toBeVisible();
  });
});

// ───────────────────────── routing / qualification ─────────────────────────

test.describe("Маршрутизація (ТЗ §15)", () => {
  const cases: { name: string; sit: string; plan: string; qual: string[]; mass: boolean; cta: string }[] = [
    { name: "чистий сценарій → тендер", sit: "Зубів немає", plan: "Ні", qual: [], mass: false, cta: CTA.tender },
    { name: "є план → CheckMyPlan", sit: "Зубів немає", plan: "Ні", qual: ["Маю план лікування / кошторис"], mass: false, cta: CTA.plan },
    { name: "є КТ → аналіз КТ", sit: "Зубів немає", plan: "Ні", qual: ["Маю КТ"], mass: false, cta: CTA.ct },
    { name: "план + КТ → план", sit: "Зубів немає", plan: "Ні", qual: ["Маю КТ", "Маю план лікування / кошторис"], mass: false, cta: CTA.plan },
    { name: "нічого з цього", sit: "Зубів немає", plan: "Ні", qual: ["Нічого з цього"], mass: false, cta: CTA.tender },
    { name: "низька впевненість → консультація", sit: "Не знаю", plan: "Ні", qual: [], mass: false, cta: CTA.consult },
    { name: "mass + план → mass має пріоритет", sit: "Залишилося лише кілька зубів", plan: "Ні", qual: ["Маю план лікування / кошторис"], mass: true, cta: CTA.mass },
    { name: "mass + КТ → mass має пріоритет", sit: "Більшість зубів сильно зруйновані або рухомі", plan: "Так, All-on-6", qual: ["Маю КТ"], mass: true, cta: CTA.mass },
  ];
  for (const c of cases) {
    test(c.name, async ({ page }) => {
      await goArch(page, c.sit, c.plan, c.qual);
      await checkResultCommon(page, { priced: true, mass: c.mass, cta: c.cta }, c.name);
    });
  }

  test("«Нічого з цього» ексклюзивний, «Показати результат» вимкнений без вибору", async ({ page }) => {
    await openCalculator(page);
    await pick(page, L_FULL, "Зубів немає", "Ні");
    await expect(btn(page, "Показати результат")).toBeDisabled();
    await page.getByRole("checkbox", { name: "Маю КТ" }).check();
    await page.getByRole("checkbox", { name: "Маю план лікування / кошторис" }).check();
    await page.getByRole("checkbox", { name: "Нічого з цього" }).check();
    await expect(page.getByRole("checkbox", { name: "Маю КТ" })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Маю план лікування / кошторис" })).not.toBeChecked();
    await page.getByRole("checkbox", { name: "Маю КТ" }).check();
    await expect(page.getByRole("checkbox", { name: "Нічого з цього" })).not.toBeChecked();
  });
});

// ───────────────────────── lead form ─────────────────────────

const ctaBlockButton = (page: Page) =>
  page.getByText("Що робити далі", { exact: true }).locator("xpath=..").getByRole("button");

test.describe("Форма заявки", () => {
  test("валідація → успіх → localStorage → закриття", async ({ page }) => {
    await goArch(page);
    await ctaBlockButton(page).click();
    const dialog = page.getByRole("dialog", { name: CTA.tender });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(CTA.tender);

    await dialog.getByRole("button", { name: "Надіслати заявку" }).click();
    await expect(dialog.getByText("Вкажіть номер телефону — щонайменше 10 цифр.")).toBeVisible();
    await expect(dialog.getByText("Потрібна ваша згода.")).toBeVisible();

    // short phone is still invalid
    await dialog.getByLabel(/Телефон/).fill("12345");
    await dialog.getByRole("button", { name: "Надіслати заявку" }).click();
    await expect(dialog.getByText("Вкажіть номер телефону — щонайменше 10 цифр.")).toBeVisible();

    await dialog.getByLabel(/Телефон/).fill("0671234567");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Надіслати заявку" }).click();
    await expect(dialog.getByText("Демо-режим: заявку не надіслано")).toBeVisible({ timeout: 3000 });

    const leads = await page.evaluate(() => JSON.parse(localStorage.getItem("denva_leads") ?? "[]"));
    expect(leads).toHaveLength(1);
    const lead = leads[0];
    expect(lead.service).toBe("tender");
    expect(lead.ctaLabel).toBe(CTA.tender);
    expect(lead.location).toEqual({ id: "lviv", label: "Львів" });
    expect(lead.calculation.title).toBe("Повне відновлення однієї щелепи");
    expect(lead.calculation.kind).toBe("priced");
    expect(lead.calculation.totalUah.p25).toBeGreaterThan(0);
    expect(lead.answers).toMatchObject({ teeth: "full_arch", arch_situation: "no_teeth", arch_plan_offered: "no" });
    expect(lead.contact.phone).toBe("0671234567");
    expect(lead.consent).toBe(true);

    const dl = await dataLayerEvents(page);
    expect(dl).toContain("cta_tender");

    await dialog.getByRole("button", { name: "Повернутися до розрахунку" }).click();
    await expect(dialog).toBeHidden();
    await resultReady(page);
    await expect(h1(page, "Повне відновлення однієї щелепи")).toBeVisible();
  });

  test("закриття хрестиком та Esc не втрачає результат", async ({ page }) => {
    await goArch(page);
    await ctaBlockButton(page).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Закрити" }).click();
    await expect(dialog).toBeHidden();
    await ctaBlockButton(page).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(segmentCards(page)).toHaveCount(3);
  });

  test("заявка з порівнянням і зі зміненим сегментом потрапляє в payload", async ({ page }) => {
    await goArch(page, "Зубів немає", "Ні", ["Маю КТ"]);
    await segmentCards(page).nth(0).click();
    await openCompare(page);
    await amountInput(page).fill("100000");
    await radio(page, "Повне лікування до постійних зубів").check();
    await compareBtn(page).click();
    await ctaBlockButton(page).click();
    const dialog = page.getByRole("dialog", { name: /.+/ });
    await dialog.getByLabel(/Телефон/).fill("+380 67 123 45 67");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Надіслати заявку" }).click();
    await expect(dialog.getByText("Демо-режим: заявку не надіслано")).toBeVisible({ timeout: 3000 });
    const [lead] = await page.evaluate(() => JSON.parse(localStorage.getItem("denva_leads") ?? "[]"));
    expect(lead.comparison.offerUah).toBe(100000);
    expect(lead.calculation.package).toEqual({ implant: "BASIC", prosthetic: "BASIC" });
    expect(["ct", "checkmyplan"]).toContain(lead.service);
  });

  test("липка нижня кнопка: є, коли основний CTA поза екраном, відкриває той самий діалог", async ({ page }) => {
    await goArch(page);
    const sticky = page.locator("div.fixed").filter({ has: page.getByRole("button", { name: CTA.tender }) });
    await expect(sticky).toBeVisible();
    await ctaBlockButton(page).scrollIntoViewIfNeeded();
    await expect(sticky).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(sticky).toBeVisible();
    await sticky.getByRole("button", { name: CTA.tender }).click();
    await expect(page.getByRole("dialog", { name: CTA.tender })).toBeVisible();
    expect(await dataLayerEvents(page)).toContain("cta_tender");
    await expect(sticky).toHaveCount(0); // hidden while the dialog is open
  });

  for (const [name, args, label, event] of [
    ["mass", ["Залишилося лише кілька зубів", "Ні", []], CTA.mass, "cta_checkmyplan"],
    ["consult", ["Не знаю", "Ні", []], CTA.consult, "cta_consultation"],
    ["ct", ["Зубів немає", "Ні", ["Маю КТ"]], CTA.ct, "cta_ct"],
    ["plan", ["Зубів немає", "Ні", ["Маю план лікування / кошторис"]], CTA.plan, "cta_checkmyplan"],
  ] as const) {
    test(`кнопка ${name}: заголовок діалогу = мітка CTA, подія ${event}`, async ({ page }) => {
      await goArch(page, ...(args as unknown as [string, string, string[]]));
      await ctaBlockButton(page).click();
      await expect(page.getByRole("dialog", { name: label })).toBeVisible();
      expect(await dataLayerEvents(page)).toContain(event);
    });
  }

  test("massExtraction: жовта картка без власної кнопки; єдиний CTA (блок + липка панель) відкриває діалог", async ({ page }) => {
    await goArch(page, "Залишилося лише кілька зубів");
    const note = page.getByRole("note").filter({ hasText: "Спершу — перевірка плану" });
    await expect(note.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("button", { name: CTA.mass, exact: true })).toHaveCount(2); // dark block + sticky bar
    await ctaBlockButton(page).click();
    await expect(page.getByRole("dialog", { name: CTA.mass })).toBeVisible();
  });

  test("статус діалогу скидається при кожному відкритті", async ({ page }) => {
    await goArch(page);
    await ctaBlockButton(page).click();
    const dialog = page.getByRole("dialog", { name: CTA.tender });
    await dialog.getByLabel(/Телефон/).fill("0671234567");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Надіслати заявку" }).click();
    await expect(dialog.getByText("Демо-режим: заявку не надіслано")).toBeVisible({ timeout: 3000 });
    await dialog.getByRole("button", { name: "Повернутися до розрахунку" }).click();
    await expect(dialog).toBeHidden();
    await ctaBlockButton(page).click();
    await expect(dialog.getByRole("button", { name: "Надіслати заявку" })).toBeVisible();
    await expect(dialog.getByText("Демо-режим: заявку не надіслано")).toHaveCount(0);
  });

  test("no_basket: заявка працює без суми (totalUah відсутній)", async ({ page }) => {
    await openCalculator(page);
    await pick(page, L_UNKNOWN, "Важко сказати");
    await finishQualification(page);
    await ctaBlockButton(page).click();
    const dialog = page.getByRole("dialog", { name: CTA.consult });
    await dialog.getByLabel(/Телефон/).fill("0501234567");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Надіслати заявку" }).click();
    await expect(dialog.getByText("Демо-режим: заявку не надіслано")).toBeVisible({ timeout: 3000 });
    const [lead] = await page.evaluate(() => JSON.parse(localStorage.getItem("denva_leads") ?? "[]"));
    expect(lead.calculation.kind).toBe("no_basket");
    expect(lead.calculation.totalUah).toBeUndefined();
    expect(lead.calculation.title).toBe("Ситуацію важко описати");
    expect(lead.answers).toMatchObject({ teeth: "unknown", triage: "hard_to_say" });
  });
});

// ───────────────────────── analytics ─────────────────────────

async function dataLayerEvents(page: Page): Promise<string[]> {
  return page.evaluate(() => (window.dataLayer ?? []).map((e) => String(e.event)));
}

function expectSubsequence(actual: string[], wanted: string[]) {
  let i = 0;
  for (const e of actual) if (e === wanted[i]) i++;
  expect(i, `events ${JSON.stringify(actual)} should contain in order ${JSON.stringify(wanted)}`).toBe(wanted.length);
}

test.describe("Аналітика (ТЗ §19)", () => {
  test("calculator_started на лендингу, потім типова воронка по порядку", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Почати розрахунок/ }).first().click();
    await expect(page).toHaveURL(/\/calculator\/$/);
    expect((await dataLayerEvents(page))[0]).toBe("calculator_started");
    const started = await page.evaluate(() => window.dataLayer?.[0]);
    expect(started).toMatchObject({ event: "calculator_started" });
    expect(typeof (started as { placement?: unknown }).placement).toBe("string");

    await pickCity(page, "Львів", T_TEETH);
    await pick(page, L_FULL, "Зубів немає", "Ні");
    await finishQualification(page, ["Маю КТ"]);
    const events = await dataLayerEvents(page);
    expectSubsequence(events, [
      "calculator_started",
      "city_selected",
      "scenario_selected",
      "scenario_resolved",
      "qualification_completed",
      "result_viewed",
    ]);
    expect(events.filter((e) => e === "result_viewed")).toHaveLength(1);
    expect(events.filter((e) => e === "scenario_resolved")).toHaveLength(1);

    const dl = await page.evaluate(() => window.dataLayer as Record<string, unknown>[]);
    const by = (name: string) => dl.find((e) => e.event === name)!;
    expect(by("city_selected")).toMatchObject({ location_id: "lviv", level: "city" });
    expect(by("scenario_selected")).toMatchObject({ teeth: "full_arch" });
    expect(by("scenario_resolved")).toMatchObject({ kind: "priced" });
    expect(by("qualification_completed")).toMatchObject({ has_ct: true, has_plan: false, has_quote: false, skipped: false });
    expect(by("result_viewed")).toMatchObject({ kind: "priced", location_id: "lviv", cta: "ct" });

    // segment / customizer / comparison / CTA
    await segmentCards(page).nth(0).click();
    await segmentCards(page).nth(0).click(); // same segment → no duplicate
    await btn(page, "Налаштувати варіант").click();
    await page.getByRole("group", { name: "Імплантаційна система" }).getByRole("button", { name: "Преміальний", exact: true }).click();
    await openCompare(page);
    await amountInput(page).fill("80000");
    await radio(page, "Повне лікування до постійних зубів").check();
    await compareBtn(page).click();
    await ctaBlockButton(page).click();
    const after = await dataLayerEvents(page);
    expectSubsequence(after, ["result_viewed", "segment_changed", "package_customized", "quote_entered", "quote_compared", "cta_ct"]);
    expect(after.filter((e) => e === "segment_changed")).toHaveLength(1);
  });

  test("skipped Q00 → qualification_completed.skipped=true; no_basket → scenario_resolved.kind=no_basket", async ({ page }) => {
    await openCalculator(page);
    await pick(page, L_UNKNOWN, "Важко сказати");
    await finishQualification(page);
    const dl = await page.evaluate(() => window.dataLayer as Record<string, unknown>[]);
    expect(dl.find((e) => e.event === "qualification_completed")).toMatchObject({ skipped: true });
    expect(dl.find((e) => e.event === "scenario_resolved")).toMatchObject({ kind: "no_basket" });
    expect(dl.find((e) => e.event === "result_viewed")).toMatchObject({ kind: "no_basket", cta: "consultation" });
    expect(dl.find((e) => e.event === "scenario_selected")).toMatchObject({ teeth: "unknown" });
  });

  test("segment_changed фіксує сегмент", async ({ page }) => {
    await goArch(page);
    await segmentCards(page).nth(2).click();
    const dl = await page.evaluate(() => window.dataLayer as Record<string, unknown>[]);
    expect(dl.find((e) => e.event === "segment_changed")).toMatchObject({ segment: "PREMIUM" });
  });
});

// ───────────────────────── navigation ─────────────────────────

test.describe("Навігація", () => {
  test("Назад з першого запитання → крок міста", async ({ page }) => {
    await openCalculator(page);
    await page.getByRole("button", { name: /Назад/ }).click();
    await expect(h1(page, "У якому місті плануєте лікування?")).toBeVisible();
    await expect(page.getByRole("button", { name: /Назад/ })).toHaveCount(0);
  });

  test("Назад усередині гілки скидає наступні відповіді", async ({ page }) => {
    await openCalculator(page);
    await pick(page, L_FULL, "Залишилося лише кілька зубів");
    await expect(h1(page, "Чи вам уже пропонували повне відновлення щелепи?")).toBeVisible();
    await page.getByRole("button", { name: /Назад/ }).click();
    await expect(h1(page, "Яка зараз ситуація на цій щелепі?")).toBeVisible();
    await pick(page, "Зубів немає", "Ні");
    await finishQualification(page);
    await expect(page.getByText("Спершу — перевірка плану", { exact: true })).toHaveCount(0);
  });

  test("Назад показує раніше обрану відповідь (aria-pressed)", async ({ page }) => {
    await openCalculator(page);
    await pick(page, L_FULL, "Залишилося лише кілька зубів");
    await page.getByRole("button", { name: /Назад/ }).click();
    await expect(h1(page, "Яка зараз ситуація на цій щелепі?")).toBeVisible();
    await expect(btn(page, "Залишилося лише кілька зубів")).toHaveAttribute("aria-pressed", "true");
  });

  test("Назад з результату повертає вибір у Q00 (чекбокси)", async ({ page }) => {
    await goArch(page, "Зубів немає", "Ні", ["Маю КТ", "Мені вже назвали вартість"]);
    await page.getByRole("button", { name: /Назад/ }).click();
    await expect(h1(page, "Що у вас уже є?")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Маю КТ" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Мені вже назвали вартість" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Маю план лікування / кошторис" })).not.toBeChecked();
  });

  test("зміна відповіді в середині гілки перебудовує результат (both → full_arch)", async ({ page }) => {
    await openCalculator(page);
    await pick(page, L_BOTH, "Майже немає зубів на обох щелепах", "Так", "All-on-4");
    await page.getByRole("button", { name: /Назад/ }).click(); // → lower? (upper_plan answered → on lower_plan)
    await page.getByRole("button", { name: /Назад/ }).click();
    await page.getByRole("button", { name: /Назад/ }).click();
    await page.getByRole("button", { name: /Назад/ }).click();
    await expect(h1(page, T_TEETH)).toBeVisible();
    await pick(page, L_FULL, "Зубів немає", "Ні");
    await finishQualification(page);
    await expect(h1(page, "Повне відновлення однієї щелепи")).toBeVisible();
    await expect(tabs(page)).toHaveCount(2);
  });

  test("зміна міста через чіп повертає до того ж результату з іншими цінами", async ({ page }) => {
    await goArch(page, "Зубів немає", "Ні", [], "Львів");
    const lviv = await dlRows(segmentCards(page).nth(1));
    await expect(page.getByText(/Орієнтовний ринковий діапазон · Львів/)).toBeVisible();

    await page.getByRole("button", { name: "Змінити місто: Львів" }).click();
    await expect(h1(page, "У якому місті плануєте лікування?")).toBeVisible();
    await pickCity(page, "Київ", "Повне відновлення однієї щелепи");
    await resultReady(page);
    await expect(page.getByText(/Орієнтовний ринковий діапазон · Київ/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Змінити місто: Київ" })).toBeVisible();
    const kyiv = await dlRows(segmentCards(page).nth(1));
    expect(kyiv.map((r) => r.value), "prices must differ between Львів and Київ").not.toEqual(lviv.map((r) => r.value));
    await checkArchCards(page, "after city change");
    const cities = (await page.evaluate(() => window.dataLayer as Record<string, unknown>[])).filter((e) => e.event === "city_selected");
    expect(cities.map((c) => c.location_id)).toEqual(["lviv", "kyiv"]);
  });

  test("вибір області", async ({ page }) => {
    await page.goto("/calculator/");
    await expect(async () => {
      await page.getByRole("button", { name: "Мого міста немає — оберу область" }).click({ timeout: 1500 });
      await expect(page.getByRole("list", { name: "Області" })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    const count = await page.getByRole("list", { name: "Області" }).getByRole("button").count();
    expect(count).toBeGreaterThanOrEqual(24);
    await btn(page, "← Повернутися до пошуку міста").click();
    await expect(page.getByPlaceholder("Почніть вводити назву міста")).toBeVisible();
    await btn(page, "Мого міста немає — оберу область").click();
    await btn(page, "Тернопільська область").click();
    await expect(h1(page, T_TEETH)).toBeVisible();
    await expect(page.getByRole("button", { name: "Змінити місто: Тернопільська область" })).toBeVisible();
    await pick(page, L_FULL, "Зубів немає", "Ні");
    await finishQualification(page);
    await checkArchCards(page, "oblast result");
    await checkResultCommon(page, { priced: true, mass: false, clinical: "Середня" }, "oblast result");
    const dl = (await page.evaluate(() => window.dataLayer as Record<string, unknown>[])).find((e) => e.event === "city_selected");
    expect(dl).toMatchObject({ location_id: "oblast:ternopilska", level: "oblast" });
  });

  test("пошук міста: латиниця, неіснуюче місто, Enter бере перший результат", async ({ page }) => {
    await page.goto("/calculator/");
    const input = page.getByPlaceholder("Почніть вводити назву міста");
    await expect(async () => {
      await input.fill("lviv");
      await expect(page.getByRole("list", { name: "Міста" }).getByRole("button", { name: /Львів/ })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await input.fill("ззззз");
    await expect(page.getByText("Такого міста немає в списку.")).toBeVisible();
    await input.fill("");
    expect(await page.getByRole("list", { name: "Міста" }).getByRole("button").count()).toBeGreaterThanOrEqual(8);
  });

  test("лендинг: CTA веде до калькулятора, без помилок", async ({ page }) => {
    await page.goto("/");
    await expect(h1(page)).toContainText("Скільки коштує імплантація");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole("link", { name: /Почати розрахунок/ }).first().click();
    await expect(h1(page, "У якому місті плануєте лікування?")).toBeVisible();
  });
});


// ───────────────────────── known issues + mobile layout ─────────────────────────

test.describe("Мобільна верстка", () => {
  test("переповнення: Обидві щелепи All-on-8 + All-on-8 на 412px", async ({ page }) => {
    await openCalculator(page);
    await pick(page, L_BOTH, "Майже немає зубів на обох щелепах", "Так", "All-on-8", "All-on-8");
    await finishQualification(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test.describe("360px", () => {
    test.use({ viewport: { width: 360, height: 760 } });
    test("переповнення: результат All-on-X на 360px", async ({ page }) => {
      await goArch(page, "Зубів немає", "Так, All-on-8", [], "Київ");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await checkArchCards(page, "360px one jaw");
    });

    test("переповнення: Обидві щелепи на 360px (A4+A4, A6+A6, A8+A8)", async ({ page }) => {
      await openCalculator(page, "Київ");
      await pick(page, L_BOTH, "Майже немає зубів на обох щелепах", "Так", "All-on-8", "All-on-8");
      await finishQualification(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await checkArchCards(page, "360px both jaws");
    });

    test("переповнення: Обидві щелепи без плану на 360px", async ({ page }) => {
      await openCalculator(page, "Київ");
      await pick(page, L_BOTH, "Майже немає зубів на обох щелепах", "Ні");
      await finishQualification(page);
      for (const label of ["All-on-4 + All-on-4", "All-on-6 + All-on-6"]) {
        await page.getByRole("tab", { name: label, exact: true }).click();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, label).toBeLessThanOrEqual(1);
      }
    });
  });

  test.describe("екрани запитань на 360px", () => {
    test.use({ viewport: { width: 360, height: 760 } });

    async function screenFits(page: Page, where: string) {
      const r = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const bad: string[] = [];
        document.querySelectorAll("main button, main label").forEach((el) => {
          const b = el.getBoundingClientRect();
          if (b.right > vw + 0.5 || b.left < -0.5) bad.push(`outside viewport: ${(el.textContent ?? "").slice(0, 40)}`);
          if (el.scrollWidth > el.clientWidth + 1) bad.push(`clipped text: ${(el.textContent ?? "").slice(0, 40)}`);
        });
        return { over: document.documentElement.scrollWidth - vw, bad };
      });
      expect(r.over, `${where}: page overflow`).toBeLessThanOrEqual(1);
      expect(r.bad, `${where}: option layout`).toEqual([]);
    }

    test("шлях: одна щелепа", async ({ page }) => {
      await openCalculator(page);
      await screenFits(page, "teeth");
      await pick(page, L_FULL);
      await screenFits(page, "arch_situation");
      await pick(page, "Більшість зубів сильно зруйновані або рухомі");
      await screenFits(page, "arch_plan_offered");
      await pick(page, "Пропонували, але не знаю яке");
      await screenFits(page, "qualification");
    });

    test("шлях: обидві щелепи", async ({ page }) => {
      await openCalculator(page);
      await pick(page, L_BOTH);
      await screenFits(page, "both_situation");
      await pick(page, "На одній майже немає, на іншій частина зубів збережена");
      await screenFits(page, "both_plan_exists");
      await pick(page, "Так");
      await screenFits(page, "upper_plan");
      await pick(page, "Інше");
      await screenFits(page, "lower_plan");
    });

    test("шлях: тріаж", async ({ page }) => {
      await openCalculator(page);
      await pick(page, L_UNKNOWN);
      await screenFits(page, "triage");
      for (const [l1, where] of [
        ["Немає одного або кількох зубів", "triage_missing"],
        ["Є сильно зруйновані або рухомі зуби", "triage_destroyed"],
        ["Лікар уже говорив про імпланти", "triage_doctor"],
        ["Ношу знімний протез і розглядаю незнімні зуби", "triage_denture"],
        ["Проблема зі старими імплантами або коронками", "old_problem_kind"],
      ] as const) {
        await pick(page, l1);
        await screenFits(page, where);
        await page.getByRole("button", { name: /Назад/ }).click();
        await expect(h1(page, "Що найкраще описує вашу ситуацію?")).toBeVisible();
      }
    });
  });
});

test.describe("Виправлені раніше проблеми", () => {
  test("no_basket + багато проблемних зубів → попередження про незворотне видалення та CTA CheckMyPlan", async ({ page }) => {
    await openCalculator(page);
    await pick(page, L_BOTH, "Багато проблемних зубів на обох щелепах", "Так", "Інше", "Інше");
    await finishQualification(page);
    await expect(page.getByText("Чому ми не показуємо ціну")).toBeVisible();
    await expect(page.getByText("Спершу — перевірка плану", { exact: true })).toBeVisible();
    await expect(ctaBlockButton(page)).toContainText(CTA.mass);
  });

  test("Обидві щелепи: підпис над сегментами каже «обох щелеп»", async ({ page }) => {
    await openCalculator(page);
    await pick(page, L_BOTH, "Майже немає зубів на обох щелепах", "Ні");
    await finishQualification(page);
    await expect(page.getByText(/^Вартість обох щелеп розділена на етапи/)).toBeVisible();
    await expect(page.getByText("Вартість однієї щелепи")).toHaveCount(0);
  });

  test("одна щелепа: підпис «однієї щелепи»", async ({ page }) => {
    await goArch(page);
    await expect(page.getByText(/^Вартість однієї щелепи розділена на етапи/)).toBeVisible();
  });

  test("Обидві щелепи: «Що входить» починається з пояснення про обидві щелепи", async ({ page }) => {
    await openCalculator(page);
    await pick(page, L_BOTH, "Майже немає зубів на обох щелепах", "Ні");
    await finishQualification(page);
    const card = page.getByText("Що входить у розрахунок", { exact: true }).locator("xpath=..");
    await expect(card.locator("li").first()).toContainText(
      "Розрахунок для обох щелеп: склад нижче — для кожної щелепи окремо, спільна діагностика — один раз",
    );
  });
});

// ───────────────────────── newly changed behaviour ─────────────────────────

test.describe("Зміни: порівняння, дані, тексти", () => {
  test("порівняння перераховується наживо при зміні сегмента / пакета", async ({ page }) => {
    await goArch(page);
    const rows0 = await dlRows(segmentCards(page).nth(1));
    const full1 = parseRange(rows0[2].value);
    await openCompare(page);
    await amountInput(page).fill(String(Math.round((full1.lo + full1.hi) / 2)));
    await radio(page, "Повне лікування до постійних зубів").check();
    await compareBtn(page).click();
    expect(parseRange(await comparisonRow(page, "Типовий ринковий діапазон").innerText())).toEqual(full1);

    await segmentCards(page).nth(2).click();
    const full2 = parseRange((await dlRows(segmentCards(page).nth(2)))[2].value);
    expect(full2.lo).toBeGreaterThan(full1.lo);
    expect(parseRange(await comparisonRow(page, "Типовий ринковий діапазон").innerText())).toEqual(full2);
    await expect(page.getByText(/^Порівнюємо з:/)).toContainText("Преміальний");

    // customiser changes the live result too
    await btn(page, "Налаштувати варіант").click();
    await page.getByRole("group", { name: "Імплантаційна система" }).getByRole("button", { name: "Базовий", exact: true }).click();
    const mixed = parseRange((await dlRows(page.getByText("Ваш варіант", { exact: true }).locator("xpath=..")))[2].value);
    expect(mixed.lo).toBeLessThan(full2.lo);
    expect(parseRange(await comparisonRow(page, "Типовий ринковий діапазон").innerText())).toEqual(mixed);

    // switching scenario tab recomputes as well
    await btn(page, "Повернутися до стандартних пакетів").click();
    await page.getByRole("tab", { name: "All-on-6", exact: true }).click();
    const a6 = parseRange((await dlRows(segmentCards(page).nth(2)))[2].value);
    expect(parseRange(await comparisonRow(page, "Типовий ринковий діапазон").innerText())).toEqual(a6);
    expect(a6).not.toEqual(full2);
    expect(await page.locator("main").innerText()).not.toMatch(BAD_TEXT);
  });

  for (const [raw, expected] of [["68.000", 68000], ["68,000", 68000], ["68 000", 68000], ["1 250,50", 1251]] as const) {
    test(`розбір суми «${raw}» → ${expected}`, async ({ page }) => {
      await goArch(page);
      await openCompare(page);
      await amountInput(page).fill(raw);
      await radio(page, "Повне лікування до постійних зубів").check();
      await compareBtn(page).click();
      expect(digits(await comparisonRow(page, "Ваша пропозиція").innerText())).toBe(expected);
    });
  }

  test("замала сума: повідомлення і немає порівняння", async ({ page }) => {
    await goArch(page);
    await openCompare(page);
    await amountInput(page).fill("500");
    await radio(page, "Повне лікування до постійних зубів").check();
    await compareBtn(page).click();
    await expect(page.getByText("Сума виглядає замалою — вкажіть повну вартість лікування.")).toBeVisible();
    await expect(page.getByText("Типовий ринковий діапазон")).toHaveCount(0);
    // EUR threshold is 20
    await page.getByRole("button", { name: "€", exact: true }).click();
    await amountInput(page).fill("15");
    await compareBtn(page).click();
    await expect(page.getByText("Сума виглядає замалою — вкажіть повну вартість лікування.")).toBeVisible();
  });

  test("Q00 «вже назвали вартість» без кошика → пояснювальна картка", async ({ page }) => {
    await openCalculator(page);
    await pick(page, L_UNKNOWN, "Важко сказати");
    await finishQualification(page, ["Мені вже назвали вартість"]);
    const card = page.getByText("Вам уже назвали вартість?", { exact: true }).locator("xpath=../..");
    await expect(card).toContainText("немає стандартизованого кошика");
    await expect(amountInput(page)).toHaveCount(0);
  });

  test("рядок про дані та примітка про fallback", async ({ page }) => {
    await goArch(page, "Зубів немає", "Ні", [], "Чернівці");
    const line = page.getByText(/^Дані: /);
    await expect(line).toContainText(/від \d+ (спостереження|спостережень) · оновлено: /);
    await expect(page.getByText(/^Даних по території «м\. Чернівці» поки замало, тому частину цін взято з ширшої території: /)).toBeVisible();
  });

  // Regression: Київ used to fall back to its own macroregion for arch scans and showed a
  // self-referential fallback note. City data now covers every full-arch line.
  test("Київ (місто / область «м. Київ») → без примітки про fallback", async ({ page }) => {
    await goArch(page, "Зубів немає", "Ні", [], "Київ");
    await expect(page.getByText(/^Даних по території/)).toHaveCount(0);
  });

  test("область «м. Київ» → location_id kyiv", async ({ page }) => {
    await page.goto("/calculator/");
    await expect(async () => {
      await page.getByRole("button", { name: "Мого міста немає — оберу область" }).click({ timeout: 1500 });
      await expect(page.getByRole("list", { name: "Області" })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await btn(page, "м. Київ").click();
    await expect(h1(page, T_TEETH)).toBeVisible();
    await pick(page, L_FULL, "Зубів немає", "Ні");
    await finishQualification(page);
    const dl = (await page.evaluate(() => window.dataLayer as Record<string, unknown>[])).find((e) => e.event === "city_selected");
    expect(dl).toMatchObject({ location_id: "kyiv" });
    await expect(page.getByText(/^Дані: /)).toBeVisible();
  });

  test("тексти: стандартний сценарій одного зуба і низька клінічна впевненість", async ({ page }) => {
    await goArch(page, "Не знаю");
    await expect(page.getByText("Без огляду лікаря таку ситуацію неможливо оцінити точно — це лише напрям.")).toBeVisible();
    await expect(page.getByText(/Якщо лікар рекомендуватиме видалити зуби, що залишилися, — вартість видалення показано окремо/)).toBeVisible();
  });

  test("тексти: висока впевненість для одного видаленого зуба", async ({ page }) => {
    await openCalculator(page);
    await pick(page, "1 зуб", "Зуб уже видалений");
    await finishQualification(page);
    await expect(page.getByText("Для такої ситуації лікування зазвичай відповідає стандартному сценарію.")).toBeVisible();
  });
});
