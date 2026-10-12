import { existsSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { calculateProject } from "@/engine";
import type { ExcelLayout, ProjectConfig, ProjectResult, ReferenceData } from "@/domain";
import { loadExcelLayout, parseWorkbook, readWorkbookFile } from "@/import";

export const GOLDEN_PATH = resolve(import.meta.dirname, "../../local-data/travel-budget-tool.xlsx");

/**
 * 浮點容差：guidance 的人次與天數都是整數，加總是精確的；唯一的非整數是「人天 ÷ 人次」的加權平均天數。
 * 引擎與 Excel 都用 IEEE 754 雙精度做同一個除法，理論上逐位元相同，容差只是防止 Excel 快取值的
 * 15 位有效數字序列化造成的尾數差；相對容差 1e-9 遠小於任何有意義的人天差（最小單位 0.5）。
 */
export const RELATIVE_TOLERANCE = 1e-9;

export function isClose(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= RELATIVE_TOLERANCE * Math.max(1, Math.abs(expected));
}

export interface GoldenContext {
  workbook: ExcelJS.Workbook;
  layout: ExcelLayout;
  reference: ReferenceData;
  projects: ProjectConfig[];
}

export interface Calculated {
  config: ProjectConfig;
  result: ProjectResult;
}

/** 讀取真實 Excel；檔案不存在時明確失敗（不可 skip）。 */
export async function loadGolden(): Promise<GoldenContext> {
  if (!existsSync(GOLDEN_PATH)) {
    throw new Error(
      `黃金測試需要原始 Excel，但找不到：${GOLDEN_PATH}\n` +
        "請把「Travel Budget Tool」活頁簿放到 local-data/travel-budget-tool.xlsx（該資料夾已 gitignore，不會進版控）。\n" +
        "詳見 local-data/README.md。這個測試不會被略過：沒有資料就不能宣稱引擎與 Excel 一致。",
    );
  }
  // 真實列標籤只在 local-data/excel-layout.json；找不到時 loadExcelLayout 會給清楚的錯誤。
  const layout = loadExcelLayout(resolve(import.meta.dirname, "../../local-data/excel-layout.json"));
  const workbook = await readWorkbookFile(GOLDEN_PATH);
  const { reference, projects } = parseWorkbook(workbook, layout);
  return { workbook, layout, reference, projects };
}

export function calculateAll(context: GoldenContext): Calculated[] {
  return context.projects.map((config) => ({ config, result: calculateProject(config, context.reference) }));
}

/**
 * 取得儲存格的快取值（公式取結果）。
 * 注意：exceljs 的 cell.value 在公式結果為 0 時會丟掉 result，必須改讀 cell.result。
 */
export function cached(sheet: ExcelJS.Worksheet, address: string): unknown {
  const cell = sheet.getCell(address);
  return cell.type === ExcelJS.ValueType.Formula ? cell.result : cell.value;
}

export function cachedNumber(sheet: ExcelJS.Worksheet, address: string): number {
  const value = cached(sheet, address);
  if (typeof value !== "number") {
    throw new Error(`${sheet.name}!${address} 預期是數字，讀到 ${JSON.stringify(value)}`);
  }
  return value;
}

export function sheetOf(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const sheet = workbook.getWorksheet(name);
  if (sheet === undefined) throw new Error(`活頁簿沒有「${name}」分頁`);
  return sheet;
}

export function superTableName(index: number): string {
  return `Super table_${String(index).padStart(2, "0")}`;
}

/**
 * 找出每個有填專案對應的 Super table 序號（1..15）。
 * Super table_NN 的 A3 連結 Input 第 NN 個專案欄的 Project Code；沒填的專案欄顯示 0。
 */
export function projectTables(context: GoldenContext, calculated: readonly Calculated[]): { index: number; entry: Calculated }[] {
  const tables: { index: number; entry: Calculated }[] = [];
  for (let index = 1; index <= 15; index += 1) {
    const code = cached(sheetOf(context.workbook, superTableName(index)), "A3");
    if (typeof code !== "string" || code === "") continue;
    const entry = calculated.find((item) => item.config.projectCode === code);
    if (entry === undefined) {
      throw new Error(`${superTableName(index)}!A3 有專案 ${code}，但匯入結果找不到（匯入漏讀）`);
    }
    tables.push({ index, entry });
  }
  return tables;
}
