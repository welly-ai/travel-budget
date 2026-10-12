// 讓 show-me 能拍到「版本衝突」畫面：等到有人登入（sessions 多一筆），再過幾秒替 SYN02 另存一版。
// 用法：先啟動這支，再執行 show-me:capture。參數是「要等第幾次登入」：
//   只拍衝突那張：pnpm exec tsx scripts/demo-conflict.ts 1，然後 pnpm show-me:capture --only project-conflict --summary "…"
//   整輪都拍（衝突是第 4 個要登入的項目）：pnpm exec tsx scripts/demo-conflict.ts 4，然後 pnpm show-me:capture --summary "…"
// 只改本機示範資料庫，用小美的身分存檔。
import { eq } from "drizzle-orm";
import { databasePath, migrateDb, openDb, schema } from "../src/db";
import { createServices } from "../src/server/projects";
import { defaultExportLayout } from "../src/server/context";

const DELAY_MS = 6000;
const TIMEOUT_MS = 120_000;

async function main(): Promise<void> {
  const db = openDb(databasePath());
  migrateDb(db);
  const services = createServices({ db, now: () => new Date(), exportLayout: defaultExportLayout });
  const mina = db.select().from(schema.users).where(eq(schema.users.email, "mina@example.com")).get();
  if (mina === undefined) throw new Error("找不到示範帳號 mina@example.com，請先 pnpm db:seed");

  const logins = Number(process.argv[2] ?? "1");
  if (!Number.isInteger(logins) || logins < 1) throw new Error("參數必須是 1 以上的整數（要等第幾次登入）");
  const startCount = db.select().from(schema.sessions).all().length;
  console.log(`等待第 ${logins} 次登入…（目前 ${startCount} 個 session，${TIMEOUT_MS / 1000} 秒內沒人登入就放棄）`);
  const deadline = Date.now() + TIMEOUT_MS;
  while (db.select().from(schema.sessions).all().length < startCount + logins) {
    if (Date.now() > deadline) throw new Error("逾時，沒有人登入");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  const record = services.getProject({ projectCode: "SYN02" });
  const next = services.updateProject({
    projectCode: "SYN02",
    expectedVersion: record.version,
    settings: { ...record.config, includeTld: !record.config.includeTld },
    actorId: mina.id,
  });
  console.log(`已替 SYN02 另存第 ${next.version} 版（小美）`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
