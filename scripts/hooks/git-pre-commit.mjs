// pre-commit：git diff --cached --check；staged 檔案不得含真實資料；skills 複本一致。
import { spawnSync } from "node:child_process";
import { PROJECT_ROOT, runCommand, runShadowedHook } from "./lib.mjs";
import { resolveCommand } from "./runner.mjs";
import { checkStagedPaths } from "./staged.mjs";

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

if (runCommand(resolveCommand("node scripts/skills-sync.mjs --check"), { cwd: PROJECT_ROOT, env }).status !== 0) failed = true;

if (failed) {
  process.stderr.write("pre-commit: 未通過，已擋下 commit。\n");
  process.exit(1);
}
process.stderr.write("pre-commit: pass\n");
