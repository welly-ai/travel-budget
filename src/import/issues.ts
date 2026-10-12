/** 匯入時發現的一個問題，指出是哪個 sheet 的哪個儲存格（JSON 匯入則是 sheet="JSON"、cell=JSON 路徑）。 */
export interface ImportIssue {
  sheet: string;
  cell: string;
  message: string;
}

export class ImportError extends Error {
  readonly issues: readonly ImportIssue[];

  constructor(issues: readonly ImportIssue[]) {
    super(ImportError.summarize(issues));
    this.name = "ImportError";
    this.issues = issues;
  }

  private static summarize(issues: readonly ImportIssue[]): string {
    const lines = issues.slice(0, 20).map((issue) => `${issue.sheet}!${issue.cell}：${issue.message}`);
    const more = issues.length > 20 ? `\n…另有 ${issues.length - 20} 個問題` : "";
    return `匯入失敗，共 ${issues.length} 個問題：\n${lines.join("\n")}${more}`;
  }
}
