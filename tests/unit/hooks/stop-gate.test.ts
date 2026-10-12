import { describe, expect, it } from "vitest";
import { stopResponse } from "../../../scripts/hooks/adapter.mjs";
import { STOP_GATE_COMMANDS } from "../../../scripts/hooks/config.mjs";
import { runStopGate } from "../../../scripts/hooks/gate.mjs";
import { cleanEnv, repoRoot } from "./helpers";

const same = (command: string) => command;

type Call = { command: string; cwd: string; env: Record<string, string | undefined> };

function fakeRunner(failing: string | null = null) {
  const calls: Call[] = [];
  const run = (command: string, options: { cwd: string; env: Record<string, string | undefined> }) => {
    calls.push({ command, ...options });
    return command === failing ? { status: 1, output: "line1\nTS2322: boom" } : { status: 0, output: "ok" };
  };
  return { calls, run, resolve: same };
}

describe("Stop 關卡：設定", () => {
  it("單一來源 config.mjs 含 pnpm check 與 skills 一致性檢查", () => {
    expect(STOP_GATE_COMMANDS).toContain("pnpm check");
    expect(STOP_GATE_COMMANDS).toContain("node scripts/skills-sync.mjs --check");
  });
});

describe("Stop 關卡：runStopGate", () => {
  const env = cleanEnv();

  it("全部指令通過就放行，並依序在專案根目錄執行", () => {
    const { calls, run, resolve: same } = fakeRunner();
    const result = runStopGate({ env, root: "/repo", commands: ["a", "b"], run, resolve: same, showMe: () => null });
    expect(result).toEqual({ block: false });
    expect(calls.map((c) => c.command)).toEqual(["a", "b"]);
    expect(calls.every((c) => c.cwd === "/repo")).toBe(true);
  });

  it("工作區乾淨與否不影響：沒有任何 git 狀態判斷，一律執行", () => {
    const { calls, run, resolve: same } = fakeRunner();
    runStopGate({ env, root: "/repo", commands: ["a"], run, resolve: same, showMe: () => null });
    expect(calls).toHaveLength(1);
  });

  it("失敗就擋下、不再執行後面的指令，原因寫出指令與輸出", () => {
    const { calls, run, resolve: same } = fakeRunner("b");
    const result = runStopGate({ env, root: "/repo", commands: ["a", "b", "c"], run, resolve: same, showMe: () => null });
    expect(result.block).toBe(true);
    if (result.block) {
      expect(result.reason).toContain("`b`");
      expect(result.reason).toContain("TS2322: boom");
    }
    expect(calls.map((c) => c.command)).toEqual(["a", "b"]);
  });

  it("缺設定（未定義、空陣列）一律擋下", () => {
    const { calls, run, resolve: same } = fakeRunner();
    expect(runStopGate({ env, commands: undefined, run, resolve: same, showMe: () => null }).block).toBe(true);
    expect(runStopGate({ env, commands: [], run, resolve: same, showMe: () => null }).block).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("AGENT_QUALITY_GATE_DISABLED=1 略過；其他值不略過", () => {
    const { calls, run, resolve: same } = fakeRunner("a");
    expect(runStopGate({ env: { ...env, AGENT_QUALITY_GATE_DISABLED: "1" }, commands: ["a"], run, resolve: same, showMe: () => null })).toEqual({ block: false });
    expect(calls).toHaveLength(0);
    expect(runStopGate({ env: { ...env, AGENT_QUALITY_GATE_DISABLED: "0" }, commands: ["a"], run, resolve: same, showMe: () => null }).block).toBe(true);
    expect(runStopGate({ env: { ...env, AGENT_QUALITY_GATE_DISABLED: "true" }, commands: ["a"], run, resolve: same, showMe: () => null }).block).toBe(true);
  });

  it("stop_hook_active 時不再觸發，避免無限迴圈", () => {
    const { calls, run, resolve: same } = fakeRunner("a");
    expect(runStopGate({ stopHookActive: true, env, commands: ["a"], run, resolve: same, showMe: () => null })).toEqual({ block: false });
    expect(calls).toHaveLength(0);
  });

  it("交給子指令的 env 不含 git 的 GIT_* 區域變數", () => {
    const { calls, run, resolve: same } = fakeRunner();
    runStopGate({ env: { ...env, GIT_DIR: "/wrong/.git", GIT_INDEX_FILE: "/wrong/index" }, commands: ["a"], run, resolve: same, showMe: () => null });
    expect(calls[0]?.env["GIT_DIR"]).toBeUndefined();
    expect(calls[0]?.env["GIT_INDEX_FILE"]).toBeUndefined();
  });
});

describe("Stop 轉接：Claude 與 Codex payload", () => {
  const claudePayload = JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: "done", session_id: "s" });
  const codexPayload = JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: null, turn_id: "t1" });
  const continued = JSON.stringify({ hook_event_name: "Stop", stop_hook_active: true });

  it.each([
    ["Claude", claudePayload],
    ["Codex", codexPayload],
  ])("%s：失敗時輸出 decision=block 與原因", (_name, payload) => {
    const { run } = fakeRunner("pnpm check");
    const out = stopResponse(payload, { env: cleanEnv(), root: repoRoot, commands: ["pnpm check"], run, resolve: same, showMe: () => null });
    expect(out["decision"]).toBe("block");
    expect(String(out["reason"])).toContain("pnpm check");
  });

  it.each([
    ["Claude", claudePayload],
    ["Codex", codexPayload],
  ])("%s：通過時輸出空物件", (_name, payload) => {
    const { run } = fakeRunner();
    expect(stopResponse(payload, { env: cleanEnv(), root: repoRoot, commands: ["pnpm check"], run, resolve: same, showMe: () => null })).toEqual({});
  });

  it("續跑的 Stop 不再檢查；空輸入視為一般 Stop", () => {
    const { calls, run, resolve: same } = fakeRunner("pnpm check");
    expect(stopResponse(continued, { env: cleanEnv(), commands: ["pnpm check"], run, resolve: same, showMe: () => null })).toEqual({});
    expect(calls).toHaveLength(0);
    expect(stopResponse("", { env: cleanEnv(), commands: ["pnpm check"], run, resolve: same, showMe: () => null })["decision"]).toBe("block");
  });

  it("缺設定時擋下", () => {
    expect(stopResponse(claudePayload, { env: cleanEnv(), commands: [] })["decision"]).toBe("block");
  });

  it("DISABLED 旗標放行", () => {
    const { run } = fakeRunner("pnpm check");
    const env = cleanEnv({ AGENT_QUALITY_GATE_DISABLED: "1" });
    expect(stopResponse(claudePayload, { env, commands: ["pnpm check"], run, resolve: same, showMe: () => null })).toEqual({});
  });
});
