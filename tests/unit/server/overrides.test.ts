import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { DEFAULT_TOLERANCE_PROFILE_ID, type CellOverride, type GuidanceCell } from "@/domain";
import { ConflictError, DuplicateNameError, NotFoundError, OverrideReasonRequiredError } from "@/server";
import { createTestEnv, type TestEnv } from "./helpers";
import { toV1Json } from "../helpers";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(() => {
  env.cleanup();
});

function actor(index: number): string {
  const id = env.userIds[index];
  if (id === undefined) throw new Error(`沒有第 ${index} 個測試帳號`);
  return id;
}

/** SYN01 第一個有效 Guidance 人天為正的格子。 */
function positiveCell(): GuidanceCell {
  const cell = env.services.reviewOverrides({ projectCode: "SYN01" }).guidance.find((item) => item.manDays > 0 && item.man > 0);
  if (cell === undefined) throw new Error("SYN01 沒有正值的 Guidance 格子");
  return cell;
}

/** 人次不變，天數乘上 factor。 */
function scaled(cell: GuidanceCell, factor: number, reason = ""): CellOverride {
  return { stage: cell.stage, function: cell.function, man: cell.man, days: cell.days * factor, reason };
}

function save(cellOverrides: CellOverride[], toleranceProfileId: string | null = null, expectedVersion = 1) {
  const base = env.services.getProject({ projectCode: "SYN01" });
  return env.services.updateProject({
    projectCode: "SYN01",
    expectedVersion,
    settings: base.config,
    cellOverrides,
    toleranceProfileId,
    actorId: actor(0),
  });
}

describe("容許範圍設定", () => {
  it("migration 建好預設組（±30%）", () => {
    const profiles = env.services.listToleranceProfiles();
    expect(profiles).toEqual([expect.objectContaining({ id: DEFAULT_TOLERANCE_PROFILE_ID, maxIncreasePct: 30, maxDecreasePct: 30, isDefault: true, version: 1 })]);
  });

  it("新增、讀取、修改；修改把版本加 1", () => {
    const created = env.services.createToleranceProfile({ name: "海外", maxIncreasePct: 50, maxDecreasePct: 20, actorId: actor(0) });
    expect(created).toMatchObject({ name: "海外", version: 1, isDefault: false, updatedByName: "示範使用者" });
    const updated = env.services.updateToleranceProfile({
      profileId: created.id,
      expectedVersion: 1,
      name: "海外",
      maxIncreasePct: 60,
      maxDecreasePct: 20,
      actorId: actor(1),
    });
    expect(updated).toMatchObject({ version: 2, maxIncreasePct: 60, updatedByName: "小美" });
    expect(env.services.getToleranceProfile({ profileId: created.id })).toEqual(updated);
  });

  it("修改時版本對不上丟 ConflictError，不寫入", () => {
    const input = { profileId: DEFAULT_TOLERANCE_PROFILE_ID, name: "預設（±30%）", maxDecreasePct: 30, actorId: actor(0) };
    env.services.updateToleranceProfile({ ...input, expectedVersion: 1, maxIncreasePct: 40 });
    expect(() => env.services.updateToleranceProfile({ ...input, expectedVersion: 1, maxIncreasePct: 10 })).toThrow(ConflictError);
    expect(env.services.getToleranceProfile({ profileId: DEFAULT_TOLERANCE_PROFILE_ID })).toMatchObject({ version: 2, maxIncreasePct: 40 });
  });

  it("名稱重複丟 DuplicateNameError；負的百分比被 Zod 擋下", () => {
    expect(() => env.services.createToleranceProfile({ name: "預設（±30%）", maxIncreasePct: 1, maxDecreasePct: 1, actorId: actor(0) })).toThrow(DuplicateNameError);
    expect(() => env.services.createToleranceProfile({ name: "X", maxIncreasePct: -1, maxDecreasePct: 1, actorId: actor(0) })).toThrow();
  });
});

describe("手動覆寫存檔", () => {
  it("在容許範圍內不需要理由；修訂快照是 v2 並含覆寫", () => {
    const cell = positiveCell();
    const saved = save([scaled(cell, 1.3)]);
    expect(saved.version).toBe(2);
    expect(saved.config.cellOverrides).toHaveLength(1);
    const revision = env.db.select().from(schema.projectRevisions).where(eq(schema.projectRevisions.version, 2)).get();
    expect(revision?.snapshot.config.schemaVersion).toBe(2);
    expect(env.services.reviewOverrides({ projectCode: "SYN01" }).warnings).toEqual([]);
  });

  it("超出範圍又沒有理由：拒絕存檔，指出是哪幾格，且不寫入", () => {
    const cell = positiveCell();
    let caught: unknown;
    try {
      save([scaled(cell, 2, "   ")]);
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OverrideReasonRequiredError);
    if (!(caught instanceof OverrideReasonRequiredError)) throw new Error("應該是 OverrideReasonRequiredError");
    expect(caught.cells.map((item) => [item.stage, item.function, item.direction])).toEqual([[cell.stage, cell.function, "increase"]]);
    expect(env.services.getProject({ projectCode: "SYN01" }).version).toBe(1);
  });

  it("超出範圍但有理由：可以存，警告仍列出", () => {
    const cell = positiveCell();
    save([scaled(cell, 2, "客戶要求多跑一趟")]);
    const review = env.services.reviewOverrides({ projectCode: "SYN01" });
    expect(review.warnings).toHaveLength(1);
    expect(review.missingReasons).toEqual([]);
  });

  it("用專案選的容許範圍設定重算：放寬到 ±150% 就不需要理由", () => {
    const wide = env.services.createToleranceProfile({ name: "寬鬆", maxIncreasePct: 150, maxDecreasePct: 150, actorId: actor(0) });
    const saved = save([scaled(positiveCell(), 2)], wide.id);
    expect(saved.config.toleranceProfileId).toBe(wide.id);
    expect(env.services.reviewOverrides({ projectCode: "SYN01" }).profile.id).toBe(wide.id);
  });

  it("指定不存在的容許範圍設定丟 NotFoundError", () => {
    expect(() => save([], "no-such-profile")).toThrow(NotFoundError);
  });

  it("試算可帶草稿覆寫：reviewOverrides 與 calculateProject 都不寫入", () => {
    const cell = positiveCell();
    const draft = [scaled(cell, 2)];
    const review = env.services.reviewOverrides({ projectCode: "SYN01", cellOverrides: draft });
    expect(review.missingReasons).toHaveLength(1);
    const before = env.services.calculateProject({ projectCode: "SYN01" }).result.total.manDays;
    const after = env.services.calculateProject({ projectCode: "SYN01", cellOverrides: draft }).result.total.manDays;
    expect(after - before).toBeCloseTo(cell.manDays);
    expect(env.services.getProject({ projectCode: "SYN01" }).version).toBe(1);
  });
});

describe("資料庫裡的 v1 設定", () => {
  it("讀出時遷移成 v2", () => {
    const record = env.services.getProject({ projectCode: "SYN02" });
    env.db.update(schema.projects).set({ config: toV1Json(record.config) }).where(eq(schema.projects.code, "SYN02")).run();
    const reread = env.services.getProject({ projectCode: "SYN02" });
    expect(reread.config).toEqual(record.config);
    expect(reread.config.schemaVersion).toBe(2);
  });
});
