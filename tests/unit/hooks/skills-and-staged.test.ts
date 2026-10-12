import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkStagedPaths } from "../../../scripts/hooks/staged.mjs";
import { diffSkills, syncSkills } from "../../../scripts/skills-sync.mjs";
import { cleanEnv, repoRoot } from "./helpers";

describe("pre-commit：staged 路徑規則", () => {
  it("擋 local-data、非合成 Excel、.db", () => {
    const problems = checkStagedPaths(["local-data/a.json", "docs/real.xlsx", "x/data.XLSM", "app.db", "src/a.ts"]);
    expect(problems).toHaveLength(4);
  });

  it("放行合成 fixture、local-data/README.md、一般檔案、反斜線路徑", () => {
    expect(checkStagedPaths(["tests/fixtures/synthetic/a.xlsx", "local-data/README.md", "src/a.ts"])).toEqual([]);
    expect(checkStagedPaths(["tests\\fixtures\\synthetic\\a.xlsx"])).toEqual([]);
    expect(checkStagedPaths(["local-data\\secret.csv"])).toHaveLength(1);
  });
});

describe("skills-sync", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function fixture() {
    const root = mkdtempSync(join(tmpdir(), "skills-"));
    dirs.push(root);
    mkdirSync(join(root, ".agents", "skills", "a", "agents"), { recursive: true });
    writeFileSync(join(root, ".agents", "skills", "a", "SKILL.md"), "line1\nline2\n");
    writeFileSync(join(root, ".agents", "skills", "a", "agents", "x.yaml"), "k: v\n");
    return root;
  }

  it("sync 之後一致，含子目錄", () => {
    const root = fixture();
    expect(diffSkills(root).length).toBeGreaterThan(0);
    syncSkills(root);
    expect(diffSkills(root)).toEqual([]);
  });

  it("內容被改、缺少、多餘都會列出", () => {
    const root = fixture();
    syncSkills(root);
    writeFileSync(join(root, ".claude", "skills", "a", "SKILL.md"), "changed\n");
    writeFileSync(join(root, ".claude", "skills", "a", "extra.md"), "x");
    rmSync(join(root, ".claude", "skills", "a", "agents"), { recursive: true });
    const problems = diffSkills(root).join("\n");
    expect(problems).toContain("內容不同：.claude/skills/a/SKILL.md");
    expect(problems).toContain("多餘：.claude/skills/a/extra.md");
    expect(problems).toContain("缺少：.claude/skills/a/agents/x.yaml");
  });

  it("CRLF 與 LF 視為相同", () => {
    const root = fixture();
    syncSkills(root);
    writeFileSync(join(root, ".claude", "skills", "a", "SKILL.md"), "line1\r\nline2\r\n");
    expect(diffSkills(root)).toEqual([]);
  });

  it("symlink 不算複本", () => {
    const root = fixture();
    mkdirSync(join(root, ".claude"), { recursive: true });
    symlinkSync(join(root, ".agents", "skills"), join(root, ".claude", "skills"), "dir");
    // .claude/skills 本身是 symlink 時，sync 會換成實體目錄
    syncSkills(root);
    expect(diffSkills(root)).toEqual([]);
  });

  it("--check 在不一致時以非零結束並列出差異；本 repo 目前一致", () => {
    const real = spawnSync(process.execPath, ["scripts/skills-sync.mjs", "--check"], { cwd: repoRoot, env: cleanEnv(), encoding: "utf8" });
    expect(real.status).toBe(0);
    expect(diffSkills(repoRoot)).toEqual([]);
  });
});
