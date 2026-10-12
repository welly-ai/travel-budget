import type ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { STAGES } from "@/domain";
import { calculateProject, toOaRows } from "@/engine";
import { exportProjectsWorkbook, type ExportMeta } from "@/export";
import { readWorkbookBuffer } from "@/import";
import { syntheticLayout } from "../fixtures/synthetic/layout";
import { syntheticProjects } from "../fixtures/synthetic/projects";
import { buildSyntheticReference } from "../fixtures/synthetic/reference";

const reference = buildSyntheticReference();
const results = syntheticProjects.map((config) => calculateProject(config, reference));
const meta: ExportMeta = {
  generatedAt: "2031-01-01T00:00:00.000Z",
  dataVersion: "data-v7",
  guidanceVersion: "guidance-v3",
  layout: syntheticLayout,
  layoutSource: "example",
  budgetYear: 2031,
};

async function exportAndRead(projects = syntheticProjects, computed = results, overrides: Partial<ExportMeta> = {}): Promise<ExcelJS.Workbook> {
  return readWorkbookBuffer(await exportProjectsWorkbook(projects, computed, reference, { ...meta, ...overrides }));
}

function sheetOf(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const sheet = workbook.getWorksheet(name);
  if (sheet === undefined) throw new Error(`匯出檔沒有工作表 ${name}`);
  return sheet;
}

function textOf(sheet: ExcelJS.Worksheet): string {
  const parts: string[] = [];
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (typeof cell.value === "string") parts.push(cell.value);
    });
  });
  return parts.join("\n");
}

describe("exportProjectsWorkbook：結構", () => {
  it("工作表順序：說明、Projects Summary、OA Upload_All、Input、每案一張 Super table；沒有內部頁", async () => {
    const workbook = await exportAndRead();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "說明",
      "Projects Summary",
      "OA Upload_All",
      "Input",
      "Super table_01",
      "Super table_02",
      "Super table_03",
      "Super table_04",
    ]);
  });

  it("沒有任何公式，只有數值與文字", async () => {
    const workbook = await exportAndRead();
    for (const sheet of workbook.worksheets) {
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          expect(typeof cell.value === "object" && cell.value !== null && "formula" in cell.value, `${sheet.name}!${cell.address}`).toBe(false);
        });
      });
    }
  });

  it("超過 15 案時工作表依序延伸，Input 往右、Super table 編號補零並可超過兩位數", async () => {
    const [first] = syntheticProjects;
    const [firstResult] = results;
    if (first === undefined || firstResult === undefined) throw new Error("合成專案不足");
    const many = Array.from({ length: 17 }, (_, index) => ({ ...first, projectCode: `M${index + 1}` }));
    const computed = many.map((config) => calculateProject(config, reference));
    const workbook = await exportAndRead(many, computed);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain("Super table_17");
    const input = sheetOf(workbook, "Input");
    expect(input.getCell("T5").value).toBe("P17"); // D 欄起第 17 欄 = T
    expect(input.getCell("T6").value).toBe("M17");
    const summary = sheetOf(workbook, "Projects Summary");
    expect(summary.getCell("C21").value).toBe("M17"); // 第 5 列起，第 17 案在第 21 列
  });
});

