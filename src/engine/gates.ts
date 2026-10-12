import type { FunctionDef, ProjectConfig, Stage } from "@/domain";

/** Function 是否計入 guidance：Core／Support 恆計入，Adder／Option 看開關。 */
export function isFunctionEnabled(def: FunctionDef, config: ProjectConfig): boolean {
  switch (def.gate.kind) {
    case "always":
      return true;
    case "switch":
      return config.gates[def.gate.key];
  }
}

/** Stage 是否計入 guidance：只有 pre A 與 TLD 是選配。 */
export function isStageEnabled(stage: Stage, config: ProjectConfig): boolean {
  switch (stage) {
    case "pre A":
      return config.includePreA;
    case "TLD":
      return config.includeTld;
    case "RFQ":
    case "A":
    case "B":
    case "C":
    case "Pre-MP":
    case "MP":
      return true;
  }
}
