import type ExcelJS from "exceljs";
import { STAGES, type Quantity, type Stage } from "@/domain";

/** 數字格式：與原 Super table 相同（零顯示為 -，負數紅字）。 */
export const NUMBER_FORMAT = "#,##0.0;[Red]-#,##0.0;-";

/** Super table 每個 Stage 佔三欄（Man、Days、Total days），Function 與 Group 在 A、B 欄，所以第 1 個 Stage 從第 3 欄開始。 */
export const FIRST_STAGE_COLUMN = 3;

export function stageFirstColumn(stage: Stage): number {
  return FIRST_STAGE_COLUMN + STAGES.indexOf(stage) * 3;
}

/** 全案合計欄：Stage 欄組之後空一欄（AA），再放 AB（總人次）、AC（總人天）。 */
export const TOTAL_MAN_COLUMN = FIRST_STAGE_COLUMN + STAGES.length * 3 + 1;
export const TOTAL_MAN_DAYS_COLUMN = TOTAL_MAN_COLUMN + 1;

/** Input 分頁的專案欄：D 欄起。 */
export const FIRST_PROJECT_COLUMN = 4;

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function superTableName(index: number): string {
  return `Super table_${pad2(index)}`;
}

export function writeQuantity(sheet: ExcelJS.Worksheet, row: number, column: number, quantity: Quantity): void {
  sheet.getCell(row, column).value = quantity.man;
  sheet.getCell(row, column + 1).value = quantity.days;
  sheet.getCell(row, column + 2).value = quantity.manDays;
  for (let offset = 0; offset < 3; offset += 1) sheet.getCell(row, column + offset).numFmt = NUMBER_FORMAT;
}

export const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
export const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };

export function styleHeader(cell: ExcelJS.Cell): void {
  cell.font = { bold: true };
  cell.fill = HEADER_FILL;
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}
