import type { SheetData } from "write-excel-file/universal";
import {
  BLOCK_TITLES,
  CARD_FIELDS,
  COLUMNS,
  INSTRUCTION_SHEET,
  PRICE_SHEET,
  TEMPLATE_TITLE,
  TIER_LABELS,
  type BlockKey,
} from "./columns";

/** Number of empty entry rows pre-formatted under the header. */
export const TEMPLATE_BLANK_ROWS = 40;

export interface TemplateOptions {
  /** Pre-filled clinic card (e.g. when exporting for a known clinic). */
  card?: Partial<Record<(typeof CARD_FIELDS)[number]["key"], string | Date>>;
  /** Services shown on the instruction sheet as a reference list. */
  services?: ReadonlyArray<{ service_code: string; name: string; tiered: boolean }>;
}

const BLOCK_COLORS: Record<BlockKey, { head: string; band: string }> = {
  offer: { head: "#dbe6ff", band: "#edf2ff" },
  denva: { head: "#fde9b8", band: "#fffaeb" },
  moderation: { head: "#e4e7ec", band: "#f5f7fa" },
};

type Cell = NonNullable<SheetData[number][number]>;

function bold(value: string, extra: Record<string, unknown> = {}): Cell {
  return { value, fontWeight: "bold", ...extra } as Cell;
}

/** Sheet 1 ("Прайс") as sheet data: title, clinic card, blank line, group band, header, blank rows. */
export function buildPriceSheet(opts: TemplateOptions = {}): SheetData {
  const rows: SheetData = [];
  rows.push([{ value: TEMPLATE_TITLE, fontWeight: "bold", fontSize: 14 } as Cell]);
  rows.push([
    {
      value:
        "Заповніть блок «Картка клініки» та блок «Фактична пропозиція». Колонки DENVA та модерації не заповнюйте. Інструкція — на другому аркуші.",
      fontStyle: "italic",
      textColor: "#667085",
    } as Cell,
  ]);
  rows.push([]);
  rows.push([bold("Картка клініки", { backgroundColor: BLOCK_COLORS.offer.head }), { backgroundColor: BLOCK_COLORS.offer.head } as Cell]);
  for (const field of CARD_FIELDS) {
    const preset = opts.card?.[field.key];
    const value: Cell | null =
      preset instanceof Date
        ? ({ value: preset, type: Date, format: "dd.mm.yyyy", backgroundColor: BLOCK_COLORS.offer.band } as Cell)
        : { value: preset as string | undefined, backgroundColor: BLOCK_COLORS.offer.band } as Cell;
    rows.push([bold(field.label), value, { value: field.hint, textColor: "#667085", fontStyle: "italic" } as Cell]);
  }
  rows.push([]);

  // group band above the header
  const band: Array<Cell | null> = [];
  let last: BlockKey | null = null;
  for (const col of COLUMNS) {
    const colors = BLOCK_COLORS[col.block];
    band.push(
      col.block !== last
        ? (bold(BLOCK_TITLES[col.block], { backgroundColor: colors.head }) as Cell)
        : ({ backgroundColor: colors.head } as Cell),
    );
    last = col.block;
  }
  rows.push(band);
  rows.push(
    COLUMNS.map((col) =>
      bold(col.header, {
        backgroundColor: BLOCK_COLORS[col.block].head,
        wrap: true,
        borderColor: "#d0d5dd",
        borderStyle: "thin",
      }),
    ),
  );
  for (let i = 0; i < TEMPLATE_BLANK_ROWS; i += 1) {
    rows.push(
      COLUMNS.map(
        (col) =>
          ({
            backgroundColor: BLOCK_COLORS[col.block].band,
            borderColor: "#e4e7ec",
            borderStyle: "thin",
            ...(col.key === "price_from" || col.key === "price_to" ? { type: Number, format: "#,##0.00" } : {}),
          }) as Cell,
      ),
    );
  }
  return rows;
}

/** Sheet 2 ("Інструкція"). */
export function buildInstructionSheet(opts: TemplateOptions = {}): SheetData {
  const lines: string[] = [
    TEMPLATE_TITLE,
    "",
    "Як заповнити",
    "1. У блоці «Картка клініки» вкажіть назву, місто, контакти, дату чинності прайсу, валюту та підтвердження достовірності.",
    "2. У таблиці нижче внесіть по одному рядку на кожну фактичну пропозицію з вашого прайсу: назва у прайсі, бренд або матеріал, ціна, склад, винятки, джерело.",
    "3. Для фіксованої ціни заповніть лише «Ціна від». Для діапазону заповніть «Ціна від» і «Ціна до» — розрахунковим значенням стане середина діапазону.",
    "4. Укажіть у колонці «Що входить у ціну» повний склад послуги. Рекламна ціна без обов'язкових компонентів не допускається до агрегату.",
    "5. Колонки «Стандартний код» і «Рівень» заповнює DENVA. Клініка не визначає свій ринковий статус самостійно.",
    "6. Колонки блоку «Модерація» заповнює лише DENVA.",
    "",
    "Що відбувається після імпорту",
    "Усі рядки потрапляють у систему зі статусом «На перевірці». Жоден рядок не впливає на калькулятор, доки його не підтвердить модератор DENVA.",
    "Одна клініка має один голос для кожної пари «послуга + рівень». Філії однієї мережі з однаковим прайсом у тому самому місті рахуються як одне джерело.",
    "",
    "Значення колонки «Рівень»",
    ...Object.values(TIER_LABELS).map((label) => `• ${label}`),
    "Спільний — для позицій без рівня (скан, супраструктура тощо); додається до всіх трьох сценаріїв. Імплант, коронка та постійна повнощелепна конструкція мають окремі рівні.",
    "",
    "Дозволені валюти: UAH, EUR, USD.",
  ];
  if (opts.services?.length) {
    lines.push("", "Довідник service_code (для модераторів DENVA)");
    for (const s of opts.services) {
      lines.push(`${s.service_code} — ${s.name}${s.tiered ? " (є рівні)" : " (Спільний)"}`);
    }
  }
  return lines.map((line, i) => [
    i === 0 || ["Як заповнити", "Що відбувається після імпорту", "Значення колонки «Рівень»"].includes(line) || line.startsWith("Довідник")
      ? (bold(line, i === 0 ? { fontSize: 14 } : {}) as Cell)
      : (line ? ({ value: line } as Cell) : null),
  ]);
}

/** Generates the .xlsx as a Blob (works in browsers and Node 18+). */
export async function generateTemplateBlob(opts: TemplateOptions = {}): Promise<Blob> {
  const { default: writeExcelFile } = await import("write-excel-file/universal");
  const priceColumns = COLUMNS.map((c) => ({ width: c.width }));
  // First column of the sheet doubles as the card label column, so keep it wide enough.
  priceColumns[0] = { width: Math.max(priceColumns[0].width, 34) };
  const result = writeExcelFile(
    [
      {
        sheet: PRICE_SHEET,
        data: buildPriceSheet(opts),
        columns: priceColumns,
        stickyRowsCount: 0,
      },
      { sheet: INSTRUCTION_SHEET, data: buildInstructionSheet(opts), columns: [{ width: 120 }] },
    ],
    { fontFamily: "Calibri", fontSize: 11 },
  );
  return result.toBlob();
}

export const TEMPLATE_FILE_NAME = "DENVA_шаблон_цін_клініки.xlsx";
