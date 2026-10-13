/** 找不到專案（或其他資料）。 */
export class NotFoundError extends Error {
  override readonly name = "NotFoundError";
}

import type { OverrideWarning } from "@/domain";

/** 樂觀鎖衝突：讀取後已有別人存檔。交給使用者決定，不可自動覆蓋（AGENTS.md 紅線 5）。 */
export class ConflictError extends Error {
  override readonly name = "ConflictError";
  /** 衝突的對象，給人看的，例如「專案 SYN01」「容許範圍設定「預設（±30%）」」。 */
  readonly subject: string;
  readonly expectedVersion: number;
  readonly currentVersion: number;
  readonly updatedByName: string | null;
  readonly updatedAt: string;

  constructor(details: {
    subject: string;
    expectedVersion: number;
    currentVersion: number;
    updatedByName: string | null;
    updatedAt: string;
  }) {
    super(`${details.subject} 已經是第 ${details.currentVersion} 版，你的修改是以第 ${details.expectedVersion} 版為基礎`);
    this.subject = details.subject;
    this.expectedVersion = details.expectedVersion;
    this.currentVersion = details.currentVersion;
    this.updatedByName = details.updatedByName;
    this.updatedAt = details.updatedAt;
  }
}

/** 名稱已被使用（例如容許範圍設定的名稱必須唯一）。 */
export class DuplicateNameError extends Error {
  override readonly name = "DuplicateNameError";
}

/** 有覆寫偏離容許範圍卻沒填理由：拒絕存檔，cells 列出是哪幾格。 */
export class OverrideReasonRequiredError extends Error {
  override readonly name = "OverrideReasonRequiredError";
  readonly projectCode: string;
  readonly cells: OverrideWarning[];

  constructor(projectCode: string, cells: OverrideWarning[]) {
    super(`專案 ${projectCode} 有 ${cells.length} 格手動覆寫超出容許範圍，必須填理由：${cells.map((cell) => `${cell.stage} × ${cell.function}`).join("、")}`);
    this.projectCode = projectCode;
    this.cells = cells;
  }
}
