"use server";

import { refresh } from "next/cache";
import { createToleranceProfileInputSchema, updateToleranceProfileInputSchema } from "@/domain";
import { ConflictError, DuplicateNameError, NotFoundError, services } from "@/server";
import { formatTime } from "../../format";
import { requireUser } from "../../session";

// 輸入形狀從 domain 推導；actorId 由 session 決定，不收用戶端傳來的。
const createInputSchema = createToleranceProfileInputSchema.omit({ actorId: true });
const updateInputSchema = updateToleranceProfileInputSchema.omit({ actorId: true });

const INVALID_MESSAGE = "名稱必填（最多 100 字），百分比要是 0 到 1000 之間的數字";

export type ToleranceSaveOutcome =
  | { ok: true }
  | { ok: false; kind: "conflict"; byName: string; atText: string }
  | { ok: false; kind: "duplicate"; message: string }
  | { ok: false; kind: "error"; message: string };

function toFailure(error: unknown, name: string): ToleranceSaveOutcome {
  if (error instanceof ConflictError) {
    return { ok: false, kind: "conflict", byName: error.updatedByName ?? "其他人", atText: formatTime(error.updatedAt) };
  }
  if (error instanceof DuplicateNameError) {
    return { ok: false, kind: "duplicate", message: `名稱「${name}」已經被另一組使用，請換一個名稱` };
  }
  if (error instanceof NotFoundError) return { ok: false, kind: "error", message: error.message };
  return { ok: false, kind: "error", message: "儲存失敗，請稍後再試" };
}

export async function createToleranceAction(input: {
  name: string;
  maxIncreasePct: number;
  maxDecreasePct: number;
}): Promise<ToleranceSaveOutcome> {
  const user = await requireUser();
  const parsed = createInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, kind: "error", message: INVALID_MESSAGE };
  try {
    services().createToleranceProfile({ ...parsed.data, actorId: user.id });
  } catch (error: unknown) {
    return toFailure(error, parsed.data.name);
  }
  refresh();
  return { ok: true };
}

/** 修改：帶讀取時的 version，對不上回 conflict，不自動覆蓋。 */
export async function updateToleranceAction(input: {
  profileId: string;
  expectedVersion: number;
  name: string;
  maxIncreasePct: number;
  maxDecreasePct: number;
}): Promise<ToleranceSaveOutcome> {
  const user = await requireUser();
  const parsed = updateInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, kind: "error", message: INVALID_MESSAGE };
  try {
    services().updateToleranceProfile({ ...parsed.data, actorId: user.id });
  } catch (error: unknown) {
    return toFailure(error, parsed.data.name);
  }
  refresh();
  return { ok: true };
}
