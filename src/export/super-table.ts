import type ExcelJS from "exceljs";
import {
  GROUPS,
  type ProjectConfig,
  type ProjectResult,
  type Quantity,
  type ReferenceData,
  STAGES,
  type Stage,
} from "@/domain";
import {
  FIRST_STAGE_COLUMN,
  NUMBER_FORMAT,
  pad2,
  stageFirstColumn,
  styleHeader,
  superTableName,
  TOTAL_FILL,
  TOTAL_MAN_COLUMN,
  TOTAL_MAN_DAYS_COLUMN,
  writeQuantity,
} from "./common";

export const SUPER_TABLE_FIRST_FUNCTION_ROW = 8;

function stageTitle(stage: Stage): string {
  switch (stage) {
    case "pre A":
    case "TLD":
      return `${stage} (選配)`;
    case "RFQ":
    case "A":
    case "B":
    case "C":
    case "Pre-MP":
    case "MP":
      return stage;
  }
}

/** 一個專案一張，版面比照原 Super table：列 8 起 Function，之後是各 Group 小計與 GRAND TOTAL。只放數值。 */
export function writeSuperTable(
  workbook: ExcelJS.Workbook,
  index: number,
  config: ProjectConfig,
  result: ProjectResult,
  reference: ReferenceData,
): void {
  const sheet = workbook.addWorksheet(superTableName(index));
  sheet.mergeCells(1, 1, 1, TOTAL_MAN_DAYS_COLUMN);
  sheet.getCell(1, 1).value = `${superTableName(index)}   ·   Travel Budget 人天 Break down   （對應 Input 欄 P${pad2(index)}）`;
  sheet.getCell(1, 1).font = { bold: true, size: 13 };

  const info: [number, string, string | number][] = [
    [1, "Project Code", config.projectCode],
    [5, "LOB", config.lob],
    [6, "Gen", config.gen],
    [7, "Phase", config.phase],
    [8, "Class", config.projectClass],
    [9, "Type", `C${config.projectClass}`],
    [10, "pre A?", config.includePreA ? "Y" : "N"],
    [11, "TLD?", config.includeTld ? "Y" : "N"],
  ];
  for (const [column, label, value] of info) {
    styleHeader(sheet.getCell(2, column));
    sheet.getCell(2, column).value = label;
    sheet.getCell(3, column).value = value;
  }
  sheet.mergeCells(2, 2, 2, 4);
  sheet.mergeCells(3, 2, 3, 4);
  styleHeader(sheet.getCell(2, 2));
  sheet.getCell(2, 2).value = "Project Name";
  sheet.getCell(3, 2).value = config.projectName;

  for (const stage of STAGES) {
    const first = stageFirstColumn(stage);
    const site = reference.stages.find((item) => item.stage === stage);
    sheet.mergeCells(5, first, 5, first + 2);
    sheet.mergeCells(6, first, 6, first + 2);
    sheet.getCell(5, first).value = stageTitle(stage);
    sheet.getCell(6, first).value = site === undefined ? "" : `${site.travelArea} / ${site.travelSite}`;
    styleHeader(sheet.getCell(5, first));
    sheet.getCell(6, first).alignment = { horizontal: "center", wrapText: true };
    ["Man\n人數", "Days\n天數", "Total days\n總人天"].forEach((title, offset) => {
      sheet.getCell(7, first + offset).value = title;
      styleHeader(sheet.getCell(7, first + offset));
    });
  }
  sheet.mergeCells(5, TOTAL_MAN_COLUMN, 6, TOTAL_MAN_DAYS_COLUMN);
  sheet.getCell(5, TOTAL_MAN_COLUMN).value = "Total 全案合計";
  styleHeader(sheet.getCell(5, TOTAL_MAN_COLUMN));
  sheet.getCell(7, TOTAL_MAN_COLUMN).value = "總人次\nMan";
  sheet.getCell(7, TOTAL_MAN_DAYS_COLUMN).value = "總人天\nMan-Days";
  styleHeader(sheet.getCell(7, TOTAL_MAN_COLUMN));
  styleHeader(sheet.getCell(7, TOTAL_MAN_DAYS_COLUMN));
  sheet.getCell(7, 1).value = "Function";
  sheet.getCell(7, 2).value = "Group";
  styleHeader(sheet.getCell(7, 1));
  styleHeader(sheet.getCell(7, 2));

  let row = SUPER_TABLE_FIRST_FUNCTION_ROW;
  const writeRow = (label: string, group: string, byStage: Record<Stage, Quantity>, total: Quantity, bold: boolean): void => {
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 2).value = group;
    for (const stage of STAGES) writeQuantity(sheet, row, stageFirstColumn(stage), byStage[stage]);
    sheet.getCell(row, TOTAL_MAN_COLUMN).value = total.man;
    sheet.getCell(row, TOTAL_MAN_DAYS_COLUMN).value = total.manDays;
    sheet.getCell(row, TOTAL_MAN_COLUMN).numFmt = NUMBER_FORMAT;
    sheet.getCell(row, TOTAL_MAN_DAYS_COLUMN).numFmt = NUMBER_FORMAT;
    if (bold) {
      for (let column = 1; column <= TOTAL_MAN_DAYS_COLUMN; column += 1) {
        sheet.getCell(row, column).font = { bold: true };
        sheet.getCell(row, column).fill = TOTAL_FILL;
      }
    }
    row += 1;
  };
  for (const fn of result.functions) writeRow(fn.function, fn.group, fn.byStage, fn.total, false);
  for (const group of GROUPS) {
    const subtotal = result.groups.find((item) => item.group === group);
    if (subtotal !== undefined) writeRow(`Subtotal — ${group}`, "", subtotal.byStage, subtotal.total, true);
  }
  writeRow("GRAND TOTAL", "", result.byStage, result.total, true);

  row += 1;
  sheet.getCell(row, 1).value = "公式說明：Total days ＝ Σ(Man × Days)（逐筆相加）；Days ＝ Total days ÷ Man（加權平均）。";
  sheet.getCell(row + 1, 1).value = "本頁數值由 App 計算後匯出，不含公式；要修改請回 App。";

  sheet.getColumn(1).width = 25;
  sheet.getColumn(2).width = 9;
  for (let column = FIRST_STAGE_COLUMN; column < TOTAL_MAN_COLUMN; column += 1) sheet.getColumn(column).width = 9;
  sheet.getColumn(TOTAL_MAN_COLUMN - 0).width = 10;
  sheet.getColumn(TOTAL_MAN_DAYS_COLUMN).width = 12;
  sheet.getRow(7).height = 30;
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 7 }];
}
