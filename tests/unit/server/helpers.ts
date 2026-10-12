import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDb, openDb, type Db } from "@/db";
import { createServices, type Services } from "@/server";
import { DEMO_USERS, seedSynthetic } from "../../fixtures/synthetic/seed";
import { syntheticLayout } from "../../fixtures/synthetic/layout";

export interface TestEnv {
  db: Db;
  services: Services;
  userIds: string[];
  advance: (ms: number) => void;
  cleanup: () => void;
}

/** 暫存 SQLite（真的跑過 drizzle/ 的 migration）＋合成種子資料＋可控的時鐘。 */
export async function createTestEnv(): Promise<TestEnv> {
  const dir = mkdtempSync(join(tmpdir(), "travel-budget-test-"));
  const db = openDb(join(dir, "test.db"));
  migrateDb(db);
  let nowMs = Date.UTC(2031, 0, 1, 0, 0, 0);
  const { userIds } = await seedSynthetic(db, new Date(nowMs));
  if (userIds.length !== DEMO_USERS.length) throw new Error("種子帳號數量不符");
  const services = createServices({
    db,
    now: () => new Date(nowMs),
    exportLayout: () => ({ layout: syntheticLayout, source: "example" }),
  });
  return {
    db,
    services,
    userIds,
    advance: (ms) => {
      nowMs += ms;
    },
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
