import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import {
  projectConfigSchema,
  projectSnapshotSchema,
  referenceDataSchema,
  SNAPSHOT_SCHEMA_VERSION,
  validateProjectAgainstReference,
  type ProjectConfig,
  type ProjectStatus,
  type ReferenceData,
} from "@/domain";
import { schema, type Db } from "@/db";

/**
 * 管理用的寫入（種子資料、本機匯入、測試準備）。
 * 網頁與 MCP 不會呼叫這裡：它們只能經過 projects.ts 的服務。
 */

export async function createUser(
  db: Db,
  input: { name: string; email: string; password: string },
  at: Date,
): Promise<string> {
  const id = randomUUID();
  const passwordHash = await hashPassword(input.password);
  db.transaction((tx) => {
    tx.insert(schema.users).values({ id, name: input.name, email: input.email, emailVerified: true, createdAt: at, updatedAt: at }).run();
    tx.insert(schema.accounts)
      .values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: passwordHash, createdAt: at, updatedAt: at })
      .run();
  });
  return id;
}

export function createGuidanceVersion(db: Db, input: { label: string; reference: ReferenceData }, at: Date): string {
  const id = randomUUID();
  db.insert(schema.guidanceVersions)
    .values({ id, label: input.label, data: referenceDataSchema.parse(input.reference), createdAt: at })
    .run();
  return id;
}

/** 建立專案，並在同一個交易裡寫第 1 版修訂。 */
export function createProject(
  db: Db,
  input: { config: ProjectConfig; guidanceVersionId: string; status: ProjectStatus; actorId: string | null },
  at: Date,
): string {
  const config = projectConfigSchema.parse(input.config);
  const row = db.select().from(schema.guidanceVersions).where(eq(schema.guidanceVersions.id, input.guidanceVersionId)).get();
  if (row === undefined) throw new Error(`找不到 Guidance 版本：${input.guidanceVersionId}`);
  const [issue] = validateProjectAgainstReference(config, referenceDataSchema.parse(row.data));
  if (issue !== undefined) throw new Error(`專案 ${config.projectCode} 與參考資料不一致：${issue.path}：${issue.message}`);
  const id = randomUUID();
  db.transaction((tx) => {
    tx.insert(schema.projects)
      .values({
        id,
        code: config.projectCode,
        name: config.projectName,
        lob: config.lob,
        phase: config.phase,
        projectClass: config.projectClass,
        guidanceVersionId: input.guidanceVersionId,
        status: input.status,
        version: 1,
        config,
        updatedBy: input.actorId,
        updatedAt: at,
        createdAt: at,
      })
      .run();
    tx.insert(schema.projectRevisions)
      .values({
        id: randomUUID(),
        projectId: id,
        version: 1,
        snapshot: projectSnapshotSchema.parse({
          schemaVersion: SNAPSHOT_SCHEMA_VERSION,
          status: input.status,
          guidanceVersionId: input.guidanceVersionId,
          config,
        }),
        createdBy: input.actorId,
        createdAt: at,
      })
      .run();
  });
  return id;
}

/** 清空所有資料（保留表結構）。順序依外鍵相依。 */
export function clearAllData(db: Db): void {
  db.transaction((tx) => {
    tx.delete(schema.comments).run();
    tx.delete(schema.projectRevisions).run();
    tx.delete(schema.projects).run();
    tx.delete(schema.guidanceVersions).run();
    tx.delete(schema.sessions).run();
    tx.delete(schema.accounts).run();
    tx.delete(schema.verifications).run();
    tx.delete(schema.users).run();
  });
}
