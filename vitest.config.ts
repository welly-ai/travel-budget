import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

// unit：合成資料，每次 pnpm check 都跑。golden：讀 local-data/ 的真實資料，要有意識地跑 pnpm test:golden。
export default defineConfig({
  resolve: { alias: { "@": src } },
  test: {
    projects: [
      { extends: true, test: { name: "unit", include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"] } },
      { extends: true, test: { name: "golden", include: ["tests/golden/**/*.test.ts"] } },
      // e2e：真的開瀏覽器。用 pnpm test:e2e 跑（會自己起伺服器），不納入 pnpm check。
      { extends: true, test: { name: "e2e", include: ["tests/e2e/**/*.e2e.ts"], testTimeout: 180_000, hookTimeout: 60_000 } },
    ],
  },
});
