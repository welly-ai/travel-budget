// Claude Code / Codex 轉接層：只處理輸入輸出格式，規則在 rules.mjs 與 gate.mjs。
// 兩邊的 Stop 擋下格式與 PreToolUse 拒絕格式（官方文件）：
//   Stop:       {"decision":"block","reason":"..."}（exit 0）
//   PreToolUse: {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}
import { runStopGate } from "./gate.mjs";
import { PROJECT_ROOT, projectRoots, readStdin, realpathLoose } from "./lib.mjs";
import { currentBranch, defaultBranches, evaluatePreToolUse } from "./rules.mjs";

function parseJson(text) {
  if (text.trim() === "") return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: {} };
  }
}

/** 回傳要印到 stdout 的 JSON 物件。 */
export function stopResponse(rawInput, options = {}) {
  const parsed = parseJson(rawInput);
  const payload = typeof parsed.value === "object" && parsed.value !== null ? parsed.value : {};
  const result = runStopGate({ stopHookActive: payload.stop_hook_active === true, ...options });
  return result.block ? { decision: "block", reason: result.reason } : {};
}

/** 主機可能用的專案根目錄拼法：腳本自己的、real path、Git 的，以及指向本專案時的 CLAUDE_PROJECT_DIR。 */
function preToolUseRoots(env = process.env) {
  const roots = projectRoots(PROJECT_ROOT, env);
  // 環境變數指向別處時不採用（過期的變數不可擴大防護範圍）。
  if (env.CLAUDE_PROJECT_DIR && realpathLoose(env.CLAUDE_PROJECT_DIR).toLowerCase() === realpathLoose(PROJECT_ROOT).toLowerCase()) roots.push(env.CLAUDE_PROJECT_DIR);
  return [...new Set(roots)];
}

export function preToolUseResponse(rawInput, options = {}) {
  const parsed = parseJson(rawInput);
  const reason = parsed.ok
    ? evaluatePreToolUse(parsed.value, { root: preToolUseRoots(), env: process.env, realpath: realpathLoose, currentBranch, defaultBranches, ...options })
    : "PreToolUse hook 收到無法解析的 payload，已擋下。";
  if (!reason) return {};
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
}

export async function runStop() {
  process.stdout.write(`${JSON.stringify(stopResponse(await readStdin()))}\n`);
}

export async function runPreToolUse() {
  process.stdout.write(`${JSON.stringify(preToolUseResponse(await readStdin()))}\n`);
}
