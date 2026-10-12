import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runStopGate } from "../../../scripts/hooks/gate.mjs";
import { checkShowMe, latestRoundTime } from "../../../scripts/hooks/showme.mjs";
import { cleanEnv } from "./helpers";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const T0 = Date.parse("2026-01-01T00:00:00Z");

function project({ config = true }: { config?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "showme-"));
  dirs.push(root);
  mkdirSync(join(root, "src", "app"), { recursive: true });
  mkdirSync(join(root, "src", "components"), { recursive: true });
  if (config) writeFileSync(join(root, "show-me.config.json"), "{}");
  setMtime(join(root, "show-me.config.json"), config ? T0 : null);
  return root;
}

function setMtime(path: string, ms: number | null) {
  if (ms !== null) utimesSync(path, new Date(ms), new Date(ms));
}

function touch(root: string, rel: string, ms: number) {
  const full = join(root, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, "x");
  setMtime(full, ms);
}

function round(root: string, name: string, body: string) {
  mkdirSync(join(root, ".review", "rounds", name), { recursive: true });
  writeFileSync(join(root, ".review", "rounds", name, "round.json"), body);
}

const iso = (ms: number) => JSON.stringify({ createdAt: new Date(ms).toISOString() });

describe("Stop（show-me）", () => {
  it("沒有 show-me.config.json 時跳過", () => {
    const root = project({ config: false });
    touch(root, "src/app/page.tsx", T0 + 5000);
    expect(checkShowMe(root)).toBeNull();
  });

  it("UI 在最新一輪之後有修改 → 擋下，並給出 capture 指令", () => {
    const root = project();
    round(root, "001", iso(T0 + 1000));
    touch(root, "src/components/deep/Button.tsx", T0 + 2000);
    const reason = checkShowMe(root);
    expect(reason).toContain('pnpm show-me:capture --summary "<本輪摘要>"');
    expect(reason).toContain("看板網址");
  });

  it("src/app 與 show-me.config.json 的修改也算", () => {
    const root = project();
    round(root, "001", iso(T0 + 1000));
    touch(root, "src/app/x/page.tsx", T0 + 2000);
    expect(checkShowMe(root)).not.toBeNull();
    const other = project();
    round(other, "001", iso(T0 + 1000));
    setMtime(join(other, "show-me.config.json"), T0 + 3000);
    expect(checkShowMe(other)).not.toBeNull();
  });

  it("截圖之後沒有修改 → 放行；用多輪中最新的一輪比較", () => {
    const root = project();
    touch(root, "src/app/page.tsx", T0 + 2000);
    round(root, "001", iso(T0 + 1000));
    expect(checkShowMe(root)).not.toBeNull();
    round(root, "002", iso(T0 + 3000));
    expect(checkShowMe(root)).toBeNull();
  });

  it("沒有任何截圖、但有 UI 檔案 → 擋下", () => {
    const root = project();
    touch(root, "src/app/page.tsx", T0 + 10);
    expect(checkShowMe(root)).not.toBeNull();
  });

  it("round.json 讀不到或格式錯誤視為沒有截圖", () => {
    const root = project();
    touch(root, "src/app/page.tsx", T0 + 2000);
    round(root, "001", "not json");
    round(root, "002", JSON.stringify({ createdAt: 123 }));
    round(root, "003", JSON.stringify({ createdAt: "garbage" }));
    mkdirSync(join(root, ".review", "rounds", "004"), { recursive: true });
    expect(latestRoundTime(root)).toBe(0);
    expect(checkShowMe(root)).not.toBeNull();
  });

  it("沒有任何 UI 檔案時，config 本身比截圖舊 → 放行", () => {
    const root = project();
    round(root, "001", iso(T0 + 1000));
    expect(checkShowMe(root)).toBeNull();
  });
});

describe("Stop 關卡整合 show-me", () => {
  const env = cleanEnv();
  const pass = () => ({ status: 0, output: "" });
  const same = (command: string) => command;

  it("pnpm check 通過之後才檢查 show-me；兩者都過才放行", () => {
    const calls: string[] = [];
    const base = { env, root: "/repo", commands: ["a"], resolve: same, run: (c: string) => (calls.push(c), pass()) };
    const blocked = runStopGate({ ...base, showMe: () => "請截圖" });
    expect(blocked).toEqual({ block: true, reason: "請截圖" });
    expect(calls).toEqual(["a"]);
    expect(runStopGate({ ...base, showMe: () => null })).toEqual({ block: false });
  });

  it("檢查失敗時不跑 show-me（先修 check）", () => {
    let asked = false;
    const result = runStopGate({
      env,
      root: "/repo",
      commands: ["a"],
      resolve: same,
      run: () => ({ status: 1, output: "x" }),
      showMe: () => ((asked = true), "請截圖"),
    });
    expect(result.block && result.reason).toContain("品質關卡失敗");
    expect(asked).toBe(false);
  });

  it("stop_hook_active 與 DISABLED 時 show-me 也不擋", () => {
    const showMe = () => "請截圖";
    const base = { root: "/repo", commands: ["a"], resolve: same, run: pass, showMe };
    expect(runStopGate({ ...base, env, stopHookActive: true })).toEqual({ block: false });
    expect(runStopGate({ ...base, env: cleanEnv({ AGENT_QUALITY_GATE_DISABLED: "1" }) })).toEqual({ block: false });
  });
});
