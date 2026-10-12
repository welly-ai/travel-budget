export type BranchLookup = (cwd?: string) => string;
export function splitSegments(command: string): string[][];
export function checkShellCommand(command: string, options?: { cwd?: string; currentBranch?: BranchLookup }): string | null;
export function normalizePath(input: string): string;
export function relativeToRoot(filePath: string, root: string, cwd?: string): string | null;
export function checkFileWrite(
  filePath: string,
  options: { root: string; cwd?: string; env?: Record<string, string | undefined> },
): string | null;
export function patchPaths(patch: string): string[];
export function evaluatePreToolUse(
  payload: unknown,
  options: { root: string; env?: Record<string, string | undefined>; currentBranch?: BranchLookup },
): string | null;
