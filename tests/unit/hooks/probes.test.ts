import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { cleanEnv, repoRoot } from "./helpers";

// 審查探測清單：一律走真實入口（spawn 入口腳本、stdin 餵 payload）。stdout 為 `{}` 代表放行，其餘代表擋下。
// 受保護路徑用 travel-budget 的清單：tests/golden、local-data、.claude/skills。
// G 是 "git" 的拼接，避免本檔被誤判成指令。

// 每個案例都會啟動真實的 hook 程序（一條 payload 一個 node）；機器負載高時（例如多個 agent 同時跑測試）
// 會超過 vitest 預設的 5 秒。逾時不代表規則錯，所以給本檔較長的上限。
vi.setConfig({ testTimeout: 60_000 });

const G = ["g", "it"].join("");
const swap = (command: string) => command.replace(/\bG\b/g, G);

const output = z.object({ hookSpecificOutput: z.object({ permissionDecision: z.string() }).optional() });

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}, 60_000);

/** 暫時專案：複製 hooks 腳本（PROJECT_ROOT 由腳本位置推得），HEAD 指向 main。 */
function makeProject(branch = "main") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hooks-probe-")));
  dirs.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  cpSync(resolve(repoRoot, "scripts", "hooks"), join(root, "scripts", "hooks"), { recursive: true });
  const gitRun = (args: string[]) => spawnSync(G, args, { cwd: root, env: cleanEnv(), encoding: "utf8" });
  gitRun(["init", "-q"]);
  gitRun(["symbolic-ref", "HEAD", `refs/heads/${branch}`]);
  return { root, gitRun };
}

type Payload = Record<string, unknown>;
function verdict(root: string, client: "claude" | "codex", payload: Payload, env = cleanEnv()): "deny" | "allow" {
  const run = spawnSync(process.execPath, [join(root, "scripts", "hooks", `${client}-pretooluse.mjs`)], {
    cwd: root,
    input: JSON.stringify({ hook_event_name: "PreToolUse", cwd: root, ...payload }),
    env,
    encoding: "utf8",
  });
  expect(run.status, run.stderr).toBe(0);
  return output.parse(JSON.parse(run.stdout)).hookSpecificOutput?.permissionDecision === "deny" ? "deny" : "allow";
}

const bash = (command: unknown) => ({ tool_name: "Bash", tool_input: { command } });

const DENY: Record<string, string[]> = {
  "A1 批次 stage": [
    "G add --all", "G -C . add .", "G add -- .", "G add ./", "G add :/", "G add '*'", "G stage .", "G stage -A",
    "G add --al", "G add --a", 'G add "."', "G add $'.'", "G add -A", "G add -f .",
  ],
  "A2 跳過 hooks": [
    "G commit --no-verify -m x", "G commit -m x --no-verif", "G commit --no-veri -m x", "G commit -nm x", "G commit -am x -n",
    "G -c core.hooksPath=/dev/null commit -m x", "G -c core.hooksPath=/dev/null push origin feat", "G push --no-verify",
  ],
  "A3 在預設分支 force／刪除（目前分支 main）": [
    "G push -f", "G push -f origin main", "G push --force-with-lease origin main", "G push origin +main", "G push origin +HEAD:main",
    "G push -f origin HEAD", "G push --force origin @", "G push -f origin HEAD:refs/heads/main", "G push --repo=origin -f main",
    "G push --forc origin main", "G push origin --delete main", "G push origin :main", "G push --mirror -f", "G push -d origin main",
    "G push origin +main:main", "G push -f origin master",
  ],
  "A4 shell 包裝": [
    'bash -c "G add ."', "sh -lc 'G add -A'", "cmd /c G add -A", 'pwsh -Command "G add -A"', 'eval "G add ."', "x=$(G add .)", "{ G add .; }",
    "GIT_DIR=.git G add .", "\\G add .", "/usr/bin/G add .", 'bash -c "$(echo G add .)"', "printf 'G add .' | sh", "cd x && G add .", "true; G add -A",
  ],
};

const ALLOW = [
  "G add -u", "G add src/a.ts", "G add ./src", "G add .gitignore", 'G commit -m "G add ."', "echo G add -A", "G log -n 5", "G push -n origin feature",
  "G push origin main", "G push origin feature", "G push -f origin feature", "G push --force-with-lease origin HEAD:feature",
  "G commit -m x", "G status", "G commit --no-edit -m x", "pnpm check",
];

