import {
  migrateProjectConfig,
  STAGES,
  validateProjectAgainstReference,
  type GuidanceCell,
  type OverrideWarning,
  type ProjectConfig,
  type ReferenceData,
  type ToleranceLimits,
} from "@/domain";
import { effectiveGuidanceOf, guidanceTotals } from "./cells";
import { makeQuantity } from "./quantity";

/**
 * 比較上限時容許的浮點誤差（相對於 |Guidance 人天| × 100）。
 * 例如 3 人次 × 10.4 天在雙精度是 31.200000000000003，對 24 人天剛好是 +30%，不應該警告。
 */
const EPSILON = 1e-9;

/** 每個 Function × Stage 的有效 Guidance（依參考資料的 Function 順序、每個 Function 8 個 Stage）。 */
export function effectiveGuidanceCells(anyConfig: ProjectConfig, reference: ReferenceData): GuidanceCell[] {
  const config = migrateProjectConfig(anyConfig);
  const totals = guidanceTotals(config, reference);
  return reference.functions.flatMap((def) =>
    STAGES.map((stage): GuidanceCell => {
      const base = effectiveGuidanceOf(totals, def, stage, config);
      return { stage, function: def.name, ...makeQuantity(base.man, base.manDays) };
    }),
  );
}

/**
 * 檢查手動覆寫是否偏離有效 Guidance 超過容許範圍，回傳警告清單（依覆寫的順序）。
 *   偏離 = 覆寫人天 − Guidance 人天；比例的分母是 |Guidance 人天|（Guidance 可能是負值的扣減）。
 *   上下限都「包含」：偏離剛好等於上限不警告，超過才警告。
 *   有效 Guidance 為 0（沒有 guidance、開關關閉、Stage 未啟用）時無從比較，不警告。
 * 只比較覆寫本身，不含例外調整。
 */
export function checkOverrides(anyConfig: ProjectConfig, reference: ReferenceData, limits: ToleranceLimits): OverrideWarning[] {
  const config = migrateProjectConfig(anyConfig);
  const [issue] = validateProjectAgainstReference(config, reference);
  if (issue !== undefined) throw new Error(`專案 ${config.projectCode} 與參考資料不一致：${issue.path}：${issue.message}`);
  const totals = guidanceTotals(config, reference);
  const warnings: OverrideWarning[] = [];
  for (const item of config.cellOverrides) {
    const def = reference.functions.find((candidate) => candidate.name === item.function);
    if (def === undefined) continue; // 上面已驗證過，不會發生
    const guidanceManDays = effectiveGuidanceOf(totals, def, item.stage, config).manDays;
    if (guidanceManDays === 0) continue;
    const overrideManDays = item.man * item.days;
    const delta = overrideManDays - guidanceManDays;
    const scale = Math.abs(guidanceManDays);
    const slack = EPSILON * scale * 100;
    const direction =
      delta * 100 > limits.maxIncreasePct * scale + slack
        ? "increase"
        : -delta * 100 > limits.maxDecreasePct * scale + slack
          ? "decrease"
          : null;
    if (direction === null) continue;
    warnings.push({
      stage: item.stage,
      function: item.function,
      direction,
      guidanceManDays,
      overrideManDays,
      changePct: (delta / scale) * 100,
      limitPct: direction === "increase" ? limits.maxIncreasePct : limits.maxDecreasePct,
      reason: item.reason,
    });
  }
  return warnings;
}
