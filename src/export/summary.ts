import type ExcelJS from "exceljs";
import { type ExcelLayout, type LobSummary, type ProjectConfig, type ProjectResult, type Quantity, STAGES } from "@/domain";
import { NUMBER_FORMAT, styleHeader, TOTAL_FILL } from "./common";
import { summarizeByLob } from "@/engine";

export const SUMMARY_FIRST_PROJECT_ROW = 5;
/** 原版固定 15 列專案；不足 15 案時補空列，讓下方 LOB 表的位置與原版一致，超過則往下延伸。 */
export const SUMMARY_MIN_PROJECT_ROWS = 15;

/** Projects Summary：全案彙整與依 LOB 彙整，版面比照原 Projects Summary。 */
export function writeSummary(
  workbook: ExcelJS.Workbook,
  projects: readonly ProjectConfig[],
  results: readonly ProjectResult[],
  layout: ExcelLayout,
): void {
  const sheet = workbook.addWorksheet("Projects Summary");
  const lastColumn = 7 + (STAGES.length + 1) * 2;
  sheet.mergeCells(1, 1, 1, lastColumn);
  sheet.getCell(1, 1).value = "Projects Summary  —  全案彙整（人次 Man / 人天 Man-Days）";
  sheet.getCell(1, 1).font = { bold: true, size: 13 };
  sheet.mergeCells(2, 1, 2, 10);
  sheet.getCell(2, 1).value = "本頁數值由 App 計算後匯出，不含公式；要修改請回 App。";

  ["LOB", "Gen", "Project Code", "Project Name", "Type", "Phase", "Class"].forEach((title, offset) => {
    sheet.mergeCells(3, offset + 1, 4, offset + 1);
    sheet.getCell(3, offset + 1).value = title;
    styleHeader(sheet.getCell(3, offset + 1));
  });
  [...STAGES, "Total"].forEach((title, offset) => {
    const column = 8 + offset * 2;
    sheet.mergeCells(3, column, 3, column + 1);
    sheet.getCell(3, column).value = title;
    styleHeader(sheet.getCell(3, column));
    sheet.getCell(4, column).value = "Man";
    sheet.getCell(4, column + 1).value = "Man\nDays";
    styleHeader(sheet.getCell(4, column));
    styleHeader(sheet.getCell(4, column + 1));
  });
  sheet.getRow(4).height = 25.5;

  const rowCount = Math.max(projects.length, SUMMARY_MIN_PROJECT_ROWS);
  const quantityColumns = (row: number, quantities: readonly Quantity[]): void => {
    quantities.forEach((quantity, offset) => {
      const column = 8 + offset * 2;
      sheet.getCell(row, column).value = quantity.man;
      sheet.getCell(row, column + 1).value = quantity.manDays;
      sheet.getCell(row, column).numFmt = NUMBER_FORMAT;
      sheet.getCell(row, column + 1).numFmt = NUMBER_FORMAT;
    });
  };
  const columnSums: Quantity[] = [...STAGES, "Total"].map(() => ({ man: 0, days: 0, manDays: 0 }));
  projects.forEach((config, index) => {
    const result = results[index];
    if (result === undefined) return;
    const row = SUMMARY_FIRST_PROJECT_ROW + index;
    [config.lob, config.gen, config.projectCode, config.projectName, `C${config.projectClass}`, config.phase, config.projectClass].forEach((value, offset) => {
      sheet.getCell(row, offset + 1).value = value;
    });
    const quantities = [...STAGES.map((stage) => result.byStage[stage]), result.total];
    quantityColumns(row, quantities);
    quantities.forEach((quantity, offset) => {
      const sum = columnSums[offset];
      if (sum !== undefined) {
        sum.man += quantity.man;
        sum.manDays += quantity.manDays;
      }
    });
  });

  const totalRow = SUMMARY_FIRST_PROJECT_ROW + rowCount;
  sheet.getCell(totalRow, 1).value = "TOTAL";
  quantityColumns(totalRow, columnSums);
  for (let column = 1; column <= lastColumn; column += 1) {
    sheet.getCell(totalRow, column).font = { bold: true };
    sheet.getCell(totalRow, column).fill = TOTAL_FILL;
  }

  writeLobTable(sheet, totalRow + 2, projects, results, layout);

  [18, 8, 14, 30, 7, 7, 9].forEach((width, offset) => {
    sheet.getColumn(offset + 1).width = width;
  });
  sheet.views = [{ state: "frozen", xSplit: 7, ySplit: 4 }];
}

function writeLobTable(
  sheet: ExcelJS.Worksheet,
  titleRow: number,
  projects: readonly ProjectConfig[],
  results: readonly ProjectResult[],
  layout: ExcelLayout,
): void {
  const entries = projects.flatMap((config, index) => {
    const result = results[index];
    return result === undefined ? [] : [{ config, result }];
  });
  const summaries = summarizeByLob(entries);
  const known: LobSummary[] = layout.lobs.map((lob) => summaries.find((item) => item.lob === lob) ?? { lob, projectCount: 0, man: 0, manDays: 0 });
  // 原 Excel 的 LOB 清單是寫死的，清單外的 LOB 會被靜默漏算；這裡附加在清單後面。
  const extra = summaries.filter((item) => !layout.lobs.includes(item.lob));
  const rows = [...known, ...extra];

  sheet.getCell(titleRow, 1).value = "依 LOB 彙整 / Summary by LOB";
  sheet.getCell(titleRow, 1).font = { bold: true };
  const header = titleRow + 1;
  ["LOB", "專案數 Projects", "Total Man", "Total Man-Days"].forEach((title, offset) => {
    sheet.getCell(header, offset + 1).value = title;
    styleHeader(sheet.getCell(header, offset + 1));
  });
  rows.forEach((item, offset) => {
    const row = header + 1 + offset;
    sheet.getCell(row, 1).value = item.lob;
    sheet.getCell(row, 2).value = item.projectCount;
    sheet.getCell(row, 3).value = item.man;
    sheet.getCell(row, 4).value = item.manDays;
    sheet.getCell(row, 3).numFmt = NUMBER_FORMAT;
    sheet.getCell(row, 4).numFmt = NUMBER_FORMAT;
  });
  const totalRow = header + 1 + rows.length;
  sheet.getCell(totalRow, 1).value = "合計";
  sheet.getCell(totalRow, 2).value = rows.reduce((sum, item) => sum + item.projectCount, 0);
  sheet.getCell(totalRow, 3).value = rows.reduce((sum, item) => sum + item.man, 0);
  sheet.getCell(totalRow, 4).value = rows.reduce((sum, item) => sum + item.manDays, 0);
  for (let column = 1; column <= 4; column += 1) {
    sheet.getCell(totalRow, column).font = { bold: true };
    sheet.getCell(totalRow, column).fill = TOTAL_FILL;
  }
  sheet.getCell(totalRow, 3).numFmt = NUMBER_FORMAT;
  sheet.getCell(totalRow, 4).numFmt = NUMBER_FORMAT;
  sheet.getCell(totalRow + 2, 1).value = "註：「依 LOB 彙整」僅統計 Project Code 非空白的專案。";
}
