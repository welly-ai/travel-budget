import ExcelJS from "exceljs";
import { type ExcelLayout, GATE_KEYS, type ProjectConfig, type ReferenceData, STAGES } from "@/domain";

/**
 * 以合成資料在記憶體中組出與原 Excel 相同版面的活頁簿（匯入測試用）。
 * 版面刻意與真實檔案一致（列號、欄位、標題文字），所以錯誤訊息裡的儲存格位置可以直接對照。
 * 只寫入「輸入」儲存格，不寫公式。
 */

export const INPUT_ROWS = {
  deptCode: 2,
  projectCode: 6,
  projectName: 7,
  lob: 8,
  gen: 9,
  phase: 10,
  projectClass: 11,
  includePreA: 24,
  includeTld: 25,
} as const;

/** 專案欄：D = 第 1 欄專案。 */
export const FIRST_PROJECT_COLUMN = 4;

const GATE_FIRST_ROW = 14;

const DATE_FIRST_ROW = 27;

export const GUIDANCE_FIRST_ROW = 4;
export const MAPPING_FIRST_FUNCTION_ROW = 5;
export const MANUAL_FIRST_ROW = 4;

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function optionLabelOf(layout: ExcelLayout, key: string | null): string | null {
  if (key === "secondPcb") return layout.optionLabels.secondPcb;
  if (key === "gpu") return layout.optionLabels.gpu;
  return null;
}

function classText(projectClass: number): string {
  return `Class ${projectClass}`;
}

