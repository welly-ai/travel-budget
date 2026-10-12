import { describe, expect, it } from "vitest";
import { GROUPS, STAGES, type FunctionResult, type ProjectResult, type Stage } from "@/domain";
import { calculateProject, summarizeByLob, toOaRows } from "@/engine";
import { buildMiniReference } from "../fixtures/synthetic/reference";
import { adjust, fn, gates, makeConfig } from "./helpers";

// 這些測試用手寫的迷你參考資料（buildMiniReference），數字小到可以心算：
//   LD   Core    pre A 1×7；A 2×10 + 1×4（同格兩列）；B 1×5；MP 1×4
//   SUP  Support A 2×3；TLD 1×6
//   ADD  Adder   （adsp）A 1×10
//   NEG  Adder   （mePlastic）B -1×20
//   OPT  Option  （gpu）C 2×5
//   BARE Support 沒有 guidance
const reference = buildMiniReference();

function functionOf(result: ProjectResult, name: string): FunctionResult {
  const found = result.functions.find((item) => item.function === name);
  if (found === undefined) throw new Error(`結果沒有 Function ${name}`);
  return found;
}

describe("calculateProject：基本規則", () => {
  const result = calculateProject(makeConfig(), reference);

  it("同一格的多列 guidance 相加，days 是人天除以人次的加權平均", () => {
    expect(functionOf(result, "LD").byStage.A).toEqual({ man: 3, days: 8, manDays: 24 });
  });

  it("結果依參考資料的 Function 順序排列，且每個 Function 都有 8 個 Stage", () => {
    expect(result.functions.map((item) => item.function)).toEqual(["LD", "SUP", "BARE", "ADD", "NEG", "OPT"]);
    for (const item of result.functions) expect(Object.keys(item.byStage)).toEqual([...STAGES]);
  });

  it("Core 與 Support 恆計入；Adder 與 Option 開關關閉時為 0", () => {
    expect(functionOf(result, "SUP").byStage.A).toEqual({ man: 2, days: 3, manDays: 6 });
    expect(functionOf(result, "ADD").total).toEqual({ man: 0, days: 0, manDays: 0 });
    expect(functionOf(result, "NEG").total).toEqual({ man: 0, days: 0, manDays: 0 });
    expect(functionOf(result, "OPT").total).toEqual({ man: 0, days: 0, manDays: 0 });
  });

  it("沒有 guidance 的 Function 全部為 0", () => {
    expect(functionOf(result, "BARE").total).toEqual({ man: 0, days: 0, manDays: 0 });
  });

  it("Stage 合計與總計", () => {
    expect(result.byStage.A).toEqual({ man: 5, days: 6, manDays: 30 });
    expect(result.byStage.B).toEqual({ man: 1, days: 5, manDays: 5 });
    expect(result.byStage.MP).toEqual({ man: 1, days: 4, manDays: 4 });
    expect(result.total).toEqual({ man: 7, days: 39 / 7, manDays: 39 });
  });

  it("Group 小計：Core 只有 LD，Support 為 SUP + BARE，總和等於總計", () => {
    const subtotal = (group: string) => {
      const found = result.groups.find((item) => item.group === group);
      if (found === undefined) throw new Error(`沒有 ${group} 小計`);
      return found;
    };
    expect(result.groups.map((item) => item.group)).toEqual([...GROUPS]);
    expect(subtotal("Core").total.manDays).toBe(33);
    expect(subtotal("Support").total.manDays).toBe(6);
    expect(subtotal("Adder").total.manDays).toBe(0);
    expect(result.groups.reduce((sum, item) => sum + item.total.manDays, 0)).toBe(result.total.manDays);
    for (const stage of STAGES) {
      expect(result.groups.reduce((sum, item) => sum + item.byStage[stage].manDays, 0)).toBe(result.byStage[stage].manDays);
    }
  });
});

