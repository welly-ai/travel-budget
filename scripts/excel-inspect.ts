// 檢查活頁簿的版面並與 excel-layout.json 比對。用法：
//   pnpm exec tsx scripts/excel-inspect.ts [活頁簿路徑] [--layout 版面設定路徑]
// 預設：local-data/travel-budget-tool.xlsx 與 local-data/excel-layout.json。
// 有差異（新增、缺少、移位、匯入錯誤）時結束碼為 1；讀不到檔案或版面設定為 2。
// 輸出可能含真實標籤，只在本機終端機看，不要貼進 issue、PR 或 commit 訊息。
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { z } from "zod";
import { ImportError, loadExcelLayout, parseWorkbook, readWorkbookFile } from "@/import";

const args = process.argv.slice(2);
const layoutFlag = args.indexOf("--layout");
const layoutPath = resolve(layoutFlag >= 0 ? (args[layoutFlag + 1] ?? "") : "local-data/excel-layout.json");
const positional = args.filter((arg, index) => !arg.startsWith("--") && (layoutFlag < 0 || index !== layoutFlag + 1));
const workbookPath = resolve(positional[0] ?? "local-data/travel-budget-tool.xlsx");

function plainText(cell: ExcelJS.Cell): string | undefined {
  const value = cell.type === ExcelJS.ValueType.Formula ? cell.result : cell.value;
  if (typeof value === "string") return value.trim() === "" ? undefined : value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && value !== null && "richText" in value && Array.isArray(value.richText)) {
    const parts: unknown[] = value.richText;
    const text = parts.map((part) => (typeof part === "object" && part !== null && "text" in part ? String(part.text) : "")).join("").trim();
    return text === "" ? undefined : text;
  }
  return undefined;
}

function describeSheet(sheet: ExcelJS.Worksheet): void {
  const merges = z.array(z.string()).parse(sheet.model.merges);
  console.log(`\n■ ${sheet.name}（${sheet.rowCount} 列 × ${sheet.columnCount} 欄，${sheet.state}）`);
  if (merges.length > 0) console.log(`  合併儲存格：${merges.slice(0, 20).join("、")}${merges.length > 20 ? ` …共 ${merges.length} 個` : ""}`);
  const samples: string[] = [];
  const labels: string[] = [];
  for (let row = 1; row <= Math.min(sheet.rowCount, 60); row += 1) {
    for (let column = 1; column <= Math.min(sheet.columnCount, 30); column += 1) {
      const cell = sheet.getCell(row, column);
      if (cell.type === ExcelJS.ValueType.Formula && samples.length < 3) samples.push(`${cell.address}: =${cell.formula}`);
      if (column <= 2 && labels.length < 12) {
        const text = plainText(cell);
        if (text !== undefined && cell.type !== ExcelJS.ValueType.Formula) labels.push(`${cell.address}=${text}`);
      }
    }
  }
  if (labels.length > 0) console.log(`  前幾個標籤（A、B 欄）：${labels.join(" | ")}`);
  for (const sample of samples) console.log(`  公式樣本 ${sample.slice(0, 140)}`);
}

function inputLabels(sheet: ExcelJS.Worksheet): Map<string, number> {
  const rows = new Map<string, number>();
  for (let row = 1; row <= sheet.rowCount; row += 1) {
    const cell = sheet.getCell(row, 2);
    if (cell.master.address !== cell.address) continue; // 合併儲存格的非左上角，值是繼承來的
    const text = plainText(cell);
    if (text !== undefined && !rows.has(text)) rows.set(text, row);
  }
  return rows;
}

async function load(): Promise<ExcelJS.Workbook | undefined> {
  try {
    return await readWorkbookFile(workbookPath);
  } catch (error: unknown) {
    console.error(`讀不到活頁簿：${workbookPath}\n${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

async function inspect(): Promise<number> {
  let layout;
  try {
    layout = loadExcelLayout(layoutPath);
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const workbook = await load();
  if (workbook === undefined) return 2;

  console.log(`活頁簿：${workbookPath}\n版面設定：${layoutPath}`);
  for (const sheet of workbook.worksheets) describeSheet(sheet);

  const differences: string[] = [];
  const input = workbook.getWorksheet("Input");
  if (input === undefined) {
    differences.push("缺少工作表 Input");
  } else {
    const actual = inputLabels(input);
    const baseline = new Map<string, number>();
    for (const cell of layout.inputTemplate) {
      const match = /^B([1-9][0-9]*)$/.exec(cell.address);
      if (match?.[1] !== undefined) baseline.set(cell.text.trim(), Number(match[1]));
    }
    const projectHeaders = new Set(["Item / 項目"]);
    for (const [label, row] of baseline) {
      const found = actual.get(label);
      if (found === undefined) differences.push(`Input 缺少標籤（layout 有、活頁簿沒有）：「${label}」原在第 ${row} 列`);
      else if (found !== row) differences.push(`Input 標籤移位：「${label}」layout 第 ${row} 列 → 活頁簿第 ${found} 列`);
    }
    for (const [label, row] of actual) {
      if (!baseline.has(label) && !projectHeaders.has(label)) differences.push(`Input 新增標籤（活頁簿有、layout 沒有）：「${label}」在第 ${row} 列`);
    }
  }

  const oa = workbook.getWorksheet("OA Upload_All");
  if (oa === undefined) {
    differences.push("缺少工作表 OA Upload_All");
  } else {
    layout.oaHeaders.forEach((expected, offset) => {
      const got = plainText(oa.getCell(1, offset + 1));
      if (got !== expected) differences.push(`OA Upload_All 第 ${offset + 1} 欄表頭：layout「${expected}」，活頁簿「${got ?? "（空白）"}」`);
    });
    const extra = plainText(oa.getCell(1, layout.oaHeaders.length + 1));
    if (extra !== undefined) differences.push(`OA Upload_All 在第 ${layout.oaHeaders.length + 1} 欄多出表頭「${extra}」`);
  }

  try {
    const imported = parseWorkbook(workbook, layout);
    console.log(`\n匯入檢查：通過（${imported.projects.length} 個專案、${imported.reference.functions.length} 個 Function、${imported.reference.guidance.length} 列 guidance）`);
  } catch (error: unknown) {
    if (error instanceof ImportError) {
      for (const issue of error.issues) differences.push(`匯入問題 ${issue.sheet}!${issue.cell}：${issue.message}`);
    } else {
      throw error;
    }
  }

  if (differences.length === 0) {
    console.log("\n與版面設定比對：無差異");
    return 0;
  }
  console.log(`\n與版面設定比對：${differences.length} 項差異`);
  for (const difference of differences) console.log(`  - ${difference}`);
  return 1;
}

inspect().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 2;
  },
);
