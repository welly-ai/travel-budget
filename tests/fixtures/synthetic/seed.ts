import type { Db } from "@/db";
import { createGuidanceVersion, createProject, createUser, ensureDefaultToleranceProfile } from "@/server/admin";
import { buildSyntheticReference } from "./reference";
import { syntheticProjects } from "./projects";

/** 示範帳號：僅供本機示範，密碼公開寫在 HANDOFF.md，不得用於任何對外環境。 */
export const DEMO_USERS = [
  { name: "示範使用者", email: "demo@example.com", password: "demo-password-123" },
  { name: "小美", email: "mina@example.com", password: "demo-password-456" },
] as const;

export const DEMO_PROJECT_CODES = ["SYN01", "SYN02", "SYN03"] as const;

export interface SeededIds {
  userIds: string[];
  guidanceVersionId: string;
}

/** 用合成資料建立一個 Guidance 版本、三個示範專案、兩個示範帳號與預設容許範圍設定。 */
export async function seedSynthetic(db: Db, at: Date): Promise<SeededIds> {
  ensureDefaultToleranceProfile(db, at);
  const userIds: string[] = [];
  for (const user of DEMO_USERS) userIds.push(await createUser(db, user, at));
  const guidanceVersionId = createGuidanceVersion(db, { label: "合成示範 Guidance v1", reference: buildSyntheticReference() }, at);
  const statuses = ["active", "active", "draft"] as const;
  syntheticProjects.slice(0, 3).forEach((config, index) => {
    createProject(db, { config, guidanceVersionId, status: statuses[index] ?? "draft", actorId: userIds[0] ?? null }, at);
  });
  return { userIds, guidanceVersionId };
}
