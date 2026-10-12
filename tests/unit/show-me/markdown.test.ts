import { describe, expect, it } from "vitest";
import { renderFeedbackMd } from "../../../tools/show-me/lib/markdown.mjs";
import type { FeedbackPayload } from "../../../tools/show-me/lib/validate.mjs";
import { makeRound, rectEntry, tmpRoot } from "./helpers";

describe("renderFeedbackMd", () => {
  const fb: FeedbackPayload = {
    schemaVersion: 1,
    items: {
      home: { status: "change", comment: "標題太小\n請放大", annotations: [
        { id: "a1", n: 1, type: "rect", x: 10, y: 20, w: 100, h: 50, text: "放大" },
        { id: "a2", n: 2, type: "pin", x: 300, y: 40, text: "" },
        { id: "a3", n: 3, type: "path", points: [[0, 0], [10, 20]], text: "這條線" },
      ] },
      detail: { status: "ok", comment: "", annotations: [] },
    },
  };

  it("先列要處理的項目（含標注與圖路徑），OK 收成一行放最後", () => {
    const round = makeRound(tmpRoot());
    const md = renderFeedbackMd(round, fb, { annotated: new Set(["home"]), submittedAt: "2026-10-13T10:00:00.000Z" });
    const todo = md.indexOf("## 要處理（1 項）");
    const rest = md.indexOf("## OK／未標記（1 項）");
    expect(todo).toBeGreaterThan(0);
    expect(rest).toBeGreaterThan(todo);
    expect(md).toContain(`.review/rounds/${round.id}/home.annotated.png`);
    expect(md).toContain(`.review/rounds/${round.id}/home.png`);
    expect(md).toContain("- #1 [矩形框] 左上 (10, 20)，寬 100 × 高 50 — 放大");
    expect(md).toContain("- #2 [圖釘] 位置 (300, 40) — （無文字）");
    expect(md).toContain("[手繪] 外框 左上 (0, 0)，寬 10 × 高 20（2 點）");
    expect(md).toContain("整體留言：標題太小 ／ 請放大");
    expect(md).toContain("- 2. 項目 detail（detail）：OK");
    expect(md).not.toContain("### 2.");
  });

  it("沒有成功產生標注圖時不寫 annotated 路徑", () => {
    const md = renderFeedbackMd(makeRound(tmpRoot()), fb);
    expect(md).not.toContain("annotated.png");
  });

  it("全部 OK 時說明沒有要處理的項目", () => {
    const md = renderFeedbackMd(makeRound(tmpRoot()), { schemaVersion: 1, items: { home: { ...rectEntry, status: "ok", annotations: [] } } });
    expect(md).toContain("## 要處理（0 項）");
    expect(md).toContain("（沒有。全部 OK 或未標記。）");
  });
});
