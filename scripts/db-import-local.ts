// 本機搬遷用：把 local-data 的真實活頁簿匯入資料庫。不在 CI 跑，也不要把產生的 .db 提交。
// 建議用獨立的資料庫檔，免得和示範資料混在一起：
//   DATABASE_PATH=data/local.db pnpm db:import-local
import { databasePath, migrateDb, openDb, schema } from "../src/db";
import { importWorkbookFile, loadExcelLayout } from "../src/import";
import { createGuidanceVersion, createProject, createUser } from "../src/server/admin";
import { DEMO_USERS } from "../tests/fixtures/synthetic/seed";

async function main(): Promise<void> {
  const WORKBOOK_PATH = "local-data/travel-budget-tool.xlsx";
  const path = databasePath();
  const db = openDb(path);
  migrateDb(db);

  const layout = loadExcelLayout();
  const imported = await importWorkbookFile(WORKBOOK_PATH, layout);
  const existingCodes = new Set(db.select({ code: schema.projects.code }).from(schema.projects).all().map((row) => row.code));
  const clashes = imported.projects.filter((config) => existingCodes.has(config.projectCode));
  const [firstClash] = clashes;
  if (firstClash !== undefined) {
    console.error(`錯誤：資料庫 ${path} 已有相同代碼的專案（例如 ${firstClash.projectCode}）。請改用空的資料庫：DATABASE_PATH=data/local.db pnpm db:import-local`);
    process.exit(1);
  }

  const now = new Date();
  const guidanceVersionId = createGuidanceVersion(db, { label: `從 Excel 匯入 ${now.toISOString().slice(0, 10)}`, reference: imported.reference }, now);
  for (const config of imported.projects) {
    createProject(db, { config, guidanceVersionId, status: "active", actorId: null }, now);
  }
  console.log(`已匯入 ${imported.projects.length} 個專案到 ${path}（專案數與代碼不印出，請在網頁上看）。`);
  if (db.select().from(schema.users).all().length === 0) {
    const demo = DEMO_USERS[0];
    await createUser(db, demo, now);
    console.log(`資料庫沒有帳號，已建立示範帳號：${demo.email} / ${demo.password}（僅供本機，用完請換掉）`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
