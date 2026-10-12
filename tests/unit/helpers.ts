import { type FunctionName, functionNameSchema, type ManualAdjustment, type ProjectConfig, type Stage } from "@/domain";

const GATES_OFF: ProjectConfig["gates"] = {
  adsp: false,
  hapticTp2: false,
  id: false,
  dqaItm: false,
  dqaRel: false,
  mePlastic: false,
  thm: false,
  secondPcb: false,
  gpu: false,
};

/** 合成專案設定：Phase 2 / Class 4、所有開關關閉、沒有 build 日期與例外調整。 */
export function makeConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    schemaVersion: 1,
    deptCode: "DEPT-X",
    projectCode: "TST01",
    projectName: "Test Project",
    lob: "LOB One",
    gen: "GEN-T",
    phase: 2,
    projectClass: 4,
    gates: GATES_OFF,
    includePreA: false,
    includeTld: false,
    buildDates: {},
    manualAdjustments: [],
    ...overrides,
  };
}

export function gates(on: readonly (keyof ProjectConfig["gates"])[]): ProjectConfig["gates"] {
  return { ...GATES_OFF, ...Object.fromEntries(on.map((key) => [key, true])) };
}

export function fn(name: string): FunctionName {
  return functionNameSchema.parse(name);
}

export function adjust(stage: Stage, name: string, man: number, days: number, remark = ""): ManualAdjustment {
  return { stage, function: fn(name), man, days, remark };
}
