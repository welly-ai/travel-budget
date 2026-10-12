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

export const PROJECT_CONFIG_SCHEMA_VERSION = 1;

/**
 * 專案設定：可整份存成 JSON 的輸入。結構改變時遞增 schemaVersion 並寫遷移函式（AGENTS.md 紅線 4）。
 * 例外調整（原 Input_Manual_Adjust）併入專案本身，所以不需要 projectCode 欄。
 */
export const projectConfigSchema = z.object({
  schemaVersion: z.literal(PROJECT_CONFIG_SCHEMA_VERSION),
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
});
export type ProjectConfig = z.infer<typeof projectConfigSchema>;
