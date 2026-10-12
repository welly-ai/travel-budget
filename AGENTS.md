# Agent 指令

這是「差旅人天預算工具」：把原本的 Excel（Travel Budget Tool）改寫成自架的 web app。主要由一位規劃者建立各專案的預算，其他人事後修改或留言。Claude Code 和 Codex 都讀這份檔案；CLAUDE.md 只有一行 `@AGENTS.md`，Claude 專屬的內容才寫在那裡。

專有名詞（Phase、Class、Stage、Function、Adder、人次、人天、LOB、Guidance）的定義在 [GLOSSARY.md](GLOSSARY.md)。命名變數、函式、檔案時一律使用詞彙表裡的詞；詞彙表沒有的新概念，先補進詞彙表再寫程式。

## 指令

| 指令 | 用途 |
|---|---|
| `pnpm dev` | 本機開發伺服器 |
| `pnpm check` | 型別檢查、lint、unit 測試。**宣告完成前必須通過**，Stop hook 也會自動跑 |
| `pnpm test:golden` | 黃金測試：用 `local-data/` 的真實 Excel 比對計算結果。改到計算引擎、匯入或匯出時**必須手動跑**，並在回報中附上結果 |
| `pnpm skills:sync` | 把 `.agents/skills/` 複製到 `.claude/skills/` |
| `pnpm db:generate` | schema 變更後產生 migration |

只能用 pnpm。腳本一律用 Node 寫，不寫 bash：開發者會在原生 Windows 上工作。

## 架構紅線

```
src/domain   Zod schema 與型別，全專案唯一的資料定義來源
src/engine   計算引擎：純函式，只能 import domain
src/import   Excel／JSON → domain 物件（解析並驗證）
src/db       Drizzle schema、連線、migration
src/server   服務層：所有讀寫都在這裡，負責交易、樂觀鎖、修訂歷史、權限
src/app      Next.js 頁面與 API route（薄層，只呼叫 server）
src/mcp      MCP 工具定義（薄層，只呼叫 server）
```

1. **engine 是純函式。** 不碰資料庫、檔案、時間、亂數、網路。輸入一律是已驗證的 domain 物件，輸出是確定的結果。ESLint 會擋下違規的 import。
2. **一份 schema，處處共用。** 資料庫的 JSON 欄位、API 輸入、表單、MCP 工具參數，都從 `src/domain` 的 Zod schema 推導。不要在別處重新定義同樣的形狀。
3. **邊界一律驗證。** 外部進來的資料（請求、表單、上傳檔、MCP 參數、從資料庫讀出的 JSON 欄位）都必須先經過 Zod `parse` 才能使用。
4. **JSON 欄位要帶版本。** 每個 JSON 欄位的內容都有 `schemaVersion`；結構改變時要寫遷移函式，不要直接改舊資料的意義。
5. **樂觀鎖。** 修改專案時必須帶上讀取時的 `version`；版本對不上時丟 `ConflictError`，交給使用者決定，不可自動覆蓋。
6. **每次寫入都留修訂。** 專案的每次修改，在同一個交易裡寫一筆 `project_revisions`（完整快照、誰、何時）。
7. **介面層不碰資料庫。** `src/app` 和 `src/mcp` 只呼叫 `src/server`。
8. **MCP 只能產生草稿。** MCP 工具可以讀取、試算、驗證、存草稿；不能把草稿設為生效、不能刪除、不能改權限。這些動作只能由人在網頁上做。

## 型別規則

- `tsconfig` 已開最嚴格的選項，不要放寬。
- 禁止 `any`、`as` 型別斷言、非空斷言 `!`、`@ts-ignore`。真的需要時用 `@ts-expect-error` 並寫明原因。
- 有限集合用字面型別（例如 `Class`、`Stage`），不要用 `string`；`switch` 要窮舉。
- 不要用字串拼接當查詢鍵（原 Excel 的 `"Phase|Class|Stage|Function"` 與 `~OFF~` 哨兵值），改用有型別的物件。

## 資料分級

| 等級 | 位置 | 規則 |
|---|---|---|
| 真實公司資料 | `local-data/`（已 gitignore） | 不得提交、不得貼進 issue、PR、commit 訊息或測試檔名。公司名、廠區名、真實數字都算 |
| 合成資料 | `tests/fixtures/synthetic/` | 可提交；結構與真實資料相同，數值和名稱是虛構的 |

- **unit 測試**只用合成資料，每次 `pnpm check` 都跑，CI 也跑。
- **黃金測試**（`tests/golden/`）讀 `local-data/`。找不到資料時要明確失敗並說明如何放入，不可以默默跳過。
- **不准為了讓測試通過而修改黃金測試或其期望值。** 黃金測試和原 Excel 對不上，代表程式錯了，或發現了 Excel 的隱藏規則；這時停下來，用 `NEEDS_DECISION` 回報差異。PreToolUse hook 也會擋下對 `tests/golden/` 的修改。

## 工作方式

- 實作、修 bug：用 `bounded-build-loop` skill。新功能先用 `tdd` skill，以合成資料寫出會失敗的測試。
- 需求不清楚時：用 `grill-with-docs` skill 先問清楚，順便更新 GLOSSARY.md。
- 想先看 UI 長怎樣：用 `prototype` skill，做完丟掉，不要直接合進主線。
- 計算結果跟 Excel 對不上：用 `diagnosing-bugs` skill。
- 規劃、委派、回報、交接時讀 [協作規範](docs/collaboration.md)。終止狀態只有三種：`READY_FOR_REVIEW`、`BLOCKED`、`NEEDS_DECISION`。
- 新增或移動防護機制前，讀 [執行強度階梯](docs/enforcement-ladder.md)；hooks 的完整規格在 [docs/hooks.md](docs/hooks.md)。
- 涉及框架或套件的行為，先查官方文件和已安裝版本的原始碼（`node_modules/<pkg>`），再寫變通做法。

## Git

- 一次只 stage 指定的檔案；`git add -A`、`git add .`、`--all` 會被 hook 擋下。
- 不要用 `--no-verify` 跳過 git hooks，也不要 force push 到 `main`。
- `.claude/skills/` 是由 `pnpm skills:sync` 產生的複本，只改 `.agents/skills/`。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
