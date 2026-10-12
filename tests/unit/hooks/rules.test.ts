import { describe, expect, it } from "vitest";
import {
  checkFileWrite,
  checkShellCommand,
  evaluatePreToolUse,
  normalizePath,
  patchPaths,
  relativeToRoot,
} from "../../../scripts/hooks/rules.mjs";

const notMain = () => "feature";
const onMain = () => "main";
const shell = (command: string, branch = notMain) => checkShellCommand(command, { cwd: "/repo", currentBranch: branch });

describe("PreToolUse：批次 stage", () => {
  it.each([
    "git add -A",
    "git add .",
    "git add --all",
    "git add -Av",
    "git -C /repo add -A",
    "cd x && git add .",
    "git status; git add -A",
    "bash -c 'git add -A'",
    'powershell -Command "git add ."',
    "mise exec -- git add -A",
    "git.exe add .",
  ])("擋下 %s", (command) => {
    expect(shell(command)).toContain("stage");
  });

  it.each([
    "git add src/a.ts",
    "git add ./src",
    "git add -p",
    "git add -u src",
    'git commit -m "do not git add ."',
    'echo "git add -A"',
    "git status",
    "pnpm check",
  ])("放行 %s", (command) => {
    expect(shell(command)).toBeNull();
  });
});

describe("PreToolUse：跳過 hooks 與 force push", () => {
  it.each([
    "git commit --no-verify -m x",
    "git commit -n -m x",
    "git commit -nm x",
    "git push --no-verify",
    "git push --force origin main",
    "git push -f origin main",
    "git push origin +main",
    "git push --force-with-lease origin HEAD:main",
    "git push -f origin HEAD:refs/heads/main",
  ])("擋下 %s", (command) => {
    expect(shell(command)).not.toBeNull();
  });

  it("沒指定分支的 force push：在 main 擋下、在其他分支放行", () => {
    expect(shell("git push -f", onMain)).toContain("main");
    expect(shell("git push --force origin", onMain)).toContain("main");
    expect(shell("git push -f", notMain)).toBeNull();
  });

  it.each([
    "git push origin main",
    "git push -u origin feature",
    "git push --force origin feature",
    "git commit -m 'fix -n handling'",
    "git commit -am x",
  ])("放行 %s", (command) => {
    expect(shell(command)).toBeNull();
  });
});

describe("路徑正規化（含 Windows）", () => {
  it("統一分隔符、磁碟代號小寫、消去 ..", () => {
    expect(normalizePath("C:\\Users\\Me\\proj\\src\\..\\tests")).toBe("c:/Users/Me/proj/tests");
    expect(normalizePath("C:/Users/Me/proj/")).toBe("c:/Users/Me/proj");
    expect(normalizePath("/c/Users/Me")).toBe("c:/Users/Me");
    expect(normalizePath("/Users/me/./proj//a")).toBe("/Users/me/proj/a");
  });

  it("C:/ 與 C:\\ 兩種寫法的專案根目錄都能比對，且不分大小寫", () => {
    expect(relativeToRoot("C:\\Work\\Proj\\Tests\\Golden\\a.ts", "c:/work/proj")).toBe("tests/golden/a.ts");
    expect(relativeToRoot("c:/work/proj/tests/golden/a.ts", "C:\\work\\proj")).toBe("tests/golden/a.ts");
    expect(relativeToRoot("/c/work/proj/src/a.ts", "C:/work/proj")).toBe("src/a.ts");
  });

  it("專案外的路徑回傳 null，同名前綴目錄不算在內", () => {
    expect(relativeToRoot("C:\\work\\proj2\\tests\\golden\\a.ts", "C:\\work\\proj")).toBeNull();
    expect(relativeToRoot("/other/tests/golden/a.ts", "/repo")).toBeNull();
  });

  it("相對路徑以 cwd 為基準", () => {
    expect(relativeToRoot("golden/a.ts", "/repo", "/repo/tests")).toBe("tests/golden/a.ts");
    expect(relativeToRoot("..\\local-data\\x.xlsx", "C:\\repo", "C:\\repo\\src")).toBe("local-data/x.xlsx");
  });
});

