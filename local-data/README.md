# local-data

放真實公司資料的本機資料夾。除了這個 README，其他內容都被 `.gitignore` 擋住，**不會進版控**：公司名、廠區名與真實數字不得提交，也不得貼進 issue、PR、commit 訊息或測試檔名（見 AGENTS.md「資料分級」）。

## 放什麼

目前只有一個檔案：

```
local-data/travel-budget-tool.xlsx
```

這是原本的 Travel Budget Tool 活頁簿（含 Input、Input_Manual_Adjust、Guidance、Mapping、Super table_01..15、Projects Summary、OA Upload_All、Validation 分頁）。黃金測試會讀它的公式快取值，所以檔案必須是 Excel 存檔過、已計算完成的版本。

另外兩個本機檔案：

```
local-data/excel-layout.json      # 真實列標籤、OA 欄名、LOB 清單、Input 靜態文字（schema：src/domain/layout.ts）
local-data/exported-sample.xlsx   # 黃金測試匯出的範例檔，每次跑 pnpm test:golden 會重新產生
```

`excel-layout.json` 缺少時，匯入、golden、excel-inspect 都會明確失敗並指出範例位置：`tests/fixtures/synthetic/excel-layout.json`（虛構標籤，結構相同）。活頁簿版面有變時，用 `mise exec -- pnpm exec tsx scripts/excel-inspect.ts` 看差異，流程見 `.agents/skills/excel-layout-mapping/SKILL.md`。

## 為什麼不進 git

活頁簿裡有真實的專案代號、廠區與人天數字。這個 repo 的程式碼與測試都只能用合成資料（`tests/fixtures/synthetic/`），真實資料只在本機驗證用。

## 黃金測試怎麼跑

```
mise exec -- pnpm test:golden
```

黃金測試做三件事：

1. 用 `src/import` 讀這個活頁簿，得到參考資料與各專案設定。
2. 用 `src/engine` 重新計算每個有填的專案。
3. 匯出再讀回，逐格比對原活頁簿的 Input、Super table、Projects Summary、OA Upload_All（證明匯出「長得一樣、數字一樣」）。
4. 逐格比對 Excel 的快取值：Super table 每個 Function × Stage 的 Man／Days／Total 與各層小計、OA Upload_All 中 Include?=Y 的列、Validation 的 56 組 guidance 總人天、Projects Summary 的 LOB 彙整。

找不到檔案時測試會明確失敗並說明放置位置，不會略過。對不上時不要調整期望值：代表引擎有錯，或發現了 Excel 的隱藏規則，請回報差異（哪案、哪格、期望值、實際值）。

浮點比對使用 1e-9 的相對容差；guidance 都是整數，只有加權平均天數會有小數。

## 檔案範圍的限制

- 目前活頁簿只有少數專案有資料，沒走到的路徑（pre A／TLD 開啟、多數 Adder、例外調整）要靠 `tests/unit/` 的合成資料覆蓋。取得更完整的活頁簿時，直接換掉這個檔案再跑一次黃金測試。
