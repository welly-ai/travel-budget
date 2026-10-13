import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  createToleranceProfileInputSchema,
  DEFAULT_TOLERANCE_PROFILE_ID,
  getToleranceProfileInputSchema,
  toleranceProfileSchema,
  updateToleranceProfileInputSchema,
  type ToleranceProfile,
} from "@/domain";
import { schema, type Db } from "@/db";
import type { z } from "zod";
import type { ServerContext } from "./context";
import { ConflictError, DuplicateNameError, NotFoundError } from "./errors";

const { toleranceProfiles, users } = schema;

type ProfileRow = { profile: typeof toleranceProfiles.$inferSelect; updatedByName: string | null };

function toProfile(row: ProfileRow): ToleranceProfile {
  return toleranceProfileSchema.parse({
    id: row.profile.id,
    name: row.profile.name,
    maxIncreasePct: row.profile.maxIncreasePct,
    maxDecreasePct: row.profile.maxDecreasePct,
    version: row.profile.version,
    isDefault: row.profile.id === DEFAULT_TOLERANCE_PROFILE_ID,
    updatedByName: row.updatedByName,
    updatedAt: row.profile.updatedAt.toISOString(),
  });
}

function selectProfiles(db: Pick<Db, "select">) {
  return db
    .select({ profile: toleranceProfiles, updatedByName: users.name })
    .from(toleranceProfiles)
    .leftJoin(users, eq(toleranceProfiles.updatedBy, users.id));
}

/** 讀一組容許範圍設定；id 為 null 時用預設組。找不到丟 NotFoundError。 */
export function findToleranceProfile(db: Pick<Db, "select">, profileId: string | null): ToleranceProfile {
  const id = profileId ?? DEFAULT_TOLERANCE_PROFILE_ID;
  const row = selectProfiles(db).where(eq(toleranceProfiles.id, id)).get();
  if (row === undefined) throw new NotFoundError(`找不到容許範圍設定：${id}`);
  return toProfile(row);
}

function assertNameFree(db: Pick<Db, "select">, name: string, exceptId: string | null): void {
  const clash = db.select({ id: toleranceProfiles.id }).from(toleranceProfiles).where(eq(toleranceProfiles.name, name)).get();
  if (clash !== undefined && clash.id !== exceptId) throw new DuplicateNameError(`容許範圍設定的名稱已被使用：${name}`);
}

/** 容許範圍設定的 list／get／create／update（先不做刪除）。 */
export function createToleranceServices(ctx: ServerContext) {
  const { db } = ctx;

  function listToleranceProfiles(): ToleranceProfile[] {
    return selectProfiles(db).orderBy(toleranceProfiles.createdAt, toleranceProfiles.name).all().map(toProfile);
  }

  function getToleranceProfile(input: z.input<typeof getToleranceProfileInputSchema>): ToleranceProfile {
    return findToleranceProfile(db, getToleranceProfileInputSchema.parse(input).profileId);
  }

  function createToleranceProfile(input: z.input<typeof createToleranceProfileInputSchema>): ToleranceProfile {
    const parsed = createToleranceProfileInputSchema.parse(input);
    const id = randomUUID();
    db.transaction((tx) => {
      assertNameFree(tx, parsed.name, null);
      const at = ctx.now();
      tx.insert(toleranceProfiles)
        .values({
          id,
          name: parsed.name,
          maxIncreasePct: parsed.maxIncreasePct,
          maxDecreasePct: parsed.maxDecreasePct,
          version: 1,
          updatedBy: parsed.actorId,
          updatedAt: at,
          createdAt: at,
        })
        .run();
    }, { behavior: "immediate" });
    return findToleranceProfile(db, id);
  }

  /** 修改：帶讀取時的版本；對不上丟 ConflictError，不自動覆蓋。 */
  function updateToleranceProfile(input: z.input<typeof updateToleranceProfileInputSchema>): ToleranceProfile {
    const parsed = updateToleranceProfileInputSchema.parse(input);
    db.transaction((tx) => {
      const current = findToleranceProfile(tx, parsed.profileId);
      const conflict = () =>
        new ConflictError({
          subject: `容許範圍設定「${current.name}」`,
          expectedVersion: parsed.expectedVersion,
          currentVersion: current.version,
          updatedByName: current.updatedByName,
          updatedAt: current.updatedAt,
        });
      if (current.version !== parsed.expectedVersion) throw conflict();
      assertNameFree(tx, parsed.name, current.id);
      const updated = tx
        .update(toleranceProfiles)
        .set({
          name: parsed.name,
          maxIncreasePct: parsed.maxIncreasePct,
          maxDecreasePct: parsed.maxDecreasePct,
          version: current.version + 1,
          updatedBy: parsed.actorId,
          updatedAt: ctx.now(),
        })
        .where(and(eq(toleranceProfiles.id, current.id), eq(toleranceProfiles.version, parsed.expectedVersion)))
        .run();
      if (updated.changes !== 1) throw conflict();
    }, { behavior: "immediate" });
    return findToleranceProfile(db, parsed.profileId);
  }

  return { listToleranceProfiles, getToleranceProfile, createToleranceProfile, updateToleranceProfile };
}
