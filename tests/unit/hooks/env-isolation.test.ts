import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { cleanEnv, repoRoot } from "./helpers";

// Stop hook 內執行 pnpm check 時，呼叫端的環境變數（CLAUDE_PROJECT_DIR、AGENT_*、GIT_*）會漏進測試。
// 這個測試在「被汙染的環境」下重跑整套 hook 測試，確認每個案例都自己建構乾淨的 env。

describe("env 隔離", () => {
  it("cleanEnv 不帶入 AGENT_*、CLAUDE*、GIT_*、ALLOW_GOLDEN_EDIT", () => {
    const env = cleanEnv({ ALLOW_GOLDEN_EDIT: "0" });
    for (const key of Object.keys(env)) {
      if (key === "ALLOW_GOLDEN_EDIT") continue;
      expect(key).not.toMatch(/^(AGENT_|CLAUDE|GIT_)/);
    }
  });

  it.skipIf(process.env["HOOK_TEST_NESTED"] === "1")("在汙染的環境下整套 hook 測試仍然通過", () => {
    const result = spawnSync(
      process.execPath,
      ["node_modules/vitest/vitest.mjs", "run", "--project", "unit", "tests/unit/hooks"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          HOOK_TEST_NESTED: "1",
          AGENT_HOOK_CLIENT: "claude",
          AGENT_QUALITY_GATE_DISABLED: "1",
          AGENT_PROJECT_DIR: "/somewhere/else",
          CLAUDE_PROJECT_DIR: "/somewhere/else",
          ALLOW_GOLDEN_EDIT: "1",
          GIT_DIR: "/somewhere/else/.git",
          GIT_INDEX_FILE: "/somewhere/else/index",
        },
      },
    );
    expect(result.stdout + result.stderr).toContain("passed");
    expect(result.status).toBe(0);
  }, 120_000);
});
