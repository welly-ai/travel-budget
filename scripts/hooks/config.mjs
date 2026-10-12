// Stop 關卡要執行的指令：全專案唯一來源（docs/hooks.md）。
// 開頭的 `node` 用執行 hook 的 node、`pnpm` 由 runner.mjs 解析（不假設 PATH 上有 pnpm）。
// 一行一個指令，依序在專案根目錄執行，任何一個失敗就擋下。
export const STOP_GATE_COMMANDS = ["node scripts/skills-sync.mjs --check", "pnpm check"];

// pre-push 執行的指令。
export const PRE_PUSH_COMMANDS = ["pnpm check"];
