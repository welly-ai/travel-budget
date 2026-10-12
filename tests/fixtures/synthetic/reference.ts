import {
  type FunctionDef,
  functionNameSchema,
  type GateKey,
  type Group,
  type GuidanceRow,
  type Phase,
  type ProjectClass,
  type ReferenceData,
  referenceDataSchema,
  type Stage,
  type StageSite,
} from "@/domain";

/**
 * 合成參考資料（可提交）。結構與真實參考資料相同，名稱與數字全部虛構。
 *
 * 產生方式（可決定性，沒有亂數、沒有時間）：
 *   - 12 個虛構 Function（見 SPECS），順序即輸出順序。
 *   - 對 Phase ∈ {2, 3}、Class ∈ {4, 3.5, 3, 2}、非 RFQ 的 7 個 Stage、每個有 guidance 的 Function：
 *     fi、si、pi、ci 分別是 Function、Stage、Phase、Class 的序號；
 *     當 (fi*3 + si*5 + pi*7 + ci) % 5 === 0 時略過（讓資料稀疏、各組合不同）；
 *     人次 = 1 + (fi + si + ci) % 3；天數 = 2 + ((fi*2 + si + pi + ci*3) % 6) * 2。
 *   - 負人天的 Function（Add-Neg）：人次 -1、天數 10 + 5*ci。
 *   - 合併來源的 Function（Add-Merged）：列依序輪流標成兩個來源名稱。
 * 要重現就是重新呼叫 buildSyntheticReference()，結果每次逐位元相同。
 */

interface FunctionSpec {
  name: string;
  group: Group;
  gate: FunctionDef["gate"];
  sources: readonly string[];
  hasGuidance: boolean;
  negative?: boolean;
}

const SPECS: readonly FunctionSpec[] = [
  { name: "Core-1", group: "Core", gate: { kind: "always" }, sources: ["Core-1"], hasGuidance: true },
  { name: "Core-2", group: "Core", gate: { kind: "always" }, sources: ["Core-2"], hasGuidance: true },
  { name: "Core-3", group: "Core", gate: { kind: "always" }, sources: ["Core-3"], hasGuidance: true },
  { name: "Supp-1", group: "Support", gate: { kind: "always" }, sources: ["Supp-1"], hasGuidance: true },
  { name: "Supp-2", group: "Support", gate: { kind: "always" }, sources: ["Supp-2"], hasGuidance: true },
  { name: "Supp-NoGuidance", group: "Support", gate: { kind: "always" }, sources: [], hasGuidance: false },
  { name: "Add-Hap", group: "Adder", gate: { kind: "switch", key: "hapticTp2" }, sources: ["Add-Hap"], hasGuidance: true },
  { name: "Add-Neg", group: "Adder", gate: { kind: "switch", key: "mePlastic" }, sources: ["Add-Neg"], hasGuidance: true, negative: true },
  { name: "Add-Merged", group: "Adder", gate: { kind: "switch", key: "dqaItm" }, sources: ["Add-M1", "Add-M2"], hasGuidance: true },
  { name: "Opt-Pcb-1", group: "Option", gate: { kind: "switch", key: "secondPcb" }, sources: ["Opt-Pcb-1"], hasGuidance: true },
  { name: "Opt-Pcb-2", group: "Option", gate: { kind: "switch", key: "secondPcb" }, sources: ["Opt-Pcb-2"], hasGuidance: true },
  { name: "Opt-Gpu", group: "Option", gate: { kind: "switch", key: "gpu" }, sources: ["Opt-Gpu"], hasGuidance: true },
];

const PHASES: readonly Phase[] = [2, 3];
const CLASSES: readonly ProjectClass[] = [4, 3.5, 3, 2];
const GUIDED_STAGES: readonly Stage[] = ["pre A", "A", "B", "C", "TLD", "Pre-MP", "MP"];

const SYNTHETIC_SITES: readonly StageSite[] = [
  { stage: "RFQ", travelArea: "Area North", travelSite: "Site Alpha" },
  { stage: "pre A", travelArea: "Area South", travelSite: "Site Beta" },
  { stage: "A", travelArea: "Area South", travelSite: "Site Beta" },
  { stage: "B", travelArea: "Area South", travelSite: "Site Beta" },
  { stage: "C", travelArea: "Area South", travelSite: "Site Beta" },
  { stage: "TLD", travelArea: "Area South", travelSite: "Site Gamma" },
  { stage: "Pre-MP", travelArea: "Area South", travelSite: "Site Gamma" },
  { stage: "MP", travelArea: "Area South", travelSite: "Site Gamma" },
];

