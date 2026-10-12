// Stop 關卡：執行設定的指令，回傳「放行」或「擋下」與原因。協定格式由轉接層處理。
import { STOP_GATE_COMMANDS } from "./config.mjs";
import { PROJECT_ROOT, runCommand, stripGitEnv, tail } from "./lib.mjs";
import { checkShowMe } from "./showme.mjs";
import { ToolchainMissingError, nodeVersionWarning, resolveCommand } from "./runner.mjs";

/**
 * @param {{ stopHookActive?: boolean, env?: Record<string, string | undefined>, root?: string,
 *   commands?: readonly string[] | undefined, run?: typeof runCommand }} options
 * @returns {{ block: false } | { block: true, reason: string }}
 */
export function runStopGate(options = {}) {
  const { stopHookActive = false, env = process.env, root = PROJECT_ROOT, run = runCommand, resolve = resolveCommand } = options;
  // 明確傳入 undefined 代表「設定遺失」，要擋下；沒傳才用預設設定。
  const commands = "commands" in options ? options.commands : STOP_GATE_COMMANDS;
  // Stop 之後的續跑不可再觸發關卡，否則會無限迴圈。
  if (stopHookActive) return { block: false };
  if (env["AGENT_QUALITY_GATE_DISABLED"] === "1") return { block: false };
  // 缺設定一律擋下，不可默默放行。
  if (!Array.isArray(commands) || commands.length === 0) {
    return { block: true, reason: "品質關卡沒有設定任何指令（scripts/hooks/config.mjs 的 STOP_GATE_COMMANDS），已擋下。" };
  }
  const childEnv = stripGitEnv(env);
  const nodeWarning = nodeVersionWarning();
  if (nodeWarning) process.stderr.write(`quality-gate: 警告：${nodeWarning}\n`);
  for (const command of commands) {
    process.stderr.write(`quality-gate: $ ${command}\n`);
    let actual;
    try {
      actual = resolve(command, { env: childEnv });
    } catch (error) {
      if (!(error instanceof ToolchainMissingError)) throw error;
      // 工具鏈缺失與檢查失敗要分開說明；仍然擋下（不默默放行）。
      return { block: true, reason: `品質關卡無法執行：${error.message}` };
    }
    const { status, output } = run(actual, { cwd: root, env: childEnv });
    if (status !== 0) {
      return {
        block: true,
        reason: `品質關卡失敗：\`${command}\`（結束碼 ${status}）。請修正後重跑該指令。\n最後輸出：\n${tail(output)}`,
      };
    }
  }
  // pnpm check 通過之後才檢查 show-me（UI 有變更是否已截圖）。
  const showMe = options.showMe ?? checkShowMe;
  const showMeReason = showMe(root);
  if (showMeReason) return { block: true, reason: showMeReason };
  return { block: false };
}
