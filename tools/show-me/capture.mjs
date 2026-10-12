// 截圖並建立新的一輪：node tools/show-me/capture.mjs --summary "<本輪摘要>" [--only id1,id2]
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { launchChromium } from "./lib/annotate.mjs";
import { assertLocalBaseUrl, loadConfig } from "./lib/config.mjs";
import { allocateRound, defaultRoot, gitShortSha, linkPreviousItems, listRounds, writeFileAtomic, writeRound } from "./lib/store.mjs";

const { values } = parseArgs({
  options: {
    summary: { type: "string", default: "" },
    only: { type: "string" },
    config: { type: "string", default: "show-me.config.json" },
    "base-url": { type: "string" },
    port: { type: "string", default: process.env["SHOW_ME_PORT"] ?? "8770" },
    root: { type: "string" },
  },
});

function fail(message) {
  console.error(`錯誤：${message}`);
  process.exit(1);
}

async function applyStep(page, step) {
  switch (step.action) {
    case "click":
      await page.locator(step.selector).first().click({ timeout: 10000 });
      break;
    case "fill":
      await page.locator(step.selector).first().fill(step.value ?? "", { timeout: 10000 });
      break;
    case "press":
      await page.keyboard.press(step.value ?? "Enter");
      break;
    case "wait":
      if (step.selector) await page.locator(step.selector).first().waitFor({ timeout: 15000 });
      else await page.waitForTimeout(Math.min(Number(step.ms ?? 500), 10000));
      break;
    default:
      break;
  }
}

const root = values.root ? path.resolve(values.root) : defaultRoot;
let config;
try {
  config = loadConfig(root, values.config);
  if (values["base-url"]) config.baseUrl = assertLocalBaseUrl(values["base-url"]);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

let items = config.items;
if (values.only) {
  const want = values.only.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = want.filter((id) => !items.some((i) => i.id === id));
  if (unknown.length > 0) fail(`--only 裡有設定檔沒有的 id：${unknown.join(", ")}。可用的 id：${items.map((i) => i.id).join(", ")}`);
  items = items.filter((i) => want.includes(i.id));
}

try {
  await fetch(config.baseUrl, { signal: AbortSignal.timeout(5000) });
} catch {
  fail(`連不上 ${config.baseUrl}。請先在另一個視窗執行 pnpm dev，等它顯示 Ready 後再重跑。\n（只能截本機直連的網址，不可用 proxy 或 tailnet 網址：經代理的畫面不會 hydrate。）`);
}

let browser;
try {
  browser = await launchChromium();
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

const previous = listRounds(root)[0] ?? null;
const { id, dir } = allocateRound(root, new Date(), gitShortSha(root));
const roundItems = [];
try {
  for (const it of items) {
    const context = await browser.newContext({ viewport: it.viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    try {
      await page.goto(config.baseUrl + it.route, { waitUntil: "load", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
      if (it.waitFor) await page.locator(it.waitFor).first().waitFor({ timeout: 15000 });
      for (const step of it.steps) await applyStep(page, step);
      const png = await page.screenshot({ fullPage: it.fullPage, type: "png" });
      writeFileAtomic(path.join(dir, `${it.id}.png`), png);
    } catch (err) {
      throw new Error(`截圖 ${it.id}（${it.route}）失敗：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await context.close();
    }
    const item = { id: it.id, title: it.title, ...(it.description ? { description: it.description } : {}), screenshot: `${it.id}.png`, route: it.route, viewport: it.viewport };
    if (it.reference) {
      const name = `${it.id}.ref${it.reference.ext}`;
      fs.copyFileSync(it.reference.abs, path.join(dir, name));
      item.reference = name;
    }
    roundItems.push(item);
  }
} catch (err) {
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  fail(err instanceof Error ? err.message : String(err));
}
await browser.close();

writeRound(root, {
  schemaVersion: 1,
  id,
  createdAt: new Date().toISOString(),
  gitSha: gitShortSha(root),
  summary: values.summary,
  status: "open",
  baseUrl: config.baseUrl,
  items: linkPreviousItems(roundItems, previous),
});
console.log(`已建立輪次 ${id}（${roundItems.length} 張）`);
if (!values.summary.trim()) console.log("提醒：沒有 --summary。摘要請先寫「請你看什麼、要你決定什麼」，再列本輪變更與上一輪回饋的處理結果。");
console.log(`看板網址（先執行 node tools/show-me/server.mjs）：http://127.0.0.1:${values.port}/rounds/${id}`);