describe("calculateProject：Phase 與 Class 選擇", () => {
  it("Phase 3 只用 Phase 3 的列", () => {
    const result = calculateProject(makeConfig({ phase: 3 }), reference);
    expect(functionOf(result, "LD").byStage.A).toEqual({ man: 9, days: 9, manDays: 81 });
    expect(functionOf(result, "SUP").total.manDays).toBe(0);
  });

  it("Class 3.5 只用 Class 3.5 的列", () => {
    const result = calculateProject(makeConfig({ projectClass: 3.5 }), reference);
    expect(functionOf(result, "LD").byStage.A).toEqual({ man: 8, days: 8, manDays: 64 });
  });

  it("沒有任何 guidance 的組合，結果全為 0 而不是錯誤", () => {
    const result = calculateProject(makeConfig({ phase: 3, projectClass: 2 }), reference);
    expect(result.total).toEqual({ man: 0, days: 0, manDays: 0 });
  });
});

describe("calculateProject：開關", () => {
  it("Adder 開關開啟後計入，其他 Adder 不受影響", () => {
    const result = calculateProject(makeConfig({ gates: gates(["adsp"]) }), reference);
    expect(functionOf(result, "ADD").byStage.A).toEqual({ man: 1, days: 10, manDays: 10 });
    expect(functionOf(result, "NEG").total.manDays).toBe(0);
  });

  it("Option 開關開啟後計入", () => {
    const result = calculateProject(makeConfig({ gates: gates(["gpu"]) }), reference);
    expect(functionOf(result, "OPT").byStage.C).toEqual({ man: 2, days: 5, manDays: 10 });
  });

  it("pre A 開啟才計入 pre A 的 guidance", () => {
    expect(functionOf(calculateProject(makeConfig(), reference), "LD").byStage["pre A"].manDays).toBe(0);
    const on = calculateProject(makeConfig({ includePreA: true }), reference);
    expect(functionOf(on, "LD").byStage["pre A"]).toEqual({ man: 1, days: 7, manDays: 7 });
  });

  it("TLD 開啟才計入 TLD 的 guidance，且不影響 pre A", () => {
    expect(functionOf(calculateProject(makeConfig(), reference), "SUP").byStage.TLD.manDays).toBe(0);
    const on = calculateProject(makeConfig({ includeTld: true }), reference);
    expect(functionOf(on, "SUP").byStage.TLD).toEqual({ man: 1, days: 6, manDays: 6 });
    expect(functionOf(on, "LD").byStage["pre A"].manDays).toBe(0);
  });
});

describe("calculateProject：負人天", () => {
  const result = calculateProject(makeConfig({ gates: gates(["mePlastic"]) }), reference);

  it("負人次與負人天照實相加，days 仍是正的加權平均", () => {
    expect(functionOf(result, "NEG").byStage.B).toEqual({ man: -1, days: 20, manDays: -20 });
  });

  it("負值會扣減 Stage 合計與總計", () => {
    expect(result.byStage.B).toEqual({ man: 0, days: 0, manDays: -15 });
    expect(result.total.manDays).toBe(39 - 20);
  });

  it("不產生 -0", () => {
    for (const item of result.functions) {
      for (const stage of STAGES) {
        expect(Object.is(item.byStage[stage].man, -0)).toBe(false);
        expect(Object.is(item.byStage[stage].manDays, -0)).toBe(false);
      }
    }
  });
});

