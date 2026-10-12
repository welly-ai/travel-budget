import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadExcelLayout } from "@/import";
import { syntheticLayout } from "../fixtures/synthetic/layout";

describe("loadExcelLayout", () => {
  const dir = mkdtempSync(join(tmpdir(), "layout-test-"));

  it("讀取並驗證合法的版面設定", () => {
    const path = join(dir, "ok.json");
    writeFileSync(path, JSON.stringify(syntheticLayout));
    expect(loadExcelLayout(path)).toEqual(syntheticLayout);
  });

  it("找不到檔案時，錯誤訊息指出路徑與範例位置", () => {
    expect(() => loadExcelLayout(join(dir, "missing.json"))).toThrow(/missing\.json[\s\S]*tests\/fixtures\/synthetic\/excel-layout\.json/);
  });

  it("不是 JSON", () => {
    const path = join(dir, "bad.json");
    writeFileSync(path, "{nope");
    expect(() => loadExcelLayout(path)).toThrow(/不是合法 JSON/);
  });

  it("欄位不合法時指出欄位路徑", () => {
    const path = join(dir, "short.json");
    writeFileSync(path, JSON.stringify({ ...syntheticLayout, oaHeaders: ["only one"] }));
    expect(() => loadExcelLayout(path)).toThrow(/oaHeaders/);
  });
});
