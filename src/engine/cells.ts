import type { FunctionDef, FunctionName, ProjectConfigV2, ReferenceData, Stage } from "@/domain";
import { isFunctionEnabled, isStageEnabled } from "./gates";

export interface Accumulator {
  man: number;
  manDays: number;
}

/** (Stage, Function) → 累加值；用巢狀 Map 取代原 Excel 的字串鍵。 */
export type CellTotals = Map<Stage, Map<FunctionName, Accumulator>>;

export function addTo(totals: CellTotals, stage: Stage, name: FunctionName, man: number, manDays: number): void {
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

export function lookup(totals: CellTotals, stage: Stage, name: FunctionName): Accumulator {
  return totals.get(stage)?.get(name) ?? { man: 0, manDays: 0 };
}

/** 專案所屬 Phase × Class 的 guidance，同一格的多列相加（Excel 的 SUMIF）。 */
export function guidanceTotals(config: ProjectConfigV2, reference: ReferenceData): CellTotals {
  const totals: CellTotals = new Map();
  for (const row of reference.guidance) {
    if (row.phase === config.phase && row.projectClass === config.projectClass) {
      addTo(totals, row.stage, row.function, row.man, row.man * row.days);
    }
  }
  return totals;
}

/** 有效 Guidance：開關關閉或 Stage 未啟用時為 0。 */
export function effectiveGuidanceOf(
  totals: CellTotals,
  def: FunctionDef,
  stage: Stage,
  config: ProjectConfigV2,
): Accumulator {
  return isFunctionEnabled(def, config) && isStageEnabled(stage, config) ? lookup(totals, stage, def.name) : { man: 0, manDays: 0 };
}