describe("calculateProject：例外調整", () => {
  it("疊加在 guidance 之上，days 重新加權平均", () => {
    const result = calculateProject(makeConfig({ manualAdjustments: [adjust("A", "LD", 2, 3)] }), reference);
    expect(functionOf(result, "LD").byStage.A).toEqual({ man: 5, days: 6, manDays: 30 });
  });

  it("天數可以是非整數的加權平均", () => {
    const result = calculateProject(makeConfig({ manualAdjustments: [adjust("A", "LD", 1, 1)] }), reference);
    expect(functionOf(result, "LD").byStage.A).toEqual({ man: 4, days: 6.25, manDays: 25 });
  });

  it("同一格的多筆調整全部相加", () => {
    const result = calculateProject(makeConfig({ manualAdjustments: [adjust("RFQ", "BARE", 1, 2), adjust("RFQ", "BARE", 2, 3)] }), reference);
    expect(functionOf(result, "BARE").byStage.RFQ).toEqual({ man: 3, days: 8 / 3, manDays: 8 });
  });

  it("沒有 guidance 的 Stage（RFQ）只靠調整", () => {
    const result = calculateProject(makeConfig({ manualAdjustments: [adjust("RFQ", "BARE", 1, 2)] }), reference);
    expect(functionOf(result, "BARE").byStage.RFQ).toEqual({ man: 1, days: 2, manDays: 2 });
    expect(result.byStage.RFQ.manDays).toBe(2);
  });

  it("調整不受開關限制：Adder 關閉時，調整仍然計入（與原 Excel 相同）", () => {
    const result = calculateProject(makeConfig({ manualAdjustments: [adjust("A", "ADD", 1, 2)] }), reference);
    expect(functionOf(result, "ADD").byStage.A).toEqual({ man: 1, days: 2, manDays: 2 });
  });

  it("調整不受選配 Stage 限制：pre A 關閉時，調整仍然計入", () => {
    const result = calculateProject(makeConfig({ manualAdjustments: [adjust("pre A", "LD", 1, 5)] }), reference);
    expect(functionOf(result, "LD").byStage["pre A"]).toEqual({ man: 1, days: 5, manDays: 5 });
  });

  it("負的調整可以扣減", () => {
    const result = calculateProject(makeConfig({ manualAdjustments: [adjust("A", "SUP", -1, 4)] }), reference);
    expect(functionOf(result, "SUP").byStage.A).toEqual({ man: 1, days: 2, manDays: 2 });
  });

  it("引用參考資料沒有的 Function 時明確失敗", () => {
    const config = makeConfig({ manualAdjustments: [adjust("A", "NOPE", 1, 1)] });
    expect(() => calculateProject(config, reference)).toThrow(/NOPE/);
  });
});

describe("calculateProject：人次為 0", () => {
  it("人次相消為 0 時 days 為 0，但人天照算", () => {
    const result = calculateProject(makeConfig({ manualAdjustments: [adjust("A", "LD", -3, 1)] }), reference);
    expect(functionOf(result, "LD").byStage.A).toEqual({ man: 0, days: 0, manDays: 21 });
  });

  it("沒有任何資料的格子是 0／0／0", () => {
    const result = calculateProject(makeConfig(), reference);
    expect(functionOf(result, "LD").byStage.RFQ).toEqual({ man: 0, days: 0, manDays: 0 });
  });
});

describe("calculateProject：純函式", () => {
  it("相同輸入得到相同輸出，且不修改輸入", () => {
    const config = makeConfig({ gates: gates(["adsp", "gpu"]), includePreA: true, manualAdjustments: [adjust("A", "LD", 1, 1)] });
    const configBefore = structuredClone(config);
    const referenceBefore = structuredClone(reference);
    const first = calculateProject(config, reference);
    const second = calculateProject(config, reference);
    expect(second).toEqual(first);
    expect(config).toEqual(configBefore);
    expect(reference).toEqual(referenceBefore);
  });
});

