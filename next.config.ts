import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // e2e 測試用另一個資料夾，才不會和正在跑的 pnpm dev 搶 .next 的鎖。
  distDir: process.env["NEXT_DIST_DIR"] ?? ".next",
  // pnpm dev 預設綁 localhost；show-me 與 e2e 用 127.0.0.1 連，要放行才會 hydrate。
  allowedDevOrigins: ["127.0.0.1"],
  // 原生模組不要被打包進去。
  serverExternalPackages: ["better-sqlite3"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
