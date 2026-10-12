export type BranchLookup = (cwd?: string) => string;
export type DefaultBranchLookup = (cwd?: string) => string[];
export type RealPath = (path: string) => string;
export function splitSegments(command: string): string[][];
export function currentBranch(cwd?: string): string;
export function defaultBranches(cwd?: string): string[];
export function checkShellCommand(
  command: string | string[],
  options?: { cwd?: string; currentBranch?: BranchLookup; defaultBranches?: DefaultBranchLookup },
): string | null;
export function normalizePath(input: string): string;
export function relativeCandidates(filePath: string, root: string | string[], cwd?: string, realpath?: RealPath): string[];
export function relativeToRoot(filePath: string, root: string | string[], cwd?: string, realpath?: RealPath): string | null;
export function checkFileWrite(
  filePath: string,
  options: { root: string | string[]; cwd?: string; env?: Record<string, string | undefined>; realpath?: RealPath },
): string | null;
export function patchPaths(patch: string): string[];
export function evaluatePreToolUse(
  payload: unknown,
  options: {
    root: string | string[];
    env?: Record<string, string | undefined>;
    realpath?: RealPath;
    currentBranch?: BranchLookup;
    defaultBranches?: DefaultBranchLookup;
  },
): string | null;
