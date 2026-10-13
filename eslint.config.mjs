import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

// 架構邊界寫成 lint 規則，違反就無法通過 pnpm check。說明見 AGENTS.md「架構紅線」。
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-expect-error": "allow-with-description", "ts-ignore": true, "ts-nocheck": true }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    // 計算引擎是純函式：只能依賴 domain，不能碰資料庫、檔案、網路、框架。
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["@/db/*", "@/server/*", "@/mcp/*", "@/import/*", "@/app/*", "next", "next/*", "react", "drizzle-orm", "drizzle-orm/*", "better-sqlite3", "node:*", "fs", "path", "exceljs"], message: "engine 只能 import @/domain 與 engine 內部模組（見 AGENTS.md）。" },
        ],
      }],
    },
  },
  {
    // domain 是最底層：只放 Zod schema 與型別。
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@/*", "!@/domain/*", "next", "next/*", "react", "drizzle-orm", "drizzle-orm/*", "node:*"], message: "domain 只能依賴 zod 與 domain 內部模組。" }],
      }],
    },
  },
  {
    // 介面層（頁面、API、MCP）不得直接碰資料庫，一律經過 src/server 的服務。
    files: ["src/app/**/*.{ts,tsx}", "src/mcp/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@/db/*", "drizzle-orm", "drizzle-orm/*", "better-sqlite3"], message: "介面層請呼叫 @/server 的服務，不要直接存取資料庫。" }],
      }],
    },
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  globalIgnores([".next/**", ".next-e2e/**", "out/**", "build/**", "next-env.d.ts", "local-data/**", "drizzle/**", ".agents/**", ".claude/skills/**", ".claude/worktrees/**"]),
]);

export default eslintConfig;
