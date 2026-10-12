import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ExcelLayout } from "@/domain";
import type { Db } from "@/db";
import { DEFAULT_LAYOUT_PATH, EXAMPLE_LAYOUT_PATH, loadExcelLayout } from "@/import";

export interface ExportLayout {
  layout: ExcelLayout;
  source: "local" | "example";
}

/** 服務層需要的外部依賴；測試時換成暫存資料庫與固定時間。 */
export interface ServerContext {
  db: Db;
  now: () => Date;
  /** 匯出用的版面設定（舊版面）。 */
  exportLayout: () => ExportLayout;
}

/**
 * 預設版面：有 local-data/excel-layout.json（真實標籤）就用它，否則用虛構範例。
 * 設環境變數 EXCEL_LAYOUT=example 可強制用範例。
 */
export function defaultExportLayout(): ExportLayout {
  const localPath = resolve(/*turbopackIgnore: true*/ process.cwd(), DEFAULT_LAYOUT_PATH);
  if (process.env["EXCEL_LAYOUT"] !== "example" && existsSync(localPath)) {
    return { layout: loadExcelLayout(localPath), source: "local" };
  }
  return { layout: loadExcelLayout(resolve(/*turbopackIgnore: true*/ process.cwd(), EXAMPLE_LAYOUT_PATH)), source: "example" };
}
