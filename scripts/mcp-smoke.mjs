// 連到 /api/mcp，呼叫 list_projects 與 calculate_budget，檢查結果自洽。
// 用法：先 pnpm dev，再 pnpm mcp:smoke（權杖讀 .env.local 的 MCP_TOKEN；網址可用 MCP_URL 覆寫）。
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* 沒有 .env.local 就只用目前的環境變數 */
}
const token = process.env.MCP_TOKEN;
if (!token) {
  console.error("錯誤：沒有 MCP_TOKEN。請在 .env.local 設定（見 .env.example），並重啟 pnpm dev。");
  process.exit(1);
}
const url = new URL(process.env.MCP_URL ?? "http://127.0.0.1:3000/api/mcp");

const client = new Client({ name: "mcp-smoke", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));

function parse(result) {
  if (result.isError) throw new Error(`工具回傳錯誤：${JSON.stringify(result.content)}`);
  const [first] = result.content;
  if (first?.type !== "text") throw new Error("工具沒有回傳文字內容");
  return JSON.parse(first.text);
}

let failures = 0;
function check(ok, message) {
  console.log(`${ok ? "OK  " : "FAIL"} ${message}`);
  if (!ok) failures += 1;
}

const tools = (await client.listTools()).tools.map((tool) => tool.name).sort();
check(tools.join(",") === "calculate_budget,list_projects", `工具清單：${tools.join(", ")}`);

const projects = parse(await client.callTool({ name: "list_projects", arguments: {} }));
check(projects.length > 0, `list_projects 回傳 ${projects.length} 個專案`);

for (const project of projects) {
  const calc = parse(await client.callTool({ name: "calculate_budget", arguments: { projectCode: project.code } }));
  const stageSum = calc.stageSubtotals.reduce((sum, stage) => sum + stage.manDays, 0);
  console.log(`     ${project.code}: 總人天 ${calc.total.manDays}（Phase ${calc.phase} / Class ${calc.projectClass}）`);
  check(calc.total.manDays === project.totalManDays, `${project.code} 試算總人天與列表一致`);
  check(Math.abs(stageSum - calc.total.manDays) < 1e-9, `${project.code} 各 Stage 小計加總等於總計`);
}

const [first] = projects;
if (first) {
  const base = parse(await client.callTool({ name: "calculate_budget", arguments: { projectCode: first.code } }));
  const other = first.projectClass === 2 ? 4 : 2;
  const changed = parse(await client.callTool({ name: "calculate_budget", arguments: { projectCode: first.code, overrides: { projectClass: other } } }));
  check(changed.projectClass === other && changed.total.manDays !== base.total.manDays, `${first.code} 覆寫 Class=${other} 後總人天改變（${base.total.manDays} → ${changed.total.manDays}）`);
  const after = parse(await client.callTool({ name: "list_projects", arguments: {} })).find((p) => p.code === first.code);
  check(after?.version === first.version && after?.projectClass === first.projectClass, "試算不會寫入（版本與 Class 不變）");
}

await client.close();
process.exit(failures === 0 ? 0 : 1);
