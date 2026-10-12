// pre-push：執行 config.mjs 的 PRE_PUSH_COMMANDS（pnpm check）。
import { PRE_PUSH_COMMANDS } from "./config.mjs";
import { readFileSync } from "node:fs";
import { PROJECT_ROOT, runCommand, runShadowedHook, stripGitEnv } from "./lib.mjs";
import { ToolchainMissingError, resolveCommand } from "./runner.mjs";

const env = stripGitEnv(process.env);

// pre-push 的 stdin 是要推送的 ref 清單，原樣轉給被蓋掉的全域 hook。
const refs = process.stdin.isTTY ? "" : readFileSync(0, "utf8");
const shadowed = runShadowedHook("pre-push", { env, input: refs });
if (shadowed && shadowed.status !== 0) {
  process.stderr.write(`pre-push: 全域 hook 未通過（${shadowed.hook}），已擋下 push。\n`);
  process.exit(1);
}
for (const command of PRE_PUSH_COMMANDS) {
  process.stderr.write(`pre-push: $ ${command}\n`);
  let actual;
  try {
    actual = resolveCommand(command, { env });
  } catch (error) {
    if (!(error instanceof ToolchainMissingError)) throw error;
    process.stderr.write(`pre-push: 無法執行：${error.message}\n`);
    process.exit(1);
  }
  const { status } = runCommand(actual, { cwd: PROJECT_ROOT, env });
  if (status !== 0) {
    process.stderr.write(`pre-push: \`${command}\` 失敗（結束碼 ${status}），已擋下 push。\n`);
    process.exit(1);
  }
}
process.stderr.write("pre-push: pass\n");
