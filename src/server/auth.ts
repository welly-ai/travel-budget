import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb, schema, type Db } from "@/db";

const DEV_SECRET = "dev-only-secret-change-me-before-any-real-use-0123456789";

function baseUrl(): string {
  return process.env["BETTER_AUTH_URL"] ?? "http://127.0.0.1:3000";
}

function secret(): string {
  const configured = process.env["BETTER_AUTH_SECRET"];
  if (configured !== undefined && configured !== "") return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("正式環境必須設定 BETTER_AUTH_SECRET（見 .env.example）");
  }
  return DEV_SECRET;
}

export function createAuth(db: Db) {
  const url = baseUrl();
  const origin = new URL(url);
  const port = origin.port === "" ? "" : `:${origin.port}`;
  return betterAuth({
    appName: "差旅人天預算工具",
    baseURL: url,
    secret: secret(),
    // 本機常用 localhost 或 127.0.0.1 開，兩個都放行。
    trustedOrigins: [url, `http://localhost${port}`, `http://127.0.0.1${port}`],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    // 內部工具：不開放自行註冊，帳號由管理者建立（pnpm db:seed）。
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

declare global {
  var __travelBudgetAuth: Auth | undefined;
}

export function getAuth(): Auth {
  globalThis.__travelBudgetAuth ??= createAuth(getDb());
  return globalThis.__travelBudgetAuth;
}
