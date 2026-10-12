// 把標注畫進截圖：開看板自己的「渲染頁」（和看板同一份 SVG 繪製程式），用 playwright 對元素截圖。
// 純 Node 沒有依賴就無法合成 PNG，所以這裡需要 playwright 與 chromium。
import path from "node:path";
import { annotatedName } from "./markdown.mjs";
import { roundDir, writeFileAtomic } from "./store.mjs";

export const INSTALL_HINT = "找不到 Playwright 的 chromium。請先執行：pnpm exec playwright install chromium";

export async function launchChromium() {
  const { chromium } = await import("playwright");
  try {
    return await chromium.launch();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Executable doesn't exist|playwright install|browserType\.launch/i.test(msg)) throw new Error(INSTALL_HINT);
    throw err;
  }
}

// 回傳 { done: string[]（成功的 item id）, warnings: string[] }
export async function annotateRound(root, round, feedback, origin) {
  const targets = round.items.filter((it) => (feedback.items[it.id]?.annotations.length ?? 0) > 0);
  const done = [];
  const warnings = [];
  if (targets.length === 0) return { done, warnings };
  let browser;
  try {
    browser = await launchChromium();
  } catch (err) {
    return { done, warnings: [err instanceof Error ? err.message : String(err)] };
  }
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const it of targets) {
      try {
        await page.goto(`${origin}/render/${round.id}/${it.id}`);
        await page.waitForFunction(() => window.__ready === true || window.__error !== undefined, null, { timeout: 15000 });
        const err = await page.evaluate(() => window.__error);
        if (err) throw new Error(err);
        const size = await page.evaluate(() => window.__size);
        await page.setViewportSize({ width: Math.min(size.w, 8000), height: Math.min(size.h, 8000) });
        const buf = await page.locator("#canvas").screenshot({ type: "png" });
        writeFileAtomic(path.join(roundDir(root, round.id), annotatedName(it.id)), buf);
        done.push(it.id);
      } catch (e) {
        warnings.push(`${it.id} 的標注截圖產生失敗：${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    await browser.close();
  }
  return { done, warnings };
}
