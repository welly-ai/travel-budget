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
| Stop（show-me） | `pnpm check` 通過之後 | 若 `src/app/**`、`src/components/**` 或 `show-me.config.json` 在最新一輪截圖之後有修改（比對檔案修改時間與 `.review/rounds/*/round.json` 的建立時間），就擋下，要求執行 `pnpm show-me:capture --summary "..."` 開新一輪，並把看板網址交給使用者。沒有 `show-me.config.json` 時不檢查 | 「UI 有變更但還沒截圖給使用者看」，附上指令 |
| PreToolUse（指令） | 執行 shell 指令前 | 擋 `git add -A`、`git add .`、`git add --all` | 「請明確指定要 stage 的檔案」 |
| PreToolUse（指令） | 同上 | 擋 `--no-verify`、`git push --force`／`-f` 到 `main` | 「不得跳過 git hooks／改寫 main 歷史」 |
| PreToolUse（檔案寫入） | 修改或建立檔案前 | 擋寫入 `tests/golden/**`、`local-data/**`、`.claude/skills/**` | golden：「黃金測試由人維護，對不上請回報 NEEDS_DECISION」；skills：「請改 `.agents/skills/` 後執行 `pnpm skills:sync`」 |

規則：

- Stop 關卡在工作區乾淨時也會執行，所以剛 commit 完也一樣會被檢查。
- 找不到設定或腳本時要擋下，不可以默默放行。
- 只有由啟動環境設定 `AGENT_QUALITY_GATE_DISABLED=1` 時才能略過，且要在回報中寫明。
- Stop 若是被上一次擋下後的續跑（payload 的 `stop_hook_active` 為 true），一律放行，避免無窮迴圈。Claude 與 Codex 行為相同。
- 需要人修改黃金測試時，由人自己編輯，或在啟動環境設定 `ALLOW_GOLDEN_EDIT=1`；agent 不可以自己設定這個變數。

## 實作

```
scripts/hooks/
  config.mjs            Stop 關卡與 pre-push 要跑的指令（全專案唯一來源）
  rules.mjs             PreToolUse 規則（純函式）：指令、檔案路徑、Codex apply_patch 解析
  gate.mjs              Stop 關卡
  showme.mjs            Stop（show-me）規則
  runner.mjs            指令解析：node、pnpm 的取得方式
  adapter.mjs           Claude／Codex 共用的 stdin／stdout 轉接
  claude-{stop,pretooluse}.mjs, codex-{stop,pretooluse}.mjs   四個入口，載入失敗時一律擋下
  git-pre-commit.mjs, git-pre-push.mjs, staged.mjs
scripts/skills-sync.mjs  skills 複本同步與 --check
```

