import { describe, expect, it } from "vitest";
import { repoRoot, runHook } from "./helpers";

// 以子行程執行真正的入口腳本（和 Claude／Codex 呼叫的方式一樣），驗證 stdin → stdout 的完整路徑。
// Stop 入口會真的跑 pnpm check，這裡只驗證不會執行指令的路徑（stop_hook_active、DISABLED）。

const denied = (run: ReturnType<typeof runHook>) => run.json.hookSpecificOutput?.permissionDecision === "deny";

describe.each(["claude-pretooluse.mjs", "codex-pretooluse.mjs"])("%s", (script) => {
  it("擋下批次 stage，輸出官方 deny 格式並以 0 結束", () => {
    const run = runHook(script, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git add -A" } });
    expect(run.status).toBe(0);
    expect(denied(run)).toBe(true);
    expect(run.json.hookSpecificOutput?.hookEventName).toBe("PreToolUse");
    expect(run.json.hookSpecificOutput?.permissionDecisionReason).toContain("stage");
  });

  it("放行一般指令", () => {
    const run = runHook(script, { tool_name: "Bash", tool_input: { command: "pnpm check" } });
    expect(run.status).toBe(0);
    expect(denied(run)).toBe(false);
  });

  it("擋下寫入 tests/golden（絕對路徑、反斜線、Windows 風格）", () => {
    const posix = runHook(script, { tool_name: "Write", tool_input: { file_path: `${repoRoot}/tests/golden/a.ts` } });
    expect(denied(posix)).toBe(true);
    const backslash = runHook(script, { tool_name: "Edit", tool_input: { file_path: `${repoRoot}/tests\\golden\\a.ts` } });
    expect(denied(backslash)).toBe(true);
  });

  it("ALLOW_GOLDEN_EDIT=1 由啟動環境提供時放行", () => {
    const run = runHook(script, { tool_name: "Write", tool_input: { file_path: `${repoRoot}/tests/golden/a.ts` } }, { ALLOW_GOLDEN_EDIT: "1" });
    expect(denied(run)).toBe(false);
  });

  it("無法解析的 payload 擋下（不默默放行）", () => {
    expect(denied(runHook(script, "not json"))).toBe(true);
  });
});

describe("codex-pretooluse.mjs：apply_patch", () => {
  it("擋下動到 .claude/skills 的 patch", () => {
    const command = "*** Begin Patch\n*** Update File: .claude/skills/tdd/SKILL.md\n@@\n-a\n+b\n*** End Patch";
    expect(denied(runHook("codex-pretooluse.mjs", { tool_name: "apply_patch", tool_input: { command } }))).toBe(true);
  });
});

describe.each(["claude-stop.mjs", "codex-stop.mjs"])("%s", (script) => {
  it("stop_hook_active=true 直接放行，不執行任何指令", () => {
    const run = runHook(script, { hook_event_name: "Stop", stop_hook_active: true });
    expect(run.status).toBe(0);
    expect(run.json).toEqual({});
  });

  it("AGENT_QUALITY_GATE_DISABLED=1 放行", () => {
    const run = runHook(script, { hook_event_name: "Stop", stop_hook_active: false }, { AGENT_QUALITY_GATE_DISABLED: "1" });
    expect(run.status).toBe(0);
    expect(run.json).toEqual({});
  });
});
