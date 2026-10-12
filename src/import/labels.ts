import type { ExcelLayout, GateKey, Stage } from "@/domain";
import { GATE_KEYS, STAGES } from "@/domain";

// 版面相關的文字（可能含真實縮寫）一律來自 ExcelLayout，不寫死在程式碼裡。

export function gateLabels(layout: ExcelLayout): readonly { key: GateKey; label: string }[] {
  return GATE_KEYS.map((key) => ({ key, label: layout.gateLabels[key] }));
}

export function gateKeyOfLabel(layout: ExcelLayout, label: string): GateKey | undefined {
  return gateLabels(layout).find((entry) => entry.label === label)?.key;
}

export function buildDateLabels(layout: ExcelLayout): readonly { stage: Stage; label: string }[] {
  return STAGES.map((stage) => ({ stage, label: layout.buildDateLabels[stage] }));
}

export function optionLabels(layout: ExcelLayout): readonly { key: GateKey; label: string }[] {
  return [
    { key: "secondPcb", label: layout.optionLabels.secondPcb },
    { key: "gpu", label: layout.optionLabels.gpu },
  ];
}

/** Mapping 分頁 Stage 表格的 Gate 欄：只有 pre A 與 TLD 是選配，這是引擎寫死的規則，Excel 若改了要明確失敗。 */
export function expectedStageGateLabel(layout: ExcelLayout, stage: Stage): string {
  switch (stage) {
    case "pre A":
      return layout.includePreALabel;
    case "TLD":
      return layout.includeTldLabel;
    case "RFQ":
    case "A":
    case "B":
    case "C":
    case "Pre-MP":
    case "MP":
      return layout.alwaysLabel;
  }
}

export const SHEETS = {
  input: "Input",
  manualAdjust: "Input_Manual_Adjust",
  guidance: "Guidance",
  mapping: "Mapping",
} as const;

/** Input 分頁的專案欄：D..R 共 15 欄（P01..P15）。 */
export const FIRST_PROJECT_COLUMN = 4;
export const PROJECT_COLUMN_COUNT = 15;
