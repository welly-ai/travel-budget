import { hasReason, type OverrideWarning, type Stage } from "@/domain";

/** 在 Stage × Function 的清單（有效 Guidance、手動覆寫、覆寫警告）裡找某一格。 */
export function findCell<T extends { stage: Stage; function: string }>(items: readonly T[], stage: Stage, fn: string): T | undefined {
  return items.find((item) => item.stage === stage && item.function === fn);
}

/** 覆寫警告的白話說明，例如「比 Guidance 多 +45%，超過上限 30%，需要填理由」。 */
export function warningText(warning: OverrideWarning): string {
  const pct = Math.round(Math.abs(warning.changePct));
  const head =
    warning.direction === "increase"
      ? `比 Guidance 多 +${pct}%，超過上限 ${warning.limitPct}%`
      : `比 Guidance 少 −${pct}%，超過下限 ${warning.limitPct}%`;
  return `${head}，${hasReason(warning.reason) ? "已填理由" : "需要填理由"}`;
}
