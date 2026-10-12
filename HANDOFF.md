# 交接：差旅人天預算工具（給 Angus）

**READY_FOR_REVIEW · 下一步：照下面「怎麼跑起來」做 8 步（約 15 分鐘），在瀏覽器登入看到專案列表，就代表環境沒問題。**

## 怎麼跑起來（Windows 原生，PowerShell）

第 0 步，只需做一次的工具（約 5 分鐘）：Node 24 與 Git。到 https://nodejs.org 裝 Node 24（LTS），到 https://git-scm.com 裝 Git for Windows。裝完重開 PowerShell。

1. 裝 pnpm：`npm install -g pnpm@10`
2. 取得程式：`git clone https://github.com/welly-ai/travel-budget.git` 然後 `cd travel-budget`
3. 切到示範分支：`git checkout example/demo-ui`
4. 裝套件：`pnpm install`
5. 安裝 git hooks（只設定這個 repo）：`node scripts/install-git-hooks.mjs`
6. 建立示範資料庫：`pnpm db:seed`
7. 啟動：`pnpm dev`，看到 Ready 後用瀏覽器開 http://127.0.0.1:3000
8. 登入（**僅供本機示範的帳號，不要用在任何對外環境**）：
   - `demo@example.com` ／ `demo-password-123`（示範使用者）
   - `mina@example.com` ／ `demo-password-456`（小美，測試「兩個人同時改」用）

出問題先看：`pnpm install` 失敗多半是 Node 版本不是 24（`node -v` 檢查）；登入後空白，確認第 6 步有執行過。要清掉重來：`pnpm db:seed -- --reset`。

可選：`.env.example` 複製成 `.env.local` 可以設定資料庫位置與 MCP 權杖；本機示範不用設。

## 現在能做什麼

| 路由 | 功能 |
|---|---|
| `/login` | email＋密碼登入；沒登入開任何頁面都會被導到這裡 |
| `/projects` | 專案列表：代碼、名稱、LOB、Phase、Class、總人天、最後修改者與時間 |
| `/projects/SYN01` | 專案頁：左邊改 Phase、Class、各 Adder／Option 開關、pre A／TLD、build 日期；右邊 Stage × Function 人天矩陣即時重算；「儲存」顯示版本號；兩人同時改時顯示「已被 ○○ 於 ○○ 修改」；「匯出 Excel（舊版面）」；下方最近 5 筆修訂 |
| `/api/projects/SYN01/export` | 匯出 Excel 的下載連結（要登入） |
| `/api/mcp` | MCP 端點（給 AI 工具用）。工具：`list_projects`、`calculate_budget`（只試算，不寫入）。要在 `.env.local` 設 `MCP_TOKEN`，用 `pnpm mcp:smoke` 檢查 |

示範專案是合成資料：SYN01、SYN02（生效中）、SYN03（草稿）。留言的資料表已建好，但畫面還沒做。

驗證指令：`pnpm check`（型別、lint、單元與整合測試）、`pnpm test:e2e`（真的開瀏覽器跑完整流程，第一次要 `pnpm exec playwright install chromium`）。

## 怎麼請 agent 加功能

1. **從 repo 根目錄啟動** Claude Code 或 Codex（hooks 依賴這一點）。
2. 先叫 agent 讀 `AGENTS.md`（架構紅線、型別規則、回報原則）與 `GLOSSARY.md`（專有名詞）。
3. 新功能用 `tdd` skill，需求不清楚用 `grill-with-docs`，想先看畫面用 `prototype`，計算與 Excel 對不上用 `diagnosing-bugs`。
4. 做完有畫面的變更，叫 agent 開 show-me 一輪：`pnpm show-me:capture --summary "…"`，你執行 `pnpm show-me` 開 http://127.0.0.1:8770 在截圖上標注，再說「我送出回饋了」。操作說明在 `tools/show-me/README.md`。要拍版本衝突畫面的步驟見 `scripts/demo-conflict.ts` 開頭。
5. Codex 注意：要先信任這個專案，hooks 在 `/hooks` 核准一次；Windows 的 workspace-write 沙盒改不了 `.agents/`，改 skills 交給 Claude Code。細節在 `docs/hooks.md`。
6. 一次只 stage 指定的檔案（不要用批次 stage 指令）、不要 `--no-verify`；`pnpm check` 沒過不會讓你 commit 或 push。
7. 結構速記：`src/domain`（資料定義）→ `src/engine`（計算）→ `src/db`（資料庫）→ `src/server`（所有讀寫）→ `src/app`／`src/mcp`（介面）。介面層不能直接碰資料庫。

## 真實資料

- 真實 Excel 放 `local-data/`（不進 git）。本機搬遷：`DATABASE_PATH=data/local.db pnpm db:import-local`，再 `DATABASE_PATH=data/local.db pnpm dev`（PowerShell 要先 `$env:DATABASE_PATH="data/local.db"`）。不要提交 `.db` 檔，不要把真實名稱貼進 issue 或 commit。
- 改到計算、匯入、匯出前後都要跑 `pnpm test:golden`。

## 待辦

都在 GitHub issues：https://github.com/welly-ai/travel-budget/issues 。標籤 `good-first-task` 適合先上手，`needs-decision` 要先跟柏緯確認需求。

## 已知限制

- 只有一種使用者角色，所有登入者都能改任何專案。
- 專案頁只能改設定；新增專案、改名稱與 LOB、例外調整、把草稿設為生效都還沒有畫面。
- 匯出的是已儲存的版本，不含畫面上未儲存的修改。
- 沒有金額計算（待需求確認）。
