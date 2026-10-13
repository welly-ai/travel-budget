import { describe, expect, it } from "vitest";
import { migrateProjectConfig, projectConfigSchema, projectSnapshotSchema, type FunctionResult, type ProjectResult } from "@/domain";
import { calculateProject, checkOverrides, effectiveGuidanceCells } from "@/engine";
import { buildMiniReference } from "../fixtures/synthetic/reference";
import { adjust, gates, makeConfig, override, toV1Json } from "./helpers";

// 迷你參考資料（Phase 2 / Class 4，見 engine.test.ts 開頭說明）：
//   LD A 有效 Guidance 3 人次、24 人天；LD B 1×5 = 5 人天；LD pre A 1×7（pre A 預設關閉）
//   ADD A 1×10（adsp 開關）；NEG B -1×20（mePlastic 開關）；BARE 沒有 guidance
const reference = buildMiniReference();
const PLUS_MINUS_30 = { maxIncreasePct: 30, maxDecreasePct: 30 };

function functionOf(result: ProjectResult, name: string): FunctionResult {
  const found = result.functions.find((item) => item.function === name);
  if (found === undefined) throw new Error(`結果沒有 Function ${name}`);
  return found;
}

function v1Json(): Record<string, unknown> {
  return toV1Json(makeConfig({ manualAdjustments: [adjust("A", "LD", 1, 2)] }));
}

describe("專案設定 v1 → v2 遷移", () => {
  it("v1 設定讀入後變成 v2：沒有手動覆寫、沒有指定容許範圍設定，其餘欄位不變", () => {
    const migrated = projectConfigSchema.parse(v1Json());
    expect(migrated).toEqual(makeConfig({ manualAdjustments: [adjust("A", "LD", 1, 2)] }));
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.cellOverrides).toEqual([]);
    expect(migrated.toleranceProfileId).toBeNull();
  });

  it("v2 設定原樣通過；migrateProjectConfig 對 v2 是恆等", () => {
    const v2 = makeConfig({ cellOverrides: [override("A", "LD", 3, 10, "多跑一趟")], toleranceProfileId: "p1" });
    expect(projectConfigSchema.parse(v2)).toEqual(v2);
    expect(migrateProjectConfig(v2)).toEqual(v2);
  });

  it("修訂快照裡的 v1 設定也會遷移", () => {
    const snapshot = projectSnapshotSchema.parse({ schemaVersion: 1, status: "draft", guidanceVersionId: "g", config: v1Json() });
    expect(snapshot.config.schemaVersion).toBe(2);
    expect(snapshot.config.cellOverrides).toEqual([]);
  });

  it("不支援的 schemaVersion 被拒絕，錯誤指向 schemaVersion", () => {
    const parsed = projectConfigSchema.safeParse({ ...v1Json(), schemaVersion: 3 });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toContain("schemaVersion");
  });

  it("同一個 Stage × Function 只能有一筆手動覆寫", () => {
    const parsed = projectConfigSchema.safeParse(
      makeConfig({ cellOverrides: [override("A", "LD", 3, 10), override("B", "LD", 1, 1), override("A", "LD", 2, 2)] }),
    );
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toEqual(["cellOverrides.2"]);
  });
});

describe("calculateProject：手動覆寫", () => {
  it("覆寫取代該格的基礎值（LD A 原本 3 人次 24 人天）", () => {
    const result = calculateProject(makeConfig({ cellOverrides: [override("A", "LD", 3, 10)] }), reference);
    expect(functionOf(result, "LD").byStage.A).toEqual({ man: 3, days: 10, manDays: 30 });
    // 其他格不受影響
    expect(functionOf(result, "LD").byStage.B).toEqual({ man: 1, days: 5, manDays: 5 });
    expect(result.byStage.A.manDays).toBe(30 + 6);
  });

  it("例外調整照舊疊加在覆寫值上", () => {
    const config = makeConfig({ cellOverrides: [override("A", "LD", 3, 10)], manualAdjustments: [adjust("A", "LD", 1, 2)] });
    expect(functionOf(calculateProject(config, reference), "LD").byStage.A).toEqual({ man: 4, days: 8, manDays: 32 });
  });

  it("覆寫不受開關與選配 Stage 限制", () => {
    const config = makeConfig({ cellOverrides: [override("pre A", "LD", 2, 5), override("A", "ADD", 1, 4)] });
    const result = calculateProject(config, reference);
    expect(functionOf(result, "LD").byStage["pre A"]).toEqual({ man: 2, days: 5, manDays: 10 });
    expect(functionOf(result, "ADD").byStage.A).toEqual({ man: 1, days: 4, manDays: 4 });
  });

  it("可以把一格覆寫成 0", () => {
    const result = calculateProject(makeConfig({ cellOverrides: [override("A", "LD", 0, 0)] }), reference);
    expect(functionOf(result, "LD").byStage.A).toEqual({ man: 0, days: 0, manDays: 0 });
  });

  it("v1 設定直接算，結果與沒有覆寫的 v2 相同", () => {
    const fromV1 = calculateProject(projectConfigSchema.parse(v1Json()), reference);
    expect(fromV1).toEqual(calculateProject(makeConfig({ manualAdjustments: [adjust("A", "LD", 1, 2)] }), reference));
  });

  it("覆寫引用參考資料沒有的 Function 會丟錯，指出 cellOverrides 路徑", () => {
    expect(() => calculateProject(makeConfig({ cellOverrides: [override("A", "NOPE", 1, 1)] }), reference)).toThrow(/cellOverrides\[0\]\.function/);
  });
});

