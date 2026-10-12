import type { ProjectConfig } from "./project";
import type { ReferenceData } from "./reference";

export interface ReferenceIssue {
  /** 例如 manualAdjustments[2].function */
  path: string;
  message: string;
}

/**
 * 檢查專案設定引用的 Function 確實存在於參考資料。
 * Function 名稱是資料而非 union，這是它的執行期防線；工程師不要用型別斷言繞過。
 */
export function validateProjectAgainstReference(config: ProjectConfig, reference: ReferenceData): ReferenceIssue[] {
  const known = new Set<string>(reference.functions.map((def) => def.name));
  const issues: ReferenceIssue[] = [];
  config.manualAdjustments.forEach((adjustment, index) => {
    if (!known.has(adjustment.function)) {
      issues.push({
        path: `manualAdjustments[${index}].function`,
        message: `參考資料沒有這個 Function：${adjustment.function}`,
      });
    }
  });
  return issues;
}
