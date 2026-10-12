# 詞彙表（草稿）

命名變數、函式、檔案時一律使用這裡的詞。詞彙表沒有的新概念，先補進來再寫程式。
本檔只放通用定義，不放任何真實公司名、廠區名或數字（見 AGENTS.md「資料分級」）。

## 計算量

| 詞 | 定義 | 程式碼命名 |
|---|---|---|
| 人次（Man） | 出差的人數，同一人出差一次算一次。可為負（扣減）。 | `man` |
| 天數（Days） | 每人出差的天數。在彙總格子裡是「人天 ÷ 人次」的加權平均，人次為 0 時為 0。 | `days`；OA 欄位叫 `travelerDays` |
| 人天（Man-Days） | 人次 × 天數；彙總時逐筆相加後才得到，不先取平均，所以沒有四捨五入誤差。 | `manDays` |
| 數量 | 人次、天數、人天三個一組。 | `Quantity` |

## 專案分類

| 詞 | 定義 | 程式碼命名 |
|---|---|---|
| Phase | 專案的開發階段制度，只有 2 或 3 兩種。 | `Phase`、`phase` |
| Class | 專案等級：4、3.5、3、2。Guidance 沒有 Class 1 的資料。 | `ProjectClass`、`projectClass`（`class` 是保留字） |
| LOB | 產品線，用來彙總。是自由文字，不是封閉集合。 | `lob`、`LobSummary` |
| Gen | 專案所屬的世代標籤（例如年份加編號），純標註。 | `gen` |
| 部門代碼 | OA 上傳要帶的部門代碼，每個專案相同。 | `deptCode` |

## 階段與地點

| 詞 | 定義 | 程式碼命名 |
|---|---|---|
| Stage | 出差所屬的 build 階段，共 8 個：RFQ、pre A、A、B、C、TLD、Pre-MP、MP。 | `Stage`、`STAGES` |
| 選配 Stage | pre A 與 TLD 是選配，由專案設定決定是否計入 guidance。 | `includePreA`、`includeTld`、`isStageEnabled` |
| 出差地區／地點 | 每個 Stage 對應的出差地區與地點，屬於參考資料。 | `StageSite`、`travelArea`、`travelSite` |
| build 日期 | 專案各 Stage 的里程碑日期，ISO 日期字串。 | `buildDates` |
| Budgeted Period | build 日期所在月份（YYYY-MM），不跨月拆分。 | `budgetedPeriod` |

## Function 與開關

| 詞 | 定義 | 程式碼命名 |
|---|---|---|
| Function | 出差人員所屬的職能（例如設計、測試）。清單是參考資料，不是程式碼寫死的集合。 | `FunctionName`（品牌字串）、`FunctionDef` |
| Group | Function 的分組：Core、Support、Adder、Option。 | `Group`、`GROUPS` |
| Core／Support | 每個專案都計入的基本 Function。 | `kind: "BASE"` |
| Adder | 條件式追加的 Function，勾選對應開關才計入；部分 Adder 的 guidance 是負值（扣減）。 | `group: "Adder"` |
| Option | 選配的 Function 組：2nd PCB 一個開關控制四列，GPU 一個開關控制一列。 | `group: "Option"` |
| 開關（Gate） | 決定 Adder／Option 是否計入的 Y/N 設定。 | `GateKey`、`gates`、`FunctionGate`、`isFunctionEnabled` |

## 資料

| 詞 | 定義 | 程式碼命名 |
|---|---|---|
| Guidance | 基準人天資料庫：每個 (Phase, Class, Stage, Function) 的基準人次與天數。 | `GuidanceRow`、`ReferenceData.guidance` |
| 參考資料 | Guidance、Function 清單、Stage 出差地對照；guidance 改版只改這份資料。 | `ReferenceData` |
| 專案設定 | 一個專案的輸入：分類、開關、build 日期、例外調整。可存成 JSON，帶 `schemaVersion`。 | `ProjectConfig` |
| 例外調整 | 疊加在某個 Stage × Function 的人次與天數，用於 guidance 沒定義的出差（例如 RFQ）或臨時增減。不受開關與選配 Stage 限制。 | `ManualAdjustment`、`manualAdjustments` |
| 專案結果 | 一個專案的 Function × Stage 計算結果、Group 小計、Stage 合計與總計。 | `ProjectResult`、`FunctionResult`、`GroupSubtotal` |
| OA 列 | 上傳給 OA 的一列（一個 Stage × Function）。人天不為 0 才需要上傳。 | `OaRow`、`include` |
| 黃金測試 | 用真實 Excel 的快取值逐格比對引擎輸出的測試，資料只放本機。 | `tests/golden/` |
| 合成資料 | 結構與真實資料相同、數字與名稱虛構的測試資料，可提交。 | `tests/fixtures/synthetic/` |

## 匯出與版面

| 詞 | 定義 | 程式碼命名 |
|---|---|---|
| 版面設定 | 舊 Excel 的列標籤、OA 欄名、LOB 清單與 Input 靜態文字；匯入與匯出共用。真實內容只放本機。 | `ExcelLayout`、`excelLayoutSchema` |
| 匯出 | 從 App 產生照舊版面、只有數值的 xlsx；修改要回 App，匯出檔不會回寫。 | `exportProjectsWorkbook`、`ExportMeta` |

## 原 Excel 對照

| Excel 名稱 | 本專案 |
|---|---|
| Input／Input_Manual_Adjust | `ProjectConfig`（例外調整併入專案） |
| Guidance／Mapping | `ReferenceData` |
| Super table | `ProjectResult` |
| Projects Summary | `summarizeByLob`，專案層級彙總直接取 `ProjectResult.total` |
| OA Upload_All | `toOaRows` |