describe.each(["claude", "codex"] as const)("%s 入口：指令探測", (client) => {
  const { root } = makeProject();
  for (const [group, commands] of Object.entries(DENY)) {
    it(`${group}：全部擋下`, () => {
      const leaks = commands.filter((c) => verdict(root, client, bash(swap(c))) !== "deny");
      expect(leaks).toEqual([]);
    });
  }

  it("B：誤判探測全部放行", () => {
    const wrong = ALLOW.filter((c) => verdict(root, client, bash(swap(c))) !== "allow");
    expect(wrong).toEqual([]);
  });

  it("A3：功能分支上 force push HEAD 放行（HEAD 解析成目前分支）", () => {
    const feature = makeProject("feature");
    for (const c of ["G push -f origin HEAD", "G push --force origin @", "G push -f", "G push -f origin HEAD:feature"]) {
      expect(verdict(feature.root, client, bash(swap(c))), c).toBe("allow");
    }
    expect(verdict(feature.root, client, bash(swap("G push -f origin HEAD:main")))).toBe("deny");
  });

  it("A5：陣列型 command 與 shell 工具", () => {
    expect(verdict(root, client, bash(["bash", "-lc", swap("G add .")]))).toBe("deny");
    expect(verdict(root, client, { tool_name: "shell", tool_input: { command: ["bash", "-lc", swap("G add -A")] } })).toBe("deny");
    expect(verdict(root, client, { tool_name: "shell", tool_input: { command: [G, "add", "."] } })).toBe("deny");
    expect(verdict(root, client, { tool_name: "shell", tool_input: { command: ["bash", "-lc", "ls"] } })).toBe("allow");
    expect(verdict(root, client, { tool_name: "exec_command", tool_input: { cmd: swap("G add -A") } })).toBe("deny");
  });
});

const PROTECTED = ["tests/golden", "local-data", ".claude/skills"];