describe("effectiveGuidanceCells：有效 Guidance", () => {
  it("每個 Function × Stage 一格；開關關閉或 Stage 未啟用時為 0；不含覆寫與例外調整", () => {
    const config = makeConfig({ cellOverrides: [override("A", "LD", 9, 9)], manualAdjustments: [adjust("A", "LD", 1, 1)] });
    const cells = effectiveGuidanceCells(config, reference);
    expect(cells).toHaveLength(6 * 8);
    const cell = (stage: string, name: string) => cells.find((item) => item.stage === stage && item.function === name);
    expect(cell("A", "LD")).toEqual({ stage: "A", function: "LD", man: 3, days: 8, manDays: 24 });
    expect(cell("pre A", "LD")?.manDays).toBe(0);
    expect(cell("A", "ADD")?.manDays).toBe(0);
  });
});

describe("checkOverrides：容許範圍（上下限都『包含』：剛好等於上限不警告，超過才警告）", () => {
  const warningsFor = (...cells: ReturnType<typeof override>[]) =>
    checkOverrides(makeConfig({ cellOverrides: cells }), reference, PLUS_MINUS_30);

  it("沒有覆寫就沒有警告", () => {
    expect(warningsFor()).toEqual([]);
  });

  it("剛好 +30%、剛好 -30% 不警告（LD B 5 人天 → 6.5、3.5）", () => {
    expect(warningsFor(override("B", "LD", 1, 6.5))).toEqual([]);
    expect(warningsFor(override("B", "LD", 1, 3.5))).toEqual([]);
  });

  it("浮點誤差不會讓剛好 30% 變成警告（LD A 24 人天 → 3 × 10.4）", () => {
    expect(warningsFor(override("A", "LD", 3, 10.4))).toEqual([]);
  });

  it("超過 +30% 警告增加，並帶上 Guidance 人天、覆寫人天、偏離百分比與理由", () => {
    expect(warningsFor(override("A", "LD", 3, 10.5, "客戶要求"))).toEqual([
      {
        stage: "A",
        function: "LD",
        direction: "increase",
        guidanceManDays: 24,
        overrideManDays: 31.5,
        changePct: 31.25,
        limitPct: 30,
        reason: "客戶要求",
      },
    ]);
  });

  it("超過 -30% 警告減少", () => {
    const [warning] = warningsFor(override("B", "LD", 1, 3));
    expect(warning).toMatchObject({ direction: "decrease", guidanceManDays: 5, overrideManDays: 3, changePct: -40, limitPct: 30 });
  });

  it("上限與下限分開設定", () => {
    const config = makeConfig({ cellOverrides: [override("B", "LD", 1, 7), override("A", "LD", 1, 12)] });
    const warnings = checkOverrides(config, reference, { maxIncreasePct: 50, maxDecreasePct: 10 });
    expect(warnings.map((item) => [item.stage, item.direction])).toEqual([["A", "decrease"]]);
  });

  it("有效 Guidance 為 0 不警告：沒有 guidance 的格子、Stage 未啟用、開關關閉", () => {
    expect(warningsFor(override("RFQ", "BARE", 5, 5), override("pre A", "LD", 9, 9), override("A", "ADD", 9, 9))).toEqual([]);
  });

  it("Guidance 為負值時以絕對值為分母：NEG B -20 人天覆寫成 0 是 +100%", () => {
    const config = makeConfig({ gates: gates(["mePlastic"]), cellOverrides: [override("B", "NEG", 0, 0)] });
    const [warning] = checkOverrides(config, reference, PLUS_MINUS_30);
    expect(warning).toMatchObject({ direction: "increase", guidanceManDays: -20, overrideManDays: 0, changePct: 100 });
  });
});
