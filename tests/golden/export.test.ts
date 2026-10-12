import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { STAGES } from "@/domain";
import { exportProjectsWorkbook } from "@/export";
import { readWorkbookBuffer } from "@/import";
import { calculateAll, cached, isClose, loadGolden, projectTables, sheetOf, superTableName } from "./support";

// 匯出 → 讀回 → 逐格比對原活頁簿對應頁面（Input、Super table、Projects Summary、OA Upload_All）。
// 這等於證明「長得一樣、數字一樣」。匯出檔另存一份到 local-data/（gitignore，不進版控）供人工開啟檢視。
const context = await loadGolden();
const calculated = calculateAll(context);
const projects = calculated.map((item) => item.config);
const results = calculated.map((item) => item.result);

const budgetYear = cached(sheetOf(context.workbook, "Input"), "C3");
const buffer = await exportProjectsWorkbook(projects, results, context.reference, {
  generatedAt: "2031-01-01T00:00:00.000Z",
  dataVersion: "golden",
  guidanceVersion: "golden",
  layout: context.layout,
  layoutSource: "local",
  ...(typeof budgetYear === "number" ? { budgetYear } : {}),
});
writeFileSync(resolve(import.meta.dirname, "../../local-data/exported-sample.xlsx"), buffer);
const exported = await readWorkbookBuffer(buffer);

type Plain = string | number | boolean | null;

/** 把兩邊的儲存格值轉成可比較的純值：空白、空字串、undefined 視為同一件事；日期比到日。 */
function plain(value: unknown): Plain {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  // 公式（含合併儲存格從左上角繼承的值）取快取結果；rich text 取串接後的文字。
  if (typeof value === "object" && "result" in value) return plain(value.result);
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    const parts: unknown[] = value.richText;
    return plain(parts.map((part) => (typeof part === "object" && part !== null && "text" in part ? String(part.text) : "")).join(""));
  }
  return JSON.stringify(value);
}

function same(a: Plain, b: Plain): boolean {
  if (typeof a === "number" && typeof b === "number") return isClose(a, b);
  return a === b;
}

function exportedValue(sheet: ExcelJS.Worksheet, address: string): unknown {
  return sheet.getCell(address).value;
}

function column(n: number): string {
  let name = "";
  for (let rest = n; rest > 0; rest = Math.floor((rest - 1) / 26)) name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  return name;
}

/** 逐格比對 original 的 originalAddress 與 exported 的 exportedAddress，回傳不一致的描述。 */
function compareCells(
  original: ExcelJS.Worksheet,
  actual: ExcelJS.Worksheet,
  pairs: readonly { from: string; to: string }[],
): string[] {
  const mismatches: string[] = [];
  for (const { from, to } of pairs) {
    const expected = plain(cached(original, from));
    const got = plain(exportedValue(actual, to));
    if (!same(got, expected)) mismatches.push(`${original.name}!${from} → ${actual.name}!${to}：期望 ${String(expected)}，實際 ${String(got)}`);
  }
  return mismatches;
}

function grid(rows: readonly number[], columns: readonly number[]): { from: string; to: string }[] {
  return rows.flatMap((row) => columns.map((col) => ({ from: `${column(col)}${row}`, to: `${column(col)}${row}` })));
}

function range(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
}

