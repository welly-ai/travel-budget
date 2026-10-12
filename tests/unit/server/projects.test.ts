import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { calculateProject as calculateWithEngine } from "@/engine";
import { readWorkbookBuffer } from "@/import";
import { ConflictError, NotFoundError } from "@/server";
import { buildSyntheticReference } from "../../fixtures/synthetic/reference";
import { createTestEnv, type TestEnv } from "./helpers";

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

describe("讀取與試算", () => {
  it("列出三個示範專案，總人天與引擎直接計算一致", () => {
    const list = env.services.listProjects();
    expect(list.map((p) => p.code)).toEqual(["SYN01", "SYN02", "SYN03"]);
    const record = env.services.getProject({ projectCode: "SYN02" });
    const direct = calculateWithEngine(record.config, buildSyntheticReference());
    expect(list.find((p) => p.code === "SYN02")?.totalManDays).toBe(direct.total.manDays);
  });

  it("試算套用覆寫但不寫入資料庫", () => {
    const before = env.services.getProject({ projectCode: "SYN01" });
    const { config, result } = env.services.calculateProject({ projectCode: "SYN01", overrides: { projectClass: 2, gates: { hapticTp2: true } } });
    expect(config.projectClass).toBe(2);
    expect(config.gates.hapticTp2).toBe(true);
    expect(result.total.manDays).not.toBe(env.services.calculateProject({ projectCode: "SYN01" }).result.total.manDays);
    expect(env.services.getProject({ projectCode: "SYN01" })).toEqual(before);
  });

  it("找不到專案丟 NotFoundError，空白輸入被 Zod 擋下", () => {
    expect(() => env.services.getProject({ projectCode: "NOPE" })).toThrow(NotFoundError);
    expect(() => env.services.getProject({ projectCode: "  " })).toThrow();
  });
});

describe("存檔、樂觀鎖與修訂", () => {
  it("存檔把版本加 1，並在同一個交易寫一筆含完整快照的修訂", () => {
    env.advance(60_000);
    const saved = env.services.updateProject({
      projectCode: "SYN01",
      expectedVersion: 1,
      settings: { ...env.services.getProject({ projectCode: "SYN01" }).config, projectClass: 3 },
      actorId: actor(1),
    });
    expect(saved.version).toBe(2);
    expect(saved.config.projectClass).toBe(3);
    expect(saved.updatedByName).toBe("小美");
    const revisions = env.services.listRevisions({ projectCode: "SYN01" });
    expect(revisions.map((r) => [r.version, r.byName])).toEqual([[2, "小美"], [1, "示範使用者"]]);
    const row = env.db
      .select()
      .from(schema.projectRevisions)
      .innerJoin(schema.projects, eq(schema.projectRevisions.projectId, schema.projects.id))
      .where(and(eq(schema.projects.code, "SYN01"), eq(schema.projectRevisions.version, 2)))
      .get();
    expect(row?.project_revisions.snapshot.config.projectClass).toBe(3);
    expect(row?.project_revisions.snapshot.schemaVersion).toBe(1);
    // 固定欄位跟著 config 同步
    expect(row?.projects.projectClass).toBe(3);
  });

  it("版本對不上就丟 ConflictError，帶上最後修改者與時間，且不寫入任何東西", () => {
    const base = env.services.getProject({ projectCode: "SYN01" });
    env.services.updateProject({ projectCode: "SYN01", expectedVersion: 1, settings: { ...base.config, projectClass: 3 }, actorId: actor(1) });
    let caught: unknown;
    try {
      env.services.updateProject({ projectCode: "SYN01", expectedVersion: 1, settings: { ...base.config, projectClass: 2 }, actorId: actor(0) });
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConflictError);
    if (!(caught instanceof ConflictError)) throw new Error("應該是 ConflictError");
    expect(caught.currentVersion).toBe(2);
    expect(caught.updatedByName).toBe("小美");
    const after = env.services.getProject({ projectCode: "SYN01" });
    expect(after.version).toBe(2);
    expect(after.config.projectClass).toBe(3);
    expect(env.services.listRevisions({ projectCode: "SYN01" })).toHaveLength(2);
  });

  it("不合法的設定（例如 Class 5）被 Zod 擋下，不寫入", () => {
    const base = env.services.getProject({ projectCode: "SYN01" });
    expect(() =>
      env.services.updateProject({
        projectCode: "SYN01",
        expectedVersion: 1,
        // @ts-expect-error 刻意傳入不合法的 Class，驗證執行期的 Zod 防線
        settings: { ...base.config, projectClass: 5 },
        actorId: actor(0),
      }),
    ).toThrow();
    expect(env.services.getProject({ projectCode: "SYN01" }).version).toBe(1);
  });
});

describe("匯出（舊版面）", () => {
  it("產生 Input、Super table、Projects Summary、OA Upload_All 與說明工作表", async () => {
    const { filename, buffer } = await env.services.exportProjectWorkbook({ projectCode: "SYN02" });
    expect(filename).toBe("SYN02-v1.xlsx");
    const workbook = await readWorkbookBuffer(buffer);
    const names = workbook.worksheets.map((sheet) => sheet.name);
    expect(names).toEqual(expect.arrayContaining(["說明", "Input", "Super table_01", "Projects Summary", "OA Upload_All"]));
    expect(names).toHaveLength(5);
  });
});
