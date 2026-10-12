import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import { allocateRound, writeRound } from "../../../tools/show-me/lib/store.mjs";
import type { Round } from "../../../tools/show-me/lib/validate.mjs";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

export function tmpRoot(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "show-me-test-"));
  dirs.push(d);
  return d;
}

export function makeRound(root: string, when = new Date("2026-10-13T08:30:15Z"), itemIds = ["home", "detail"]): Round {
  const { id } = allocateRound(root, when, "a1b2c3d");
  const round: Round = {
    schemaVersion: 1,
    id,
    createdAt: when.toISOString(),
    gitSha: "a1b2c3d",
    summary: "請看首頁。",
    status: "open",
    items: itemIds.map((i) => ({ id: i, title: `項目 ${i}`, screenshot: `${i}.png`, route: `/${i}`, viewport: { width: 1280, height: 800 } })),
  };
  writeRound(root, round);
  return round;
}

export const rectEntry = {
  status: "change",
  comment: "標題太小",
  annotations: [
    { id: "a1", n: 1, type: "rect", x: 10, y: 20, w: 100, h: 50, text: "放大" },
    { id: "a2", n: 2, type: "pin", x: 300, y: 40, text: "" },
  ],
};
