import { describe, expect, it } from "vitest";
import { runStopGate } from "../../../scripts/hooks/gate.mjs";
import { ToolchainMissingError, nodeVersionWarning, pnpmCandidates, resolveCommand } from "../../../scripts/hooks/runner.mjs";
import { cleanEnv, repoRoot } from "./helpers";

const only = (...working: string[]) => (candidate: string) => working.includes(candidate);

describe("pnpm 解析（不假設 PATH 上有 pnpm）", () => {
  it("PATH 上有 pnpm 就直接用", () => {
    expect(resolveCommand("pnpm check", { platform: "linux", probe: only("pnpm") })).toBe("pnpm check");
  });

  it("PATH 沒有 pnpm → corepack", () => {
    expect(resolveCommand("pnpm check", { platform: "linux", probe: only("corepack pnpm", "mise exec -- pnpm") })).toBe("corepack pnpm check");
  });

  it("PATH 與 corepack 都沒有 → mise exec", () => {
    expect(resolveCommand("pnpm skills:check", { platform: "darwin", probe: only("mise exec -- pnpm") })).toBe("mise exec -- pnpm skills:check");
  });

  it("全部都沒有 → 丟出 ToolchainMissingError，訊息說明不是檢查失敗", () => {
    expect(() => resolveCommand("pnpm check", { probe: only() })).toThrow(ToolchainMissingError);
    expect(() => resolveCommand("pnpm check", { probe: only() })).toThrow(/corepack enable/);
  });

  it("Windows：優先找 pnpm.cmd", () => {
    expect(pnpmCandidates("win32").slice(0, 2)).toEqual(["pnpm.cmd", "pnpm"]);
    expect(pnpmCandidates("linux")[0]).toBe("pnpm");
    expect(resolveCommand("pnpm check", { platform: "win32", probe: only("pnpm.cmd") })).toBe("pnpm.cmd check");
  });

  it("開頭的 node 換成執行 hook 的 node（含空白路徑加引號）；其他指令原樣", () => {
    expect(resolveCommand("node scripts/skills-sync.mjs --check", { execPath: "/usr/bin/node" })).toBe("/usr/bin/node scripts/skills-sync.mjs --check");
    expect(resolveCommand("node a.mjs", { execPath: "C:\\Program Files\\nodejs\\node.exe" })).toBe('"C:\\Program Files\\nodejs\\node.exe" a.mjs');
    expect(resolveCommand("git status")).toBe("git status");
    expect(resolveCommand("pnpmx check")).toBe("pnpmx check");
  });
});

describe("Stop 關卡：工具鏈缺失與檢查失敗要分開", () => {
  it("找不到 pnpm → 擋下，訊息為「無法執行」而不是「失敗」", () => {
    const result = runStopGate({
      env: cleanEnv(),
      root: repoRoot,
      commands: ["pnpm check"],
      resolve: (command) => resolveCommand(command, { probe: only() }),
      run: () => ({ status: 0, output: "" }),
    });
    expect(result.block).toBe(true);
    if (result.block) {
      expect(result.reason).toContain("無法執行");
      expect(result.reason).toContain("找不到 pnpm");
      expect(result.reason).not.toContain("品質關卡失敗");
    }
  });
});

describe("node 版本警告", () => {
  it("低於 engines 時警告，達到或更高時不警告", () => {
    expect(nodeVersionWarning("20.1.0", repoRoot)).toContain("engines");
    expect(nodeVersionWarning("24.0.0", repoRoot)).toBeNull();
    expect(nodeVersionWarning("26.1.0", repoRoot)).toBeNull();
  });
});
