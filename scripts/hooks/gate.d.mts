export type CommandResult = { status: number; output: string };
export type StopGateResult = { block: false } | { block: true; reason: string };
export function runStopGate(options?: {
  stopHookActive?: boolean;
  env?: Record<string, string | undefined>;
  root?: string;
  commands?: readonly string[] | undefined;
  resolve?: (command: string, options: { env: Record<string, string | undefined> }) => string;
  showMe?: (root: string) => string | null;
  run?: (command: string, options: { cwd: string; env: Record<string, string | undefined> }) => CommandResult;
}): StopGateResult;
