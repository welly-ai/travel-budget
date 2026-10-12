import type { BranchLookup } from "./rules.mjs";
import type { CommandResult } from "./gate.mjs";

export type StopOptions = {
  env?: Record<string, string | undefined>;
  root?: string;
  commands?: readonly string[] | undefined;
  resolve?: (command: string, options: { env: Record<string, string | undefined> }) => string;
  showMe?: (root: string) => string | null;
  run?: (command: string, options: { cwd: string; env: Record<string, string | undefined> }) => CommandResult;
};
export type HookResponse = Record<string, unknown>;
export function stopResponse(rawInput: string, options?: StopOptions): HookResponse;
export function preToolUseResponse(
  rawInput: string,
  options?: { root?: string; env?: Record<string, string | undefined>; currentBranch?: BranchLookup },
): HookResponse;
export function runStop(): Promise<void>;
export function runPreToolUse(): Promise<void>;
