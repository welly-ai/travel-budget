import type ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ImportError, type ImportIssue, parseWorkbook, readWorkbookBuffer } from "@/import";
import { syntheticProjects } from "../fixtures/synthetic/projects";
import { syntheticLayout } from "../fixtures/synthetic/layout";
import { buildSyntheticReference } from "../fixtures/synthetic/reference";
import { buildSyntheticWorkbook, GUIDANCE_FIRST_ROW, MANUAL_FIRST_ROW, MAPPING_FIRST_FUNCTION_ROW } from "../fixtures/synthetic/workbook";

const reference = buildSyntheticReference();

function build(): ExcelJS.Workbook {
  return buildSyntheticWorkbook(reference, syntheticProjects, syntheticLayout);
}

function sheetOf(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const sheet = workbook.getWorksheet(name);
  if (sheet === undefined) throw new Error(`測試用活頁簿沒有 ${name}`);
  return sheet;
}

function issuesOf(workbook: ExcelJS.Workbook): readonly ImportIssue[] {
  try {
    parseWorkbook(workbook, syntheticLayout);
  } catch (error: unknown) {
    if (error instanceof ImportError) return error.issues;
    throw error;
  }
  throw new Error("預期匯入失敗，但成功了");
}

function expectIssue(issues: readonly ImportIssue[], sheet: string, cell: string, messagePart: string): void {
  const hit = issues.find((issue) => issue.sheet === sheet && issue.cell === cell);
  expect(hit, `預期有 ${sheet}!${cell} 的問題，實際：${JSON.stringify(issues)}`).toBeDefined();
  expect(hit?.message).toContain(messagePart);
}

describe("parseWorkbook：成功路徑", () => {
  it("合成活頁簿匯入後，參考資料與專案設定與來源完全一致", () => {
    const imported = parseWorkbook(build(), syntheticLayout);
    expect(imported.reference).toEqual(reference);
    expect(imported.projects).toEqual(syntheticProjects);
  });

  it("寫成 xlsx 檔案再讀回來（真正走過 exceljs 的序列化）也一致", async () => {
    const buffer = await build().xlsx.writeBuffer();
    const reloaded = await readWorkbookBuffer(buffer);
    const imported = parseWorkbook(reloaded, syntheticLayout);
    expect(imported.reference).toEqual(reference);
    expect(imported.projects).toEqual(syntheticProjects);
  });

  it("Y／N 不分大小寫，數字以文字存放也接受（Excel 的比較行為）", () => {
    const workbook = build();
    const input = sheetOf(workbook, "Input");
    input.getCell("D14").value = "y";
    input.getCell("D10").value = "2";
    input.getCell("D11").value = "4";
    const imported = parseWorkbook(workbook, syntheticLayout);
    expect(imported.projects[0]?.gates.adsp).toBe(true);
    expect(imported.projects[0]?.phase).toBe(2);
    expect(imported.projects[0]?.projectClass).toBe(4);
  });

  it("開關儲存格是公式時讀快取結果", () => {
    const workbook = build();
    sheetOf(workbook, "Input").getCell("D14").value = { formula: '"Y"', result: "Y" };
    expect(parseWorkbook(workbook, syntheticLayout).projects[0]?.gates.adsp).toBe(true);
  });

  it("空白的 Y／N 視為 N", () => {
    const workbook = build();
    sheetOf(workbook, "Input").getCell("D14").value = null;
    expect(parseWorkbook(workbook, syntheticLayout).projects[0]?.gates.adsp).toBe(false);
  });

  it("沒有專案時仍可匯入參考資料", () => {
    const imported = parseWorkbook(buildSyntheticWorkbook(reference, [], syntheticLayout), syntheticLayout);
    expect(imported.projects).toEqual([]);
    expect(imported.reference).toEqual(reference);
  });
});

