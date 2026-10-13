import ExcelJS from "exceljs";
import { z } from "zod";
import {
  type ExcelLayout,
  INPUT_LABELS,
  type FunctionDef,
  functionNameSchema,
  GATE_KEYS,
  type GateKey,
  GROUPS,
  groupSchema,
  guidanceKindSchema,
  type GuidanceRow,
  type ManualAdjustment,
  phaseSchema,
  PROJECT_CONFIG_SCHEMA_VERSION,
  type ProjectConfigV2,
  projectClassSchema,
  projectConfigSchema,
  type ReferenceData,
  referenceDataSchema,
  type Stage,
  stageSchema,
  type StageSite,
  STAGES,
} from "@/domain";
import { ImportError, type ImportIssue } from "./issues";
import {
  buildDateLabels,
  expectedStageGateLabel,
  FIRST_PROJECT_COLUMN,
  gateKeyOfLabel,
  gateLabels,
  optionLabels,
  PROJECT_COLUMN_COUNT,
  SHEETS,
} from "./labels";
import { addressOf, dateSchema, flagSchema, numeric, optionalTextSchema, SheetReader, textSchema } from "./reader";

export interface ImportedWorkbook {
  reference: ReferenceData;
  /** 依 Input 欄位順序（P01..P15）排列，只含有填 Project Code 的專案。 */
  projects: ProjectConfigV2[];
}

export async function readWorkbookFile(path: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  return workbook;
}

export async function readWorkbookBuffer(data: Uint8Array | ExcelJS.Buffer): Promise<ExcelJS.Workbook> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(copy);
  return workbook;
}

/** 讀檔並解析；任何問題都丟 ImportError。 */
export async function importWorkbookFile(path: string, layout: ExcelLayout): Promise<ImportedWorkbook> {
  return parseWorkbook(await readWorkbookFile(path), layout);
}

function openSheet(workbook: ExcelJS.Workbook, name: string, issues: ImportIssue[]): SheetReader | undefined {
  const worksheet = workbook.getWorksheet(name);
  if (worksheet === undefined) {
    issues.push({ sheet: name, cell: "-", message: `活頁簿沒有「${name}」分頁` });
    return undefined;
  }
  return new SheetReader(name, worksheet, issues);
}

/** 解析活頁簿：參考資料（Guidance、Mapping）與各專案設定（Input、Input_Manual_Adjust）。 */
export function parseWorkbook(workbook: ExcelJS.Workbook, layout: ExcelLayout): ImportedWorkbook {
  const issues: ImportIssue[] = [];
  const mappingSheet = openSheet(workbook, SHEETS.mapping, issues);
  const guidanceSheet = openSheet(workbook, SHEETS.guidance, issues);
  const inputSheet = openSheet(workbook, SHEETS.input, issues);
  const manualSheet = openSheet(workbook, SHEETS.manualAdjust, issues);

  const functions = mappingSheet === undefined ? [] : readFunctionDefs(mappingSheet, layout);
  const stages = mappingSheet === undefined ? [] : readStageSites(mappingSheet, layout);
  const guidance = guidanceSheet === undefined ? [] : readGuidance(guidanceSheet, functions, layout);

  const referenceParsed = referenceDataSchema.safeParse({ schemaVersion: 1, functions, stages, guidance });
  if (!referenceParsed.success) {
    for (const issue of referenceParsed.error.issues) {
      issues.push({ sheet: "參考資料", cell: issue.path.join("."), message: issue.message });
    }
  }

  const drafts = inputSheet === undefined ? [] : readProjects(inputSheet, layout);
  const projects = referenceParsed.success ? attachManualAdjustments(drafts, manualSheet, referenceParsed.data) : [];

  if (issues.length > 0 || !referenceParsed.success) throw new ImportError(issues);
  return { reference: referenceParsed.data, projects };
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function findRow(sheet: SheetReader, column: number, predicate: (text: string | undefined) => boolean): number | undefined {
  for (let row = 1; row <= sheet.rowCount; row += 1) {
    if (predicate(sheet.text(row, column))) return row;
  }
  return undefined;
}

function readFunctionDefs(sheet: SheetReader, layout: ExcelLayout): FunctionDef[] {
  const header = findRow(sheet, 2, (text) => text?.startsWith("Function") === true);
  if (header === undefined) {
    sheet.report("B1:B60", "找不到 Function 清單的表頭（B 欄以「Function」開頭）");
    return [];
  }
  const defs: FunctionDef[] = [];
  for (let row = header + 1; sheet.text(row, 2) !== undefined; row += 1) {
    const name = sheet.read(row, 2, functionNameSchema, "Function 名稱");
    const group = sheet.read(row, 3, groupSchema, `Function 分組（${GROUPS.join("、")}）`);
    const gateLabel = sheet.read(row, 4, textSchema, "Gate 欄");
    let gate: FunctionDef["gate"] | undefined;
    if (gateLabel === layout.alwaysLabel) {
      gate = { kind: "always" };
    } else if (gateLabel !== undefined) {
      const key = gateKeyOfLabel(layout, gateLabel);
      if (key === undefined) {
        sheet.report(addressOf(row, 4), `Gate 欄不認得：${gateLabel}（已知：${layout.alwaysLabel}、${gateLabels(layout).map((entry) => entry.label).join("、")}）`);
      } else {
        gate = { kind: "switch", key };
      }
    }
    const sources = sheet.read(row, 5, optionalTextSchema, "來源 Function") ?? "";
    if (name !== undefined && group !== undefined && gate !== undefined) {
      defs.push({
        name,
        group,
        gate,
        sourceFunctions: sources
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part !== ""),
      });
    }
  }
  return defs;
}