describe("PreToolUse：檔案寫入", () => {
  const roots = [
    { name: "posix", root: "/repo", join: (p: string) => `/repo/${p}` },
    { name: "windows 反斜線", root: "C:\\repo", join: (p: string) => `C:\\repo\\${p.replace(/\//g, "\\")}` },
    { name: "windows 正斜線", root: "C:/repo", join: (p: string) => `C:/repo/${p}` },
    { name: "windows 大小寫不同", root: "c:\\Repo", join: (p: string) => `C:\\REPO\\${p.toUpperCase().replace(/\//g, "\\")}` },
  ];

  describe.each(roots)("$name", ({ root, join }) => {
    it("擋 tests/golden/**", () => {
      expect(checkFileWrite(join("tests/golden/a.test.ts"), { root })).toContain("NEEDS_DECISION");
    });
    it("擋 local-data/**", () => {
      expect(checkFileWrite(join("local-data/real.xlsx"), { root })).toContain("local-data");
    });
    it("擋 .claude/skills/**", () => {
      expect(checkFileWrite(join(".claude/skills/tdd/SKILL.md"), { root })).toContain("pnpm skills:sync");
    });
    it("放行其他檔案", () => {
      expect(checkFileWrite(join("src/engine/a.ts"), { root })).toBeNull();
      expect(checkFileWrite(join(".agents/skills/tdd/SKILL.md"), { root })).toBeNull();
      expect(checkFileWrite(join("tests/unit/a.test.ts"), { root })).toBeNull();
    });
  });

  it("ALLOW_GOLDEN_EDIT=1（由啟動環境提供）才放行黃金測試", () => {
    const env = { ALLOW_GOLDEN_EDIT: "1" };
    expect(checkFileWrite("/repo/tests/golden/a.ts", { root: "/repo", env })).toBeNull();
    expect(checkFileWrite("/repo/local-data/a.xlsx", { root: "/repo", env })).not.toBeNull();
  });

  it("用 .. 繞路也會被擋", () => {
    expect(checkFileWrite("/repo/src/../tests/golden/a.ts", { root: "/repo" })).not.toBeNull();
  });

  it("專案外的 tests/golden 不受影響", () => {
    expect(checkFileWrite("/elsewhere/tests/golden/a.ts", { root: "/repo" })).toBeNull();
  });
});

describe("evaluatePreToolUse：Claude 與 Codex payload", () => {
  const root = "/repo";
  const run = (payload: unknown) => evaluatePreToolUse(payload, { root, currentBranch: notMain });

  it("Claude Bash", () => {
    expect(run({ tool_name: "Bash", tool_input: { command: "git add -A" } })).not.toBeNull();
    expect(run({ tool_name: "Bash", tool_input: { command: "git add src/a.ts" } })).toBeNull();
  });

  it("Claude Write／Edit／MultiEdit／NotebookEdit", () => {
    for (const tool_name of ["Write", "Edit", "MultiEdit"]) {
      expect(run({ tool_name, tool_input: { file_path: "/repo/tests/golden/a.ts" } })).not.toBeNull();
      expect(run({ tool_name, tool_input: { file_path: "/repo/src/a.ts" } })).toBeNull();
    }
    expect(run({ tool_name: "NotebookEdit", tool_input: { notebook_path: "/repo/local-data/n.ipynb" } })).not.toBeNull();
  });

  it("Claude 在 Windows：反斜線的 file_path", () => {
    const winRoot = "C:\\repo";
    const reason = evaluatePreToolUse(
      { tool_name: "Edit", tool_input: { file_path: "C:\\repo\\.claude\\skills\\tdd\\SKILL.md" } },
      { root: winRoot },
    );
    expect(reason).toContain("skills:sync");
  });

  it("Codex Bash（exec_command）與陣列形式的指令", () => {
    expect(run({ tool_name: "exec_command", tool_input: { cmd: "git push --force origin main" } })).not.toBeNull();
    expect(run({ tool_name: "Bash", tool_input: { command: ["git", "add", "."] } })).not.toBeNull();
  });

  it("Codex apply_patch：多檔案、含 Move to", () => {
    const patch = (...lines: string[]) => ({ tool_name: "apply_patch", tool_input: { command: ["*** Begin Patch", ...lines, "*** End Patch"].join("\n") } });
    expect(run(patch("*** Update File: tests/golden/x.ts", "@@", "-a", "+b"))).not.toBeNull();
    expect(run(patch("*** Add File: src/a.ts", "+x", "*** Add File: local-data/b.txt", "+y"))).not.toBeNull();
    expect(run(patch("*** Update File: src/a.ts", "*** Move to: .claude/skills/a.md"))).not.toBeNull();
    expect(run(patch("*** Update File: src/a.ts", "@@", "-a", "+b"))).toBeNull();
  });

  it("patchPaths 取出所有路徑", () => {
    expect(patchPaths("*** Begin Patch\n*** Delete File: a.ts\n*** Update File: b.ts\n*** Move to: c.ts\n*** End Patch")).toEqual([
      "a.ts",
      "b.ts",
      "c.ts",
    ]);
  });

  it("不相關的工具與畸形輸入一律放行（不是 hook 要管的範圍）", () => {
    expect(run({ tool_name: "Read", tool_input: { file_path: "/repo/tests/golden/a.ts" } })).toBeNull();
    expect(run(null)).toBeNull();
    expect(run({ tool_name: "Bash" })).toBeNull();
  });
});