describe("parseWorkbook：Input 的錯誤訊息指出儲存格", () => {
  it("Phase 不是 2 或 3", () => {
    const workbook = build();
    sheetOf(workbook, "Input").getCell("E10").value = 5;
    expectIssue(issuesOf(workbook), "Input", "E10", "Phase");
  });

  it("Class 不在 4／3.5／3／2", () => {
    const workbook = build();
    sheetOf(workbook, "Input").getCell("F11").value = 1;
    expectIssue(issuesOf(workbook), "Input", "F11", "Class");
  });

  it("開關不是 Y 或 N", () => {
    const workbook = build();
    sheetOf(workbook, "Input").getCell("D14").value = "maybe";
    expectIssue(issuesOf(workbook), "Input", "D14", "maybe");
  });

  it("build 日期不是日期", () => {
    const workbook = build();
    sheetOf(workbook, "Input").getCell("E29").value = "next week";
    expectIssue(issuesOf(workbook), "Input", "E29", "build date");
  });

  it("LOB 空白", () => {
    const workbook = build();
    sheetOf(workbook, "Input").getCell("D8").value = null;
    expectIssue(issuesOf(workbook), "Input", "D8", "LOB");
  });

  it("有資料但 Project Code 空白", () => {
    const workbook = build();
    sheetOf(workbook, "Input").getCell("E6").value = null;
    expectIssue(issuesOf(workbook), "Input", "E6", "Project Code");
  });

  it("Project Code 重複", () => {
    const workbook = build();
    sheetOf(workbook, "Input").getCell("F6").value = "SYN01";
    expectIssue(issuesOf(workbook), "Input", "F6", "重複");
  });

  it("列標籤被改掉時，指出找不到哪個標籤", () => {
    const workbook = build();
    sheetOf(workbook, "Input").getCell("B14").value = "Adder_Renamed";
    expect(issuesOf(workbook).some((issue) => issue.sheet === "Input" && issue.message.includes(syntheticLayout.gateLabels.adsp))).toBe(true);
  });

  it("一次回報所有問題，而不是只回報第一個", () => {
    const workbook = build();
    const input = sheetOf(workbook, "Input");
    input.getCell("D10").value = 9;
    input.getCell("E14").value = "x";
    const issues = issuesOf(workbook);
    expectIssue(issues, "Input", "D10", "Phase");
    expectIssue(issues, "Input", "E14", "x");
  });

  it("錯誤訊息（ImportError.message）含 sheet 與儲存格", () => {
    const workbook = build();
    sheetOf(workbook, "Input").getCell("E10").value = 5;
    expect(() => parseWorkbook(workbook, syntheticLayout)).toThrow(/Input!E10/);
  });
});

