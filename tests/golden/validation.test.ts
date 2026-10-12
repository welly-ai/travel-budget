import { describe, expect, it } from "vitest";
import { phaseSchema, projectClassSchema, type ProjectConfig, type Stage, STAGES } from "@/domain";
import { calculateProject } from "@/engine";
import { cached, cachedNumber, isClose, loadGolden, sheetOf } from "./support";

const context = await loadGolden();
const sheet = sheetOf(context.workbook, "Validation");

// Validation 分頁：列 4 是表頭（D..J = pre A、A、B、C、TLD、Pre-MP、MP）；
// 每組 Phase×Class 三列：Guidance_DB、原檔 guidance（寫死的期望值）、差異。
const STAGE_COLUMNS: { stage: Stage; letter: string }[] = [
  { stage: "pre A", letter: "D" },
  { stage: "A", letter: "E" },
  { stage: "B", letter: "F" },
  { stage: "C", letter: "G" },
  { stage: "TLD", letter: "H" },
  { stage: "Pre-MP", letter: "I" },
  { stage: "MP", letter: "J" },
];

interface Block {
  phase: 2 | 3;
  projectClass: 4 | 3.5 | 3 | 2;
  expected: Map<Stage, number>;
}

function readBlocks(): Block[] {
  const blocks: Block[] = [];
  for (let row = 5; row <= 40; row += 1) {
    if (cached(sheet, `C${row}`) !== "Guidance_DB") continue;
    const phase = phaseSchema.parse(cached(sheet, `A${row}`));
    const classText = String(cached(sheet, `B${row}`));
    const projectClass = projectClassSchema.parse(Number(classText.replace("Class ", "")));
    const expected = new Map<Stage, number>();
    for (const { stage, letter } of STAGE_COLUMNS) {
      expected.set(stage, cachedNumber(sheet, `${letter}${row + 1}`));
    }
    blocks.push({ phase, projectClass, expected });
  }
  return blocks;
}

const blocks = readBlocks();

const ALL_GATES_OFF: ProjectConfig["gates"] = {
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

describe("Validation：Guidance 的 BASE 人天對照原檔公布值", () => {
  it("共 8 組 Phase×Class、56 個 Stage 對照值", () => {
    expect(blocks.length).toBe(8);
    expect(blocks.length * STAGE_COLUMNS.length).toBe(56);
  });

  it("匯入的 guidance BASE 列加總與 56 個期望值一致", () => {
    const mismatches: string[] = [];
    for (const block of blocks) {
      for (const { stage } of STAGE_COLUMNS) {
        const actual = context.reference.guidance
          .filter((row) => row.kind === "BASE" && row.phase === block.phase && row.projectClass === block.projectClass && row.stage === stage)
          .reduce((sum, row) => sum + row.man * row.days, 0);
        const expected = block.expected.get(stage) ?? Number.NaN;
        if (!isClose(actual, expected)) mismatches.push(`Phase ${block.phase} Class ${block.projectClass} ${stage}：期望 ${expected}，實際 ${actual}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("引擎在所有 Adder／Option 關閉、pre A 與 TLD 開啟時，各 Stage 人天等於同一組 BASE 期望值", () => {
    const mismatches: string[] = [];
    for (const block of blocks) {
      const config: ProjectConfig = {
        schemaVersion: 1,
        deptCode: "VALID",
        projectCode: "VALIDATION",
        projectName: "",
        lob: "Validation",
        gen: "",
        phase: block.phase,
        projectClass: block.projectClass,
        gates: ALL_GATES_OFF,
        includePreA: true,
        includeTld: true,
        buildDates: {},
        manualAdjustments: [],
      };
      const result = calculateProject(config, context.reference);
      for (const stage of STAGES) {
        const expected = block.expected.get(stage) ?? 0; // RFQ 在 guidance 沒有人天
        if (!isClose(result.byStage[stage].manDays, expected)) {
          mismatches.push(`Phase ${block.phase} Class ${block.projectClass} ${stage}：期望 ${expected}，引擎 ${result.byStage[stage].manDays}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});
