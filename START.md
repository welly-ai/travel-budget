# 從這裡開始（給 Angus）

**下一步：照「1. 跑起來」做完 7 步（約 15 分鐘），看到 `pnpm check` 全部通過，就可以開始做第一張 issue。**

## 這個分支有什麼、沒有什麼

`main` 是起點，資料定義和計算已經做好，畫面和資料庫要由你來做。

| 部分 | 狀態 |
|---|---|
| `src/domain` 資料定義（Phase、Class、Guidance、專案設定…） | 已完成 |
| `src/engine` 計算、`src/import` 讀 Excel、`src/export` 匯出舊版面 | 已完成，黃金測試和原 Excel 一致 |
| 自動檢查（`pnpm check`、git hooks、agent hooks）、show-me 回饋看板 | 已設定好 |
| `src/db` 資料庫、`src/server` 服務層、登入 | **還沒有，你要做** |
| 頁面（專案列表、專案頁…）、MCP | **還沒有，你要做** |

各層的分工規則寫在 `AGENTS.md` 的「架構紅線」：箭頭只能往下，頁面不能直接查資料庫。

## 1. 跑起來（Windows 原生，PowerShell）

第 0 步只需做一次：到 https://nodejs.org 裝 Node 24（LTS），到 https://git-scm.com 裝 Git for Windows，裝完重開 PowerShell。

1. 裝 pnpm：`npm install -g pnpm@10`
2. 取得程式：`git clone https://github.com/welly-ai/travel-budget.git`，再 `cd travel-budget`
3. 裝套件：`pnpm install`
4. 安裝 git hooks（只設定這個 repo）：`node scripts/install-git-hooks.mjs`
5. 跑檢查：`pnpm check`，要全部通過
6. 把原本的 Excel 放進 `local-data/`（檔名見 `local-data/README.md`），再跑 `pnpm test:golden`，要全部通過。這一步確認計算和 Excel 一致
7. 啟動：`pnpm dev`，用瀏覽器開 http://127.0.0.1:3000 。現在只會看到 Next.js 的預設首頁，這是正常的

## 2. 開工順序

issue 上的 `start-here` 標籤標出了順序，請一張一張做，每張都要合併後再做下一張：

1. 資料庫：建表與合成示範資料
2. 專案列表頁（唯讀）
3. 專案頁：改設定、即時試算（先不存檔）
4. 登入
5. 存檔：樂觀鎖與修訂紀錄

這 5 張做完，其他 issue（留言、修訂歷史頁、LOB 彙總…）才有地基。

## 3. 每一張 issue 怎麼做

1. **從 repo 根目錄啟動** Claude Code 或 Codex（hooks 依賴這一點）。
2. 跟 agent 說：「讀 AGENTS.md 和 START.md，幫我開分支做 issue #N」。
3. 做完叫 agent 跑 `pnpm check`、push、開 PR。PR 由審查的人合併，不要自己合併。
4. 被自動檢查擋下時，把錯誤訊息整段貼給 agent，它會照訊息修。不要用 `--no-verify` 跳過。

## 4. 參考答案

`example/demo-ui` 分支有一份做好的示範（資料庫、登入、專案頁、樂觀鎖、手動覆寫、容許範圍設定）。卡住時可以叫 agent「看 example/demo-ui 的 src/server/projects.ts 怎麼做」，**但不要整個分支合併進來**，也不要整份複製：照著 issue 的範圍自己做，才知道每一塊在做什麼。

## 5. 真實資料

- 真實 Excel 只放 `local-data/`，不進 git。
- 公司名、廠區名、真實數字不要貼進 issue、PR、commit 訊息或測試檔名。
- 測試一律用 `tests/fixtures/synthetic/` 的合成資料。
