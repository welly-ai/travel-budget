import { describe, expect, it } from "vitest";
import { validateFeedback, validateRound } from "../../../tools/show-me/lib/validate.mjs";
import { rectEntry } from "./helpers";

const ok = (items: unknown) => ({ schemaVersion: 1, items });

describe("validateFeedback", () => {
  it("接受正確的 payload 並回傳清理後的複本（多餘欄位被丟掉）", () => {
    const r = validateFeedback(ok({ home: { ...rectEntry, evil: "x" } }), { itemIds: ["home"] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.items["home"]?.annotations).toHaveLength(2);
      expect(r.value.items["home"]).not.toHaveProperty("evil");
    }
  });

  it("拒絕不在本輪的 item id", () => {
    const r = validateFeedback(ok({ other: rectEntry }), { itemIds: ["home"] });
    expect(r.ok).toBe(false);
  });

  it.each([
    ["非物件", "x"],
    ["schemaVersion 錯", { schemaVersion: 2, items: {} }],
    ["status 錯", ok({ home: { ...rectEntry, status: "great" } })],
    ["座標是字串", ok({ home: { ...rectEntry, annotations: [{ id: "a1", n: 1, type: "rect", x: "1", y: 0, w: 1, h: 1, text: "" }] } })],
    ["座標是 NaN／負數", ok({ home: { ...rectEntry, annotations: [{ id: "a1", n: 1, type: "pin", x: -5, y: 0, text: "" }] } })],
    ["標注類型未知", ok({ home: { ...rectEntry, annotations: [{ id: "a1", n: 1, type: "circle", text: "" }] } })],
    ["標注 id 重複", ok({ home: { ...rectEntry, annotations: [rectEntry.annotations[0], rectEntry.annotations[0]] } })],
    ["留言過長", ok({ home: { ...rectEntry, comment: "x".repeat(5001) } })],
    ["item id 含路徑", ok({ "../x": rectEntry })],
    ["path 沒有點", ok({ home: { ...rectEntry, annotations: [{ id: "p", n: 1, type: "path", points: [], text: "" }] } })],
  ])("拒絕：%s", (_name, payload) => {
    expect(validateFeedback(payload, { itemIds: ["home"] }).ok).toBe(false);
  });

  it("接受手繪與箭頭", () => {
    const r = validateFeedback(ok({ home: { status: "ok", comment: "", annotations: [
      { id: "p", n: 1, type: "path", points: [[1, 2], [3, 4]], text: "" },
      { id: "r", n: 2, type: "arrow", x1: 0, y1: 0, x2: 5, y2: 5, text: "看這" },
    ] } }));
    expect(r.ok).toBe(true);
  });
});

describe("validateRound", () => {
  const base = { schemaVersion: 1, id: "20261013-083015-abc1234", createdAt: "2026-10-13T08:30:15.000Z", gitSha: "abc1234", summary: "", status: "open", items: [{ id: "home", title: "t", screenshot: "home.png", route: "/", viewport: { width: 1, height: 1 } }] };
  it("接受合法 round", () => { expect(validateRound(base).ok).toBe(true); });
  it("拒絕非 png 的 screenshot（防穿越）", () => {
    expect(validateRound({ ...base, items: [{ ...base.items[0], screenshot: "../../etc/passwd" }] }).ok).toBe(false);
  });
  it("拒絕不合法的 reference 檔名", () => {
    expect(validateRound({ ...base, items: [{ ...base.items[0], reference: "../x.png" }] }).ok).toBe(false);
    expect(validateRound({ ...base, items: [{ ...base.items[0], reference: "home.ref.png" }] }).ok).toBe(true);
  });
  it("拒絕重複 item id", () => {
    expect(validateRound({ ...base, items: [base.items[0], base.items[0]] }).ok).toBe(false);
  });
});
