import { z } from "zod";
import { gateKeySchema, stageSchema } from "./primitives";

export const EXCEL_LAYOUT_SCHEMA_VERSION = 1;

/** OA 上傳表的欄數（A..T）。 */
export const OA_COLUMN_COUNT = 20;

/**
 * 原 Excel 的版面設定：列標籤與 OA 欄名。
 * 真實標籤可能帶有公司或地點縮寫，所以只放在 local-data/excel-layout.json（不進 git）；
 * repo 內只有這份 schema 與 tests/fixtures/synthetic/excel-layout.json 的虛構範例。
 */
export const excelLayoutSchema = z.object({
  schemaVersion: z.literal(EXCEL_LAYOUT_SCHEMA_VERSION),
  /** Mapping 的 Gate 欄「恆計入」文字。 */
  alwaysLabel: z.string().min(1),
  includePreALabel: z.string().min(1),
  includeTldLabel: z.string().min(1),
  /** Input 的 B 欄列標籤，也是 Mapping 的 Gate 欄文字。 */
  gateLabels: z.record(gateKeySchema, z.string().min(1)),
  /** Guidance 的 Option 欄文字。 */
  optionLabels: z.object({ secondPcb: z.string().min(1), gpu: z.string().min(1) }),
  /** Input 各 Stage 的 build 日期列標籤。 */
  buildDateLabels: z.record(stageSchema, z.string().min(1)),
  /** OA 上傳表第 1 列的欄名（A..T），下游人工上傳依此欄序。 */
  oaHeaders: z.array(z.string().min(1)).length(OA_COLUMN_COUNT),
  /**
   * Input 分頁的靜態文字儲存格（標題、B 欄列標籤、C 欄輸入說明、區段標題），不含 P01.. 表頭與專案資料。
   * 匯出時照此重建 Input 頁；excel-inspect 也以它為基準偵測列標籤的新增、缺少與移位。
   */
  inputTemplate: z.array(z.object({ address: z.string().regex(/^[A-Z]+[1-9][0-9]*$/), text: z.string() })),
  /** Input 分頁的合併儲存格（例如 "A1:R1"）。 */
  inputMerges: z.array(z.string().regex(/^[A-Z]+[1-9][0-9]*:[A-Z]+[1-9][0-9]*$/)),
  /** Projects Summary「依 LOB 彙整」的固定 LOB 清單（順序即輸出順序；資料裡出現清單外的 LOB 會附加在後面）。 */
  lobs: z.array(z.string().min(1)),
});
export type ExcelLayout = z.infer<typeof excelLayoutSchema>;

/** Input 分頁 B 欄的通用列標籤（不含公司或地點名稱，所以寫在程式碼裡）。 */
export const INPUT_LABELS = {
  projectCode: "Project Code",
  projectName: "Project Name",
  lob: "LOB",
  gen: "Gen",
  phase: "Phase",
  projectClass: "Class",
  type: "Type",
  totalMan: "Total Man (總人次)",
  totalManDays: "Total Man-Days (總人天)",
  check: "Check 檢查",
} as const;
