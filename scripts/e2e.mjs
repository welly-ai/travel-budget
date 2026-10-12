// pnpm test:e2e：用暫存資料庫與合成資料起一個獨立的伺服器（埠 3100），跑 Playwright 瀏覽器測試，結束後收掉。
// 不會動到你平常的資料庫和 pnpm dev（用另一個 .next-e2e 資料夾）。第一次需要 pnpm exec playwright install chromium。
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = process.env.E2E_PORT ?? "3100";
const baseUrl = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), "travel-budget-e2e-"));
const env = {
  ...process.env,
  DATABASE_PATH: join(dir, "e2e.db"),
  BETTER_AUTH_URL: baseUrl,
  NEXT_DIST_DIR: ".next-e2e",
  EXCEL_LAYOUT: "example",
  E2E_BASE_URL: baseUrl,
};
const shell = process.platform === "win32";

function stop(child) {
  if (child.pid === undefined) return;
  if (shell) spawnSync(`taskkill /pid ${child.pid} /T /F`, { shell: true, stdio: "ignore" });
  else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* 已經結束 */
    }
  }
}

let server;
let code = 1;
try {
  const seed = spawnSync("pnpm exec tsx scripts/db-seed.ts", { env, shell: true, stdio: "inherit" });
  if (seed.status !== 0) throw new Error("種子資料建立失敗");

  server = spawn(`pnpm exec next dev -H 127.0.0.1 -p ${PORT}`, { env, shell: true, stdio: "ignore", detached: !shell });
  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) break;
    } catch {
      /* 還沒起來 */
    }
    if (Date.now() > deadline) throw new Error(`伺服器 90 秒內沒有起來：${baseUrl}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const run = spawnSync("pnpm exec vitest run --project e2e", { env, shell: true, stdio: "inherit" });
  code = run.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  if (server) stop(server);
  rmSync(dir, { recursive: true, force: true });
}
process.exit(code);
