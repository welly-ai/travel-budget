// 指令解析：不假設 PATH 上有 pnpm，也不假設 `node` 是專案指定的版本。
//   "node ..."  → 用目前執行 hook 的 node（process.execPath）
//   "pnpm ..."  → 依序嘗試 PATH 上的 pnpm（Windows 為 pnpm.cmd）→ corepack pnpm → mise exec -- pnpm
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PROJECT_ROOT } from "./lib.mjs";

export class ToolchainMissingError extends Error {}

export function pnpmCandidates(platform = process.platform) {
  const direct = platform === "win32" ? ["pnpm.cmd", "pnpm"] : ["pnpm"];
  return [...direct.map((pnpm) => pnpm), "corepack pnpm", "mise exec -- pnpm"];
}

/** 能執行 `<candidate> --version` 就算可用。 */
export function probeCandidate(candidate, env) {
  const result = spawnSync(`${candidate} --version`, { shell: true, env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 20000 });
  return result.status === 0;
}

const quote = (path) => (/\s/.test(path) ? `"${path}"` : path);

/**
 * 回傳實際要交給 shell 的指令；找不到 pnpm 時丟出 ToolchainMissingError。
 * @param {string} command
 * @param {{ env?: Record<string, string | undefined>, platform?: string, execPath?: string, probe?: (candidate: string, env: Record<string, string | undefined>) => boolean }} [options]
 */
export function resolveCommand(command, { env = process.env, platform = process.platform, execPath = process.execPath, probe = probeCandidate } = {}) {
  if (/^node(\s|$)/.test(command)) return `${quote(execPath)}${command.slice(4)}`;
  const match = /^pnpm(\s.*|)$/.exec(command);
  if (!match) return command;
  for (const candidate of pnpmCandidates(platform)) {
    if (probe(candidate, env)) return `${candidate}${match[1]}`;
  }
  throw new ToolchainMissingError(
    "找不到 pnpm（已嘗試 PATH 上的 pnpm、corepack pnpm、mise exec -- pnpm）。請安裝 pnpm，或執行 `corepack enable`。這不是檢查本身失敗。",
  );
}

/** 讀 package.json engines.node 的最低主版本；node 低於它時回傳警告文字（只警告，不影響結果）。 */
export function nodeVersionWarning(version = process.versions.node, root = PROJECT_ROOT) {
  try {
    const engines = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).engines?.node ?? "";
    const min = /(\d+)/.exec(String(engines));
    if (min && Number(version.split(".")[0]) < Number(min[1])) {
      return `執行 hook 的 node 是 v${version}，低於 package.json engines 要求（${engines}）；檢查結果可能與正式環境不同。`;
    }
  } catch {
    // 讀不到就不警告。
  }
  return null;
}