describe("parseWorkbook：Guidance 與 Mapping", () => {
  it("Guidance 的 Stage 不合法", () => {
    const workbook = build();
    sheetOf(workbook, "Guidance").getCell(`E${GUIDANCE_FIRST_ROW}`).value = "Z";
    expectIssue(issuesOf(workbook), "Guidance", `E${GUIDANCE_FIRST_ROW}`, "Stage");
  });

  it("Guidance 的 Man 不是數字", () => {
    const workbook = build();
    sheetOf(workbook, "Guidance").getCell(`I${GUIDANCE_FIRST_ROW + 1}`).value = "many";
    expectIssue(issuesOf(workbook), "Guidance", `I${GUIDANCE_FIRST_ROW + 1}`, "Man");
  });

  it("Guidance 的 Function 不在 Mapping", () => {
    const workbook = build();
    sheetOf(workbook, "Guidance").getCell(`G${GUIDANCE_FIRST_ROW}`).value = "Ghost";
    expectIssue(issuesOf(workbook), "Guidance", `G${GUIDANCE_FIRST_ROW}`, "Ghost");
  });

  it("Guidance 的 Group 與 Mapping 不一致", () => {
    const workbook = build();
    const cell = sheetOf(workbook, "Guidance").getCell(`F${GUIDANCE_FIRST_ROW}`);
    cell.value = cell.value === "Core" ? "Support" : "Core";
    expectIssue(issuesOf(workbook), "Guidance", `F${GUIDANCE_FIRST_ROW}`, "不一致");
  });

  it("Guidance 的 Option 不認得", () => {
    const workbook = build();
    sheetOf(workbook, "Guidance").getCell(`D${GUIDANCE_FIRST_ROW}`).value = "Mystery";
    expectIssue(issuesOf(workbook), "Guidance", `D${GUIDANCE_FIRST_ROW}`, "Mystery");
  });

  it("Mapping 的 Gate 文字不認得", () => {
    const workbook = build();
    const row = MAPPING_FIRST_FUNCTION_ROW + reference.functions.length - 1;
    sheetOf(workbook, "Mapping").getCell(`D${row}`).value = "Unknown switch";
    expectIssue(issuesOf(workbook), "Mapping", `D${row}`, "Unknown switch");
  });

  it("Mapping 的 Group 不合法", () => {
    const workbook = build();
    sheetOf(workbook, "Mapping").getCell(`C${MAPPING_FIRST_FUNCTION_ROW}`).value = "Extra";
    expectIssue(issuesOf(workbook), "Mapping", `C${MAPPING_FIRST_FUNCTION_ROW}`, "分組");
  });

  it("Mapping 的 Stage 選配規則被改掉時明確失敗（引擎只支援 pre A 與 TLD 選配）", () => {
    const workbook = build();
    const stageRow = MAPPING_FIRST_FUNCTION_ROW + reference.functions.length + 3 + 3; // 表頭後第 3 列 = A
    sheetOf(workbook, "Mapping").getCell(`E${stageRow}`).value = "Include A build";
    expectIssue(issuesOf(workbook), "Mapping", `E${stageRow}`, "Gate");
  });

  it("Mapping 缺少某個 Stage", () => {
    const workbook = build();
    const stageHeaderRow = MAPPING_FIRST_FUNCTION_ROW + reference.functions.length + 3;
    sheetOf(workbook, "Mapping").getCell(`B${stageHeaderRow + 8}`).value = null; // 最後一個 Stage（MP）
    const issues = issuesOf(workbook);
    expect(issues.some((issue) => issue.message.includes("MP"))).toBe(true);
  });

  it("缺少整個分頁", () => {
    const workbook = build();
    workbook.removeWorksheet(sheetOf(workbook, "Mapping").id);
    expectIssue(issuesOf(workbook), "Mapping", "-", "沒有「Mapping」分頁");
  });
});

describe("parseWorkbook：Input_Manual_Adjust", () => {
  const firstRow = MANUAL_FIRST_ROW;

  it("例外調整依 Project Code 歸到各專案", () => {
    const imported = parseWorkbook(build(), syntheticLayout);
    expect(imported.projects.map((project) => project.manualAdjustments.length)).toEqual([0, 1, 2, 0]);
  });

  it("找不到 Project Code", () => {
    const workbook = build();
    sheetOf(workbook, "Input_Manual_Adjust").getCell(`A${firstRow}`).value = "NOPE";
    expectIssue(issuesOf(workbook), "Input_Manual_Adjust", `A${firstRow}`, "NOPE");
  });

  it("Function 不在 Mapping", () => {
    const workbook = build();
    sheetOf(workbook, "Input_Manual_Adjust").getCell(`C${firstRow}`).value = "Ghost";
    expectIssue(issuesOf(workbook), "Input_Manual_Adjust", `C${firstRow}`, "Ghost");
  });

  it("Stage 不合法", () => {
    const workbook = build();
    sheetOf(workbook, "Input_Manual_Adjust").getCell(`B${firstRow}`).value = "Beta";
    expectIssue(issuesOf(workbook), "Input_Manual_Adjust", `B${firstRow}`, "Stage");
  });

  it("Man 不是數字", () => {
    const workbook = build();
    sheetOf(workbook, "Input_Manual_Adjust").getCell(`D${firstRow}`).value = "two";
    expectIssue(issuesOf(workbook), "Input_Manual_Adjust", `D${firstRow}`, "Man");
  });

  it("有 Man 沒有 Days", () => {
    const workbook = build();
    sheetOf(workbook, "Input_Manual_Adjust").getCell(`E${firstRow}`).value = null;
    expectIssue(issuesOf(workbook), "Input_Manual_Adjust", `E${firstRow}`, "Days");
  });
});
