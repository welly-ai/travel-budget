// 共用工具：只用 Node 內建模組，不依賴 bash、jq。
import { execFileSync, spawnSync } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** git 在 hook 內會設定 GIT_DIR、GIT_INDEX_FILE 等變數；跑子指令前要拿掉，否則子指令會操作到錯的 repo。 */
export function stripGitEnv(env) {
  const clean = { ...env };
  let names = [];
  try {
    names = execFileSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8", env: clean })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    // 沒有 git 時沒有可清的變數。
  }
  for (const name of names) delete clean[name];
  return clean;
}

/** 以 shell 執行一行指令（Windows 上 pnpm 是 .cmd，需要 shell）。stdout 與 stderr 合併收集，同時轉送到 stderr。 */
export function runCommand(command, { cwd, env }) {
  const result = spawnSync(command, { cwd, env, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stderr.write(output);
  const status = result.status ?? (result.error ? 127 : 1);
  return { status, output: result.error ? `${output}\n${result.error.message}` : output };
}

export function readStdin() {
  return new Promise((resolveInput) => {
    if (process.stdin.isTTY) {
      resolveInput("");
      return;
    }
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolveInput(data));
    process.stdin.on("error", () => resolveInput(data));
  });
}

export function tail(text, lines = 15) {
  return text.trimEnd().split(/\r?\n/).slice(-lines).join("\n");
}

/**
 * 本 repo 用 --local core.hooksPath 指向 .githooks，會蓋掉全域（--global／--system）設定的 hooks，
 * 例如機器層的 secret scan。這裡找出被蓋掉的同名 hook 並先執行它；沒有就回傳 null。
 * 傳入的 stdin 會原樣轉給它（pre-push 會從 stdin 讀要推的 ref）。
 */
export function runShadowedHook(name, { env, input = "" }) {
  const projectHooks = resolve(PROJECT_ROOT, ".githooks");
  for (const scope of ["--global", "--system"]) {
    let dir = "";
    try {
      dir = execFileSync("git", ["config", scope, "--get", "core.hooksPath"], { encoding: "utf8", env }).trim();
    } catch {
      continue; // 該層沒有設定
    }
    if (!dir) continue;
    const hookDir = resolve(PROJECT_ROOT, dir.replace(/^~(?=$|[\\/])/, process.env.HOME ?? process.env.USERPROFILE ?? "~"));
    if (hookDir === projectHooks) continue;
    const hook = resolve(hookDir, name);
    if (!existsSync(hook)) continue;
    // git 本身會略過沒有執行權限的 hook，這裡比照辦理（Windows 沒有執行位元，不檢查）。
    if (process.platform !== "win32") {
      try {
        accessSync(hook, constants.X_OK);
      } catch {
        continue;
      }
    }
    // Windows 上 hook 檔不能直接執行，交給 Git for Windows 附的 sh。
    const result =
      process.platform === "win32"
        ? spawnSync("sh", [hook], { cwd: PROJECT_ROOT, env, input, stdio: ["pipe", "inherit", "inherit"] })
        : spawnSync(hook, [], { cwd: PROJECT_ROOT, env, input, stdio: ["pipe", "inherit", "inherit"] });
    return { hook, status: result.status ?? 1 };
  }
  return null;
}
