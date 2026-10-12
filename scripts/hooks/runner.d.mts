export class ToolchainMissingError extends Error {}
export function pnpmCandidates(platform?: string): string[];
export function probeCandidate(candidate: string, env: Record<string, string | undefined>): boolean;
export function resolveCommand(
  command: string,
  options?: {
    env?: Record<string, string | undefined>;
    platform?: string;
    execPath?: string;
    probe?: (candidate: string, env: Record<string, string | undefined>) => boolean;
  },
): string;
export function nodeVersionWarning(version?: string, root?: string): string | null;
