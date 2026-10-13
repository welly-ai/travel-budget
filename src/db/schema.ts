import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { ProjectConfig, ProjectSnapshot, ProjectStatus, ReferenceData } from "@/domain";

/**
 * 資料庫結構。JSON 欄位的內容形狀由 src/domain 的 Zod schema 定義（帶 schemaVersion），
 * 讀出後一律先 parse 才能使用（AGENTS.md 紅線 3、4）。
 */

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
};

// ---- better-auth 需要的四張表（欄位名稱依 better-auth 的核心 schema）----

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    /** email＋密碼登入時存雜湊後的密碼。 */
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("accounts_user_idx").on(table.userId)],
);

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

// ---- Guidance：整份參考資料存成一個 JSON（ReferenceData），不拆列 ----
// 理由：引擎一次要整份參考資料，沒有「查單一 guidance 列」的需求；
// 版本管理頁（待辦）只需要列出版本、比較整份內容。若日後要做逐列比較，再拆成 guidance_rows。

export const guidanceVersions = sqliteTable("guidance_versions", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  data: text("data", { mode: "json" }).$type<ReferenceData>().notNull(),
  ...timestamps,
});

// ---- 專案 ----
// 固定欄位（code、name、lob、phase、class…）是為了列表與篩選，由 config 衍生，
// 兩者只在 src/server 的 columnsOf() 一個地方同步。config 才是權威內容。

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    lob: text("lob").notNull(),
    phase: integer("phase").notNull().$type<2 | 3>(),
    projectClass: real("class").notNull().$type<4 | 3.5 | 3 | 2>(),
    guidanceVersionId: text("guidance_version_id").notNull().references(() => guidanceVersions.id),
    status: text("status").notNull().$type<ProjectStatus>().default("draft"),
    /** 樂觀鎖：每次修改加 1，更新時要帶讀取時的值。 */
    version: integer("version").notNull().default(1),
    config: text("config", { mode: "json" }).$type<ProjectConfig>().notNull(),
    updatedBy: text("updated_by").references(() => users.id),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("projects_code_idx").on(table.code)],
);

export const projectRevisions = sqliteTable(
  "project_revisions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: text("snapshot", { mode: "json" }).$type<ProjectSnapshot>().notNull(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("project_revisions_project_version_idx").on(table.projectId, table.version)],
);

// ---- 容許範圍設定：手動覆寫可偏離有效 Guidance 的百分比上限 ----
// 預設組的 id 固定為 DEFAULT_TOLERANCE_PROFILE_ID，由 migration 0002 建立；專案的 toleranceProfileId 為 null 時用它。

export const toleranceProfiles = sqliteTable(
  "tolerance_profiles",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    maxIncreasePct: real("max_increase_pct").notNull(),
    maxDecreasePct: real("max_decrease_pct").notNull(),
    /** 樂觀鎖：每次修改加 1，更新時要帶讀取時的值。 */
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by").references(() => users.id),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("tolerance_profiles_name_idx").on(table.name)],
);

// ---- 留言（schema 先建好，介面留給後續待辦）----

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    /** 掛在格子上時的 Stage 與 Function；兩者都為 null 代表整個專案的留言。 */
    stage: text("stage"),
    functionName: text("function_name"),
    body: text("body").notNull(),
    authorId: text("author_id").notNull().references(() => users.id),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [index("comments_project_idx").on(table.projectId)],
);
