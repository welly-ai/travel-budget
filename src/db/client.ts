import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

export const DEFAULT_DATABASE_PATH = "data/travel-budget.db";
export const MIGRATIONS_FOLDER = resolve(/*turbopackIgnore: true*/ process.cwd(), "drizzle");

export function databasePath(): string {
  return resolve(/*turbopackIgnore: true*/ process.cwd(), process.env["DATABASE_PATH"] ?? DEFAULT_DATABASE_PATH);
}

/**
 * 開啟 SQLite。連線設定寫在這裡，不要散到別處：
 * - WAL：讀寫不互相擋住，多人同時開頁面時不會卡。
 * - busy_timeout：碰到鎖時等 5 秒而不是立刻報錯。
 * - foreign_keys：SQLite 預設不檢查外鍵，必須每條連線打開。
 */
export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

/** 套用 drizzle/ 資料夾裡尚未執行的 migration。 */
export function migrateDb(db: Db): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

// 開發模式會重複載入模組，把連線掛在 globalThis 才不會每次熱更新都開新連線。
declare global {
  var __travelBudgetDb: Db | undefined;
}

/** 應用程式用的共用連線（第一次取用時開啟並套用 migration）。 */
export function getDb(): Db {
  if (globalThis.__travelBudgetDb === undefined) {
    const db = openDb(databasePath());
    migrateDb(db);
    globalThis.__travelBudgetDb = db;
  }
  return globalThis.__travelBudgetDb;
}
