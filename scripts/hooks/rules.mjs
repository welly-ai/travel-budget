// PreToolUse 規則：純函式。唯一的 I/O 是（未注入時）向 git 查分支名稱，以及入口注入的 realpath。
// Claude 與 Codex 轉接層都呼叫這裡；規格見 docs/hooks.md。
import { execFileSync } from "node:child_process";
import { posix, resolve as resolvePath } from "node:path";

// ---------- shell commands ----------

/** Split a command line into segments (at ; & | newline, parentheses, backticks) of tokens; understands quotes. */
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
    } else if (ch === "$" && (command[i + 1] === "'" || command[i + 1] === '"')) {
      // $'.' and $"." quote like '.' and "." for our purposes.
      continue;
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

const GIT_OPTS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix", "--config-env"]);
const SHELL_EXEC_FLAG = /^(-[a-z]*c|-command|-c|\/[ck])$/i;
const isGitToken = (token) => /(^|[\\/])git(\.exe)?$/i.test(token);

function git(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export function currentBranch(cwd) {
  return git(["symbolic-ref", "--short", "-q", "HEAD"], cwd) || git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
}

/** main and master, plus whatever origin/HEAD points at. */
export function defaultBranches(cwd) {
  const names = new Set(["main", "master"]);
  const head = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd); // origin/<branch>
  if (head.startsWith("origin/")) names.add(head.slice("origin/".length));
  return [...names];
}

const DENY_ADD_ALL = "請明確指定要 stage 的檔案（git add <path>）；批次 stage（-A、--all、.）會把不該提交的檔案帶進來。";
const DENY_SKIP_HOOKS = "不得跳過 git hooks（--no-verify、commit -n，或用 core.hooksPath 覆寫）；hook 失敗請修正原因。";
const DENY_FORCE_DEFAULT = "不得 force push 到預設分支（main／master，改寫共用歷史）；HEAD、@、+ref 也算。";
const DENY_DELETE_DEFAULT = "不得刪除遠端的預設分支（main／master）。";

// Git accepts any unambiguous prefix of a long option. These are the shortest unambiguous spellings.
const NO_VERIFY = /^--no-veri(f(y)?)?$/;
const ADD_ALL = /^--(a(l(l)?)?|no-ignore-removal)$/;
const PUSH_DELETE = /^--de(l(e(t(e)?)?)?)?$/;
const BULK_PATHSPEC = new Set([".", "./", ":/", "*", ":(top)"]);

/** The branch name a push refspec destination refers to; HEAD and @ mean the current branch. */
function refDestination(ref, currentOf) {
  const name = ref.replace(/^\+/, "");
  const dest = name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
  const branch = dest.replace(/^refs\/heads\//, "");
  return branch === "HEAD" || branch === "@" ? currentOf() : branch;
}

function analyzeGit(args, cwd, options) {
  let i = 0;
  let effectiveCwd = cwd;
  while (i < args.length && args[i].startsWith("-")) {
    const opt = args[i];
    const value = args[i + 1] ?? "";
    // A config override of the hooks directory skips every hook, whatever the subcommand.
    if (opt === "-c" && /^core\.hookspath=/i.test(value)) return DENY_SKIP_HOOKS;
    if (opt === "--config-env" && /^core\.hookspath=/i.test(value)) return DENY_SKIP_HOOKS;
    if (/^-c.+/.test(opt) && /^-ccore\.hookspath=/i.test(opt)) return DENY_SKIP_HOOKS;
    if (/^--config-env=core\.hookspath=/i.test(opt)) return DENY_SKIP_HOOKS;
    if (opt === "-C" && value) effectiveCwd = effectiveCwd ? resolvePath(effectiveCwd, value) : value;
    i += GIT_OPTS_WITH_VALUE.has(opt) ? 2 : 1;
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (sub === undefined) return null;
  if (rest.some((a) => NO_VERIFY.test(a))) return DENY_SKIP_HOOKS;
  // -n is the short form of the commit flag above (it means something else for log, push, and others).
  if (sub === "commit" && rest.some((a) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a))) return DENY_SKIP_HOOKS;
  if ((sub === "add" || sub === "stage") && rest.some((a) => BULK_PATHSPEC.has(a) || ADD_ALL.test(a) || /^-[a-zA-Z]*A[a-zA-Z]*$/.test(a))) return DENY_ADD_ALL;
  if (sub === "push") {
    const defaults = options.defaultBranches(effectiveCwd);
    let cached;
    const currentOf = () => (cached ??= options.currentBranch(effectiveCwd));
    const isDefault = (ref) => defaults.includes(refDestination(ref, currentOf));
    const positional = rest.filter((a) => !a.startsWith("-"));
    const force = rest.some((a) => a === "--force" || /^--for(c(e)?)?$/.test(a) || a.startsWith("--force-with-lease") || a === "--force-if-includes" || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a));
    const deleting = rest.some((a) => PUSH_DELETE.test(a) || /^-[a-zA-Z]*d[a-zA-Z]*$/.test(a));
    const hasRepo = rest.some((a) => a === "--repo" || a.startsWith("--repo="));
    const refspecs = hasRepo ? positional : positional.slice(1); // otherwise the first positional is the remote
    if (positional.some((a) => a.startsWith("+") && isDefault(a))) return DENY_FORCE_DEFAULT;
    if (refspecs.some((a) => a.startsWith(":") && isDefault(a)) || (deleting && refspecs.some(isDefault))) return DENY_DELETE_DEFAULT;
    if (force && (refspecs.some(isDefault) || (refspecs.length === 0 && defaults.includes(currentOf())))) return DENY_FORCE_DEFAULT;
  }
  return null;
}

const PRINT_ONLY = new Set(["echo", "printf", "print", "write-host", "write-output"]);

/** The command word of a segment, skipping VAR=value assignments and group openers. */
function commandWord(tokens) {
  return tokens.find((t) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(t) && t !== "{" && t !== "!");
}

function checkTokens(tokens, options, depth) {
  // `echo git add -A` prints; it does not run. Inside a -c string (depth > 0) the output may be executed
  // (`bash -c "$(echo git add .)"`), so the exemption applies to top-level commands only.
  const printOnly = depth === 0 && PRINT_ONLY.has((commandWord(tokens) ?? "").toLowerCase());
  for (let i = 0; i < tokens.length; i++) {
    if (!printOnly && isGitToken(tokens[i])) {
      const reason = analyzeGit(tokens.slice(i + 1), options.cwd, options);
      if (reason) return reason;
    }
    // bash -c "...", powershell -Command "...", cmd /c "...", eval "...": check the inner string again.
    // Only after such a flag, so that `commit -m "git add ."` is not misread.
    if (!printOnly && i > 0 && (SHELL_EXEC_FLAG.test(tokens[i - 1]) || /^eval$/i.test(tokens[i - 1])) && /git/i.test(tokens[i])) {
      const reason = checkShellCommand(tokens[i], options, depth + 1);
      if (reason) return reason;
    }
  }
  return null;
}

/**
 * Check one shell command line, or a command given as an argv array (Codex). Returns the reason to deny,
 * or null to allow.
 * @param {string | string[]} command
 * @param {{ cwd?: string, currentBranch?: (cwd?: string) => string, defaultBranches?: (cwd?: string) => string[] }} [options]
 */
export function checkShellCommand(command, options = {}, depth = 0) {
  if (depth > 3) return null;
  const resolved = { currentBranch, defaultBranches, ...options };
  if (Array.isArray(command)) {
    const words = command.map(String);
    return checkTokens(words, resolved, depth) ?? checkShellCommand(words.join(" "), resolved, depth + 1);
  }
  if (typeof command !== "string") return null;
  const segments = splitSegments(command);
  for (const tokens of segments) {
    const reason = checkTokens(tokens, resolved, depth);
    if (reason) return reason;
  }
  // `printf 'git add .' | sh`: text piped into a shell is executed, so inspect quoted strings that mention git.
  if (/\|\s*(?:sudo\s+)?(?:\S*[\\/])?(?:ba|z|da|k|a)?sh(?:\.exe)?(?:\s|$)/i.test(command)) {
    for (const tokens of segments) {
      for (const token of tokens) {
        if (/\s/.test(token) && /(^|\s)git/i.test(token)) {
          const reason = checkShellCommand(token, resolved, depth + 1);
          if (reason) return reason;
        }
      }
    }
  }
  return null;
}

// ---------- file paths ----------

/** Forward slashes, no . or .. segments, lowercase drive letter; Git Bash /c/... becomes c:/... */
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

/** One root-relative, lowercase path for an absolute normalized path, or null when outside every root. */
function stripRoot(absLower, roots) {
  for (const rootN of roots) {
    const r = rootN.toLowerCase().replace(/\/$/, "");
    if (absLower === r) return "";
    if (absLower.startsWith(`${r}/`)) return absLower.slice(r.length + 1);
  }
  return null;
}

/**
 * Every root-relative lowercase spelling of a path (Windows and the default macOS filesystem ignore case);
 * empty when the path is outside the project. `root` may be a list of equivalent spellings of the root.
 * With `realpath` (the entry points pass one), the path is also resolved through symlinks, junctions, and
 * alias spellings such as /tmp for /private/tmp, so a link into a protected directory is seen for what it is.
 */
export function relativeCandidates(filePath, root, cwd, realpath) {
  const roots = (Array.isArray(root) ? root : [root]).map(normalizePath);
  let abs = normalizePath(filePath);
  if (!isAbsolutePath(abs)) abs = normalizePath(`${normalizePath(cwd ?? roots[0])}/${abs}`);
  const forms = [abs];
  const allRoots = [...roots];
  if (realpath) {
    for (const r of roots) allRoots.push(normalizePath(realpath(r)));
    forms.push(normalizePath(realpath(abs)));
  }
  const found = forms.map((form) => stripRoot(form.toLowerCase(), allRoots)).filter((rel) => rel !== null);
  return [...new Set(found)];
}

/** The first spelling from relativeCandidates (kept for callers that want a single answer). */
export function relativeToRoot(filePath, root, cwd, realpath) {
  return relativeCandidates(filePath, root, cwd, realpath)[0] ?? null;
}

/**
 * 檢查 agent 要寫入的路徑。回傳擋下原因，放行則回傳 null。
 * 受保護路徑寫死在這裡（tests/golden、local-data、.claude/skills）；任何一種拼法（含 symlink 解析後）命中就擋。
 * @param {string} filePath
 * @param {{ root: string | string[], cwd?: string, env?: Record<string, string | undefined>, realpath?: (path: string) => string }} options
 */
export function checkFileWrite(filePath, { root, cwd, env = {}, realpath }) {
  for (const rel of relativeCandidates(filePath, root, cwd, realpath)) {
    if (rel === "tests/golden" || rel.startsWith("tests/golden/")) {
      if (env["ALLOW_GOLDEN_EDIT"] === "1") continue;
      return "黃金測試由人維護，不可修改。對不上請停下來，用 NEEDS_DECISION 回報差異。（人要改時，在啟動環境設定 ALLOW_GOLDEN_EDIT=1。）";
    }
    if (rel === "local-data" || rel.startsWith("local-data/")) {
      return "local-data/ 是真實公司資料，只由人放入，agent 不可寫入。";
    }
    if (rel === ".claude/skills" || rel.startsWith(".claude/skills/")) {
      return ".claude/skills/ 是複本。請改 .agents/skills/ 後執行 `pnpm skills:sync`。";
    }
  }
  return null;
}

/** Every path touched by a Codex apply_patch text. One patch may touch many files; paths may contain spaces. */
export function patchPaths(patch) {
  const paths = [];
  for (const line of String(patch).split(/\r?\n/)) {
    const m = /^\*\*\*\s+(?:Add File|Update File|Delete File|Move to):\s*(.+)$/.exec(line);
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
 * @param {{ root: string | string[], env?: Record<string, string | undefined>, realpath?: (path: string) => string, currentBranch?: (cwd?: string) => string, defaultBranches?: (cwd?: string) => string[] }} options
 */
export function evaluatePreToolUse(payload, { root, env = {}, realpath, currentBranch: branchOf, defaultBranches: defaultsOf }) {
  if (typeof payload !== "object" || payload === null) return null;
  const rootList = Array.isArray(root) ? root : [root];
  const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "";
  const input = typeof payload.tool_input === "object" && payload.tool_input !== null ? payload.tool_input : {};
  const cwd = typeof payload.cwd === "string" ? payload.cwd : rootList[0];

  if (SHELL_TOOLS.has(toolName)) {
    const raw = input.command ?? input.cmd;
    return checkShellCommand(raw, { cwd, ...(branchOf ? { currentBranch: branchOf } : {}), ...(defaultsOf ? { defaultBranches: defaultsOf } : {}) });
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
    const reason = checkFileWrite(target, { root: rootList, cwd, env, realpath });
    if (reason) return reason;
  }
  return null;
}