describe("Codex apply_patch 實測 payload（codex-cli 0.160.0）", () => {
  const base = {
    session_id: "00000000-0000-0000-0000-000000000001",
    turn_id: "00000000-0000-0000-0000-000000000002",
    cwd: "/home/user/project",
    hook_event_name: "PreToolUse",
    model: "gpt-5.6-terra",
    permission_mode: "bypassPermissions",
    tool_name: "apply_patch",
    tool_use_id: "exec-617443f9-f9d6-4ef0-ae15-456b4d0fcc50",
  };
  const patch = (command: string, cwd = base.cwd) => ({ ...base, cwd, tool_input: { command } });
  const run = (payload: unknown) => evaluatePreToolUse(payload, { root: "/home/user/project" });

  it("實測：同一個 patch 同時有 Delete 與 Add，路徑含空格（取到行尾）", () => {
    const command = "*** Begin Patch\n*** Delete File: b.txt\n*** Add File: docs/new note.txt\n+hi\n*** End Patch";
    expect(patchPaths(command)).toEqual(["b.txt", "docs/new note.txt"]);
    expect(run(patch(command))).toBeNull();
  });

  it("實測：只有 Delete／只有 Add", () => {
    expect(patchPaths("*** Begin Patch\n*** Delete File: a.txt\n*** End Patch")).toEqual(["a.txt"]);
    expect(patchPaths("*** Begin Patch\n*** Add File: a.txt\n+two\n*** End Patch")).toEqual(["a.txt"]);
  });

  it("實測：Add／Update／Delete 在被保護的目錄都會被擋", () => {
    for (const action of ["Add File", "Update File", "Delete File"]) {
      const command = `*** Begin Patch\n*** ${action}: local-data/zz-probe.txt\n@@\n-hi\n+ho\n*** End Patch`;
      expect(run(patch(command))).toContain("local-data");
    }
  });

  it("被保護目錄的檔名含空格也擋得到", () => {
    expect(run(patch("*** Begin Patch\n*** Add File: tests/golden/my case.test.ts\n+x\n*** End Patch"))).not.toBeNull();
  });

  it("依語法推定（未實測）：Update File 後接 Move to，目的地在被保護目錄也擋", () => {
    const command = "*** Begin Patch\n*** Update File: src/a.ts\n*** Move to: .claude/skills/a.ts\n@@\n-a\n+b\n*** End Patch";
    expect(patchPaths(command)).toEqual(["src/a.ts", ".claude/skills/a.ts"]);
    expect(run(patch(command))).toContain("skills:sync");
  });

  it("路徑相對 payload.cwd：在子目錄內的相對路徑會先 resolve", () => {
    const command = "*** Begin Patch\n*** Add File: golden/x.ts\n+x\n*** End Patch";
    expect(run(patch(command, "/home/user/project/tests"))).not.toBeNull();
    expect(run(patch(command, "/home/user/project/src"))).toBeNull();
  });

  it("防穿越：../local-data/x 與絕對路徑", () => {
    expect(run(patch("*** Begin Patch\n*** Add File: ../local-data/x.txt\n+x\n*** End Patch", "/home/user/project/src"))).not.toBeNull();
    expect(run(patch("*** Begin Patch\n*** Add File: /home/user/project/src/../local-data/x.txt\n+x\n*** End Patch"))).not.toBeNull();
    expect(run(patch("*** Begin Patch\n*** Add File: ../outside/tests/golden/x.txt\n+x\n*** End Patch", "/home/user/project/src"))).toBeNull();
  });

  it("Windows 風格的 patch 路徑與 cwd", () => {
    const command = "*** Begin Patch\n*** Add File: tests\\golden\\x.ts\n+x\n*** End Patch";
    const payload = { ...base, cwd: "C:\\Users\\me\\project", tool_input: { command } };
    expect(evaluatePreToolUse(payload, { root: "C:/Users/me/project" })).not.toBeNull();
  });
});
