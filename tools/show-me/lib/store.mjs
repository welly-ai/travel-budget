// .review/ 的讀寫：輪次、回饋、原子寫入。
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeId, isSafeId, resolveInside } from "./paths.mjs";
import { validateFeedback, validateRound } from "./validate.mjs";

export const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const reviewDir = (root) => path.join(root, ".review");
export const reportsDir = (root) => path.join(reviewDir(root), "reports");
export const roundsDir = (root) => path.join(reviewDir(root), "rounds");
export const roundDir = (root, id) => resolveInside(roundsDir(root), assertSafeId(id, "輪次 id"));

// 先寫暫存檔再 rename：中途失敗或當機時，讀到的永遠是完整的舊檔或完整的新檔。
export function writeFileAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

export const writeJsonAtomic = (file, value) => writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);

const pad = (n) => String(n).padStart(2, "0");

// 時間戳（UTC）＋ git 短 SHA。例：20261013-083015-a1b2c3d
export function makeRoundId(date, sha) {
  const stamp = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  const clean = typeof sha === "string" && /^[0-9a-f]{4,40}$/i.test(sha) ? sha.toLowerCase() : "nogit";
  return `${stamp}-${clean}`;
}

export function gitShortSha(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || "nogit";
  } catch {
    return "nogit";
  }
}

// 建立輪次資料夾（同一秒內重複建立時加 -2、-3…）。回傳 { id, dir }。
export function allocateRound(root, date, sha) {
  fs.mkdirSync(roundsDir(root), { recursive: true });
  const base = makeRoundId(date, sha);
  for (let i = 1; i < 100; i += 1) {
    const id = i === 1 ? base : `${base}-${i}`;
    try {
      const dir = resolveInside(roundsDir(root), id);
      fs.mkdirSync(dir);
      return { id, dir };
    } catch (err) {
      if (!(err instanceof Error && "code" in err && err.code === "EEXIST")) throw err;
    }
  }
  throw new Error("無法配置輪次 id");
}

// 前一輪有同 id 的 item 時，填入 previousItemId（格式：<前一輪 id>/<item id>）。
export function linkPreviousItems(items, previousRound) {
  const prevIds = new Set(previousRound ? previousRound.items.map((it) => it.id) : []);
  return items.map((it) => {
    const copy = { ...it };
    delete copy.previousItemId;
    return previousRound && prevIds.has(it.id) ? { ...copy, previousItemId: `${previousRound.id}/${it.id}` } : copy;
  });
}

export function writeRound(root, round) {
  const checked = validateRound(round);
  if (!checked.ok) throw new Error(`round.json 不合法：${checked.errors.join("；")}`);
  writeJsonAtomic(path.join(roundDir(root, round.id), "round.json"), round);
}

export function readRound(root, id) {
  if (!isSafeId(id)) return null;
  let raw;
  try {
    raw = fs.readFileSync(path.join(roundDir(root, id), "round.json"), "utf8");
  } catch {
    return null;
  }
  try {
    const checked = validateRound(JSON.parse(raw));
    return checked.ok ? checked.value : null;
  } catch {
    return null;
  }
}

// 新到舊。
export function listRounds(root) {
  let names = [];
  try {
    names = fs.readdirSync(roundsDir(root));
  } catch {
    return [];
  }
  return names
    .filter(isSafeId)
    .sort()
    .reverse()
    .map((name) => readRound(root, name))
    .filter((r) => r !== null);
}

export function emptyFeedback(roundId) {
  return { schemaVersion: 1, roundId, status: "draft", updatedAt: new Date(0).toISOString(), items: {} };
}

export function readFeedback(root, round) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(roundDir(root, round.id), "feedback.json"), "utf8"));
    const checked = validateFeedback(raw, { itemIds: round.items.map((i) => i.id) });
    if (checked.ok) {
      const meta = { roundId: round.id, status: raw.status === "submitted" ? "submitted" : "draft", updatedAt: String(raw.updatedAt ?? "") };
      return { ...checked.value, ...meta, ...(typeof raw.submittedAt === "string" ? { submittedAt: raw.submittedAt } : {}) };
    }
  } catch {
    // 沒有或壞掉的 feedback.json 視為空白
  }
  return emptyFeedback(round.id);
}

export function saveFeedback(root, round, payload, now = new Date()) {
  const checked = validateFeedback(payload, { itemIds: round.items.map((i) => i.id) });
  if (!checked.ok) return checked;
  const file = { ...checked.value, roundId: round.id, status: "draft", updatedAt: now.toISOString() };
  writeJsonAtomic(path.join(roundDir(root, round.id), "feedback.json"), file);
  return { ok: true, value: file };
}

// 已送出、尚未被 agent 處理的最新一輪。
export function latestPending(root) {
  return listRounds(root).find((r) => r.status === "submitted") ?? null;
}

export function markResolved(root, id, now = new Date()) {
  const round = readRound(root, id);
  if (!round) return { ok: false, error: `找不到輪次 ${id}` };
  if (round.status === "open") return { ok: false, error: `輪次 ${id} 還沒送出回饋，不能標記已處理` };
  const next = { ...round, status: "resolved", resolvedAt: now.toISOString() };
  writeRound(root, next);
  return { ok: true, round: next };
}

export function summarizeFeedback(round, feedback) {
  const counts = { pending: 0, ok: 0, change: 0, question: 0 };
  for (const item of round.items) counts[feedback.items[item.id]?.status ?? "pending"] += 1;
  return counts;
}
