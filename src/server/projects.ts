import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  calculateProjectInputSchema,
  exportProjectInputSchema,
  getProjectInputSchema,
  listRevisionsInputSchema,
  projectConfigSchema,
  projectRecordSchema,
  projectSnapshotSchema,
  projectSummarySchema,
  referenceDataSchema,
  revisionSummarySchema,
  SNAPSHOT_SCHEMA_VERSION,
  updateProjectInputSchema,
  type ProjectConfig,
  type ProjectRecord,
  type ProjectResult,
  type ProjectSummary,
  type ReferenceData,
  type RevisionSummary,
  type SettingsOverride,
} from "@/domain";
import { calculateProject as calculateWithEngine } from "@/engine";
import { exportProjectsWorkbook } from "@/export";
import { schema } from "@/db";
import type { z } from "zod";
import type { ServerContext } from "./context";
import { ConflictError, NotFoundError } from "./errors";

const { projects, projectRevisions, guidanceVersions, users } = schema;

export interface CalculatedProject {
  config: ProjectConfig;
  result: ProjectResult;
}

export interface ExportedWorkbook {
  filename: string;
  buffer: Buffer;
}

/** 固定欄位由 config 衍生；寫入專案時一律經過這個函式，兩者才不會分歧。 */
function columnsOf(config: ProjectConfig) {
  return {
    code: config.projectCode,
    name: config.projectName,
    lob: config.lob,
    phase: config.phase,
    projectClass: config.projectClass,
  };
}

/** 把設定覆寫合併進專案設定；開關與 build 日期是逐項覆蓋。 */
export function applyOverrides(config: ProjectConfig, overrides: SettingsOverride | undefined): ProjectConfig {
  if (overrides === undefined) return config;
  return projectConfigSchema.parse({
    ...config,
    ...(overrides.phase !== undefined ? { phase: overrides.phase } : {}),
    ...(overrides.projectClass !== undefined ? { projectClass: overrides.projectClass } : {}),
    ...(overrides.includePreA !== undefined ? { includePreA: overrides.includePreA } : {}),
    ...(overrides.includeTld !== undefined ? { includeTld: overrides.includeTld } : {}),
    gates: { ...config.gates, ...overrides.gates },
    buildDates: { ...config.buildDates, ...overrides.buildDates },
  });
}

function iso(at: Date) {
  return at.toISOString();
}

