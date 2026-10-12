import { describe, expect, it } from "vitest";
import { referenceDataSchema, validateProjectAgainstReference } from "@/domain";
import { calculateProject, toOaRows } from "@/engine";
import { syntheticProjects } from "../fixtures/synthetic/projects";
import { buildMiniReference, buildSyntheticReference } from "../fixtures/synthetic/reference";
import { adjust, makeConfig } from "./helpers";

describe("合成參考資料", () => {
  it("可決定性重現：每次產生的結果逐位元相同", () => {
    expect(buildSyntheticReference()).toEqual(buildSyntheticReference());
  });

  it("通過 referenceDataSchema，且涵蓋四個 Group、負人天與沒有 guidance 的 Function", () => {
    const reference = referenceDataSchema.parse(buildSyntheticReference());
    expect(new Set(reference.functions.map((def) => def.group))).toEqual(new Set(["Core", "Support", "Adder", "Option"]));
    expect(reference.guidance.some((row) => row.man < 0)).toBe(true);
    expect(reference.functions.some((def) => def.sourceFunctions.length === 0)).toBe(true);
    expect(reference.guidance.some((row) => row.stage === "RFQ")).toBe(false);
  });
});

describe("referenceDataSchema", () => {
  it("Function 名稱重複會被拒絕", () => {
    const reference = buildMiniReference();
    const [firstDef] = reference.functions;
    if (firstDef === undefined) throw new Error("迷你參考資料沒有 Function");
    const result = referenceDataSchema.safeParse({ ...reference, functions: [...reference.functions, firstDef] });
    expect(result.success).toBe(false);
  });

  it("guidance 使用清單沒有的 Function 會被拒絕", () => {
    const reference = buildMiniReference();
    const [row] = reference.guidance;
    if (row === undefined) throw new Error("迷你參考資料沒有 guidance");
    const result = referenceDataSchema.safeParse({ ...reference, guidance: [{ ...row, function: "Ghost" }] });
    expect(result.success).toBe(false);
  });

  it("Stage 對照缺少任何一個 Stage 會被拒絕", () => {
    const reference = buildMiniReference();
    const result = referenceDataSchema.safeParse({ ...reference, stages: reference.stages.slice(1) });
    expect(result.success).toBe(false);
  });
});

describe("validateProjectAgainstReference", () => {
  it("回報引用不存在 Function 的位置", () => {
    const config = makeConfig({ manualAdjustments: [adjust("A", "LD", 1, 1), adjust("A", "Ghost", 1, 1)] });
    const issues = validateProjectAgainstReference(config, buildMiniReference());
    expect(issues.map((issue) => issue.path)).toEqual(["manualAdjustments[1].function"]);
  });
});

describe("合成專案跑完整合成參考資料", () => {
  const reference = buildSyntheticReference();

  for (const config of syntheticProjects) {
    it(`${config.projectCode}：內部一致性（小計加總、OA 與結果對得起來）`, () => {
      const result = calculateProject(config, reference);
      const byFunction = result.functions.reduce((sum, item) => sum + item.total.manDays, 0);
      const byGroup = result.groups.reduce((sum, item) => sum + item.total.manDays, 0);
      expect(byFunction).toBeCloseTo(result.total.manDays, 9);
      expect(byGroup).toBeCloseTo(result.total.manDays, 9);

      const rows = toOaRows(config, result, reference);
      expect(rows).toHaveLength(8 * reference.functions.length);
      expect(rows.reduce((sum, row) => sum + row.manDays, 0)).toBeCloseTo(result.total.manDays, 9);
      expect(rows.every((row) => row.include === (row.manDays !== 0))).toBe(true);
    });
  }

  it("全部開關開啟、pre A 與 TLD 開啟的專案，人天不少於全部關閉的同組合專案（Adder 負值除外時仍成立於 Option）", () => {
    const [, , , allOn] = syntheticProjects;
    if (allOn === undefined) throw new Error("合成專案不足");
    const off = calculateProject({ ...allOn, gates: makeConfig().gates, includePreA: false, includeTld: false, manualAdjustments: [] }, reference);
    const on = calculateProject(allOn, reference);
    expect(on.groups.find((item) => item.group === "Option")?.total.manDays).toBeGreaterThan(0);
    expect(off.groups.find((item) => item.group === "Option")?.total.manDays).toBe(0);
    expect(on.total.manDays).not.toBe(off.total.manDays);
  });
});
