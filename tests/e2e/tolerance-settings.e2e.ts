import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";
import { DEMO_USERS } from "../fixtures/synthetic/seed";

const baseUrl = process.env["E2E_BASE_URL"] ?? "http://127.0.0.1:3100";
const PROFILE = '[data-testid="tolerance-profile"]';

let browser: Browser;
const contexts: BrowserContext[] = [];

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  for (const context of contexts) await context.close();
  await browser.close();
});

async function openSettings(user: (typeof DEMO_USERS)[number]): Promise<Page> {
  const context = await browser.newContext({ baseURL: baseUrl });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto("/settings/tolerance");
  await page.waitForURL(/\/login/); // 沒登入會被導到登入頁
  await page.waitForLoadState("networkidle");
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/settings\/tolerance$/);
  await page.waitForSelector(PROFILE);
  await page.waitForLoadState("networkidle"); // 等 hydrate
  return page;
}

function card(page: Page, name: string) {
  return page.locator(PROFILE).filter({ has: page.getByTestId("profile-name").getByText(name, { exact: true }) });
}

async function fillForm(page: Page, formName: string, values: { name: string; up: string; down: string }): Promise<void> {
  const form = page.getByRole("form", { name: formName });
  await form.getByLabel("名稱").fill(values.name);
  await form.getByLabel("最多增加（%）").fill(values.up);
  await form.getByLabel("最多減少（%）").fill(values.down);
  await form.locator('button[type="submit"]').click();
}

it("容許範圍設定：新增 → 編輯 → 名稱重複被擋 → 舊版本衝突", async () => {
  const [first, second] = DEMO_USERS;
  const pageA = await openSettings(first);

  // 預設組帶「預設」標籤。
  await expect.poll(() => pageA.locator(PROFILE).first().textContent()).toContain("預設");

  // 新增一組。
  await fillForm(pageA, "新增一組", { name: "合成廠區甲", up: "50", down: "20" });
  await expect.poll(() => card(pageA, "合成廠區甲").count()).toBe(1);
  expect(await card(pageA, "合成廠區甲").getByTestId("profile-limits").textContent()).toContain("上限 +50% · 下限 −20%");
  expect(await card(pageA, "合成廠區甲").textContent()).toContain(first.name);

  // 名稱重複被擋。
  await fillForm(pageA, "新增一組", { name: "合成廠區甲", up: "10", down: "10" });
  await expect.poll(() => pageA.getByTestId("notice-duplicate").textContent()).toContain("已經被另一組使用");
  await expect.poll(() => card(pageA, "合成廠區甲").count()).toBe(1);

  // B 打開頁面（停在第 1 版），A 先改。
  const pageB = await openSettings(second);
  await card(pageA, "合成廠區甲").getByRole("button", { name: "編輯「合成廠區甲」" }).click();
  await fillForm(pageA, "編輯「合成廠區甲」", { name: "合成廠區甲", up: "60", down: "25" });
  await expect.poll(() => card(pageA, "合成廠區甲").getByTestId("profile-limits").textContent()).toContain("上限 +60% · 下限 −25%");

  // B 以舊版本存檔 → 衝突訊息，資料不被覆蓋。
  await card(pageB, "合成廠區甲").getByRole("button", { name: "編輯「合成廠區甲」" }).click();
  await fillForm(pageB, "編輯「合成廠區甲」", { name: "合成廠區甲", up: "5", down: "5" });
  await expect.poll(() => pageB.getByTestId("notice-conflict").textContent()).toContain(`已被 ${first.name} 於`);
  expect(await pageB.getByTestId("notice-conflict").textContent()).toContain("修改，請重新載入");
  await pageB.getByRole("button", { name: "重新載入" }).click();
  await expect.poll(() => card(pageB, "合成廠區甲").getByTestId("profile-limits").textContent()).toContain("上限 +60% · 下限 −25%");
});