describe("exportProjectsWorkbook：OA Upload_All", () => {
  it("表頭與欄序完全照版面設定（20 欄）", async () => {
    const sheet = sheetOf(await exportAndRead(), "OA Upload_All");
    expect(syntheticLayout.oaHeaders).toHaveLength(20);
    syntheticLayout.oaHeaders.forEach((title, offset) => {
      expect(sheet.getCell(1, offset + 1).value).toBe(title);
    });
  });

  it("只輸出 include 的列，順序為專案、Stage、Function，欄位對應正確", async () => {
    const sheet = sheetOf(await exportAndRead(), "OA Upload_All");
    const expected = syntheticProjects.flatMap((config, index) => {
      const result = results[index];
      if (result === undefined) return [];
      return toOaRows(config, result, reference).filter((row) => row.include);
    });
    expect(sheet.rowCount).toBe(expected.length + 1);
    expected.forEach((row, offset) => {
      const r = offset + 2;
      expect(sheet.getCell(r, 1).value).toBe(row.deptCode);
      expect(sheet.getCell(r, 2).value ?? null).toBe(row.budgetedPeriod);
      expect(sheet.getCell(r, 3).value).toBe(row.projectCode);
      expect(sheet.getCell(r, 4).value).toBe(row.travelArea);
      expect(sheet.getCell(r, 5).value).toBe(row.travelSite);
      expect(sheet.getCell(r, 6).value).toBe(row.man);
      expect(sheet.getCell(r, 7).value).toBe(row.travelerDays);
      expect(sheet.getCell(r, 8).value).toBe(row.manDays);
      for (const feeColumn of [9, 10, 11, 12, 13]) expect(sheet.getCell(r, feeColumn).value ?? null).toBeNull();
      expect(sheet.getCell(r, 14).value).toBe(row.projectCode);
      expect(sheet.getCell(r, 15).value).toBe(row.stage);
      expect(sheet.getCell(r, 16).value).toBe(row.function);
      expect(sheet.getCell(r, 17).value).toBe(row.man);
      expect(sheet.getCell(r, 19).value).toBe(row.manDays);
      expect(sheet.getCell(r, 20).value).toBe("Y");
    });
  });

  it("沒有人天的列不會出現（Supp-NoGuidance 在沒有例外調整的專案裡不上傳）", async () => {
    const sheet = sheetOf(await exportAndRead(), "OA Upload_All");
    const rows: { code: unknown; fn: unknown }[] = [];
    sheet.eachRow((row, number) => {
      if (number > 1) rows.push({ code: row.getCell(3).value, fn: row.getCell(16).value });
    });
    expect(rows.some((row) => row.code === "SYN01" && row.fn === "Supp-NoGuidance")).toBe(false);
    expect(rows.some((row) => row.code === "SYN03" && row.fn === "Supp-NoGuidance")).toBe(true);
  });
});

describe("exportProjectsWorkbook：Super table", () => {
  it("每個 Function × Stage 的人次、天數、人天與結果一致；小計與 GRAND TOTAL 在 Function 之後", async () => {
    const workbook = await exportAndRead();
    syntheticProjects.forEach((config, index) => {
      const result = results[index];
      if (result === undefined) throw new Error("缺結果");
      const sheet = sheetOf(workbook, `Super table_0${index + 1}`);
      expect(sheet.getCell("A3").value).toBe(config.projectCode);
      result.functions.forEach((fn, offset) => {
        const row = 8 + offset;
        expect(sheet.getCell(row, 1).value).toBe(fn.function);
        expect(sheet.getCell(row, 2).value).toBe(fn.group);
        STAGES.forEach((stage, stageOffset) => {
          const column = 3 + stageOffset * 3;
          expect(sheet.getCell(row, column).value).toBe(fn.byStage[stage].man);
          expect(sheet.getCell(row, column + 1).value).toBe(fn.byStage[stage].days);
          expect(sheet.getCell(row, column + 2).value).toBe(fn.byStage[stage].manDays);
        });
        expect(sheet.getCell(row, 28).value).toBe(fn.total.man);
        expect(sheet.getCell(row, 29).value).toBe(fn.total.manDays);
      });
      const grand = 8 + result.functions.length + 4;
      expect(sheet.getCell(grand, 1).value).toBe("GRAND TOTAL");
      expect(sheet.getCell(grand, 29).value).toBe(result.total.manDays);
      expect(sheet.getCell(grand - 4, 1).value).toBe("Subtotal — Core");
    });
  });

  it("凍結窗格與數字格式", async () => {
    const sheet = sheetOf(await exportAndRead(), "Super table_01");
    expect(sheet.views[0]).toMatchObject({ state: "frozen", xSplit: 2, ySplit: 7 });
    expect(sheet.getCell("C8").numFmt).toContain("#,##0.0");
  });
});