describe("toOaRows", () => {
  const config = makeConfig({
    buildDates: { A: "2031-02-01", B: "2031-12-31" },
    manualAdjustments: [adjust("RFQ", "BARE", 1, 0), adjust("MP", "BARE", -3, 1), adjust("MP", "SUP", 4, 1)],
  });
  const result = calculateProject(config, reference);
  const rows = toOaRows(config, result, reference);

  function rowOf(stage: Stage, name: string) {
    const found = rows.find((row) => row.stage === stage && row.function === name);
    if (found === undefined) throw new Error(`沒有 OA 列 ${stage} / ${name}`);
    return found;
  }

  it("每個 Stage × Function 一列，Stage 為外層、Function 為內層", () => {
    expect(rows).toHaveLength(8 * 6);
    expect(rows.slice(0, 6).map((row) => `${row.stage}/${row.function}`)).toEqual(["RFQ/LD", "RFQ/SUP", "RFQ/BARE", "RFQ/ADD", "RFQ/NEG", "RFQ/OPT"]);
    expect(rows[6]?.stage).toBe("pre A");
  });

  it("數值與結果一致：人次、TravelerDays（加權平均天數）、人天", () => {
    expect(rowOf("A", "LD")).toMatchObject({ man: 3, travelerDays: 8, manDays: 24, include: true, projectCode: "TST01", deptCode: "DEPT-X" });
  });

  it("只有人天不為 0 的列需要上傳", () => {
    expect(rows.filter((row) => row.include).map((row) => `${row.stage}/${row.function}`)).toEqual([
      "A/LD",
      "A/SUP",
      "B/LD",
      "MP/LD",
      "MP/SUP",
      "MP/BARE",
    ]);
  });

  it("人次大於 0 但人天為 0 的列不上傳", () => {
    expect(rowOf("RFQ", "BARE")).toMatchObject({ man: 1, manDays: 0, include: false });
  });

  it("人次為 0 但人天不為 0 的列仍要上傳，TravelerDays 為 0", () => {
    const row = rowOf("MP", "BARE");
    expect(row).toMatchObject({ man: -3, travelerDays: 1, manDays: -3, include: true });
    const zeroMan = calculateProject(makeConfig({ manualAdjustments: [adjust("A", "LD", -3, 1)] }), reference);
    const zeroRow = toOaRows(makeConfig({ manualAdjustments: [adjust("A", "LD", -3, 1)] }), zeroMan, reference).find((item) => item.stage === "A" && item.function === "LD");
    expect(zeroRow).toMatchObject({ man: 0, travelerDays: 0, manDays: 21, include: true });
  });

  it("Budgeted Period 取該 Stage build 日期所在的月份，沒填日期則為 null", () => {
    expect(rowOf("A", "LD").budgetedPeriod).toBe("2031-02");
    expect(rowOf("B", "LD").budgetedPeriod).toBe("2031-12");
    expect(rowOf("C", "LD").budgetedPeriod).toBeNull();
  });

  it("出差地區與地點來自參考資料的 Stage 對照", () => {
    expect(rowOf("RFQ", "LD")).toMatchObject({ travelArea: "Area North", travelSite: "Site Alpha" });
    expect(rowOf("MP", "LD")).toMatchObject({ travelArea: "Area South", travelSite: "Site Gamma" });
  });
});

describe("summarizeByLob", () => {
  it("依 LOB 彙總專案數、人次與人天，LOB 依第一次出現的順序", () => {
    const configs = [
      makeConfig({ projectCode: "P1", lob: "LOB Two" }),
      makeConfig({ projectCode: "P2", lob: "LOB One", gates: gates(["adsp"]) }),
      makeConfig({ projectCode: "P3", lob: "LOB Two", phase: 3 }),
    ];
    const entries = configs.map((config) => ({ config, result: calculateProject(config, reference) }));
    expect(summarizeByLob(entries)).toEqual([
      { lob: "LOB Two", projectCount: 2, man: 7 + 9, manDays: 39 + 81 },
      { lob: "LOB One", projectCount: 1, man: 8, manDays: 49 },
    ]);
  });

  it("沒有專案時回傳空陣列", () => {
    expect(summarizeByLob([])).toEqual([]);
  });
});

describe("fn 輔助函式", () => {
  it("品牌字串會拒絕空字串", () => {
    expect(() => fn("")).toThrow();
  });
});
