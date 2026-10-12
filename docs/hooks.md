# Hooks 規格

Hooks 是「AI 寫錯時自動擋下」的機制。這份文件是規格，實作在 `scripts/hooks/`，設定在 `.claude/settings.json`（Claude Code）與 `.codex/hooks.json`（Codex）。兩邊呼叫的是同一支 Node 腳本，只有輸入輸出格式由轉接層處理。

設計原則：

- **確定性**：只檢查能用程式判斷的事，不做 LLM 判斷。
- **快**：Stop 關卡目標 60 秒內；PreToolUse 目標 1 秒內。
- **擋下時說清楚**：訊息要寫出「哪條規則、為什麼、該怎麼做」，讓 agent 能自己修正。
- **跨平台**：全部用 Node 寫，在原生 Windows、macOS、Linux 都能跑；不依賴 bash、jq、symlink。
- **設定檔存在，不等於已生效**：每個 hook 都要在真正的 Claude Code 和 Codex 裡實際觸發一次，才算驗證完成。

## Agent hooks

| 事件 | 觸發時機 | 規則 | 擋下時的訊息重點 |
|---|---|---|---|
| Stop | agent 要結束這一輪時 | 執行 `pnpm check`（型別、lint、unit 測試），以及 skills 複本一致性檢查。失敗就擋下，不讓 agent 結束 | 列出失敗的指令與最後幾行輸出 |
| PreToolUse（指令） | 執行 shell 指令前 | 擋 `git add -A`、`git add .`、`git add --all` | 「請明確指定要 stage 的檔案」 |
| PreToolUse（指令） | 同上 | 擋 `--no-verify`、`git push --force`／`-f` 到 `main` | 「不得跳過 git hooks／改寫 main 歷史」 |
| PreToolUse（檔案寫入） | 修改或建立檔案前 | 擋寫入 `tests/golden/**`、`local-data/**`、`.claude/skills/**` | golden：「黃金測試由人維護，對不上請回報 NEEDS_DECISION」；skills：「請改 `.agents/skills/` 後執行 `pnpm skills:sync`」 |

規則：

- Stop 關卡在工作區乾淨時也會執行，所以剛 commit 完也一樣會被檢查。
- 找不到設定或腳本時要擋下，不可以默默放行。
- 只有由啟動環境設定 `AGENT_QUALITY_GATE_DISABLED=1` 時才能略過，且要在回報中寫明。
- 需要人修改黃金測試時，由人自己編輯，或在啟動環境設定 `ALLOW_GOLDEN_EDIT=1`；agent 不可以自己設定這個變數。

## Git hooks

透過 `node scripts/install-git-hooks.mjs` 安裝。它只設定**這個 repo 的** `core.hooksPath=.githooks`，不碰全域設定。hook 檔是 `#!/bin/sh` 加上一行 `exec node ...`；Git for Windows 本身附有 sh，所以原生 Windows 也能執行。

| Hook | 規則 |
|---|---|
| pre-commit | `git diff --cached --check`；staged 檔案中不得有 `local-data/`、`.xlsx`（合成 fixture 除外）、`.db`；skills 複本一致 |
| pre-push | `pnpm check` |

## CI

`.github/workflows/` 在 GitHub 代管的 runner 上跑 `pnpm check`，**不跑黃金測試**（CI 上沒有真實資料）。
