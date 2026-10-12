import {
  GROUPS,
  type FunctionName,
  type FunctionResult,
  type Group,
  type GroupSubtotal,
  type ProjectConfig,
  type ProjectResult,
  type Quantity,
  type ReferenceData,
  type Stage,
  validateProjectAgainstReference,
} from "@/domain";
import { isFunctionEnabled, isStageEnabled } from "./gates";
import { makeQuantity, stageRecord, sumQuantities } from "./quantity";

interface Accumulator {
  man: number;
  manDays: number;
}

/** (Stage, Function) → 累加值；用巢狀 Map 取代原 Excel 的字串鍵。 */
type CellTotals = Map<Stage, Map<FunctionName, Accumulator>>;

function addTo(totals: CellTotals, stage: Stage, name: FunctionName, man: number, manDays: number): void {
  let byFunction = totals.get(stage);
  if (byFunction === undefined) {
    byFunction = new Map();
    totals.set(stage, byFunction);
  }
  const current = byFunction.get(name);
  if (current === undefined) {
    byFunction.set(name, { man, manDays });
  } else {
    current.man += man;
    current.manDays += manDays;
  }
}

function lookup(totals: CellTotals, stage: Stage, name: FunctionName): Accumulator {
  return totals.get(stage)?.get(name) ?? { man: 0, manDays: 0 };
}

/**
 * 計算單一專案。對應原 Excel 的 Super table：
 *   人次 = guidance 加總 × 開關 + 例外調整加總
 *   人天 = Σ(人次 × 天數) 同樣處理
 *   天數 = 人天 ÷ 人次（人次為 0 時為 0）
 * 例外調整不受開關與選配 Stage 影響（Excel 即如此：它加在乘上開關之後）。
 */
export function calculateProject(config: ProjectConfig, reference: ReferenceData): ProjectResult {
  const referenceIssues = validateProjectAgainstReference(config, reference);
  const [firstIssue] = referenceIssues;
  if (firstIssue !== undefined) {
    throw new Error(`專案 ${config.projectCode} 與參考資料不一致：${firstIssue.path}：${firstIssue.message}`);
  }

  const guidance: CellTotals = new Map();
  for (const row of reference.guidance) {
    if (row.phase === config.phase && row.projectClass === config.projectClass) {
      addTo(guidance, row.stage, row.function, row.man, row.man * row.days);
    }
  }
  const adjustments: CellTotals = new Map();
  for (const adjustment of config.manualAdjustments) {
    addTo(adjustments, adjustment.stage, adjustment.function, adjustment.man, adjustment.man * adjustment.days);
  }

  const functions: FunctionResult[] = reference.functions.map((def) => {
    const enabled = isFunctionEnabled(def, config);
    const byStage = stageRecord((stage): Quantity => {
      const base = enabled && isStageEnabled(stage, config) ? lookup(guidance, stage, def.name) : { man: 0, manDays: 0 };
      const extra = lookup(adjustments, stage, def.name);
      return makeQuantity(base.man + extra.man, base.manDays + extra.manDays);
    });
    return { function: def.name, group: def.group, byStage, total: sumStages(byStage) };
  });

  const groups: GroupSubtotal[] = GROUPS.map((group) => subtotalOf(group, functions));
  const byStage = stageRecord((stage) => sumQuantities(functions.map((fn) => fn.byStage[stage])));
  return {
    projectCode: config.projectCode,
    functions,
    groups,
    byStage,
    total: sumStages(byStage),
  };
}

function sumStages(byStage: Record<Stage, Quantity>): Quantity {
  return sumQuantities([
    byStage.RFQ,
    byStage["pre A"],
    byStage.A,
    byStage.B,
    byStage.C,
    byStage.TLD,
    byStage["Pre-MP"],
    byStage.MP,
  ]);
}

function subtotalOf(group: Group, functions: readonly FunctionResult[]): GroupSubtotal {
  const members = functions.filter((fn) => fn.group === group);
  const byStage = stageRecord((stage) => sumQuantities(members.map((fn) => fn.byStage[stage])));
  return { group, byStage, total: sumStages(byStage) };
}