describe("匯出 → 讀回 → 對照原活頁簿", () => {
  it("工作表清單：說明、Projects Summary、OA Upload_All、Input、每案一張 Super table；沒有內部頁", () => {
    const names = exported.worksheets.map((sheet) => sheet.name);
    expect(names).toEqual(["說明", "Projects Summary", "OA Upload_All", "Input", ...projects.map((_, index) => superTableName(index + 1))]);
  });

  it("所有儲存格都是數值或文字，沒有公式", () => {
    const formulas: string[] = [];
    for (const sheet of exported.worksheets) {
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (typeof cell.value === "object" && cell.value !== null && "formula" in cell.value) formulas.push(`${sheet.name}!${cell.address}`);
        });
      });
    }
    expect(formulas).toEqual([]);
  });

  it("Super table：標題、專案資訊、Stage 表頭、每個 Function × Stage 的 Man／Days／Total、小計、GRAND TOTAL", () => {
    const mismatches: string[] = [];
    const tables = projectTables(context, calculated);
    expect(tables.length).toBeGreaterThan(0);
    for (const { index, entry } of tables) {
      const original = sheetOf(context.workbook, superTableName(index));
      const exportedIndex = projects.indexOf(entry.config) + 1;
      const actual = sheetOf(exported, superTableName(exportedIndex));
      // 標題：A1；專案資訊：A..K 的第 2、3 列；Stage 名稱與地點：第 5、6 列；欄名：第 7 列；資料：第 8..44 列的 A、B、C..Z、AB、AC。
      const columns = [...range(1, 26), 28, 29];
      mismatches.push(...compareCells(original, actual, [{ from: "A1", to: "A1" }]));
      mismatches.push(...compareCells(original, actual, grid([2, 3], range(1, 11))));
      mismatches.push(...compareCells(original, actual, grid([5, 6], [3, 6, 9, 12, 15, 18, 21, 24, 28])));
      mismatches.push(...compareCells(original, actual, grid([7], columns)));
      mismatches.push(...compareCells(original, actual, grid(range(8, 44), columns)));
    }
    expect(mismatches).toEqual([]);
  });

  it("Projects Summary：標題與表頭、每案列、TOTAL 列、依 LOB 彙整", () => {
    const original = sheetOf(context.workbook, "Projects Summary");
    const actual = sheetOf(exported, "Projects Summary");
    const mismatches: string[] = [];
    mismatches.push(...compareCells(original, actual, [{ from: "A1", to: "A1" }]));
    mismatches.push(...compareCells(original, actual, grid([3, 4], range(1, 25))));
    const projectRows = range(5, 4 + projects.length);
    mismatches.push(...compareCells(original, actual, grid(projectRows, range(1, 25))));
    mismatches.push(...compareCells(original, actual, grid([20], range(1, 25))));
    mismatches.push(...compareCells(original, actual, grid(range(22, 30), range(1, 4))));
    mismatches.push(...compareCells(original, actual, [{ from: "A32", to: "A32" }]));
    expect(mismatches).toEqual([]);
  });

  it("OA Upload_All：表頭與欄序一致；Include?=Y 的列逐列、逐欄（A..T）一致", () => {
    const original = sheetOf(context.workbook, "OA Upload_All");
    const actual = sheetOf(exported, "OA Upload_All");
    const mismatches = compareCells(original, actual, grid([1], range(1, 20)));
    let next = 2;
    for (let row = 2; row <= 1801; row += 1) {
      if (cached(original, `T${row}`) !== "Y") continue;
      mismatches.push(
        ...compareCells(original, actual, range(1, 20).map((col) => ({ from: `${column(col)}${row}`, to: `${column(col)}${next}` }))),
      );
      next += 1;
    }
    expect(mismatches).toEqual([]);
    expect(actual.rowCount).toBe(next - 1); // 沒有多出 Excel 沒有的列
    expect(next - 1).toBeGreaterThan(1);
  });

  it("Input：靜態文字（A..C 欄）與各專案欄的值", () => {
    const original = sheetOf(context.workbook, "Input");
    const actual = sheetOf(exported, "Input");
    const mismatches: string[] = [];
    mismatches.push(...compareCells(original, actual, grid(range(1, 38), [1, 2, 3])));
    projects.forEach((_, index) => {
      const col = 4 + index;
      mismatches.push(...compareCells(original, actual, grid(range(5, 38), [col])));
    });
    expect(mismatches).toEqual([]);
  });

  it("每個 Stage 都有對應的出差地欄組（欄位位置沒有移位）", () => {
    expect(STAGES.length * 3 + 2).toBe(26);
  });
});
