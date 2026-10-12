import type ExcelJS from "exceljs";
import { type ExcelLayout, OA_COLUMN_COUNT, type ProjectConfig, type ProjectResult, type ReferenceData } from "@/domain";
import { toOaRows } from "@/engine";
import { styleHeader } from "./common";

export const OA_SHEET_NAME = "OA Upload_All";

/**
 * OA Upload_All：欄位與順序完全照原 Excel（欄名來自版面設定），下游人工上傳用。
 * 只輸出 Include?=Y 的列（人天不為 0）；費用欄（I..M）留空，由財務或助理依單價填入。
 */
export function writeOaSheet(
  workbook: ExcelJS.Workbook,
  projects: readonly ProjectConfig[],
  results: readonly ProjectResult[],
  reference: ReferenceData,
  layout: ExcelLayout,
): void {
  const sheet = workbook.addWorksheet(OA_SHEET_NAME);
  layout.oaHeaders.forEach((title, offset) => {
    sheet.getCell(1, offset + 1).value = title;
    styleHeader(sheet.getCell(1, offset + 1));
  });
  sheet.getRow(1).height = 33.75;

  let row = 2;
  projects.forEach((config, index) => {
    const result = results[index];
    if (result === undefined) return;
    for (const item of toOaRows(config, result, reference)) {
      if (!item.include) continue;
      const values: (string | number | null)[] = [
        item.deptCode,
        item.budgetedPeriod,
        item.projectCode,
        item.travelArea,
        item.travelSite,
        item.man,
        item.travelerDays,
        item.manDays,
        null,
        null,
        null,
        null,
        null,
        item.projectCode,
        item.stage,
        item.function,
        item.man,
        item.travelerDays,
        item.manDays,
        "Y",
      ];
      values.forEach((value, offset) => {
        if (value !== null) sheet.getCell(row, offset + 1).value = value;
      });
      row += 1;
    }
  });

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(row - 1, 1), column: OA_COLUMN_COUNT } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  [16, 14, 13, 12, 18, 8, 11, 9, 11, 13, 20, 14, 11, 13, 10, 20, 8, 8, 10, 9].forEach((width, offset) => {
    sheet.getColumn(offset + 1).width = width;
  });
}