function readStageSites(sheet: SheetReader, layout: ExcelLayout): StageSite[] {
  const header = findRow(sheet, 2, (text) => text === "Stage");
  if (header === undefined) {
    sheet.report("B1:B60", "找不到 Stage 出差地對照表的表頭（B 欄為「Stage」）");
    return [];
  }
  const sites: StageSite[] = [];
  for (let row = header + 1; sheet.text(row, 2) !== undefined; row += 1) {
    const stage = sheet.read(row, 2, stageSchema, `Stage（${STAGES.join("、")}）`);
    const travelArea = sheet.read(row, 3, textSchema, "TravelArea");
    const travelSite = sheet.read(row, 4, textSchema, "TravelSite");
    const gateLabel = sheet.read(row, 5, textSchema, "Gate 欄");
    if (stage !== undefined && gateLabel !== undefined && gateLabel !== expectedStageGateLabel(layout, stage)) {
      sheet.report(addressOf(row, 5), `Stage ${stage} 的 Gate 應為「${expectedStageGateLabel(layout, stage)}」，讀到「${gateLabel}」；引擎只支援 pre A 與 TLD 為選配`);
    }
    if (stage !== undefined && travelArea !== undefined && travelSite !== undefined) {
      sites.push({ stage, travelArea, travelSite });
    }
  }
  return sites;
}

// ---------------------------------------------------------------------------
// Guidance
// ---------------------------------------------------------------------------

const classTextSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const match = /^Class\s+(\S+)$/.exec(value);
    if (match?.[1] !== undefined) return Number(match[1]);
  }
  return value;
}, projectClassSchema);

function optionKeyOf(layout: ExcelLayout, text: string | undefined): GateKey | null | undefined {
  if (text === undefined) return null;
  return optionLabels(layout).find((entry) => entry.label === text)?.key;
}

