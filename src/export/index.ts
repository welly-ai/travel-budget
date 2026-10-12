import ExcelJS from "exceljs";
import { type ExcelLayout, type ProjectConfig, type ProjectResult, type ReferenceData } from "@/domain";
import { writeInputSheet } from "./input-sheet";
import { writeOaSheet } from "./oa-sheet";
import { writeSummary } from "./summary";
import { writeSuperTable } from "./super-table";

export { OA_SHEET_NAME } from "./oa-sheet";
export { superTableName } from "./common";

export interface ExportMeta {
  /** 匯出時間（ISO 8601），由呼叫端提供（匯出函式本身不取時間，結果才可重現）。 */
  generatedAt: string;
  /** 專案資料的版本（例如各專案 version 的摘要）。 */
  dataVersion: string;
  /** Guidance（參考資料）的版本。 */
  guidanceVersion: string;
  /** 版面設定；真實標籤來自 local-data/excel-layout.json。 */
  layout: ExcelLayout;
  /** 版面設定來源：local＝本機真實版面；example＝範例（虛構標籤），說明頁會註明。 */
  layoutSource: "local" | "example";
  budgetYear?: number;
}

export const NOTES_SHEET_NAME = "說明";

/**
 * 匯出整份活頁簿，版面比照原工具：Input、Super table_01..NN、Projects Summary、OA Upload_All，外加「說明」。
 * 只放數值，不放公式；不輸出 Guidance、Mapping、Validation 等內部頁。專案數超過 15 時，Input 往右、Super table 依序編號延伸。
 */
export async function exportProjectsWorkbook(
  projects: readonly ProjectConfig[],
  results: readonly ProjectResult[],
  reference: ReferenceData,
  meta: ExportMeta,
): Promise<Buffer> {
  if (projects.length !== results.length) {
    throw new Error(`匯出失敗：專案 ${projects.length} 個，但結果 ${results.length} 個`);
  }
  projects.forEach((config, index) => {
    const result = results[index];
    if (result?.projectCode !== config.projectCode) {
      throw new Error(`匯出失敗：第 ${index + 1} 個專案是 ${config.projectCode}，但結果屬於 ${result?.projectCode ?? "（無）"}`);
    }
  });

  const workbook = new ExcelJS.Workbook();
  writeNotes(workbook, projects.length, meta);
  writeSummary(workbook, projects, results, meta.layout);
  writeOaSheet(workbook, projects, results, reference, meta.layout);
  writeInputSheet(workbook, projects, results, meta.layout, meta.budgetYear);
  projects.forEach((config, index) => {
    const result = results[index];
    if (result !== undefined) writeSuperTable(workbook, index + 1, config, result, reference);
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function writeNotes(workbook: ExcelJS.Workbook, projectCount: number, meta: ExportMeta): void {
  const sheet = workbook.addWorksheet(NOTES_SHEET_NAME);
  sheet.getCell("A1").value = "匯出說明";
  sheet.getCell("A1").font = { bold: true, size: 13 };
  const rows: [string, string][] = [
    ["產生者", "差旅人天預算工具（App）"],
    ["產生時間", meta.generatedAt],
    ["資料版本", meta.dataVersion],
    ["Guidance 版本", meta.guidanceVersion],
    ["專案數", String(projectCount)],
    ["版面", meta.layoutSource === "local" ? "本機版面設定" : "範例版面設定（標籤為虛構，僅供示範，不可直接用於下游上傳）"],
    ["工作表命名", "Input（各專案一欄，P01、P02…）；Super table_01、Super table_02…（依專案順序，超過 99 案時位數自動增加）；Projects Summary；OA Upload_All"],
    ["內容", "所有儲存格都是數值，沒有公式。"],
    ["重要", "要修改請回 App，此檔修改不會回寫。"],
  ];
  rows.forEach(([key, value], offset) => {
    sheet.getCell(offset + 3, 1).value = key;
    sheet.getCell(offset + 3, 1).font = { bold: true };
    sheet.getCell(offset + 3, 2).value = value;
  });
  sheet.getColumn(1).width = 16;
  sheet.getColumn(2).width = 90;
}
