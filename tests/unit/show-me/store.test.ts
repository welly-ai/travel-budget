import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allocateRound, latestPending, linkPreviousItems, listRounds, makeRoundId, markResolved, readFeedback, readRound, roundDir, saveFeedback, writeJsonAtomic, writeRound } from "../../../tools/show-me/lib/store.mjs";
import { makeRound, rectEntry, tmpRoot } from "./helpers";

describe("round id", () => {
  it("時間戳（UTC）＋ git 短 SHA", () => {
    expect(makeRoundId(new Date("2026-10-13T08:30:15Z"), "A1B2C3D")).toBe("20261013-083015-a1b2c3d");
  });
  it("SHA 不合法或缺少時用 nogit", () => {
    expect(makeRoundId(new Date("2026-01-02T03:04:05Z"), "../../x")).toBe("20261002-030405-nogit".replace("20261002", "20260102"));
    expect(makeRoundId(new Date("2026-01-02T03:04:05Z"), "")).toMatch(/-nogit$/);
  });
  it("同一秒重複配置時加後綴，不覆蓋", () => {
    const root = tmpRoot();
    const t = new Date("2026-10-13T08:30:15Z");
    const a = allocateRound(root, t, "abc1234");
    const b = allocateRound(root, t, "abc1234");
    expect(b.id).toBe(`${a.id}-2`);
  });
  it("輪次由新到舊排序", () => {
    const root = tmpRoot();
    const r1 = makeRound(root, new Date("2026-10-13T08:00:00Z"));
    const r2 = makeRound(root, new Date("2026-10-13T09:00:00Z"));
    expect(listRounds(root).map((r) => r.id)).toEqual([r2.id, r1.id]);
  });
  it("readRound 拒絕穿越 id", () => {
    const root = tmpRoot();
    expect(readRound(root, "../../etc")).toBeNull();
    expect(readRound(root, "..\\x")).toBeNull();
  });
});

describe("previousItemId", () => {
  const items = [
    { id: "home", title: "h", screenshot: "home.png", route: "/", viewport: { width: 1, height: 1 } },
    { id: "new", title: "n", screenshot: "new.png", route: "/n", viewport: { width: 1, height: 1 } },
  ];
  it("前一輪有同 id 才填，格式為 <輪次>/<item>", () => {
    const root = tmpRoot();
    const prev = makeRound(root, undefined, ["home"]);
    const linked = linkPreviousItems(items, prev);
    expect(linked[0]?.previousItemId).toBe(`${prev.id}/home`);
    expect(linked[1]).not.toHaveProperty("previousItemId");
  });
  it("沒有前一輪就不填，且清掉殘留值", () => {
    const linked = linkPreviousItems([{ ...items[0], id: "home", title: "h", screenshot: "home.png", route: "/", viewport: { width: 1, height: 1 }, previousItemId: "x/y" }], null);
    expect(linked[0]).not.toHaveProperty("previousItemId");
  });
});

describe("原子寫入", () => {
  it("寫完不留暫存檔，內容完整", () => {
    const root = tmpRoot();
    const f = path.join(root, "a.json");
    writeJsonAtomic(f, { a: 1 });
    writeJsonAtomic(f, { a: 2 });
    expect(JSON.parse(fs.readFileSync(f, "utf8"))).toEqual({ a: 2 });
    expect(fs.readdirSync(root)).toEqual(["a.json"]);
  });
  it("寫入失敗時保留舊檔並清掉暫存檔", () => {
    const root = tmpRoot();
    const f = path.join(root, "a.json");
    writeJsonAtomic(f, { ok: true });
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    expect(() => { writeJsonAtomic(f, circular); }).toThrow();
    expect(JSON.parse(fs.readFileSync(f, "utf8"))).toEqual({ ok: true });
    expect(fs.readdirSync(root)).toEqual(["a.json"]);
  });
});

describe("feedback 存取與狀態", () => {
  it("saveFeedback 寫入 feedback.json 並可讀回", () => {
    const root = tmpRoot();
    const round = makeRound(root);
    const res = saveFeedback(root, round, { schemaVersion: 1, items: { home: rectEntry } });
    expect(res.ok).toBe(true);
    const back = readFeedback(root, round);
    expect(back.items["home"]?.annotations).toHaveLength(2);
    expect(back.roundId).toBe(round.id);
    expect(back.status).toBe("draft");
  });
  it("不合法 payload 不會動到既有檔案", () => {
    const root = tmpRoot();
    const round = makeRound(root);
    saveFeedback(root, round, { schemaVersion: 1, items: { home: rectEntry } });
    const bad = saveFeedback(root, round, { schemaVersion: 1, items: { home: { status: "x" } } });
    expect(bad.ok).toBe(false);
    expect(readFeedback(root, round).items["home"]?.comment).toBe("標題太小");
  });
  it("latestPending 與 markResolved", () => {
    const root = tmpRoot();
    const round = makeRound(root);
    expect(latestPending(root)).toBeNull();
    expect(markResolved(root, round.id).ok).toBe(false); // 還沒送出
    writeRound(root, { ...round, status: "submitted", submittedAt: "2026-10-13T10:00:00.000Z" });
    expect(latestPending(root)?.id).toBe(round.id);
    const res = markResolved(root, round.id);
    expect(res.ok).toBe(true);
    expect(latestPending(root)).toBeNull();
    expect(readRound(root, round.id)?.resolvedAt).toBeTruthy();
    expect(fs.existsSync(path.join(roundDir(root, round.id), "round.json"))).toBe(true);
  });
});
