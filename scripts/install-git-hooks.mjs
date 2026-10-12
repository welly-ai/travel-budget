// 只設定「這個 repo」的 core.hooksPath=.githooks（--local）；絕不寫入全域設定。
import { execFileSync } from "node:child_process";
import { chmodSync } from "node:fs";
import { join } from "node:path";

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let root;
try {
  root = git(["rev-parse", "--show-toplevel"], process.cwd());
} catch {
  process.stderr.write("install-git-hooks: 請在 Git 工作目錄內執行\n");
  process.exit(2);
}

const desired = ".githooks";
let local = "";
try {
  local = git(["config", "--local", "--get", "core.hooksPath"], root);
} catch {
  // 本地沒設定。
}
if (local && local !== desired) {
  process.stderr.write(`install-git-hooks: 本地 core.hooksPath 已是 ${local}，請手動合併後再執行\n`);
  process.exit(1);
}

if (git(["rev-parse", "--git-dir"], root) !== git(["rev-parse", "--git-common-dir"], root)) {
  process.stderr.write("install-git-hooks: 不在 linked worktree 內修改共用設定；請從主工作目錄執行\n");
  process.exit(1);
}

for (const hook of ["pre-commit", "pre-push"]) {
  try {
    chmodSync(join(root, desired, hook), 0o755);
  } catch {
    // Windows 沒有 chmod 語意；Git for Windows 的 sh 仍可執行。
  }
}
git(["config", "--local", "core.hooksPath", desired], root);
process.stdout.write(`install-git-hooks: 已設定本 repo 的 core.hooksPath=${desired}（全域設定未動）\n`);
const global = (() => {
  try {
    return git(["config", "--global", "--get", "core.hooksPath"], root);
  } catch {
    return "";
  }
})();
if (global) process.stdout.write(`install-git-hooks: 注意：全域 core.hooksPath=${global} 在本 repo 被本地設定取代\n`);
