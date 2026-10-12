import { describe, expect, it } from "vitest";
import { GROUPS, STAGES, type Quantity, type Stage } from "@/domain";
import { calculateAll, cached, cachedNumber, isClose, loadGolden, projectTables, sheetOf, superTableName } from "./support";

const context = await loadGolden();
const calculated = calculateAll(context);
const tables = projectTables(context, calculated);

// Super table 每個 Stage 佔三欄：Man、Days、Total days；起始欄 C、F、I、L、O、R、U、X。
const STAGE_FIRST_COLUMN: Record<Stage, number> = { RFQ: 3, "pre A": 6, A: 9, B: 12, C: 15, TLD: 18, "Pre-MP": 21, MP: 24 };
const FIRST_FUNCTION_ROW = 8;
const SUBTOTAL_FIRST_ROW = 8 + 32; // 列 40..43：Core、Support、Adder、Option 小計
const GRAND_TOTAL_ROW = 44;

function columnLetter(column: number): string {
  return String.fromCharCode(64 + column);
}

function compare(label: string, actual: Quantity, expected: Quantity, mismatches: string[]): void {
  const pairs: [string, number, number][] = [
    ["Man", actual.man, expected.man],
    ["Days", actual.days, expected.days],
    ["Total", actual.manDays, expected.manDays],
  ];
  for (const [name, a, e] of pairs) {
    if (!isClose(a, e)) mismatches.push(`${label} ${name}：期望 ${e}，實際 ${a}`);
  }
}

describe("Super table 逐格比對", () => {
  it("Input 有填的專案都被匯入，且每案對得到一張 Super table", () => {
    expect(tables.length).toBe(context.projects.length);
    expect(tables.length).toBeGreaterThan(0);
  });

  it("Function 清單與分組與每張 Super table 的 A、B 欄一致", () => {
    for (const { index } of tables) {
      const sheet = sheetOf(context.workbook, superTableName(index));
      context.reference.functions.forEach((def, offset) => {
        expect(cached(sheet, `A${FIRST_FUNCTION_ROW + offset}`), `${superTableName(index)} 列 ${FIRST_FUNCTION_ROW + offset}`).toBe(def.name);
        expect(cached(sheet, `B${FIRST_FUNCTION_ROW + offset}`)).toBe(def.group);
      });
    }
  });

  for (const { index, entry } of tables) {
    it(`${superTableName(index)}：Function × Stage 的 Man／Days／Total 與 Function 合計`, () => {
      const sheet = sheetOf(context.workbook, superTableName(index));
      const mismatches: string[] = [];
      entry.result.functions.forEach((fn, offset) => {
        const row = FIRST_FUNCTION_ROW + offset;
        for (const stage of STAGES) {
          const first = STAGE_FIRST_COLUMN[stage];
          const expected: Quantity = {
            man: cachedNumber(sheet, `${columnLetter(first)}${row}`),
            days: cachedNumber(sheet, `${columnLetter(first + 1)}${row}`),
            manDays: cachedNumber(sheet, `${columnLetter(first + 2)}${row}`),
          };
          compare(`${fn.function} @ ${stage}（${columnLetter(first)}${row}）`, fn.byStage[stage], expected, mismatches);
        }
        const total = fn.total;
        if (!isClose(total.man, cachedNumber(sheet, `AB${row}`))) mismatches.push(`${fn.function} 總人次（AB${row}）不符`);
        if (!isClose(total.manDays, cachedNumber(sheet, `AC${row}`))) mismatches.push(`${fn.function} 總人天（AC${row}）不符`);
      });
      expect(mismatches).toEqual([]);
    });

    it(`${superTableName(index)}：Group 小計與 GRAND TOTAL`, () => {
      const sheet = sheetOf(context.workbook, superTableName(index));
      const mismatches: string[] = [];
      const rows: { label: string; row: number; byStage: Record<Stage, Quantity>; total: Quantity }[] = [
        ...GROUPS.map((group, offset) => {
          const subtotal = entry.result.groups.find((item) => item.group === group);
          if (subtotal === undefined) throw new Error(`結果缺少 ${group} 小計`);
          return { label: `Subtotal ${group}`, row: SUBTOTAL_FIRST_ROW + offset, ...subtotal };
        }),
        { label: "GRAND TOTAL", row: GRAND_TOTAL_ROW, byStage: entry.result.byStage, total: entry.result.total },
      ];
      for (const { label, row, byStage, total } of rows) {
        for (const stage of STAGES) {
          const first = STAGE_FIRST_COLUMN[stage];
          compare(
            `${label} @ ${stage}（列 ${row}）`,
            byStage[stage],
            {
              man: cachedNumber(sheet, `${columnLetter(first)}${row}`),
              days: cachedNumber(sheet, `${columnLetter(first + 1)}${row}`),
              manDays: cachedNumber(sheet, `${columnLetter(first + 2)}${row}`),
            },
            mismatches,
          );
        }
        if (!isClose(total.man, cachedNumber(sheet, `AB${row}`))) mismatches.push(`${label} 總人次（AB${row}）不符`);
        if (!isClose(total.manDays, cachedNumber(sheet, `AC${row}`))) mismatches.push(`${label} 總人天（AC${row}）不符`);
      }
      expect(mismatches).toEqual([]);
    });
  }
});
