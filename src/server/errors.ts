/** 找不到專案（或其他資料）。 */
export class NotFoundError extends Error {
  override readonly name = "NotFoundError";
}

/** 樂觀鎖衝突：讀取後已有別人存檔。交給使用者決定，不可自動覆蓋（AGENTS.md 紅線 5）。 */
export class ConflictError extends Error {
  override readonly name = "ConflictError";
  readonly projectCode: string;
  readonly expectedVersion: number;
  readonly currentVersion: number;
  readonly updatedByName: string | null;
  readonly updatedAt: string;

  constructor(details: {
    projectCode: string;
    expectedVersion: number;
    currentVersion: number;
    updatedByName: string | null;
    updatedAt: string;
  }) {
    super(`專案 ${details.projectCode} 已經是第 ${details.currentVersion} 版，你的修改是以第 ${details.expectedVersion} 版為基礎`);
    this.projectCode = details.projectCode;
    this.expectedVersion = details.expectedVersion;
    this.currentVersion = details.currentVersion;
    this.updatedByName = details.updatedByName;
    this.updatedAt = details.updatedAt;
  }
}
