---
name: excel-layout-mapping
description: 舊版 Excel 的版面變了、搬遷匯入失敗、列標籤對不上、要調整匯出欄位或版面時使用。例如「匯入說找不到列標籤」「golden 對不上」「Excel 多了一列／少了一列／欄位移位」「OA 上傳欄名要改」「匯出的 Super table 版面要改」。
---

# Excel 版面對照（匯入與匯出一起改）

App 是唯一資料來源。Excel 匯入只用於本機一次性搬遷與黃金測試的讀取；匯出照舊版面（Input、Super table_NN、Projects Summary、OA Upload_All）。匯入與匯出共用同一份版面定義，所以舊版面有變時，**兩邊要一起改**。

## 版面定義放哪裡

| 內容 | 位置 | 進 git？ |
|---|---|---|
| 真實列標籤、OA 欄名、LOB 清單、Input 靜態文字 | `local-data/excel-layout.json`（schema：`src/domain/layout.ts`） | 否 |
| 虛構範例（結構相同、文字虛構） | `tests/fixtures/synthetic/excel-layout.json` | 是 |
| 通用文字（Project Code、Phase 等 Input 列標籤） | `INPUT_LABELS`，在 `src/domain/layout.ts` | 是 |
| 列欄位置、標題、Stage 欄組 | `src/export/`（`common.ts`、`super-table.ts`、`summary.ts`、`oa-sheet.ts`、`input-sheet.ts`）與 `src/import/excel.ts` | 是 |

## 步驟

1. 跑檢查腳本看差異：`mise exec -- pnpm exec tsx scripts/excel-inspect.ts [活頁簿路徑]`。它列出各工作表的標籤、合併儲存格、公式樣本，並與 layout 比對「新增／缺少／移位」；有差異結束碼為 1。
2. 雙重確認：把 inspect 的結果和**實際打開活頁簿**看到的對一遍（標籤文字、列號、欄名）。兩者不一致時停下來，不要憑其中一邊修改。
3. 只改該改的地方：
   - 只是標籤文字、列位置、OA 欄名、LOB 清單變了：改 `local-data/excel-layout.json`，必要時同步改範例檔的對應欄位（文字保持虛構）。
   - 欄位定義或版面結構變了（欄位增減、順序、標題）：改 `src/export/` 的對應檔，**同時**改 `src/import/excel.ts` 的讀取，以及 `tests/fixtures/synthetic/workbook.ts`（合成活頁簿要跟著變）。
4. 跑 `mise exec -- pnpm test:golden` 與 `mise exec -- pnpm check`，兩個都要綠。
5. 用 show-me 報告呈現：差異清單（只寫類型與位置，不貼真實標籤）、改了哪些檔、兩個指令的結果。

## 紅線

- 真實標籤（可能含公司或地點縮寫）只放 `local-data/`；不得寫進程式碼、測試、範例、commit 訊息、issue 或 PR。inspect 的輸出可能含真實標籤，只留在本機終端機。
- 不得為了讓測試通過而修改 `tests/golden/` 或其期望值。對不上代表引擎、匯入、匯出有錯，或發現 Excel 的隱藏規則：停下來用 `NEEDS_DECISION` 回報（哪個工作表、哪格、期望值、實際值、推測原因）。
- 匯出的 OA Upload_All 欄位與順序必須與原 Excel 完全一致（下游人工上傳依此欄序）；要改欄序必須先由人確認下游。
- 範例 layout 與合成活頁簿的文字一律虛構；不得因為方便而複製真實標籤。
- 不修改 `.claude/skills/`（由 `pnpm skills:sync` 同步）。

## 回報

遵守 AGENTS.md 與 `docs/collaboration.md`：終止狀態只有 `READY_FOR_REVIEW`、`BLOCKED`、`NEEDS_DECISION`。回報附上 inspect 前後的差異摘要、`pnpm test:golden` 與 `pnpm check` 的實際輸出尾段，以及未解決的差異。