describe.each(["claude", "codex"] as const)("%s 入口：受保護路徑探測", (client) => {
  it.each(PROTECTED)("C：%s 的各種拼法全擋、近似名稱放行", (dir) => {
    const { root } = makeProject();
    const upper = dir.toUpperCase();
    const spellings = [
      `${dir}/x/a.md`, `${upper}/x`, `./${dir}/x`, `foo/../${dir}/x`, `${root}/${dir}/x`, `${root}\\${dir.replace(/\//g, "\\")}\\x`,
      dir.replace(/\//g, "\\") + "\\x", dir, dir.replace("/", "//") + "/x", dir.replace("/", "/./") + "/x", `${root}/foo/../${dir}/x`,
    ];
    const leaks = spellings.filter((file_path) => verdict(root, client, { tool_name: "Write", tool_input: { file_path } }) !== "deny");
    expect(leaks).toEqual([]);
    for (const file_path of [`${dir}x`, `${dir}-extra/x`, "src/a.ts", ".agents/skills/x/SKILL.md"]) {
      expect(verdict(root, client, { tool_name: "Write", tool_input: { file_path } }), file_path).toBe("allow");
    }
  });

  it.each(PROTECTED)("C：專案內指向 %s 的 symlink 會被追蹤（檔案不必存在）", (dir) => {
    const { root } = makeProject();
    mkdirSync(join(root, dir), { recursive: true });
    symlinkSync(join(root, dir), join(root, "linkdir"), "junction");
    for (const file_path of ["linkdir/x", "linkdir/x/SKILL.md", `${root}/linkdir/deep/er/y.md`, "./linkdir"]) {
      expect(verdict(root, client, { tool_name: "Write", tool_input: { file_path } }), file_path).toBe("deny");
    }
    expect(verdict(root, client, { tool_name: "Edit", tool_input: { file_path: "other/x" } })).toBe("allow");
  });

  // 懸空連結：目標不存在時 existsSync 回 false，舊實作把它當成普通的新名稱，寫入卻會建出受保護路徑下的檔案。
  // Windows 建立檔案 symlink 需要權限（目錄用 junction 不需要），建不出來時跳過檔案那一案。
  it.each(PROTECTED)("C：指向 %s 內、目標還不存在的懸空連結也擋", (dir) => {
    const { root } = makeProject();
    mkdirSync(join(root, dir), { recursive: true });
    symlinkSync(join(root, dir, "newdir"), join(root, "danglingdir"), "junction");
    for (const file_path of ["danglingdir/x.md", `${root}/danglingdir/deep/y.md`]) {
      expect(verdict(root, client, { tool_name: "Write", tool_input: { file_path } }), file_path).toBe("deny");
    }
    try {
      symlinkSync(join(root, dir, "x.md"), join(root, "danglingfile"), "file");
    } catch {
      return;
    }
    expect(verdict(root, client, { tool_name: "Write", tool_input: { file_path: "danglingfile" } })).toBe("deny");
  });

  it("C：symlink 循環時拒絕（不默默放行）", () => {
    const { root } = makeProject();
    try {
      symlinkSync(join(root, "loopb"), join(root, "loopa"), "junction");
      symlinkSync(join(root, "loopa"), join(root, "loopb"), "junction");
    } catch {
      return;
    }
    expect(verdict(root, client, { tool_name: "Write", tool_input: { file_path: "loopa/x" } })).toBe("deny");
  });

  it.skipIf(process.platform !== "darwin")("C：根目錄的別名拼法（/tmp 對 /private/tmp）會被追蹤", () => {
    const { root } = makeProject();
    if (!root.startsWith("/private/")) return;
    const alias = root.slice("/private".length);
    for (const dir of PROTECTED) {
      expect(verdict(root, client, { tool_name: "Write", tool_input: { file_path: `${alias}/${dir}/x` } }), dir).toBe("deny");
      expect(verdict(root, client, { tool_name: "Write", cwd: alias, tool_input: { file_path: `${dir}/x` } }), dir).toBe("deny");
    }
    expect(verdict(root, client, { tool_name: "Write", tool_input: { file_path: `${alias}/src/a.ts` } })).toBe("allow");
  });

  it("C：過期的 CLAUDE_PROJECT_DIR 不影響判斷", () => {
    const { root } = makeProject();
    const env = cleanEnv({ CLAUDE_PROJECT_DIR: "/somewhere/else" });
    expect(verdict(root, client, { tool_name: "Write", tool_input: { file_path: join(root, ".claude", "skills", "x") } }, env)).toBe("deny");
    expect(verdict(root, client, { tool_name: "Write", tool_input: { file_path: "/somewhere/else/.claude/skills/x" } }, env)).toBe("allow");
  });

  it("C：ALLOW_GOLDEN_EDIT=1 只放行 golden", () => {
    const { root } = makeProject();
    const env = cleanEnv({ ALLOW_GOLDEN_EDIT: "1" });
    expect(verdict(root, client, { tool_name: "Write", tool_input: { file_path: "tests/golden/a.ts" } }, env)).toBe("allow");
    expect(verdict(root, client, { tool_name: "Write", tool_input: { file_path: "local-data/a.xlsx" } }, env)).toBe("deny");
  });
});

describe("codex 入口：apply_patch 探測", () => {
  const patch = (...lines: string[]) => ["*** Begin Patch", ...lines, "*** End Patch"].join("\n");
  const { root } = makeProject();
  for (const dir of PROTECTED) {
    const cases: [string, string, "deny" | "allow"][] = [
      ["Update 後 Move to 受保護路徑", patch("*** Update File: README.md", `*** Move to: ${dir}/x/SKILL.md`, "@@", "-a", "+b"), "deny"],
      ["Add File 在受保護路徑", patch(`*** Add File: ${dir}/y`, "+x"), "deny"],
      ["Add File 在受保護路徑，CRLF", patch(`*** Add File: ${dir}/y`, "+x").replace(/\n/g, "\r\n"), "deny"],
      ["星號後兩個空白（寬鬆視為標頭）", patch(`***  Add File: ${dir}/y`, "+x"), "deny"],
      ["路徑前後空白", patch(`*** Add File:   ${dir}/y  `, "+x"), "deny"],
      ["Delete File 在受保護路徑", patch(`*** Delete File: ${dir}/y`), "deny"],
      ["一般 patch", patch("*** Add File: docs/new note.txt", "+x", "*** Update File: README.md", "@@", "-a", "+b"), "allow"],
      ["近似名稱", patch(`*** Add File: ${dir}x/y`, "+x"), "allow"],
    ];
    for (const field of ["command", "input"]) {
      for (const [name, text, expected] of cases) {
        it(`${dir} tool_input.${field}：${name}`, () => {
          expect(verdict(root, "codex", { tool_name: "apply_patch", tool_input: { [field]: text } })).toBe(expected);
        });
      }
    }
  }

  it("patch 經 symlink 進受保護目錄也擋", () => {
    const p = makeProject();
    mkdirSync(join(p.root, ".claude", "skills"), { recursive: true });
    symlinkSync(join(p.root, ".claude", "skills"), join(p.root, "linkdir"), "junction");
    expect(verdict(p.root, "codex", { tool_name: "apply_patch", tool_input: { command: patch("*** Add File: linkdir/z.md", "+x") } })).toBe("deny");
  });
});

describe("已知限制（見 docs/hooks.md）", () => {
  it("shell 重導向寫入受保護路徑目前放行，由 pre-commit 補位", () => {
    const { root } = makeProject();
    // 刻意斷言放行：行為改變時會被注意到，文件要跟著更新。
    for (const c of ["echo x > .claude/skills/a/SKILL.md", "echo x > tests/golden/a.ts", "cp a local-data/b"]) {
      expect(verdict(root, "claude", bash(c)), c).toBe("allow");
    }
    expect(existsSync(join(root, ".claude", "skills", "a"))).toBe(false);
  });

  it("echo 印出批次 stage 文字放行，同樣文字放在 bash -c 內擋下", () => {
    const { root } = makeProject();
    expect(verdict(root, "claude", bash(swap("echo G add -A")))).toBe("allow");
    expect(verdict(root, "claude", bash(swap("bash -c 'echo G add -A'")))).toBe("deny");
  });
});