function optionOf(gate: FunctionDef["gate"], group: Group): GateKey | null {
  return group === "Option" && gate.kind === "switch" ? gate.key : null;
}

function kindOf(group: Group): GuidanceRow["kind"] {
  switch (group) {
    case "Core":
    case "Support":
      return "BASE";
    case "Adder":
      return "ADDER";
    case "Option":
      return "OPT";
  }
}

export function buildSyntheticReference(): ReferenceData {
  const functions: FunctionDef[] = SPECS.map((spec) => ({
    name: functionNameSchema.parse(spec.name),
    group: spec.group,
    gate: spec.gate,
    sourceFunctions: [...spec.sources],
  }));

  const guidance: GuidanceRow[] = [];
  PHASES.forEach((phase, pi) => {
    CLASSES.forEach((projectClass, ci) => {
      GUIDED_STAGES.forEach((stage, si) => {
        SPECS.forEach((spec, fi) => {
          if (!spec.hasGuidance || (fi * 3 + si * 5 + pi * 7 + ci) % 5 === 0) return;
          const man = spec.negative === true ? -1 : 1 + ((fi + si + ci) % 3);
          const days = spec.negative === true ? 10 + 5 * ci : 2 + ((fi * 2 + si + pi + ci * 3) % 6) * 2;
          guidance.push({
            phase,
            projectClass,
            kind: kindOf(spec.group),
            option: optionOf(spec.gate, spec.group),
            stage,
            function: functionNameSchema.parse(spec.name),
            sourceFunction: spec.sources[(si + ci) % spec.sources.length] ?? spec.name,
            man,
            days,
          });
        });
      });
    });
  });

  return referenceDataSchema.parse({ schemaVersion: 1, functions, stages: [...SYNTHETIC_SITES], guidance });
}

/**
 * 手寫的極小參考資料：只有 Phase 2 / Class 4（外加少量對照用的其他組合），數字小到可以心算。
 * 單元測試用它逐條驗證計算規則。
 */
export function buildMiniReference(): ReferenceData {
  const name = (value: string) => functionNameSchema.parse(value);
  const row = (
    phase: Phase,
    projectClass: ProjectClass,
    stage: Stage,
    fn: string,
    man: number,
    days: number,
    group: Group,
    option: GateKey | null = null,
  ): GuidanceRow => ({ phase, projectClass, kind: kindOf(group), option, stage, function: name(fn), sourceFunction: fn, man, days });
  return referenceDataSchema.parse({
    schemaVersion: 1,
    functions: [
      { name: name("LD"), group: "Core", gate: { kind: "always" }, sourceFunctions: ["LD"] },
      { name: name("SUP"), group: "Support", gate: { kind: "always" }, sourceFunctions: ["SUP"] },
      { name: name("BARE"), group: "Support", gate: { kind: "always" }, sourceFunctions: [] },
      { name: name("ADD"), group: "Adder", gate: { kind: "switch", key: "adsp" }, sourceFunctions: ["ADD"] },
      { name: name("NEG"), group: "Adder", gate: { kind: "switch", key: "mePlastic" }, sourceFunctions: ["NEG"] },
      { name: name("OPT"), group: "Option", gate: { kind: "switch", key: "gpu" }, sourceFunctions: ["OPT"] },
    ],
    stages: [...SYNTHETIC_SITES],
    guidance: [
      row(2, 4, "pre A", "LD", 1, 7, "Core"),
      row(2, 4, "A", "LD", 2, 10, "Core"),
      row(2, 4, "A", "LD", 1, 4, "Core"), // 同一格兩列：加總（Excel 的 SUMIF）
      row(2, 4, "B", "LD", 1, 5, "Core"),
      row(2, 4, "MP", "LD", 1, 4, "Core"),
      row(2, 4, "A", "SUP", 2, 3, "Support"),
      row(2, 4, "TLD", "SUP", 1, 6, "Support"),
      row(2, 4, "A", "ADD", 1, 10, "Adder"),
      row(2, 4, "B", "NEG", -1, 20, "Adder"),
      row(2, 4, "C", "OPT", 2, 5, "Option", "gpu"),
      row(3, 4, "A", "LD", 9, 9, "Core"), // 只有 Phase 3 才會用到
      row(2, 3.5, "A", "LD", 8, 8, "Core"), // 只有 Class 3.5 才會用到
    ],
  });
}
