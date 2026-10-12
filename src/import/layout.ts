import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type ExcelLayout, excelLayoutSchema } from "@/domain";

export const DEFAULT_LAYOUT_PATH = "local-data/excel-layout.json";
export const EXAMPLE_LAYOUT_PATH = "tests/fixtures/synthetic/excel-layout.json";

/** 讀取並驗證版面設定；找不到或不合法時給清楚的錯誤。 */
export function loadExcelLayout(path: string = resolve(/*turbopackIgnore: true*/ process.cwd(), DEFAULT_LAYOUT_PATH)): ExcelLayout {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(
      `找不到 Excel 版面設定：${path}\n` +
        `請建立這個檔案（真實列標籤只放 local-data，不進 git）；欄位格式可參考虛構範例 ${EXAMPLE_LAYOUT_PATH}，` +
        "也可以跑 excel-inspect 對照目前活頁簿。",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error: unknown) {
    throw new Error(`Excel 版面設定不是合法 JSON：${path}：${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = excelLayoutSchema.safeParse(json);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join(".")}：${issue.message}`).join("\n");
    throw new Error(`Excel 版面設定不合法：${path}\n${detail}`);
  }
  return parsed.data;
}
