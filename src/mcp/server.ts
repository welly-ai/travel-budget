import { z } from "zod";
import { projectCodeSchema, settingsOverrideSchema, STAGES } from "@/domain";
import { NotFoundError, services } from "@/server";

/** 目前 MCP 只有讀取與試算；不寫入、不改狀態（AGENTS.md 紅線 8）。 */
type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function json(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function failure(error: unknown): ToolResult {
  const message = error instanceof NotFoundError || error instanceof Error ? error.message : "未知錯誤";
  return { content: [{ type: "text", text: message }], isError: true };
}

export const listProjectsInput = z.object({});
export const calculateBudgetInput = z.object({
  projectCode: projectCodeSchema,
  overrides: settingsOverrideSchema.optional().describe("要試算的設定覆寫（可只給要改的欄位），不會寫入"),
});

export function listProjectsTool(): ToolResult {
  try {
    return json(services().listProjects());
  } catch (error: unknown) {
    return failure(error);
  }
}

export function calculateBudgetTool(input: z.infer<typeof calculateBudgetInput>): ToolResult {
  try {
    const { config, result } = services().calculateProject(input);
    return json({
      projectCode: config.projectCode,
      phase: config.phase,
      projectClass: config.projectClass,
      total: result.total,
      stageSubtotals: STAGES.map((stage) => ({ stage, ...result.byStage[stage] })),
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
