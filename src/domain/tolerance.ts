import { z } from "zod";
import { functionNameSchema, stageSchema } from "./primitives";

/** 預設容許範圍設定的固定 id：專案的 toleranceProfileId 為 null 時用它。由 migration 與 seed 建立。 */
export const DEFAULT_TOLERANCE_PROFILE_ID = "default";

/** 偏離百分比上限（不可為負）。例如 30 代表 30%。 */
const pctSchema = z.number().min(0).max(1000);

/** 容許範圍：引擎檢查覆寫時只需要這兩個上限。 */
export const toleranceLimitsSchema = z.object({
  maxIncreasePct: pctSchema,
  maxDecreasePct: pctSchema,
});
export type ToleranceLimits = z.infer<typeof toleranceLimitsSchema>;

/** 容許範圍設定：一組有名稱的上限，可依專案或地區設多組。 */
export const toleranceProfileSchema = toleranceLimitsSchema.extend({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  /** 樂觀鎖：每次修改加 1。 */
  version: z.number().int().min(1),
  isDefault: z.boolean(),
  updatedByName: z.string().nullable(),
  updatedAt: z.string(),
});
export type ToleranceProfile = z.infer<typeof toleranceProfileSchema>;

export const OVERRIDE_DIRECTIONS = ["increase", "decrease"] as const;
export const overrideDirectionSchema = z.enum(OVERRIDE_DIRECTIONS);
export type OverrideDirection = z.infer<typeof overrideDirectionSchema>;

/** 覆寫警告：某格覆寫的人天偏離有效 Guidance 人天超過容許範圍。 */
export const overrideWarningSchema = z.object({
  stage: stageSchema,
  function: functionNameSchema,
  direction: overrideDirectionSchema,
  guidanceManDays: z.number(),
  overrideManDays: z.number(),
  /** 偏離百分比：(覆寫 − Guidance) ÷ |Guidance| × 100，增加為正、減少為負。 */
  changePct: z.number(),
  /** 這個方向的上限（百分比）。 */
  limitPct: z.number(),
  /** 該筆覆寫目前填的理由（可能是空字串）。 */
  reason: z.string(),
});
export type OverrideWarning = z.infer<typeof overrideWarningSchema>;

/** 有效 Guidance 的一格：經開關與選配 Stage 過濾後的 Guidance 值，不含覆寫與例外調整。 */
export const guidanceCellSchema = z.object({
  stage: stageSchema,
  function: functionNameSchema,
  man: z.number(),
  days: z.number(),
  manDays: z.number(),
});
export type GuidanceCell = z.infer<typeof guidanceCellSchema>;

/** 理由是否算有填：去掉空白後不是空字串。 */
export function hasReason(reason: string): boolean {
  return reason.trim().length > 0;
}
