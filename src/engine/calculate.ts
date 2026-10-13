import {
  GROUPS,
  migrateProjectConfig,
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
import { addTo, type CellTotals, effectiveGuidanceOf, guidanceTotals, lookup } from "./cells";
import { makeQuantity, stageRecord, sumQuantities } from "./quantity";

/**
 * 計算單一專案。對應原 Excel 的 Super table：
 *   基礎值 = 該格有手動覆寫時用覆寫值，否則用有效 Guidance（guidance 加總 × 開關 × Stage 是否啟用）
 *   人次、人天 = 基礎值 + 例外調整加總；人天 = Σ(人次 × 天數)
 *   天數 = 人天 ÷ 人次（人次為 0 時為 0）
 * 例外調整與手動覆寫都不受開關與選配 Stage 影響（Excel 的例外調整即如此：它加在乘上開關之後）。
 * 收任一版本的專案設定，先遷移成目前版本再算。
 */
export function calculateProject(anyConfig: ProjectConfig, reference: ReferenceData): ProjectResult {
  const config = migrateProjectConfig(anyConfig);
  const referenceIssues = validateProjectAgainstReference(config, reference);
  const [firstIssue] = referenceIssues;
  if (firstIssue !== undefined) {
    throw new Error(`專案 ${config.projectCode} 與參考資料不一致：${firstIssue.path}：${firstIssue.message}`);
  }

  const guidance = guidanceTotals(config, reference);
  const overrides: CellTotals = new Map();
  for (const item of config.cellOverrides) {
    addTo(overrides, item.stage, item.function, item.man, item.man * item.days);
  }
  const adjustments: CellTotals = new Map();
  for (const adjustment of config.manualAdjustments) {
    addTo(adjustments, adjustment.stage, adjustment.function, adjustment.man, adjustment.man * adjustment.days);
  }

  const functions: FunctionResult[] = reference.functions.map((def) => {
    const byStage = stageRecord((stage): Quantity => {
      const base = overrides.get(stage)?.get(def.name) ?? effectiveGuidanceOf(guidance, def, stage, config);
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
