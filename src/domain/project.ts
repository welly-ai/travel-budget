import { z } from "zod";
import {
  functionNameSchema,
  gateKeySchema,
  isoDateSchema,
  phaseSchema,
  projectClassSchema,
  stageSchema,
} from "./primitives";

/** 例外調整：疊加在某個 Stage × Function 的人次與天數上（人天 = man × days）。 */
export const manualAdjustmentSchema = z.object({
  stage: stageSchema,
  function: functionNameSchema,
  man: z.number(),
  days: z.number(),
  remark: z.string(),
});
export type ManualAdjustment = z.infer<typeof manualAdjustmentSchema>;

/**
 * 手動覆寫：使用者輸入某個 Stage × Function 格子「最後的人次與天數」，取代該格的有效 Guidance 當作基礎值。
 * 例外調整照舊疊加在覆寫值上。理由在偏離超過容許範圍時必填（由服務層存檔時檢查）。
 */
export const cellOverrideSchema = z.object({
  stage: stageSchema,
  function: functionNameSchema,
  man: z.number(),
  days: z.number(),
  reason: z.string(),
});
export type CellOverride = z.infer<typeof cellOverrideSchema>;

/** 目前的專案設定版本。結構改變時遞增，並在 migrateProjectConfig 補上遷移（AGENTS.md 紅線 4）。 */
export const PROJECT_CONFIG_SCHEMA_VERSION = 2;

const projectConfigFields = {
  deptCode: z.string().min(1),
  projectCode: z.string().trim().min(1),
  projectName: z.string(),
  lob: z.string().trim().min(1),
  gen: z.string(),
  phase: phaseSchema,
  projectClass: projectClassSchema,
  /** 每個 Adder／Option 開關都必須明確給值。 */
  gates: z.record(gateKeySchema, z.boolean()),
  includePreA: z.boolean(),
  includeTld: z.boolean(),
  /** 各 Stage 的 build 里程碑日期；未填的 Stage 沒有 Budgeted Period。 */
  buildDates: z.partialRecord(stageSchema, isoDateSchema),
  manualAdjustments: z.array(manualAdjustmentSchema),
};

/** v1：沒有手動覆寫與容許範圍設定。只用於讀入舊資料，讀入後立刻遷移成 v2。 */
export const projectConfigV1Schema = z.object({ schemaVersion: z.literal(1), ...projectConfigFields });
export type ProjectConfigV1 = z.infer<typeof projectConfigV1Schema>;

/** v2 的欄位（不含跨欄位檢查）；需要 pick 欄位時用這個。 */
export const projectConfigV2ObjectSchema = z.object({
  schemaVersion: z.literal(2),
  ...projectConfigFields,
  /** 手動覆寫：同一個 Stage × Function 至多一筆。 */
  cellOverrides: z.array(cellOverrideSchema),
  /** 選用的容許範圍設定；null 代表用預設組。 */
  toleranceProfileId: z.string().min(1).nullable(),
});

/** 目前版本（v2）的專案設定。 */
export const projectConfigV2Schema = projectConfigV2ObjectSchema.superRefine((config, ctx) => {
  const seen = new Set<string>();
  config.cellOverrides.forEach((item, index) => {
    // 只在這裡當作「是否重複」的集合成員判斷，不當查詢鍵在別處傳遞。
    const key = JSON.stringify([item.stage, item.function]);
    if (seen.has(key)) {
      ctx.addIssue({ code: "custom", path: ["cellOverrides", index], message: `同一格只能有一筆手動覆寫：${item.stage} × ${item.function}` });
    }
    seen.add(key);
  });
});
export type ProjectConfigV2 = z.infer<typeof projectConfigV2Schema>;

/**
 * 任一支援版本的專案設定。引擎與匯出都收這個型別，內部再經 migrateProjectConfig 轉成目前版本；
 * 從外部讀入（資料庫、匯入、API、MCP）時一律用 projectConfigSchema，讀出來就已經是目前版本。
 */
export type ProjectConfig = ProjectConfigV1 | ProjectConfigV2;

/** 把任一版本的專案設定遷移成目前版本（純函式）。 */
export function migrateProjectConfig(config: ProjectConfig): ProjectConfigV2 {
  switch (config.schemaVersion) {
    case 1:
      return { ...config, schemaVersion: 2, cellOverrides: [], toleranceProfileId: null };
    case 2:
      return config;
  }
}

/**
 * 專案設定的讀入 schema：接受 v1 或 v2，輸出一律是 v2。
 * 例外調整（原 Input_Manual_Adjust）併入專案本身，所以不需要 projectCode 欄。
 */
export const projectConfigSchema = z
  .discriminatedUnion("schemaVersion", [projectConfigV1Schema, projectConfigV2Schema])
  .transform(migrateProjectConfig);