/** 服務層：頁面、API、MCP 唯一的資料入口。所有輸入先經 Zod 驗證。 */
export function createServices(ctx: ServerContext) {
  const { db } = ctx;
  // guidance 版本建立後不會改內容，所以解析結果可以記住。
  const referenceCache = new Map<string, ReferenceData>();

  function loadReference(guidanceVersionId: string): { reference: ReferenceData; label: string } {
    const row = db.select().from(guidanceVersions).where(eq(guidanceVersions.id, guidanceVersionId)).get();
    if (row === undefined) throw new NotFoundError(`找不到 Guidance 版本：${guidanceVersionId}`);
    const cached = referenceCache.get(row.id);
    if (cached !== undefined) return { reference: cached, label: row.label };
    const reference = referenceDataSchema.parse(row.data);
    referenceCache.set(row.id, reference);
    return { reference, label: row.label };
  }

  function findRow(projectCode: string) {
    const row = db
      .select({ project: projects, updatedByName: users.name })
      .from(projects)
      .leftJoin(users, eq(projects.updatedBy, users.id))
      .where(eq(projects.code, projectCode))
      .get();
    if (row === undefined) throw new NotFoundError(`找不到專案：${projectCode}`);
    return row;
  }

  function toRecord(row: ReturnType<typeof findRow>): ProjectRecord {
    return projectRecordSchema.parse({
      id: row.project.id,
      code: row.project.code,
      status: row.project.status,
      version: row.project.version,
      guidanceVersionId: row.project.guidanceVersionId,
      config: projectConfigSchema.parse(row.project.config),
      updatedByName: row.updatedByName,
      updatedAt: iso(row.project.updatedAt),
    });
  }

  function getProject(input: z.input<typeof getProjectInputSchema>): ProjectRecord {
    const { projectCode } = getProjectInputSchema.parse(input);
    return toRecord(findRow(projectCode));
  }

  function calculateProject(input: z.input<typeof calculateProjectInputSchema>): CalculatedProject {
    const parsed = calculateProjectInputSchema.parse(input);
    const record = toRecord(findRow(parsed.projectCode));
    const config = applyOverrides(record.config, parsed.overrides);
    const { reference } = loadReference(record.guidanceVersionId);
    return { config, result: calculateWithEngine(config, reference) };
  }

  function listProjects(): ProjectSummary[] {
    const rows = db
      .select({ project: projects, updatedByName: users.name })
      .from(projects)
      .leftJoin(users, eq(projects.updatedBy, users.id))
      .orderBy(projects.code)
      .all();
    return rows.map((row) => {
      const record = toRecord(row);
      const { reference } = loadReference(record.guidanceVersionId);
      const result = calculateWithEngine(record.config, reference);
      return projectSummarySchema.parse({
        code: record.code,
        name: record.config.projectName,
        lob: record.config.lob,
        phase: record.config.phase,
        projectClass: record.config.projectClass,
        status: record.status,
        version: record.version,
        totalMan: result.total.man,
        totalManDays: result.total.manDays,
        updatedByName: record.updatedByName,
        updatedAt: record.updatedAt,
      });
    });
  }

  /** 存檔：帶讀取時的版本；版本對不上就丟 ConflictError。專案更新與修訂在同一個交易裡寫入。 */
  function updateProject(input: z.input<typeof updateProjectInputSchema>): ProjectRecord {
    const parsed = updateProjectInputSchema.parse(input);
    db.transaction((tx) => {
      const current = tx
        .select({ project: projects, updatedByName: users.name })
        .from(projects)
        .leftJoin(users, eq(projects.updatedBy, users.id))
        .where(eq(projects.code, parsed.projectCode))
        .get();
      if (current === undefined) throw new NotFoundError(`找不到專案：${parsed.projectCode}`);
      if (current.project.version !== parsed.expectedVersion) {
        throw new ConflictError({
          projectCode: parsed.projectCode,
          expectedVersion: parsed.expectedVersion,
          currentVersion: current.project.version,
          updatedByName: current.updatedByName,
          updatedAt: iso(current.project.updatedAt),
        });
      }
      const config = projectConfigSchema.parse({ ...projectConfigSchema.parse(current.project.config), ...parsed.settings });
      const { reference } = loadReference(current.project.guidanceVersionId);
      calculateWithEngine(config, reference); // 設定與參考資料不一致時在這裡丟錯，不寫入
      const at = ctx.now();
      const nextVersion = current.project.version + 1;
      // where 帶 version：就算兩個交易交錯，也只有一個能改到資料。
      const updated = tx
        .update(projects)
        .set({ ...columnsOf(config), config, version: nextVersion, updatedBy: parsed.actorId, updatedAt: at })
        .where(and(eq(projects.id, current.project.id), eq(projects.version, parsed.expectedVersion)))
        .run();
      if (updated.changes !== 1) {
        throw new ConflictError({
          projectCode: parsed.projectCode,
          expectedVersion: parsed.expectedVersion,
          currentVersion: current.project.version + 1,
          updatedByName: null,
          updatedAt: iso(at),
        });
      }
      tx.insert(projectRevisions)
        .values({
          id: randomUUID(),
          projectId: current.project.id,
          version: nextVersion,
          snapshot: projectSnapshotSchema.parse({
            schemaVersion: SNAPSHOT_SCHEMA_VERSION,
            status: current.project.status,
            guidanceVersionId: current.project.guidanceVersionId,
            config,
          }),
          createdBy: parsed.actorId,
          createdAt: at,
        })
        .run();
    }, { behavior: "immediate" });
    return toRecord(findRow(parsed.projectCode));
  }

  function listRevisions(input: z.input<typeof listRevisionsInputSchema>): RevisionSummary[] {
    const parsed = listRevisionsInputSchema.parse(input);
    const project = findRow(parsed.projectCode).project;
    return db
      .select({ version: projectRevisions.version, byName: users.name, at: projectRevisions.createdAt })
      .from(projectRevisions)
      .leftJoin(users, eq(projectRevisions.createdBy, users.id))
      .where(eq(projectRevisions.projectId, project.id))
      .orderBy(desc(projectRevisions.version))
      .limit(parsed.limit)
      .all()
      .map((row) => revisionSummarySchema.parse({ version: row.version, byName: row.byName, at: iso(row.at) }));
  }

  /** 匯出單一專案的活頁簿（舊版面，只有數值）。 */
  async function exportProjectWorkbook(input: z.input<typeof exportProjectInputSchema>): Promise<ExportedWorkbook> {
    const { projectCode } = exportProjectInputSchema.parse(input);
    const record = toRecord(findRow(projectCode));
    const { reference, label } = loadReference(record.guidanceVersionId);
    const result = calculateWithEngine(record.config, reference);
    const { layout, source } = ctx.exportLayout();
    const buffer = await exportProjectsWorkbook([record.config], [result], reference, {
      generatedAt: ctx.now().toISOString(),
      dataVersion: `${record.code} v${record.version}`,
      guidanceVersion: label,
      layout,
      layoutSource: source,
    });
    return { filename: `${record.code}-v${record.version}.xlsx`, buffer };
  }

  return { listProjects, getProject, calculateProject, updateProject, listRevisions, exportProjectWorkbook };
}

export type Services = ReturnType<typeof createServices>;