- **指令來源**：只改 `scripts/hooks/config.mjs`。開頭的 `node` 會換成執行 hook 的那支 node；`pnpm` 依序嘗試 PATH 上的 pnpm（Windows 為 `pnpm.cmd`）、`corepack pnpm`、`mise exec -- pnpm`。都找不到時擋下，並說明「無法執行」，與「檢查失敗」區分。
- **輸出格式**：Claude 與 Codex 的官方格式相同。Stop 擋下為 `{"decision":"block","reason":"..."}`，通過為 `{}`；PreToolUse 拒絕為 `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}`；皆以結束碼 0 輸出。
- **專案根目錄**：由腳本自己的位置推得，不依賴環境變數。
- **設定檔呼叫方式**：Claude 用 `"command": "node", "args": ["${CLAUDE_PROJECT_DIR}/scripts/hooks/..."]`（不經 shell）；Codex 用 `node scripts/hooks/...`，沒有專案根目錄變數，所以 Codex 必須從專案根目錄啟動。
- **工具名稱**：Claude 的檔案寫入工具是 `Write`、`Edit`、`MultiEdit`、`NotebookEdit`（`tool_input.file_path`／`notebook_path`）；Codex 是 `apply_patch`，路徑在 `tool_input.command` 的 patch 文字（`*** Add File:`、`*** Update File:`、`*** Delete File:`、`*** Move to:`，相對於 payload 的 `cwd`）。路徑一律先正規化（反斜線、`C:/` 與 `C:\`、`..`、Windows 不分大小寫）再比對。
- **預設分支**：「預設分支」是 `main`、`master`，加上 `origin/HEAD` 指向的分支。`HEAD`、`@` 由入口注入的目前分支解析（規則本身維持純函式）。擋 force push（`-f`、`--force`、`--force-with-lease`、`+ref`、`--mirror -f`、`--repo=`）與刪除（`--delete`、`-d`、`:main`）；在功能分支 force push 放行。
- **受保護路徑與 symlink**：目標取最長的既存祖先做 realpath（Windows 用 `realpathSync.native`）再接回剩餘部分；比對用的根目錄包含腳本推得的路徑、real path、git toplevel，以及指向本專案時的 `CLAUDE_PROJECT_DIR`；相對路徑以 payload 的 `cwd` 為基準。
- **指令規則**：git 長選項接受前綴（`--no-verif`、`--forc`、`--al`），`git stage` 視同 `add`，`./`、`:/`、`'*'`、`$'.'` 算批次 stage，`-c core.hooksPath=` 覆寫算跳過 hooks，`commit -n` 只對 commit 算（`log -n 5`、`push -n` 放行）；支援陣列型 command 與 `shell` 工具；`bash -c`、`sh -lc`、`eval`、管線進 shell 會展開內層字串。
- **已知限制**：PreToolUse 只看 Bash／檔案寫入工具與簡單的引號感知切分，不是完整 shell parser。用 shell 重導向或指令改檔（例如 `echo > .claude/skills/x`）仍會放行，由 pre-commit 補位：`skills:check` 抓 skills 複本漂移、leak-check 抓敏感詞；`tests/golden/**` 與 `local-data/**` 的 staged 內容由 pre-commit 的 staged 規則攔下。單純 `echo` 印出批次 stage 文字會放行，但同樣文字放在 `bash -c` 內會被擋（刻意的誤判）。
- **Codex 與 `.agents/`**：一定要從 repo 根目錄啟動 Codex。workspace-write 沙盒依 Codex 設計，遞迴保護 `.agents/`、`.git`、`.codex` 為唯讀（與 cwd 無關）。要讓 Codex 改 skills（改完執行 `pnpm skills:sync`），依模式與平台：

  | 模式 | macOS | Windows | Linux |
  |---|---|---|---|
  | workspace-write | 啟動加 `--add-dir .agents` 可寫 | `--add-dir` 無效，不可寫 | 未測 |
  | 跳過核准（`--dangerously-bypass-approvals-and-sandbox`） | 可寫 | 可寫 | 未測 |

  Windows 若不想用跳過核准模式，skills 的修改交給 Claude Code。repo 內不要放相對路徑的 `writable_roots`（Windows 實測會讓整個沙盒無法寫入），所以專案不提供 `.codex/config.toml`。
- **Codex 啟用**：專案的 `.codex/` 要先被信任（專案 trust），hooks 要在 `/hooks` 核准一次；非互動測試可用 `-c 'projects={"<專案絕對路徑>"={trust_level="trusted"}}' --dangerously-bypass-hook-trust`。
- **env 隔離**：`hook` 測試每個案例自己建構乾淨的 env，不繼承 `AGENT_*`、`CLAUDE*`、`GIT_*`。

## Git hooks

透過 `node scripts/install-git-hooks.mjs` 安裝。它只設定**這個 repo 的** `core.hooksPath=.githooks`，不碰全域設定。hook 檔是 `#!/bin/sh` 加上一行 `exec node ...`；Git for Windows 本身附有 sh，所以原生 Windows 也能執行。

| Hook | 規則 |
|---|---|
| pre-commit | 先執行被本 repo 蓋掉的全域同名 hook（例如機器層的 secret scan）；`git diff --cached --check`；staged 檔案中不得有 `local-data/`、`.xlsx`（合成 fixture 除外）、`.db`；**防外洩**：staged 內容不得含 `local-data/sensitive-terms.txt` 裡的敏感詞（整個詞、不分大小寫；清單不存在時只提醒）；skills 複本一致 |
| pre-push | 先執行被蓋掉的全域同名 hook；再跑 `pnpm check` |

## CI

`.github/workflows/` 在 GitHub 代管的 runner 上跑 `pnpm check`，**不跑黃金測試**（CI 上沒有真實資料）。
