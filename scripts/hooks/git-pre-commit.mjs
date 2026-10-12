// pre-commit：git diff --cached --check；staged 檔案不得含真實資料；skills 複本一致。
import { spawnSync } from "node:child_process";
import { PROJECT_ROOT, runCommand, runShadowedHook } from "./lib.mjs";
import { resolveCommand } from "./runner.mjs";
import { checkStagedPaths } from "./staged.mjs";
import { findSensitiveTerms, loadSensitiveTerms } from "./leak-check.mjs";

const env = process.env; // 保留 GIT_INDEX_FILE 等，讓 --cached 讀到這次 commit 的索引。
let failed = false;

const shadowed = runShadowedHook("pre-commit", { env });
if (shadowed && shadowed.status !== 0) {
  process.stderr.write(`pre-commit: 全域 hook 未通過（${shadowed.hook}）\n`);
  failed = true;
}

const check = runCommand("git diff --cached --check", { cwd: PROJECT_ROOT, env });
if (check.status !== 0) failed = true;

const staged = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
  cwd: PROJECT_ROOT,
  env,
  encoding: "utf8",
});
if (staged.status !== 0) {
  process.stderr.write("pre-commit: 無法取得 staged 檔案清單\n");
  failed = true;
} else {
  const problems = checkStagedPaths(staged.stdout.split("\0").filter(Boolean));
  for (const problem of problems) process.stderr.write(`pre-commit: ${problem}\n`);
  if (problems.length > 0) failed = true;
}

// 防外洩：staged 內容不得含本機敏感詞清單裡的詞（見 leak-check.mjs）。
const { terms, sources } = loadSensitiveTerms(PROJECT_ROOT);
if (sources.length === 0) {
  process.stderr.write("pre-commit: 提醒：找不到 local-data/sensitive-terms.txt 或 excel-layout.json，略過防外洩檢查\n");
} else if (staged.status === 0) {
  for (const path of staged.stdout.split("\0").filter(Boolean)) {
    const shown = spawnSync("git", ["show", `:${path}`], { cwd: PROJECT_ROOT, env, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
    if (shown.status !== 0 || shown.stdout.includes(0)) continue; // 讀不到或是二進位檔
    for (const hit of findSensitiveTerms(shown.stdout.toString("utf8"), terms)) {
      process.stderr.write(`pre-commit: ${path}:${hit.line} 含敏感詞「${hit.term}」（真實公司／客戶／廠區名稱只能放在 local-data/）\n`);
      failed = true;
    }
  }
}

if (runCommand(resolveCommand("node scripts/skills-sync.mjs --check"), { cwd: PROJECT_ROOT, env }).status !== 0) failed = true;

if (failed) {
  process.stderr.write("pre-commit: 未通過，已擋下 commit。\n");
  process.exit(1);
}
process.stderr.write("pre-commit: pass\n");
