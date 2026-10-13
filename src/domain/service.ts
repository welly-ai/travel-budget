import { z } from "zod";
import { projectConfigSchema, projectConfigV2ObjectSchema } from "./project";
import { gateKeySchema, isoDateSchema, phaseSchema, projectClassSchema, stageSchema } from "./primitives";

/** 專案狀態：草稿或生效。把草稿設為生效只能由人在網頁上做（AGENTS.md 紅線 8）。 */
export const PROJECT_STATUSES = ["draft", "active"] as const;
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

/** 專案頁左側可以修改的設定：專案設定的子集（代碼、名稱、LOB 與例外調整另有管道）。 */
export const projectSettingsSchema = projectConfigV2ObjectSchema.pick({
  phase: true,
  projectClass: true,
  gates: true,
  includePreA: true,
  includeTld: true,
  buildDates: true,
});
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

/** 試算用的設定覆寫：每個欄位都可省略，開關與 build 日期可以只給要改的部分。 */
export const settingsOverrideSchema = z.object({
  phase: phaseSchema.optional(),
  projectClass: projectClassSchema.optional(),
  gates: z.partialRecord(gateKeySchema, z.boolean()).optional(),
  includePreA: z.boolean().optional(),
  includeTld: z.boolean().optional(),
  buildDates: z.partialRecord(stageSchema, isoDateSchema).optional(),
});
export type SettingsOverride = z.infer<typeof settingsOverrideSchema>;

/** 專案代碼：網址與 MCP 都用它指名專案。 */
export const projectCodeSchema = z.string().trim().min(1).max(64);

export const SNAPSHOT_SCHEMA_VERSION = 1;

/** 修訂快照：每次存檔當下的完整專案內容。 */
export const projectSnapshotSchema = z.object({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  status: projectStatusSchema,
  guidanceVersionId: z.string(),
  config: projectConfigSchema,
});
export type ProjectSnapshot = z.infer<typeof projectSnapshotSchema>;

/** 專案列表的一列。 */
export const projectSummarySchema = z.object({
  code: z.string(),
  name: z.string(),
  lob: z.string(),
  phase: phaseSchema,
  projectClass: projectClassSchema,
  status: projectStatusSchema,
  version: z.number().int(),
  totalMan: z.number(),
  totalManDays: z.number(),
  updatedByName: z.string().nullable(),
  updatedAt: z.string(),
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const projectRecordSchema = z.object({
  id: z.string(),
  code: z.string(),
  status: projectStatusSchema,
  version: z.number().int(),
  guidanceVersionId: z.string(),
  config: projectConfigSchema,
  updatedByName: z.string().nullable(),
  updatedAt: z.string(),
});
export type ProjectRecord = z.infer<typeof projectRecordSchema>;

export const revisionSummarySchema = z.object({
  version: z.number().int(),
  byName: z.string().nullable(),
  at: z.string(),
});
export type RevisionSummary = z.infer<typeof revisionSummarySchema>;

/** 服務層的輸入 schema：頁面、API、MCP 共用。 */
export const getProjectInputSchema = z.object({ projectCode: projectCodeSchema });
export const calculateProjectInputSchema = z.object({
  projectCode: projectCodeSchema,
  overrides: settingsOverrideSchema.optional(),
});
export const updateProjectInputSchema = z.object({
  projectCode: projectCodeSchema,
  expectedVersion: z.number().int().min(1),
  settings: projectSettingsSchema,
  actorId: z.string().min(1),
});
export const listRevisionsInputSchema = z.object({
  projectCode: projectCodeSchema,
  limit: z.number().int().min(1).max(100).default(5),
});
export const exportProjectInputSchema = z.object({ projectCode: projectCodeSchema });
