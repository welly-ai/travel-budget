"use server";

import { z } from "zod";
import { projectCodeSchema, projectSettingsSchema, type ProjectResult, type ProjectSettings } from "@/domain";
import { ConflictError, NotFoundError, services } from "@/server";
import { formatTime } from "../../format";
import { requireUser } from "../../session";

const recalculateInputSchema = z.object({ projectCode: projectCodeSchema, settings: projectSettingsSchema });
const saveInputSchema = z.object({
  projectCode: projectCodeSchema,
  expectedVersion: z.number().int().min(1),
  settings: projectSettingsSchema,
});

export type RecalculateOutcome = { ok: true; result: ProjectResult } | { ok: false; message: string };

export type SaveOutcome =
  | { ok: true; version: number; savedBy: string; savedAt: string }
  | { ok: false; kind: "conflict"; byName: string; atText: string; currentVersion: number }
  | { ok: false; kind: "error"; message: string };

/** 即時試算：只算不存。計算邏輯在 engine，這裡只轉接。 */
export async function recalculateAction(input: { projectCode: string; settings: ProjectSettings }): Promise<RecalculateOutcome> {
  await requireUser();
  const parsed = recalculateInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "設定內容不正確" };
  try {
    const { result } = services().calculateProject({ projectCode: parsed.data.projectCode, overrides: parsed.data.settings });
    return { ok: true, result };
  } catch (error: unknown) {
    return { ok: false, message: error instanceof Error ? error.message : "試算失敗" };
  }
}

export async function saveAction(input: { projectCode: string; expectedVersion: number; settings: ProjectSettings }): Promise<SaveOutcome> {
  const user = await requireUser();
  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, kind: "error", message: "設定內容不正確" };
  try {
    const saved = services().updateProject({ ...parsed.data, actorId: user.id });
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
    if (error instanceof NotFoundError) return { ok: false, kind: "error", message: error.message };
    return { ok: false, kind: "error", message: "存檔失敗，請稍後再試" };
  }
}
