import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertSafeName, isSafeId, isSafeName, resolveInside, resolveRepoFile, UnsafePathError } from "../../../tools/show-me/lib/paths.mjs";
import { tmpRoot } from "./helpers";

const attacks = ["../x", "..\\x", "..", "a/../b", "a\\b", "/etc/passwd", "C:\\Windows\\win.ini", "C:evil", "\\\\server\\share", "x\u0000.png", ".hidden", "a..b", "", " ", "con:", "a/b"];

describe("路徑穿越防護", () => {
  it.each(attacks)("assertSafeName 拒絕 %j", (name) => {
    expect(() => assertSafeName(name)).toThrow(UnsafePathError);
    expect(isSafeName(name)).toBe(false);
  });

  it("接受一般名稱（含中文）", () => {
    for (const n of ["report.html", "階段回報-1.html", "a b.png"]) expect(isSafeName(n)).toBe(true);
  });

  it.each(["../x", "..\\x", "/abs", "a/b", "", "x".repeat(65)])("isSafeId 拒絕 %j", (id) => {
    expect(isSafeId(id)).toBe(false);
  });

  it("resolveInside 回傳 root 底下的路徑，拒絕穿越", () => {
    const root = tmpRoot();
    expect(resolveInside(root, "a.html")).toBe(path.join(root, "a.html"));
    expect(() => resolveInside(root, "..")).toThrow(UnsafePathError);
    expect(() => resolveInside(root, "..\\..\\x")).toThrow(UnsafePathError);
    expect(() => resolveInside(root, path.resolve("/etc/passwd"))).toThrow(UnsafePathError);
  });

  it("resolveInside 拒絕指向 root 外的符號連結", () => {
    const root = tmpRoot();
    const outside = tmpRoot();
    fs.writeFileSync(path.join(outside, "secret.txt"), "s");
    try {
      fs.symlinkSync(outside, path.join(root, "link"), "dir");
    } catch {
      return; // 沒有建立符號連結的權限（Windows 一般使用者）
    }
    expect(() => resolveInside(root, "link")).toThrow(UnsafePathError);
  });

  it("resolveRepoFile 只接受 repo 內存在的相對路徑", () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, "local-data"));
    fs.writeFileSync(path.join(root, "local-data", "ref 1.png"), "x");
    expect(resolveRepoFile(root, "local-data/ref 1.png")).toContain("ref 1.png");
    expect(resolveRepoFile(root, "local-data\\ref 1.png")).toContain("ref 1.png");
    for (const bad of ["../outside.png", "..\\outside.png", "local-data/../../x", "/etc/passwd", "C:\\x.png", "local-data/missing.png", "local-data//ref 1.png", ""]) {
      expect(() => resolveRepoFile(root, bad), bad).toThrow(UnsafePathError);
    }
  });
});