describe("exportProjectsWorkbook：Input、Summary、說明", () => {
  it("Input 依版面設定放標籤與各專案欄，日期為日期、開關為 Y/N", async () => {
    const sheet = sheetOf(await exportAndRead(), "Input");
    expect(sheet.getCell("B6").value).toBe("Project Code");
    expect(sheet.getCell("B14").value).toBe(syntheticLayout.gateLabels.adsp);
    expect(sheet.getCell("C2").value).toBe("SYN-DEPT");
    expect(sheet.getCell("C3").value).toBe(2031);
    expect(sheet.getCell("D6").value).toBe("SYN01");
    expect(sheet.getCell("E10").value).toBe(3);
    expect(sheet.getCell("E15").value).toBe("Y"); // SYN02 的 hapticTp2
    expect(sheet.getCell("D15").value).toBe("N");
    expect(sheet.getCell("E28").value).toBeInstanceOf(Date); // SYN02 的 pre A 日期
    expect(sheet.getCell("D27").value ?? null).toBeNull(); // SYN01 沒填 RFQ 日期
  });

  it("Projects Summary：每案列、TOTAL 與依 LOB 彙整（固定清單在前，清單外的 LOB 附加在後）", async () => {
    const sheet = sheetOf(await exportAndRead(), "Projects Summary");
    expect(sheet.getCell("C5").value).toBe("SYN01");
    expect(sheet.getCell("X5").value).toBe(results[0]?.total.man);
    expect(sheet.getCell("Y5").value).toBe(results[0]?.total.manDays);
    expect(sheet.getCell("A20").value).toBe("TOTAL");
    const grandMan = results.reduce((sum, item) => sum + item.total.man, 0);
    expect(sheet.getCell("X20").value).toBe(grandMan);
    expect(sheet.getCell("A24").value).toBe("LOB One");
    expect(sheet.getCell("B24").value).toBe(2);
    expect(sheet.getCell("A25").value).toBe("LOB Two");
    expect(sheet.getCell("B25").value).toBe(2);
    expect(sheet.getCell("A26").value).toBe("LOB Three");
    expect(sheet.getCell("B26").value).toBe(0);
    expect(sheet.getCell("A27").value).toBe("合計");
    expect(sheet.getCell("B27").value).toBe(4);
  });

  it("Summary 遇到清單外的 LOB 時附加在後面而不是漏掉", async () => {
    const [first] = syntheticProjects;
    const [firstResult] = results;
    if (first === undefined || firstResult === undefined) throw new Error("合成專案不足");
    const odd = { ...first, projectCode: "ODD1", lob: "Unlisted LOB" };
    const sheet = sheetOf(await exportAndRead([odd], [calculateProject(odd, reference)]), "Projects Summary");
    expect(sheet.getCell("A27").value).toBe("Unlisted LOB");
    expect(sheet.getCell("B27").value).toBe(1);
    expect(sheet.getCell("A28").value).toBe("合計");
  });

  it("說明頁：產生時間、資料版本、Guidance 版本、不回寫的提醒，範例版面會註明", async () => {
    const sheet = sheetOf(await exportAndRead(), "說明");
    const all = textOf(sheet);
    expect(all).toContain("2031-01-01T00:00:00.000Z");
    expect(all).toContain("data-v7");
    expect(all).toContain("guidance-v3");
    expect(all).toContain("此檔修改不會回寫");
    expect(all).toContain("範例版面設定");
    const local = await exportAndRead(syntheticProjects, results, { layoutSource: "local" });
    expect(textOf(sheetOf(local, "說明"))).not.toContain("範例版面設定");
  });
});

describe("exportProjectsWorkbook：輸入檢查", () => {
  it("專案與結果數量不同時失敗", async () => {
    await expect(exportProjectsWorkbook(syntheticProjects, results.slice(1), reference, meta)).rejects.toThrow(/結果/);
  });

  it("結果與專案順序不一致時失敗", async () => {
    await expect(exportProjectsWorkbook(syntheticProjects, [...results].reverse(), reference, meta)).rejects.toThrow(/SYN01/);
  });

  it("相同輸入產生相同內容（可重現）", async () => {
    const a = await exportAndRead();
    const b = await exportAndRead();
    expect(a.worksheets.map((s) => s.getCell("A1").value)).toEqual(b.worksheets.map((s) => s.getCell("A1").value));
  });
});
