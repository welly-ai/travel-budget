import { describe, expect, it } from "vitest";
import { ImportError, type ImportIssue, parseProjectConfigJson, parseProjectConfigListJson } from "@/import";
import { syntheticProjects } from "../fixtures/synthetic/projects";
import { buildSyntheticReference } from "../fixtures/synthetic/reference";
import { toV1Json } from "./helpers";

const reference = buildSyntheticReference();
const [first, second] = syntheticProjects;
if (first === undefined || second === undefined) throw new Error("合成專案不足");

function issuesOf(run: () => unknown): readonly ImportIssue[] {
  try {
    run();
  } catch (error: unknown) {
    if (error instanceof ImportError) return error.issues;
    throw error;
  }
  throw new Error("預期匯入失敗，但成功了");
}

function withChange(base: object, change: Record<string, unknown>): string {
  return JSON.stringify({ ...base, ...change });
}

describe("parseProjectConfigJson", () => {
  it("存成 JSON 再匯入會得到相同的設定（含 schemaVersion）", () => {
    for (const project of syntheticProjects) {
      const text = JSON.stringify(project);
      expect(JSON.parse(text)).toHaveProperty("schemaVersion", 2);
      expect(parseProjectConfigJson(text, reference)).toEqual(project);
    }
  });

  it("v1 的 JSON 匯入後遷移成 v2（沒有手動覆寫、用預設容許範圍設定）", () => {
    const imported = parseProjectConfigJson(JSON.stringify(toV1Json(first)), reference);
    expect(imported).toEqual(first);
    expect(imported.cellOverrides).toEqual([]);
    expect(imported.toleranceProfileId).toBeNull();
  });

  it("手動覆寫引用參考資料沒有的 Function", () => {
    const overrides = [{ stage: "A", function: "Ghost", man: 1, days: 1, reason: "" }];
    const issues = issuesOf(() => parseProjectConfigJson(withChange(first, { cellOverrides: overrides }), reference));
    expect(issues).toEqual([expect.objectContaining({ cell: "$.cellOverrides[0].function" })]);
  });

  it("不是合法 JSON", () => {
    const [issue] = issuesOf(() => parseProjectConfigJson("{oops", reference));
    expect(issue).toMatchObject({ sheet: "JSON", cell: "$" });
    expect(issue?.message).toContain("JSON");
  });

  it("schemaVersion 不是 1 或 2", () => {
    const issues = issuesOf(() => parseProjectConfigJson(withChange(first, { schemaVersion: 3 }), reference));
    expect(issues.map((issue) => issue.cell)).toContain("$.schemaVersion");
  });

  it("缺少開關時指出是哪一個", () => {
    const rest = Object.fromEntries(Object.entries(first.gates).filter(([key]) => key !== "gpu"));
    const issues = issuesOf(() => parseProjectConfigJson(withChange(first, { gates: rest }), reference));
    expect(issues.map((issue) => issue.cell)).toContain("$.gates.gpu");
  });

  it("Phase 與 Class 不合法", () => {
    const issues = issuesOf(() => parseProjectConfigJson(withChange(first, { phase: 4, projectClass: 1 }), reference));
    const cells = issues.map((issue) => issue.cell);
    expect(cells).toContain("$.phase");
    expect(cells).toContain("$.projectClass");
  });

  it("build 日期格式錯誤", () => {
    const issues = issuesOf(() => parseProjectConfigJson(withChange(first, { buildDates: { A: "2031-13-01" } }), reference));
    expect(issues.map((issue) => issue.cell)).toContain("$.buildDates.A");
  });

  it("例外調整引用參考資料沒有的 Function", () => {
    const adjustments = [{ stage: "A", function: "Ghost", man: 1, days: 1, remark: "" }];
    const issues = issuesOf(() => parseProjectConfigJson(withChange(first, { manualAdjustments: adjustments }), reference));
    expect(issues).toEqual([expect.objectContaining({ cell: "$.manualAdjustments[0].function" })]);
  });

  it("不是物件", () => {
    expect(issuesOf(() => parseProjectConfigJson("42", reference)).length).toBeGreaterThan(0);
  });
});

describe("parseProjectConfigListJson", () => {
  it("匯入陣列", () => {
    expect(parseProjectConfigListJson(JSON.stringify([first, second]), reference)).toEqual([first, second]);
  });

  it("陣列元素的錯誤帶索引", () => {
    const text = JSON.stringify([first, { ...second, phase: 9 }]);
    expect(issuesOf(() => parseProjectConfigListJson(text, reference)).map((issue) => issue.cell)).toContain("$[1].phase");
  });

  it("不是陣列", () => {
    expect(issuesOf(() => parseProjectConfigListJson(JSON.stringify(first), reference))[0]?.message).toContain("陣列");
  });
});
