import { describe, expect, it } from "vitest";
import { summarizeByLob } from "@/engine";
import { calculateAll, cached, cachedNumber, isClose, loadGolden, sheetOf } from "./support";

const context = await loadGolden();
const calculated = calculateAll(context);
const sheet = sheetOf(context.workbook, "Projects Summary");

// Projects Summary：列 24 起是「依 LOB 彙整」表（A=LOB、B=專案數、C=Total Man、D=Total Man-Days），LOB 清單是寫死的。
const FIRST_LOB_ROW = 24;

function readLobNames(): { row: number; lob: string }[] {
  const lobs: { row: number; lob: string }[] = [];
  for (let row = FIRST_LOB_ROW; row < FIRST_LOB_ROW + 20; row += 1) {
    const name = cached(sheet, `A${row}`);
    if (name === "合計") break;
    if (typeof name !== "string" || name === "") throw new Error(`Projects Summary!A${row} 預期是 LOB 名稱或「合計」，讀到 ${JSON.stringify(name)}`);
    lobs.push({ row, lob: name });
  }
  return lobs;
}

describe("Projects Summary：依 LOB 彙整", () => {
  const lobRows = readLobNames();
  const actual = summarizeByLob(calculated);

  it("Excel 的 LOB 表有列", () => {
    expect(lobRows.length).toBeGreaterThan(0);
  });

  it("每個 LOB 的專案數、總人次、總人天一致", () => {
    const mismatches: string[] = [];
    for (const { row, lob } of lobRows) {
      const found = actual.find((item) => item.lob === lob) ?? { lob, projectCount: 0, man: 0, manDays: 0 };
      if (found.projectCount !== cachedNumber(sheet, `B${row}`)) mismatches.push(`${lob} 專案數：期望 ${cachedNumber(sheet, `B${row}`)}，實際 ${found.projectCount}`);
      if (!isClose(found.man, cachedNumber(sheet, `C${row}`))) mismatches.push(`${lob} 總人次不符`);
      if (!isClose(found.manDays, cachedNumber(sheet, `D${row}`))) mismatches.push(`${lob} 總人天不符`);
    }
    expect(mismatches).toEqual([]);
  });

  it("合計列等於所有專案的專案數、總人次、總人天", () => {
    const totalRow = FIRST_LOB_ROW + lobRows.length;
    expect(cached(sheet, `A${totalRow}`)).toBe("合計");
    expect(actual.reduce((sum, item) => sum + item.projectCount, 0)).toBe(cachedNumber(sheet, `B${totalRow}`));
    expect(isClose(actual.reduce((sum, item) => sum + item.man, 0), cachedNumber(sheet, `C${totalRow}`))).toBe(true);
    expect(isClose(actual.reduce((sum, item) => sum + item.manDays, 0), cachedNumber(sheet, `D${totalRow}`))).toBe(true);
  });

  it("所有專案的 LOB 都在 Excel 的寫死清單內（否則 Excel 會靜默漏算）", () => {
    const known = new Set(lobRows.map((item) => item.lob));
    expect(actual.filter((item) => !known.has(item.lob)).map((item) => item.lob)).toEqual([]);
  });
});
