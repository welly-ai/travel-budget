import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertLocalBaseUrl, parseConfig } from "../../../tools/show-me/lib/config.mjs";
import { tmpRoot } from "./helpers";

describe("assertLocalBaseUrl", () => {
  it("接受本機直連", () => {
    expect(assertLocalBaseUrl("http://127.0.0.1:3000/")).toBe("http://127.0.0.1:3000");
    expect(assertLocalBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });
  it.each(["https://box.tail1234.ts.net:3000", "http://192.168.1.5:3000", "https://example.com", "not a url"])("拒絕 %s", (u) => {
    expect(() => assertLocalBaseUrl(u)).toThrow();
  });
});

describe("parseConfig", () => {
  const item = { id: "home", title: "首頁", route: "/" };
  it("預設 baseUrl 與 viewport", () => {
    const c = parseConfig({ items: [item] }, tmpRoot());
    expect(c.baseUrl).toBe("http://127.0.0.1:3000");
    expect(c.items[0]?.viewport).toEqual({ width: 1280, height: 800 });
  });
  it("拒絕壞 id、重複 id、route 不是 / 開頭", () => {
    const root = tmpRoot();
    expect(() => parseConfig({ items: [{ ...item, id: "../x" }] }, root)).toThrow();
    expect(() => parseConfig({ items: [item, item] }, root)).toThrow();
    expect(() => parseConfig({ items: [{ ...item, route: "http://evil" }] }, root)).toThrow();
  });
  it("reference 必須是 repo 內存在的圖檔", () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, "local-data"));
    fs.writeFileSync(path.join(root, "local-data", "t.png"), "x");
    fs.writeFileSync(path.join(root, "local-data", "t.txt"), "x");
    expect(parseConfig({ items: [{ ...item, reference: "local-data/t.png" }] }, root).items[0]?.reference?.ext).toBe(".png");
    expect(() => parseConfig({ items: [{ ...item, reference: "../t.png" }] }, root)).toThrow();
    expect(() => parseConfig({ items: [{ ...item, reference: "local-data/t.txt" }] }, root)).toThrow();
    expect(() => parseConfig({ items: [{ ...item, reference: "/etc/hosts" }] }, root)).toThrow();
  });
});