export function buildSyntheticWorkbook(reference: ReferenceData, projects: readonly ProjectConfig[], layout: ExcelLayout): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();

  // Input
  const input = workbook.addWorksheet("Input");
  input.getCell("B2").value = "DeptCode (部門代碼)";
  input.getCell("B5").value = "Item / 項目";
  input.getCell(INPUT_ROWS.projectCode, 2).value = "Project Code";
  input.getCell(INPUT_ROWS.projectName, 2).value = "Project Name";
  input.getCell(INPUT_ROWS.lob, 2).value = "LOB";
  input.getCell(INPUT_ROWS.gen, 2).value = "Gen";
  input.getCell(INPUT_ROWS.phase, 2).value = "Phase";
  input.getCell(INPUT_ROWS.projectClass, 2).value = "Class";
  input.getCell(INPUT_ROWS.includePreA, 2).value = layout.includePreALabel;
  input.getCell(INPUT_ROWS.includeTld, 2).value = layout.includeTldLabel;
  GATE_KEYS.forEach((key, offset) => {
    input.getCell(GATE_FIRST_ROW + offset, 2).value = layout.gateLabels[key];
  });
  STAGES.forEach((stage, offset) => {
    input.getCell(DATE_FIRST_ROW + offset, 2).value = layout.buildDateLabels[stage];
  });
  input.getCell(INPUT_ROWS.deptCode, 3).value = projects[0]?.deptCode ?? "SYN-DEPT";
  projects.forEach((project, offset) => {
    const column = FIRST_PROJECT_COLUMN + offset;
    input.getCell(INPUT_ROWS.projectCode, column).value = project.projectCode;
    input.getCell(INPUT_ROWS.projectName, column).value = project.projectName;
    input.getCell(INPUT_ROWS.lob, column).value = project.lob;
    input.getCell(INPUT_ROWS.gen, column).value = project.gen;
    input.getCell(INPUT_ROWS.phase, column).value = project.phase;
    input.getCell(INPUT_ROWS.projectClass, column).value = project.projectClass;
    input.getCell(INPUT_ROWS.includePreA, column).value = project.includePreA ? "Y" : "N";
    input.getCell(INPUT_ROWS.includeTld, column).value = project.includeTld ? "Y" : "N";
    GATE_KEYS.forEach((key, offset) => {
      input.getCell(GATE_FIRST_ROW + offset, column).value = project.gates[key] ? "Y" : "N";
    });
    STAGES.forEach((stage, dateOffset) => {
      const date = project.buildDates[stage];
      if (date !== undefined) input.getCell(DATE_FIRST_ROW + dateOffset, column).value = utcDate(date);
    });
  });

  // Input_Manual_Adjust
  const manual = workbook.addWorksheet("Input_Manual_Adjust");
  ["Project Code", "Stage", "Function", "Man", "Days", "Man-Days", "Remark"].forEach((title, index) => {
    manual.getCell(3, index + 1).value = title;
  });
  let manualRow = MANUAL_FIRST_ROW;
  for (const project of projects) {
    for (const adjustment of project.manualAdjustments) {
      manual.getCell(manualRow, 1).value = project.projectCode;
      manual.getCell(manualRow, 2).value = adjustment.stage;
      manual.getCell(manualRow, 3).value = adjustment.function;
      manual.getCell(manualRow, 4).value = adjustment.man;
      manual.getCell(manualRow, 5).value = adjustment.days;
      manual.getCell(manualRow, 7).value = adjustment.remark === "" ? null : adjustment.remark;
      manualRow += 1;
    }
  }

  // Guidance
  const guidance = workbook.addWorksheet("Guidance");
  ["Phase", "Class", "Kind", "Option", "Stage", "Group", "Function (row key)", "Source Function", "Man", "Days"].forEach((title, index) => {
    guidance.getCell(3, index + 1).value = title;
  });
  const groupOf = new Map<string, string>(reference.functions.map((def) => [def.name, def.group]));
  reference.guidance.forEach((row, offset) => {
    const r = GUIDANCE_FIRST_ROW + offset;
    guidance.getCell(r, 1).value = row.phase;
    guidance.getCell(r, 2).value = classText(row.projectClass);
    guidance.getCell(r, 3).value = row.kind;
    guidance.getCell(r, 4).value = row.option === null ? null : (optionLabelOf(layout, row.option));
    guidance.getCell(r, 5).value = row.stage;
    guidance.getCell(r, 6).value = groupOf.get(row.function) ?? "";
    guidance.getCell(r, 7).value = row.function;
    guidance.getCell(r, 8).value = row.sourceFunction;
    guidance.getCell(r, 9).value = row.man;
    guidance.getCell(r, 10).value = row.days;
  });

  // Mapping
  const mapping = workbook.addWorksheet("Mapping");
  ["#", "Function (row key)", "Group", "Gate ← Input 項目", "Source Function (guidance 原名)"].forEach((title, index) => {
    mapping.getCell(4, index + 1).value = title;
  });
  reference.functions.forEach((def, offset) => {
    const r = MAPPING_FIRST_FUNCTION_ROW + offset;
    mapping.getCell(r, 1).value = offset + 1;
    mapping.getCell(r, 2).value = def.name;
    mapping.getCell(r, 3).value = def.group;
    const gate = def.gate;
    mapping.getCell(r, 4).value = gate.kind === "always" ? "(always)" : (layout.gateLabels[gate.key]);
    mapping.getCell(r, 5).value = def.sourceFunctions.length === 0 ? null : def.sourceFunctions.join(", ");
  });
  const stageHeaderRow = MAPPING_FIRST_FUNCTION_ROW + reference.functions.length + 3;
  ["#", "Stage", "TravelArea", "TravelSite", "Gate ← Input 項目"].forEach((title, index) => {
    mapping.getCell(stageHeaderRow, index + 1).value = title;
  });
  reference.stages.forEach((site, offset) => {
    const r = stageHeaderRow + 1 + offset;
    mapping.getCell(r, 1).value = offset + 1;
    mapping.getCell(r, 2).value = site.stage;
    mapping.getCell(r, 3).value = site.travelArea;
    mapping.getCell(r, 4).value = site.travelSite;
    mapping.getCell(r, 5).value = site.stage === "pre A" ? layout.includePreALabel : site.stage === "TLD" ? layout.includeTldLabel : "(always)";
  });

  return workbook;
}
