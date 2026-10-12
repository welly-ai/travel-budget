import type { LobSummary, ProjectConfig, ProjectResult } from "@/domain";

export interface ProjectEntry {
  config: ProjectConfig;
  result: ProjectResult;
}

/** 依 LOB 彙總人次與人天；LOB 依第一次出現的順序排列。 */
export function summarizeByLob(entries: readonly ProjectEntry[]): LobSummary[] {
  const byLob = new Map<string, LobSummary>();
  for (const { config, result } of entries) {
    const current = byLob.get(config.lob) ?? { lob: config.lob, projectCount: 0, man: 0, manDays: 0 };
    byLob.set(config.lob, {
      lob: config.lob,
      projectCount: current.projectCount + 1,
      man: current.man + result.total.man,
      manDays: current.manDays + result.total.manDays,
    });
  }
  return [...byLob.values()];
}