function readGuidance(sheet: SheetReader, functions: readonly FunctionDef[], layout: ExcelLayout): GuidanceRow[] {
  const header = findRow(sheet, 1, (text) => text === "Phase");
  if (header === undefined) {
    sheet.report("A1:A10", "找不到 Guidance 的表頭（A 欄為「Phase」）");
    return [];
  }
  const groupOf = new Map<string, string>(functions.map((def) => [def.name, def.group]));
  const rows: GuidanceRow[] = [];
  for (let row = header + 1; row <= sheet.rowCount; row += 1) {
    if (sheet.raw(row, 1) === undefined && sheet.raw(row, 7) === undefined) continue;
    const phase = sheet.read(row, 1, numeric(phaseSchema), "Phase");
    const projectClass = sheet.read(row, 2, classTextSchema, "Class");
    const kind = sheet.read(row, 3, guidanceKindSchema, "Kind（BASE、ADDER、OPT）");
    const optionText = sheet.text(row, 4);
    const option = optionKeyOf(layout, optionText);
    if (option === undefined) {
      sheet.report(addressOf(row, 4), `Option 不認得：${optionText ?? ""}（已知：${optionLabels(layout).map((entry) => entry.label).join("、")}）`);
    }
    const stage = sheet.read(row, 5, stageSchema, `Stage（${STAGES.join("、")}）`);
    const group = sheet.read(row, 6, groupSchema, "Group");
    const fn = sheet.read(row, 7, functionNameSchema, "Function");
    const sourceFunction = sheet.read(row, 8, textSchema, "Source Function");
    const man = sheet.read(row, 9, z.number(), "Man");
    const days = sheet.read(row, 10, z.number(), "Days");
    if (fn !== undefined) {
      const expected = groupOf.get(fn);
      if (expected === undefined) {
        sheet.report(addressOf(row, 7), `Mapping 沒有這個 Function：${fn}`);
        continue;
      }
      if (group !== undefined && expected !== group) {
        sheet.report(addressOf(row, 6), `Group「${group}」與 Mapping 中 ${fn} 的分組「${expected}」不一致`);
      }
    }
    if (
      phase !== undefined &&
      projectClass !== undefined &&
      kind !== undefined &&
      option !== undefined &&
      stage !== undefined &&
      fn !== undefined &&
      sourceFunction !== undefined &&
      man !== undefined &&
      days !== undefined
    ) {
      rows.push({ phase, projectClass, kind, option, stage, function: fn, sourceFunction, man, days });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

interface ProjectDraft {
  config: ProjectConfigV2;
  /** Project Code 所在儲存格，用來回報例外調整找不到專案的位置。 */
  codeCell: string;
}

function indexLabels(sheet: SheetReader): Map<string, number> {
  const rows = new Map<string, number>();
  for (let row = 1; row <= sheet.rowCount; row += 1) {
    const label = sheet.text(row, 2);
    if (label !== undefined && !rows.has(label)) rows.set(label, row);
  }
  return rows;
}

function readProjects(sheet: SheetReader, layout: ExcelLayout): ProjectDraft[] {
  const rowOf = indexLabels(sheet);
  const requireRow = (label: string): number | undefined => {
    const row = rowOf.get(label);
    if (row === undefined) sheet.report("B1:B60", `找不到列標籤「${label}」`);
    return row;
  };

  const deptRow = findRow(sheet, 2, (text) => text?.startsWith("DeptCode") === true);
  let deptCode: string | undefined;
  if (deptRow === undefined) {
    sheet.report("B1:B60", "找不到列標籤「DeptCode」");
  } else {
    deptCode = sheet.read(deptRow, 3, textSchema, "DeptCode");
  }

  const codeRow = requireRow(INPUT_LABELS.projectCode);
  const nameRow = requireRow(INPUT_LABELS.projectName);
  const lobRow = requireRow(INPUT_LABELS.lob);
  const genRow = requireRow(INPUT_LABELS.gen);
  const phaseRow = requireRow(INPUT_LABELS.phase);
  const classRow = requireRow(INPUT_LABELS.projectClass);
  const preARow = requireRow(layout.includePreALabel);
  const tldRow = requireRow(layout.includeTldLabel);
  const gateRows = gateLabels(layout).map((entry) => ({ key: entry.key, row: requireRow(entry.label) }));
  const dateRows = buildDateLabels(layout).map((entry) => ({ stage: entry.stage, row: requireRow(entry.label) }));

  if (
    codeRow === undefined ||
    nameRow === undefined ||
    lobRow === undefined ||
    genRow === undefined ||
    phaseRow === undefined ||
    classRow === undefined ||
    preARow === undefined ||
    tldRow === undefined
  ) {
    return [];
  }

  const drafts: ProjectDraft[] = [];
  const seenCodes = new Map<string, string>();
  for (let column = FIRST_PROJECT_COLUMN; column < FIRST_PROJECT_COLUMN + PROJECT_COLUMN_COUNT; column += 1) {
    const codeCell = addressOf(codeRow, column);
    if (sheet.raw(codeRow, column) === undefined) {
      const stray = [nameRow, lobRow, phaseRow, classRow].some((row) => sheet.raw(row, column) !== undefined);
      if (stray) sheet.report(codeCell, "同一欄已有其他資料，但 Project Code 是空白");
      continue;
    }
    const before = sheet.issueCount;
    const projectCode = sheet.read(codeRow, column, textSchema, "Project Code");
    const projectName = sheet.read(nameRow, column, optionalTextSchema, "Project Name");
    const lob = sheet.read(lobRow, column, textSchema, "LOB");
    const gen = sheet.read(genRow, column, optionalTextSchema, "Gen");
    const phase = sheet.read(phaseRow, column, numeric(phaseSchema), "Phase（2 或 3）");
    const projectClass = sheet.read(classRow, column, numeric(projectClassSchema), "Class（4、3.5、3 或 2）");
    const includePreA = sheet.read(preARow, column, flagSchema, "Include pre A（Y 或 N）");
    const includeTld = sheet.read(tldRow, column, flagSchema, "Include TLD build（Y 或 N）");

    const gates = new Map<GateKey, boolean>();
    for (const { key, row } of gateRows) {
      if (row === undefined) continue;
      const flag = sheet.read(row, column, flagSchema, `${key} 開關（Y 或 N）`);
      if (flag !== undefined) gates.set(key, flag);
    }
    const buildDates: Partial<Record<Stage, string>> = {};
    for (const { stage, row } of dateRows) {
      if (row === undefined) continue;
      const date = sheet.read(row, column, dateSchema, `${stage} build date`);
      if (date !== undefined) buildDates[stage] = date;
    }

    if (projectCode !== undefined) {
      const first = seenCodes.get(projectCode);
      if (first !== undefined) {
        sheet.report(codeCell, `Project Code ${projectCode} 與 ${first} 重複`);
      } else {
        seenCodes.set(projectCode, codeCell);
      }
    }
    if (sheet.issueCount > before) continue;

    const parsed = projectConfigSchema.safeParse({
      schemaVersion: PROJECT_CONFIG_SCHEMA_VERSION,
      deptCode,
      projectCode,
      projectName: projectName ?? "",
      lob,
      gen: gen ?? "",
      phase,
      projectClass,
      gates: Object.fromEntries(GATE_KEYS.map((key) => [key, gates.get(key)])),
      includePreA,
      includeTld,
      buildDates,
      manualAdjustments: [],
      cellOverrides: [],
      toleranceProfileId: null,
    });
    if (parsed.success) {
      drafts.push({ config: parsed.data, codeCell });
    } else {
      sheet.report(codeCell, `專案設定不合法：${parsed.error.issues[0]?.message ?? ""}`);
    }
  }
  return drafts;
}

// ---------------------------------------------------------------------------
// Input_Manual_Adjust
// ---------------------------------------------------------------------------

function attachManualAdjustments(
  drafts: readonly ProjectDraft[],
  sheet: SheetReader | undefined,
  reference: ReferenceData,
): ProjectConfigV2[] {
  const adjustmentsByCode = new Map<string, ManualAdjustment[]>(drafts.map((draft) => [draft.config.projectCode, []]));
  if (sheet !== undefined) {
    const header = findRow(sheet, 1, (text) => text === "Project Code");
    if (header === undefined) {
      sheet.report("A1:A10", "找不到例外調整的表頭（A 欄為「Project Code」）");
    } else {
      const functionNames = new Set<string>(reference.functions.map((def) => def.name));
      for (let row = header + 1; row <= sheet.rowCount; row += 1) {
        const blank = [1, 2, 3, 4, 5].every((column) => sheet.raw(row, column) === undefined);
        if (blank) continue;
        const code = sheet.read(row, 1, textSchema, "Project Code");
        const stage = sheet.read(row, 2, stageSchema, `Stage（${STAGES.join("、")}）`);
        const fn = sheet.read(row, 3, functionNameSchema, "Function");
        const man = sheet.read(row, 4, z.number(), "Man");
        const days = sheet.read(row, 5, z.number(), "Days");
        const remark = sheet.read(row, 7, optionalTextSchema, "Remark") ?? "";
        if (fn !== undefined && !functionNames.has(fn)) {
          sheet.report(addressOf(row, 3), `Mapping 沒有這個 Function：${fn}`);
          continue;
        }
        if (code === undefined || stage === undefined || fn === undefined || man === undefined || days === undefined) continue;
        const bucket = adjustmentsByCode.get(code);
        if (bucket === undefined) {
          sheet.report(addressOf(row, 1), `Input 分頁沒有 Project Code ${code}`);
          continue;
        }
        bucket.push({ stage, function: fn, man, days, remark });
      }
    }
  }
  return drafts.map((draft) => ({
    ...draft.config,
    manualAdjustments: adjustmentsByCode.get(draft.config.projectCode) ?? [],
  }));
}
