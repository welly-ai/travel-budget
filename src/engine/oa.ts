import type { OaRow, ProjectConfig, ProjectResult, ReferenceData, Stage } from "@/domain";

/** build 日期（YYYY-MM-DD）所在月份；沒填日期時為 null。 */
function budgetedPeriodOf(config: ProjectConfig, stage: Stage): string | null {
  const date = config.buildDates[stage];
  return date === undefined ? null : date.slice(0, 7);
}

/**
 * 展開成 OA 上傳列：Stage 為外層、Function 為內層（與原 OA Upload_All 相同順序）。
 * 每個 Stage × Function 都有一列；只有 include 為 true（人天不為 0）的列需要上傳。
 */
export function toOaRows(config: ProjectConfig, result: ProjectResult, reference: ReferenceData): OaRow[] {
  const rows: OaRow[] = [];
  for (const site of reference.stages) {
    for (const fn of result.functions) {
      const quantity = fn.byStage[site.stage];
      rows.push({
        deptCode: config.deptCode,
        budgetedPeriod: budgetedPeriodOf(config, site.stage),
        projectCode: config.projectCode,
        travelArea: site.travelArea,
        travelSite: site.travelSite,
        stage: site.stage,
        function: fn.function,
        man: quantity.man,
        travelerDays: quantity.days,
        manDays: quantity.manDays,
        include: quantity.manDays !== 0,
      });
    }
  }
  return rows;
}
