import { z } from "zod";
import { budgetedPeriodSchema, functionNameSchema, groupSchema, quantitySchema, stageSchema } from "./primitives";

const byStageSchema = z.record(stageSchema, quantitySchema);

/** 一個 Function 在各 Stage 的結果，以及跨 Stage 合計。 */
export const functionResultSchema = z.object({
  function: functionNameSchema,
  group: groupSchema,
  byStage: byStageSchema,
  total: quantitySchema,
});
export type FunctionResult = z.infer<typeof functionResultSchema>;

/** 一個 Group 的小計（原 Super table 的 Subtotal 列）。 */
export const groupSubtotalSchema = z.object({
  group: groupSchema,
  byStage: byStageSchema,
  total: quantitySchema,
});
export type GroupSubtotal = z.infer<typeof groupSubtotalSchema>;

export const projectResultSchema = z.object({
  projectCode: z.string(),
  functions: z.array(functionResultSchema),
  groups: z.array(groupSubtotalSchema),
  /** 各 Stage 的合計（原 GRAND TOTAL 列）。 */
  byStage: byStageSchema,
  total: quantitySchema,
});
export type ProjectResult = z.infer<typeof projectResultSchema>;

/** OA 上傳的一列（Stage × Function）。費用欄位本工具不試算，所以不在這裡。 */
export const oaRowSchema = z.object({
  deptCode: z.string(),
  /** 該 Stage 的 build 日期所在月份；沒填日期時為 null。 */
  budgetedPeriod: budgetedPeriodSchema.nullable(),
  projectCode: z.string(),
  travelArea: z.string(),
  travelSite: z.string(),
  stage: stageSchema,
  function: functionNameSchema,
  man: z.number(),
  travelerDays: z.number(),
  manDays: z.number(),
  /** 人天不為 0 才需要上傳。 */
  include: z.boolean(),
});
export type OaRow = z.infer<typeof oaRowSchema>;

/** 依 LOB 彙總。 */
export const lobSummarySchema = z.object({
  lob: z.string(),
  projectCount: z.number().int(),
  man: z.number(),
  manDays: z.number(),
});
export type LobSummary = z.infer<typeof lobSummarySchema>;
