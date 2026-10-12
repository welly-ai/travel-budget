// Claude Code / Codex 轉接層：只處理輸入輸出格式，規則在 rules.mjs 與 gate.mjs。
// 兩邊的 Stop 擋下格式與 PreToolUse 拒絕格式（官方文件）：
//   Stop:       {"decision":"block","reason":"..."}（exit 0）
//   PreToolUse: {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}
import { runStopGate } from "./gate.mjs";
import { PROJECT_ROOT, readStdin } from "./lib.mjs";
import { evaluatePreToolUse } from "./rules.mjs";

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

export function preToolUseResponse(rawInput, options = {}) {
  const parsed = parseJson(rawInput);
  const reason = parsed.ok
    ? evaluatePreToolUse(parsed.value, { root: PROJECT_ROOT, env: process.env, ...options })
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
