"use server";

import { z } from "zod";
import {
  cellOverrideSchema,
  projectCodeSchema,
  projectSettingsSchema,
  toleranceProfileIdSchema,
  type CellOverride,
  type OverrideWarning,
  type ProjectResult,
  type ProjectSettings,
} from "@/domain";
import { ConflictError, NotFoundError, OverrideReasonRequiredError, services, type OverrideReview } from "@/server";
import { formatTime } from "../../format";
import { requireUser } from "../../session";

const recalculateInputSchema = z.object({
  projectCode: projectCodeSchema,
  settings: projectSettingsSchema,
  cellOverrides: z.array(cellOverrideSchema).optional(),
});
const reviewInputSchema = recalculateInputSchema.extend({ toleranceProfileId: toleranceProfileIdSchema.optional() });
const saveInputSchema = z.object({
  projectCode: projectCodeSchema,
  expectedVersion: z.number().int().min(1),
  settings: projectSettingsSchema,
  cellOverrides: z.array(cellOverrideSchema).optional(),
  toleranceProfileId: toleranceProfileIdSchema.optional(),
});

export type RecalculateOutcome = { ok: true; result: ProjectResult } | { ok: false; message: string };

export type ReviewOutcome = ({ ok: true } & OverrideReview) | { ok: false; message: string };

export type SaveOutcome =
  | { ok: true; version: number; savedBy: string; savedAt: string }
  | { ok: false; kind: "conflict"; byName: string; atText: string; currentVersion: number }
  /** 超出容許範圍的覆寫沒填理由：cells 是哪幾格。 */
  | { ok: false; kind: "reasonRequired"; message: string; cells: OverrideWarning[] }
  | { ok: false; kind: "error"; message: string };

/** 即時試算：只算不存。計算邏輯在 engine，這裡只轉接。 */
export async function recalculateAction(input: {
  projectCode: string;
  settings: ProjectSettings;
  cellOverrides?: CellOverride[];
}): Promise<RecalculateOutcome> {
  await requireUser();
  const parsed = recalculateInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "設定內容不正確" };
  try {
    const { projectCode, settings, cellOverrides } = parsed.data;
    const { result } = services().calculateProject({ projectCode, overrides: settings, ...(cellOverrides === undefined ? {} : { cellOverrides }) });
    return { ok: true, result };
  } catch (error: unknown) {
    return { ok: false, message: error instanceof Error ? error.message : "試算失敗" };
  }
}

/** 覆寫檢查（只讀，可帶草稿）：有效 Guidance 每格值、警告、缺理由的格子。 */
export async function reviewOverridesAction(input: {
  projectCode: string;
  settings: ProjectSettings;
  cellOverrides?: CellOverride[];
  toleranceProfileId?: string | null;
}): Promise<ReviewOutcome> {
  await requireUser();
  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "設定內容不正確" };
  try {
    const { projectCode, settings, cellOverrides, toleranceProfileId } = parsed.data;
    const review = services().reviewOverrides({
      projectCode,
      overrides: settings,
      ...(cellOverrides === undefined ? {} : { cellOverrides }),
      ...(toleranceProfileId === undefined ? {} : { toleranceProfileId }),
    });
    return { ok: true, ...review };
  } catch (error: unknown) {
    return { ok: false, message: error instanceof Error ? error.message : "檢查失敗" };
  }
}

export async function saveAction(input: {
  projectCode: string;
  expectedVersion: number;
  settings: ProjectSettings;
  cellOverrides?: CellOverride[];
  toleranceProfileId?: string | null;
}): Promise<SaveOutcome> {
  const user = await requireUser();
  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, kind: "error", message: "設定內容不正確" };
  try {
    const { cellOverrides, toleranceProfileId, ...rest } = parsed.data;
    const saved = services().updateProject({
      ...rest,
      ...(cellOverrides === undefined ? {} : { cellOverrides }),
      ...(toleranceProfileId === undefined ? {} : { toleranceProfileId }),
      actorId: user.id,
    });
    return { ok: true, version: saved.version, savedBy: user.name, savedAt: formatTime(saved.updatedAt) };
  } catch (error: unknown) {
    if (error instanceof ConflictError) {
      return {
        ok: false,
        kind: "conflict",
        byName: error.updatedByName ?? "其他人",
        atText: formatTime(error.updatedAt),
        currentVersion: error.currentVersion,
      };
    }
    if (error instanceof OverrideReasonRequiredError) {
      return { ok: false, kind: "reasonRequired", message: error.message, cells: error.cells };
    }
    if (error instanceof NotFoundError) return { ok: false, kind: "error", message: error.message };
    return { ok: false, kind: "error", message: "存檔失敗，請稍後再試" };
  }
}
