import { type ProjectConfig, projectConfigSchema, type ReferenceData, validateProjectAgainstReference } from "@/domain";
import { ImportError, type ImportIssue } from "./issues";

const JSON_SHEET = "JSON";

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; issue: ImportIssue } {
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, issue: { sheet: JSON_SHEET, cell: "$", message: `不是合法的 JSON：${detail}` } };
  }
}

function validateOne(value: unknown, reference: ReferenceData, prefix: string): { config?: ProjectConfig; issues: ImportIssue[] } {
  const parsed = projectConfigSchema.safeParse(value);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((issue) => ({
        sheet: JSON_SHEET,
        cell: [prefix, ...issue.path.map(String)].join("."),
        message: issue.message,
      })),
    };
  }
  const referenceIssues = validateProjectAgainstReference(parsed.data, reference).map((issue) => ({
    sheet: JSON_SHEET,
    cell: `${prefix}.${issue.path}`,
    message: issue.message,
  }));
  return referenceIssues.length > 0 ? { issues: referenceIssues } : { config: parsed.data, issues: [] };
}

/** 從 JSON 文字匯入單一專案設定；任何問題都丟 ImportError，指出 JSON 路徑。 */
export function parseProjectConfigJson(text: string, reference: ReferenceData): ProjectConfig {
  const json = parseJson(text);
  if (!json.ok) throw new ImportError([json.issue]);
  const { config, issues } = validateOne(json.value, reference, "$");
  if (config === undefined) throw new ImportError(issues);
  return config;
}

/** 從 JSON 文字匯入專案設定陣列；全部通過才回傳。 */
export function parseProjectConfigListJson(text: string, reference: ReferenceData): ProjectConfig[] {
  const json = parseJson(text);
  if (!json.ok) throw new ImportError([json.issue]);
  if (!Array.isArray(json.value)) {
    throw new ImportError([{ sheet: JSON_SHEET, cell: "$", message: "預期是專案設定陣列" }]);
  }
  const configs: ProjectConfig[] = [];
  const issues: ImportIssue[] = [];
  json.value.forEach((item: unknown, index) => {
    const result = validateOne(item, reference, `$[${index}]`);
    if (result.config !== undefined) configs.push(result.config);
    issues.push(...result.issues);
  });
  if (issues.length > 0) throw new ImportError(issues);
  return configs;
}
