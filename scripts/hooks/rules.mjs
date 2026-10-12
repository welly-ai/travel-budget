// PreToolUse 規則：純函式，不碰檔案系統（取目前分支除外，且可注入）。
// Claude 與 Codex 轉接層都呼叫這裡；規格見 docs/hooks.md。
import { execFileSync } from "node:child_process";
import { posix } from "node:path";

// ---------- shell 指令 ----------

/** 把一行 shell 指令切成「段」（以 ; & | 換行 括號分隔），每段再切成 token；理解單雙引號。 */
export function splitSegments(command) {
  const segments = [];
  let tokens = [];
  let current = "";
  let hasToken = false;
  let quote = "";
  const endToken = () => {
    if (hasToken) tokens.push(current);
    current = "";
    hasToken = false;
  };
  const endSegment = () => {
    endToken();
    if (tokens.length > 0) segments.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = "";
      else if (ch === "\\" && quote === '"' && i + 1 < command.length && /["\\$`]/.test(command[i + 1])) current += command[++i];
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
    } else if (/\s/.test(ch) && ch !== "\n") {
      endToken();
    } else if (ch === ";" || ch === "&" || ch === "|" || ch === "\n" || ch === "(" || ch === ")" || ch === "`") {
      endSegment();
    } else if (ch === "$" && command[i + 1] === "(") {
      endSegment();
      i++;
    } else {
      current += ch;
      hasToken = true;
    }
  }
  endSegment();
  return segments;
}

const GIT_OPTS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix"]);

const SHELL_EXEC_FLAG = /^(-[a-z]*c|-command|-c|\/[ck])$/i;

function isGitToken(token) {
  return /(^|[\\/])git(\.exe)?$/i.test(token);
}

function isMainRef(ref) {
  const name = ref.replace(/^\+/, "");
  const dest = name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
  return dest.replace(/^refs\/heads\//, "") === "main";
}

function currentBranch(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const DENY_ADD_ALL = "請明確指定要 stage 的檔案（git add <path>）；批次 stage（-A、--all、.）會把不該提交的檔案帶進來。";
const DENY_NO_VERIFY = "不得用 --no-verify 跳過 git hooks；hook 失敗請修正原因。";
const DENY_FORCE_MAIN = "不得 force push 到 main（改寫 main 歷史）。";

function analyzeGit(args, cwd, branchOf) {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) {
    i += GIT_OPTS_WITH_VALUE.has(args[i]) ? 2 : 1;
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (sub === undefined) return null;
  if (rest.includes("--no-verify")) return DENY_NO_VERIFY;
  // -n 是 commit --no-verify 的短寫；-m 的值不以 - 開頭，不會誤判。
  if (sub === "commit" && rest.some((a) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a))) return DENY_NO_VERIFY;
  if (sub === "add") {
    const bulk = rest.some((a) => a === "." || a === "--all" || /^-[a-zA-Z]*A[a-zA-Z]*$/.test(a));
    if (bulk) return DENY_ADD_ALL;
  }
  if (sub === "push") {
    const positional = rest.filter((a) => !a.startsWith("-"));
    const force = rest.some(
      (a) => a === "--force" || a.startsWith("--force-with-lease") || a === "--force-if-includes" || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a),
    );
    const plusMain = positional.some((a) => a.startsWith("+") && isMainRef(a));
    const refspecs = positional.slice(1); // 第一個是 remote
    if (plusMain) return DENY_FORCE_MAIN;
    if (force && (refspecs.some(isMainRef) || (refspecs.length === 0 && branchOf(cwd) === "main"))) return DENY_FORCE_MAIN;
  }
  return null;
}

/**
 * 檢查一行 shell 指令。回傳擋下原因，放行則回傳 null。
 * @param {string} command
 * @param {{ cwd?: string, currentBranch?: (cwd?: string) => string }} [options]
 */
export function checkShellCommand(command, { cwd, currentBranch: branchOf = currentBranch } = {}, depth = 0) {
  if (typeof command !== "string" || depth > 3) return null;
  for (const tokens of splitSegments(command)) {
    for (let i = 0; i < tokens.length; i++) {
      if (isGitToken(tokens[i])) {
        const reason = analyzeGit(tokens.slice(i + 1), cwd, branchOf);
        if (reason) return reason;
      }
      // bash -c "..."、powershell -Command "..."、cmd /c "..."、eval "..."：內層字串再檢查一次。
      // 只在前一個 token 是這類旗標時才展開，避免 commit -m "git ..." 之類的訊息被誤判。
      if (i > 0 && (SHELL_EXEC_FLAG.test(tokens[i - 1]) || /^eval$/i.test(tokens[i - 1])) && /git/i.test(tokens[i])) {
        const reason = checkShellCommand(tokens[i], { cwd, currentBranch: branchOf }, depth + 1);
        if (reason) return reason;
      }
    }
  }
  return null;
}

// ---------- 檔案路徑 ----------

/** 統一成正斜線、消去 . 與 ..；磁碟代號小寫；Git Bash 的 /c/... 視為 c:/...。 */
export function normalizePath(input) {
  let p = String(input).replace(/\\/g, "/");
  if (/^[a-zA-Z]:/.test(p)) p = p[0].toLowerCase() + p.slice(1);
  else {
    const gitBash = /^\/([a-zA-Z])(\/.*)?$/.exec(p);
    if (gitBash) p = `${gitBash[1].toLowerCase()}:${gitBash[2] ?? "/"}`;
  }
  const drive = /^([a-z]:)(\/.*)?$/.exec(p);
  if (drive) return `${drive[1]}${posix.normalize(drive[2] ?? "/")}`.replace(/(?<=.)\/+$/, "");
  return posix.normalize(p).replace(/(?<=.)\/+$/, "");
}

const isAbsolutePath = (p) => /^[a-z]:\//.test(p) || p.startsWith("/");

/** 回傳相對專案根目錄的小寫路徑（Windows 與 macOS 預設檔案系統不分大小寫）；在專案外回傳 null。 */
export function relativeToRoot(filePath, root, cwd) {
  const rootN = normalizePath(root);
  let abs = normalizePath(filePath);
  if (!isAbsolutePath(abs)) abs = normalizePath(`${normalizePath(cwd ?? rootN)}/${abs}`);
  const a = abs.toLowerCase();
  const r = rootN.toLowerCase().replace(/\/$/, "");
  if (a === r) return "";
  if (!a.startsWith(`${r}/`)) return null;
  return a.slice(r.length + 1);
}

/**
 * 檢查要寫入的檔案。回傳擋下原因，放行則回傳 null。
 * @param {string} filePath
 * @param {{ root: string, cwd?: string, env?: Record<string, string | undefined> }} options
 */
export function checkFileWrite(filePath, { root, cwd, env = {} }) {
  const rel = relativeToRoot(filePath, root, cwd);
  if (rel === null) return null;
  if (rel === "tests/golden" || rel.startsWith("tests/golden/")) {
    if (env["ALLOW_GOLDEN_EDIT"] === "1") return null;
    return "黃金測試由人維護，不可修改。對不上請停下來，用 NEEDS_DECISION 回報差異。（人要改時，在啟動環境設定 ALLOW_GOLDEN_EDIT=1。）";
  }
  if (rel === "local-data" || rel.startsWith("local-data/")) {
    return "local-data/ 是真實公司資料，只由人放入，agent 不可寫入。";
  }
  if (rel === ".claude/skills" || rel.startsWith(".claude/skills/")) {
    return ".claude/skills/ 是複本。請改 .agents/skills/ 後執行 `pnpm skills:sync`。";
  }
  return null;
}

/** 從 Codex apply_patch 的 patch 文字取出所有被動到的路徑。 */
export function patchPaths(patch) {
  const paths = [];
  for (const line of String(patch).split(/\r?\n/)) {
    const m = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/.exec(line.trim());
    if (m) paths.push(m[1].trim());
  }
  return paths;
}

const SHELL_TOOLS = new Set(["Bash", "exec_command", "shell", "local_shell", "shell_command"]);
const PATCH_TOOLS = new Set(["apply_patch"]);
const FILE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/**
 * 依 PreToolUse payload（Claude 或 Codex）判斷。回傳擋下原因或 null。
 * @param {unknown} payload
 * @param {{ root: string, env?: Record<string, string | undefined>, currentBranch?: (cwd?: string) => string }} options
 */
export function evaluatePreToolUse(payload, { root, env = {}, currentBranch: branchOf }) {
  if (typeof payload !== "object" || payload === null) return null;
  const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "";
  const input = typeof payload.tool_input === "object" && payload.tool_input !== null ? payload.tool_input : {};
  const cwd = typeof payload.cwd === "string" ? payload.cwd : root;
  const branchOpt = branchOf ? { currentBranch: branchOf } : {};

  if (SHELL_TOOLS.has(toolName)) {
    const raw = input.command ?? input.cmd;
    const command = Array.isArray(raw) ? raw.join(" ") : raw;
    return checkShellCommand(command, { cwd, ...branchOpt });
  }
  const targets = [];
  if (PATCH_TOOLS.has(toolName)) {
    const raw = input.command ?? input.patch ?? input.input;
    targets.push(...patchPaths(Array.isArray(raw) ? raw.join("\n") : raw));
  } else if (FILE_TOOLS.has(toolName)) {
    for (const key of ["file_path", "notebook_path", "path"]) {
      if (typeof input[key] === "string") targets.push(input[key]);
    }
  }
  for (const target of targets) {
    const reason = checkFileWrite(target, { root, cwd, env });
    if (reason) return reason;
  }
  return null;
}
