import { z } from "zod";
import {
  functionNameSchema,
  gateKeySchema,
  groupSchema,
  phaseSchema,
  projectClassSchema,
  STAGES,
  stageSchema,
} from "./primitives";

/** Function 的開關：恆計入，或看某個 Adder／Option 開關。 */
export const functionGateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("always") }),
  z.object({ kind: z.literal("switch"), key: gateKeySchema }),
]);
export type FunctionGate = z.infer<typeof functionGateSchema>;

/** Mapping 的一列：Function 清單，順序即輸出順序。 */
export const functionDefSchema = z.object({
  name: functionNameSchema,
  group: groupSchema,
  gate: functionGateSchema,
  /** guidance 的原始 Function 名稱（例如 DQA_ITM 合併自 DQA_ITM1、DQA_ITM2）；沒有 guidance 資料的 Function 為空陣列。 */
  sourceFunctions: z.array(z.string()),
});
export type FunctionDef = z.infer<typeof functionDefSchema>;

/** Stage 對應的出差地區與地點。 */
export const stageSiteSchema = z.object({
  stage: stageSchema,
  travelArea: z.string(),
  travelSite: z.string(),
});
export type StageSite = z.infer<typeof stageSiteSchema>;

export const GUIDANCE_KINDS = ["BASE", "ADDER", "OPT"] as const;
export const guidanceKindSchema = z.enum(GUIDANCE_KINDS);

/** Guidance 的一列：(Phase, Class, Stage, Function) 的基準人次與天數。人次可為負（扣減）。 */
export const guidanceRowSchema = z.object({
  phase: phaseSchema,
  projectClass: projectClassSchema,
  kind: guidanceKindSchema,
  /** Option 欄（2nd PCB SoC、GPU）；其他列為 null。 */
  option: gateKeySchema.nullable(),
  stage: stageSchema,
  function: functionNameSchema,
  sourceFunction: z.string(),
  man: z.number(),
  days: z.number(),
});
export type GuidanceRow = z.infer<typeof guidanceRowSchema>;

export const referenceDataSchema = z
  .object({
    schemaVersion: z.literal(1),
    functions: z.array(functionDefSchema).min(1),
    stages: z.array(stageSiteSchema),
    guidance: z.array(guidanceRowSchema),
  })
  .superRefine((ref, ctx) => {
    const names = new Set<string>();
    ref.functions.forEach((def, index) => {
      if (names.has(def.name)) {
        ctx.addIssue({ code: "custom", path: ["functions", index, "name"], message: `Function 名稱重複：${def.name}` });
      }
      names.add(def.name);
    });
    ref.guidance.forEach((row, index) => {
      if (!names.has(row.function)) {
        ctx.addIssue({ code: "custom", path: ["guidance", index, "function"], message: `guidance 使用了 Function 清單沒有的名稱：${row.function}` });
      }
    });
    const seen = new Set<string>(ref.stages.map((site) => site.stage));
    const duplicated = seen.size !== ref.stages.length;
    const missing = STAGES.filter((stage) => !seen.has(stage));
    if (duplicated || missing.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["stages"],
        message: `stages 必須恰好包含每個 Stage 一次（缺少：${missing.join("、") || "無"}${duplicated ? "；有重複" : ""}）`,
      });
    }
  });
export type ReferenceData = z.infer<typeof referenceDataSchema>;
