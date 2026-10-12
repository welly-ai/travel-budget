import { timingSafeEqual } from "node:crypto";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { calculateBudgetInput, calculateBudgetTool, listProjectsInput, listProjectsTool } from "@/mcp/server";

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_projects",
      { title: "列出專案", description: "列出所有專案：代碼、名稱、LOB、Phase、Class、狀態、版本與總人天。", inputSchema: listProjectsInput },
      () => listProjectsTool(),
    );
    server.registerTool(
      "calculate_budget",
      {
        title: "試算預算",
        description: "用專案目前的設定（可附設定覆寫）試算人天，回傳總計與各 Stage 小計。只試算，不會寫入。",
        inputSchema: calculateBudgetInput,
      },
      (input) => calculateBudgetTool(input),
    );
  },
  { serverInfo: { name: "travel-budget", version: "0.1.0" } },
);

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// MCP_TOKEN 沒設定時一律 401（等於關閉）。
const authed = withMcpAuth(
  handler,
  (_request, bearerToken) => {
    const expected = process.env["MCP_TOKEN"];
    if (expected === undefined || expected === "" || bearerToken === undefined || !sameToken(bearerToken, expected)) return undefined;
    return { token: bearerToken, clientId: "mcp-client", scopes: [] };
  },
  { required: true },
);

export { authed as GET, authed as POST };
