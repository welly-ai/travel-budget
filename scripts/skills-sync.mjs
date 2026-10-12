// 把 .agents/skills/（唯一來源）複製成 .claude/skills/ 的實體複本（Claude Code 只讀 .claude/skills/，且不用 symlink 以支援 Windows）。
//   node scripts/skills-sync.mjs           寫入複本
//   node scripts/skills-sync.mjs --check   只比對；不一致時列出差異並以非零結束
// 比對時文字檔的 CRLF 視為 LF。
import { cpSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const IGNORED = new Set([".DS_Store", "Thumbs.db", "THIRD_PARTY.md"]);

/** 列出目錄下所有檔案（相對路徑，正斜線）；symlink 以特殊標記回報而不跟隨。 */
function listTree(dir) {
  /** @type {Map<string, { kind: "file" | "symlink", path: string }>} */
  const entries = new Map();
  const walk = (current, prefix) => {
    for (const name of readdirSync(current)) {
      if (IGNORED.has(name)) continue;
      const full = join(current, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) entries.set(rel, { kind: "symlink", path: full });
      else if (stat.isDirectory()) walk(full, rel);
      else entries.set(rel, { kind: "file", path: full });
    }
  };
  try {
    walk(dir, "");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return entries;
}

function content(path) {
  const buffer = readFileSync(path);
  if (buffer.includes(0)) return buffer; // 二進位檔不正規化
  return Buffer.from(buffer.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
}

/** 回傳差異說明清單（空陣列表示一致）。 */
export function diffSkills(root) {
  const source = listTree(join(root, ".agents", "skills"));
  const target = listTree(join(root, ".claude", "skills"));
  const problems = [];
  for (const [rel, entry] of source) {
    const copy = target.get(rel);
    if (!copy) problems.push(`缺少：.claude/skills/${rel}`);
    else if (copy.kind === "symlink") problems.push(`應為實體檔而非 symlink：.claude/skills/${rel}`);
    else if (!content(entry.path).equals(content(copy.path))) problems.push(`內容不同：.claude/skills/${rel}`);
  }
  for (const [rel, entry] of target) {
    if (!source.has(rel)) {
      problems.push(entry.kind === "symlink" ? `多餘的 symlink：.claude/skills/${rel}` : `多餘：.claude/skills/${rel}（.agents/skills/ 沒有）`);
    }
  }
  // 頂層就是 symlink 的 skill 目錄（例如 .claude/skills/<name> -> ../../.agents/skills/<name>）。
  try {
    for (const name of readdirSync(join(root, ".claude", "skills"))) {
      if (lstatSync(join(root, ".claude", "skills", name)).isSymbolicLink()) {
        const msg = `應為實體目錄而非 symlink：.claude/skills/${name}`;
        if (!problems.includes(msg)) problems.push(msg);
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return problems;
}

export function syncSkills(root) {
  const from = join(root, ".agents", "skills");
  const to = join(root, ".claude", "skills");
  rmSync(to, { recursive: true, force: true }); // 對 symlink 只移除連結本身
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    if (IGNORED.has(name)) continue;
    cpSync(join(from, name), join(to, name), { recursive: true, filter: (src) => !IGNORED.has(src.split(/[\\/]/).pop() ?? "") });
  }
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (process.argv.includes("--check")) {
    const problems = diffSkills(root);
    if (problems.length > 0) {
      for (const problem of problems) process.stderr.write(`skills:check ${problem}\n`);
      process.stderr.write("skills:check 失敗：.claude/skills/ 與 .agents/skills/ 不一致。請改 .agents/skills/ 後執行 `pnpm skills:sync`。\n");
      process.exit(1);
    }
    process.stdout.write("skills:check 通過\n");
  } else {
    syncSkills(root);
    process.stdout.write("skills:sync 完成\n");
  }
}
