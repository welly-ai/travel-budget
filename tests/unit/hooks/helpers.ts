import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";

export const repoRoot = resolve(import.meta.dirname, "..", "..", "..");

/** hook 在執行 pnpm check 時會把呼叫端的環境變數帶進來；每個案例都從乾淨的 env 開始，只放明確指定的值。 */
const LEAKY = /^(AGENT_|CLAUDE|ALLOW_GOLDEN_EDIT|GIT_|HOOK_TEST_)/;

export function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (LEAKY.test(key)) Reflect.deleteProperty(env, key);
  }
  return Object.assign(env, extra);
}

const hookOutput = z.object({
  decision: z.string().optional(),
  reason: z.string().optional(),
  hookSpecificOutput: z
    .object({ hookEventName: z.string(), permissionDecision: z.string(), permissionDecisionReason: z.string() })
    .optional(),
});

export type HookRun = { status: number | null; stdout: string; stderr: string; json: z.infer<typeof hookOutput> };

/** 真的啟動 node 子行程執行 hook 入口，與 Claude／Codex 實際呼叫的方式相同。 */
export function runHook(script: string, payload: unknown, extraEnv: Record<string, string> = {}): HookRun {
  const result = spawnSync(process.execPath, [resolve(repoRoot, "scripts", "hooks", script)], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env: cleanEnv(extraEnv),
    cwd: repoRoot,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json: hookOutput.parse(JSON.parse(result.stdout)) };
}
