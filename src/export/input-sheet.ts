import type ExcelJS from "exceljs";
import { type ExcelLayout, GATE_KEYS, INPUT_LABELS, type ProjectConfig, type ProjectResult, STAGES } from "@/domain";
import { FIRST_PROJECT_COLUMN, pad2, styleHeader } from "./common";

const YELLOW: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };

/** 把 "yyyy-mm-dd" 轉成 UTC 午夜的 Date，避免時區偏移。 */
function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function rowsByLabel(layout: ExcelLayout): Map<string, number> {
  const rows = new Map<string, number>();
  for (const cell of layout.inputTemplate) {
    const match = /^B([1-9][0-9]*)$/.exec(cell.address);
    if (match?.[1] !== undefined && !rows.has(cell.text)) rows.set(cell.text, Number(match[1]));
  }
  return rows;
}

/** Input：各專案一欄（D 起，P01、P02…），列位置與標籤來自版面設定，與原 Input 頁相同。 */
export function writeInputSheet(
  workbook: ExcelJS.Workbook,
  projects: readonly ProjectConfig[],
  results: readonly ProjectResult[],
  layout: ExcelLayout,
  budgetYear: number | undefined,
): void {
  const sheet = workbook.addWorksheet("Input");
  for (const cell of layout.inputTemplate) sheet.getCell(cell.address).value = cell.text;
  for (const range of layout.inputMerges) sheet.mergeCells(range);
  sheet.getCell("A1").font = { bold: true, size: 13 };

  const rows = rowsByLabel(layout);
  const rowOf = (label: string): number | undefined => rows.get(label);
  const headerRow = rowOf("Item / 項目");
  const deptRow = [...rows.entries()].find(([label]) => label.startsWith("DeptCode"))?.[1];
  const yearRow = [...rows.entries()].find(([label]) => label.startsWith("Budget Year"))?.[1];
  const [first] = projects;
  if (deptRow !== undefined && first !== undefined) sheet.getCell(deptRow, 3).value = first.deptCode;
  if (yearRow !== undefined && budgetYear !== undefined) sheet.getCell(yearRow, 3).value = budgetYear;
  if (headerRow !== undefined) {
    for (const column of [2, 3]) styleHeader(sheet.getCell(headerRow, column));
  }

  projects.forEach((config, index) => {
    const column = FIRST_PROJECT_COLUMN + index;
    const result = results[index];
    if (headerRow !== undefined) {
      sheet.getCell(headerRow, column).value = `P${pad2(index + 1)}`;
      styleHeader(sheet.getCell(headerRow, column));
    }
    const put = (label: string, value: string | number | Date | undefined, input: boolean): void => {
      const row = rowOf(label);
      if (row === undefined || value === undefined) return;
      const cell = sheet.getCell(row, column);
      cell.value = value;
      cell.alignment = { horizontal: "center" };
      if (input) cell.fill = YELLOW;
    };
    put(INPUT_LABELS.projectCode, config.projectCode, true);
    put(INPUT_LABELS.projectName, config.projectName, true);
    put(INPUT_LABELS.lob, config.lob, true);
    put(INPUT_LABELS.gen, config.gen, true);
    put(INPUT_LABELS.phase, config.phase, true);
    put(INPUT_LABELS.projectClass, config.projectClass, true);
    put(INPUT_LABELS.type, `C${config.projectClass}`, false);
    for (const key of GATE_KEYS) put(layout.gateLabels[key], config.gates[key] ? "Y" : "N", true);
    put(layout.includePreALabel, config.includePreA ? "Y" : "N", true);
    put(layout.includeTldLabel, config.includeTld ? "Y" : "N", true);
    for (const stage of STAGES) {
      const date = config.buildDates[stage];
      put(layout.buildDateLabels[stage], date === undefined ? undefined : utcDate(date), true);
      const row = rowOf(layout.buildDateLabels[stage]);
      if (row !== undefined) sheet.getCell(row, column).numFmt = "yyyy/mm/dd";
    }
    if (result !== undefined) {
      put(INPUT_LABELS.totalMan, result.total.man, false);
      put(INPUT_LABELS.totalManDays, result.total.manDays, false);
      put(INPUT_LABELS.check, result.total.manDays === 0 ? "人天為 0" : "OK", false);
    }
    sheet.getColumn(column).width = 15;
  });

  sheet.getColumn(1).width = 4;
  sheet.getColumn(2).width = 34;
  sheet.getColumn(3).width = 29;
  sheet.views = [{ state: "frozen", xSplit: 3, ySplit: headerRow ?? 5 }];
}
