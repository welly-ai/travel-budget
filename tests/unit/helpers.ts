import {
  type CellOverride,
  type FunctionName,
  functionNameSchema,
  type ManualAdjustment,
  type ProjectConfig,
  type ProjectConfigV1,
  type ProjectConfigV2,
  type Stage,
} from "@/domain";

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

/** 合成專案設定：Phase 2 / Class 4、所有開關關閉、沒有 build 日期、例外調整與手動覆寫。 */
export function makeConfig(overrides: Partial<ProjectConfigV2> = {}): ProjectConfigV2 {
  return {
    schemaVersion: 2,
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
    cellOverrides: [],
    toleranceProfileId: null,
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

export function override(stage: Stage, name: string, man: number, days: number, reason = ""): CellOverride {
  return { stage, function: fn(name), man, days, reason };
}

/** 把目前版本的設定改寫成 v1（拿掉 v2 才有的欄位），用來測遷移。 */
export function toV1Json(config: ProjectConfigV2): ProjectConfigV1 {
  return {
    schemaVersion: 1,
    deptCode: config.deptCode,
    projectCode: config.projectCode,
    projectName: config.projectName,
    lob: config.lob,
    gen: config.gen,
    phase: config.phase,
    projectClass: config.projectClass,
    gates: config.gates,
    includePreA: config.includePreA,
    includeTld: config.includeTld,
    buildDates: config.buildDates,
    manualAdjustments: config.manualAdjustments,
  };
}
