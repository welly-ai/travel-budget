// 用合成資料建立示範資料庫：node 經 tsx 執行，pnpm db:seed。
// 加 --reset 會清空現有資料再建立（會先印出要清掉哪個檔案）。
// 冪等：重複執行不會重複建立；預設容許範圍設定不論有沒有其他資料都會補上。
import { databasePath, migrateDb, openDb, schema } from "../src/db";
import { clearAllData, ensureDefaultToleranceProfile } from "../src/server/admin";
import { DEMO_PROJECT_CODES, DEMO_USERS, seedSynthetic } from "../tests/fixtures/synthetic/seed";

async function main(): Promise<void> {
  const reset = process.argv.includes("--reset");
  const path = databasePath();
  const db = openDb(path);
  migrateDb(db);

  const existing = db.select().from(schema.projects).all().length + db.select().from(schema.users).all().length;
  if (existing > 0 && !reset) {
    ensureDefaultToleranceProfile(db, new Date());
    console.log(`已確認預設容許範圍設定存在（${path}）`);
    console.log(`資料庫已有資料（${path}），沒有動它。要清掉重建請執行：pnpm db:seed -- --reset`);
    return;
  }
  if (reset) {
    console.log(`清空 ${path} 的所有資料`);
    clearAllData(db);
  }
  await seedSynthetic(db, new Date());
  console.log(`已建立示範資料：${path}`);
  console.log(`  專案：${DEMO_PROJECT_CODES.join("、")}`);
  for (const user of DEMO_USERS) console.log(`  帳號：${user.email} / ${user.password}（僅供本機示範）`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
