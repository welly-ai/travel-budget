import { describe, expect, it } from "vitest";
import { stageSchema, type OaRow } from "@/domain";
import { toOaRows } from "@/engine";
import { calculateAll, cached, cachedNumber, isClose, loadGolden, sheetOf } from "./support";

const context = await loadGolden();
const calculated = calculateAll(context);

const FIRST_ROW = 2;
const LAST_ROW = 1801; // 15 專案 × 120 列

interface ExpectedRow {
  row: number;
  period: string | null;
  projectCode: string;
  stage: OaRow["stage"];
  function: string;
  deptCode: string;
  travelArea: string;
  travelSite: string;
  man: number;
  travelerDays: number;
  manDays: number;
}

function readIncludedRows(): ExpectedRow[] {
  const sheet = sheetOf(context.workbook, "OA Upload_All");
  const rows: ExpectedRow[] = [];
  for (let row = FIRST_ROW; row <= LAST_ROW; row += 1) {
    if (cached(sheet, `T${row}`) !== "Y") continue;
    const period = cached(sheet, `B${row}`);
    rows.push({
      row,
      period: typeof period === "string" && period !== "" ? period : null,
      projectCode: String(cached(sheet, `C${row}`)),
      stage: stageSchema.parse(cached(sheet, `O${row}`)),
      function: String(cached(sheet, `P${row}`)),
      deptCode: String(cached(sheet, `A${row}`)),
      travelArea: String(cached(sheet, `D${row}`)),
      travelSite: String(cached(sheet, `E${row}`)),
      man: cachedNumber(sheet, `F${row}`),
      travelerDays: cachedNumber(sheet, `G${row}`),
      manDays: cachedNumber(sheet, `H${row}`),
    });
  }
  return rows;
}

describe("OA Upload_All 逐列比對（只比 Include?=Y）", () => {
  const expectedRows = readIncludedRows();
  const actualRows: OaRow[] = calculated.flatMap(({ config, result }) => toOaRows(config, result, context.reference).filter((row) => row.include));

  it("Excel 有 Y 列", () => {
    expect(expectedRows.length).toBeGreaterThan(0);
  });

  it("每一個 Y 列都在引擎輸出裡，欄位一致，且引擎沒有多出 Excel 沒有的列", () => {
    const mismatches: string[] = [];
    const unmatched = new Set<OaRow>(actualRows);
    for (const expected of expectedRows) {
      const actual = actualRows.find((row) => row.projectCode === expected.projectCode && row.stage === expected.stage && row.function === expected.function);
      const where = `OA 列 ${expected.row}（${expected.stage} / ${expected.function}）`;
      if (actual === undefined) {
        mismatches.push(`${where}：引擎輸出沒有這一列`);
        continue;
      }
      unmatched.delete(actual);
      if (actual.budgetedPeriod !== expected.period) mismatches.push(`${where} Budgeted Period：期望 ${String(expected.period)}，實際 ${String(actual.budgetedPeriod)}`);
      if (actual.deptCode !== expected.deptCode) mismatches.push(`${where} DeptCode 不符`);
      if (actual.travelArea !== expected.travelArea) mismatches.push(`${where} TravelArea 不符`);
      if (actual.travelSite !== expected.travelSite) mismatches.push(`${where} TravelSite 不符`);
      if (!isClose(actual.man, expected.man)) mismatches.push(`${where} 人次（F）：期望 ${expected.man}，實際 ${actual.man}`);
      if (!isClose(actual.travelerDays, expected.travelerDays)) mismatches.push(`${where} TravelerDays（G）：期望 ${expected.travelerDays}，實際 ${actual.travelerDays}`);
      if (!isClose(actual.manDays, expected.manDays)) mismatches.push(`${where} 人天（H）：期望 ${expected.manDays}，實際 ${actual.manDays}`);
    }
    for (const extra of unmatched) {
      mismatches.push(`引擎多出一列 ${extra.projectCode} / ${extra.stage} / ${extra.function}（Excel 的 OA 沒有，可能是樣板外的例外調整）`);
    }
    expect(mismatches).toEqual([]);
    expect(actualRows.length).toBe(expectedRows.length);
  });
});
