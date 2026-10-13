import { readFileSync, statSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";
import { DEMO_USERS } from "../fixtures/synthetic/seed";

const baseUrl = process.env["E2E_BASE_URL"] ?? "http://127.0.0.1:3100";
const TOTAL = '[data-testid="total-man-days"]';
/** server action 有 debounce 與 dev 編譯，給輪詢多一點時間。 */
const POLL = { timeout: 15_000 };

let browser: Browser;
const contexts: BrowserContext[] = [];

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  for (const context of contexts) await context.close();
  await browser.close();
});

async function login(user: (typeof DEMO_USERS)[number]): Promise<Page> {
  const context = await browser.newContext({ baseURL: baseUrl, acceptDownloads: true });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto("/projects");
  await page.waitForURL(/\/login/); // 沒登入會被導到登入頁
  await page.waitForLoadState("networkidle");
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/projects$/);
  return page;
}

async function openProject(page: Page, code: string): Promise<void> {
  await page.getByRole("link", { name: code, exact: true }).click();
  await page.waitForURL(new RegExp(`/projects/${code}$`));
  await page.waitForSelector(TOTAL);
  await page.waitForLoadState("networkidle"); // 等 hydrate，否則改設定的事件沒人接
}

async function totalText(page: Page): Promise<string> {
  return (await page.locator(TOTAL).textContent()) ?? "";
}

async function changeClass(page: Page, value: string): Promise<void> {
  const before = await totalText(page);
  await page.getByLabel("Class", { exact: true }).selectOption(value);
  await page.waitForFunction(([selector, old]) => document.querySelector(selector ?? "")?.textContent !== old, [TOTAL, before]);
}

it("登入 → 改 Class → 存檔 → 舊版本衝突 → 匯出", async () => {
  const [first, second] = DEMO_USERS;

  // B（小美）先打開專案，停在第 1 版。
  const pageB = await login(second);
  await openProject(pageB, "SYN01");
  await expect.poll(() => pageB.getByTestId("version").textContent()).toBe("第 1 版");

  // A（示範使用者）改 Class，矩陣數字改變，存檔成功。
  const pageA = await login(first);
  await openProject(pageA, "SYN01");
  const before = await totalText(pageA);
  await changeClass(pageA, "3");
  expect(await totalText(pageA)).not.toBe(before);
  await pageA.getByRole("button", { name: "儲存" }).click();
  await expect.poll(() => pageA.getByTestId("notice-saved").textContent()).toContain("第 2 版");
  await expect.poll(() => pageA.getByTestId("version").textContent()).toBe("第 2 版");

  // B 以舊的第 1 版存檔 → 衝突，且資料不被覆蓋。
  await changeClass(pageB, "2");
  await pageB.getByRole("button", { name: "儲存" }).click();
  const conflict = pageB.getByTestId("notice-conflict");
  await expect.poll(() => conflict.textContent()).toContain(`已被 ${first.name} 於`);
  expect(await conflict.textContent()).toContain("修改");
  await pageB.getByRole("button", { name: "重新載入" }).click();
  await pageB.waitForSelector(TOTAL);
  await expect.poll(() => pageB.getByTestId("version").textContent()).toBe("第 2 版");

  // 匯出舊版面 Excel。
  const [download] = await Promise.all([pageA.waitForEvent("download"), pageA.getByRole("link", { name: /匯出 Excel/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^SYN01-v2\.xlsx$/);
  const path = await download.path();
  expect(statSync(path).size).toBeGreaterThan(1000);
  expect(readFileSync(path).subarray(0, 2).toString()).toBe("PK"); // xlsx 是 zip
});

it("格子手動覆寫：超出容許範圍 → 警告 → 沒理由存不進去 → 填理由 → 存檔 → 重新載入後還在", async () => {
  const [first] = DEMO_USERS;
  const page = await login(first);
  await openProject(page, "SYN02");
  await expect.poll(() => page.getByTestId("version").textContent(), POLL).toBe("第 1 版");

  // 找一個有 Guidance 的 Function 格子（A Stage 一定計入，且合成資料在 A 沒有例外調整），點開覆寫對話框。
  const cell = page.locator('td[data-testid^="cell-"][data-testid$="-A"]').filter({ hasText: "人次" }).first();
  const cellId = await cell.getAttribute("data-testid");
  expect(cellId).not.toBeNull();
  const target = page.locator(`td[data-testid="${cellId ?? ""}"]`);
  await target.getByRole("button").click();
  const dialog = page.getByRole("dialog");
  expect(await dialog.getByTestId("override-guidance").textContent()).toContain("Guidance 有效值");

  // 人次改成兩倍多一點 → 超出 ±30%，對話框與格子都出現警告。
  const man = dialog.getByLabel("人次");
  await man.fill(String(Number(await man.inputValue()) * 2 + 1));
  const warning = dialog.getByTestId("override-warning");
  await warning.waitFor({ timeout: 30_000 }); // 第一次呼叫 server action 時 dev server 要編譯
  await expect.poll(() => warning.textContent(), POLL).toContain("超過上限 30%");
  expect(await warning.textContent()).toContain("需要填理由");
  await expect.poll(() => target.getAttribute("data-warning"), POLL).toBe("missing-reason");
  await dialog.getByRole("button", { name: "完成" }).click();

  // 沒填理由 → 伺服器拒絕存檔，版號不變。
  await page.getByRole("button", { name: "儲存修改" }).click();
  await expect.poll(() => page.getByTestId("notice-reasonRequired").textContent(), POLL).toContain("需要填理由");
  expect(await page.getByTestId("version").textContent()).toBe("第 1 版");

  // 填理由 → 存檔成功。
  await target.getByRole("button").click();
  await dialog.getByLabel("理由").fill("客戶要求加做一次驗證");
  await expect.poll(() => dialog.getByTestId("override-warning").textContent(), POLL).toContain("已填理由");
  await dialog.getByRole("button", { name: "完成" }).click();
  await expect.poll(() => target.getAttribute("data-warning"), POLL).toBe("with-reason");
  await page.getByRole("button", { name: "儲存修改" }).click();
  await expect.poll(() => page.getByTestId("notice-saved").textContent(), POLL).toContain("第 2 版");

  // 重新載入：覆寫和理由都還在。
  await page.reload();
  await page.waitForSelector(TOTAL);
  await expect.poll(() => page.getByTestId("version").textContent(), POLL).toBe("第 2 版");
  expect(await target.getAttribute("data-override")).toBe("true");
  expect(await target.getByRole("button").getAttribute("title")).toContain("理由：客戶要求加做一次驗證");
});
