// show-me.config.json 的讀取與驗證（capture 用）。
import fs from "node:fs";
import path from "node:path";
import { isSafeId, resolveRepoFile } from "./paths.mjs";

export const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
export const REF_EXT = [".png", ".jpg", ".jpeg", ".webp"];

// 只能截本機直連的 dev server。經 proxy／tailnet 的 dev server 畫面看似正常，但不會 hydrate，互動全死且沒有錯誤訊息。
export function assertLocalBaseUrl(baseUrl) {
  let u;
  try {
    u = new URL(baseUrl);
  } catch {
    throw new Error(`baseUrl 不是合法網址：${baseUrl}`);
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!["127.0.0.1", "localhost", "::1"].includes(host) || !["http:", "https:"].includes(u.protocol)) {
    throw new Error(`baseUrl 必須指向本機（127.0.0.1／localhost），收到 ${baseUrl}。不可指向 proxy 或 tailnet 網址：經代理的 dev server 不會 hydrate，截到的畫面互動全死。`);
  }
  return baseUrl.replace(/\/+$/, "");
}

const num = (v, name) => {
  if (!Number.isInteger(v) || v < 100 || v > 8000) throw new Error(`${name} 必須是 100～8000 的整數`);
  return v;
};

export function parseConfig(raw, root) {
  if (typeof raw !== "object" || raw === null) throw new Error("show-me.config.json 必須是物件");
  const baseUrl = assertLocalBaseUrl(typeof raw.baseUrl === "string" ? raw.baseUrl : DEFAULT_BASE_URL);
  if (!Array.isArray(raw.items) || raw.items.length === 0) throw new Error("show-me.config.json 的 items 必須是非空陣列");
  const seen = new Set();
  const items = raw.items.map((it, i) => {
    const where = `items[${i}]`;
    if (typeof it !== "object" || it === null) throw new Error(`${where} 必須是物件`);
    if (!isSafeId(it.id)) throw new Error(`${where}.id 只能用英數、底線、連字號（最長 64）`);
    if (seen.has(it.id)) throw new Error(`${where}.id 重複：${it.id}`);
    seen.add(it.id);
    if (typeof it.title !== "string" || !it.title) throw new Error(`${where}.title 必須是非空字串`);
    if (typeof it.route !== "string" || !it.route.startsWith("/")) throw new Error(`${where}.route 必須以 / 開頭`);
    const vp = it.viewport ?? { width: 1280, height: 800 };
    const steps = Array.isArray(it.steps) ? it.steps : [];
    for (const [j, st] of steps.entries()) {
      if (!["click", "fill", "press", "wait"].includes(st?.action)) throw new Error(`${where}.steps[${j}].action 必須是 click／fill／press／wait`);
    }
    let reference;
    if (it.reference !== undefined) {
      const abs = resolveRepoFile(root, it.reference); // 防穿越，且必須在 repo 內
      const ext = path.extname(abs).toLowerCase();
      if (!REF_EXT.includes(ext)) throw new Error(`${where}.reference 必須是 ${REF_EXT.join("／")} 圖檔`);
      reference = { abs, ext: ext === ".jpeg" ? ".jpg" : ext };
    }
    return {
      id: it.id,
      title: it.title,
      description: typeof it.description === "string" ? it.description : "",
      route: it.route,
      viewport: { width: num(vp.width, `${where}.viewport.width`), height: num(vp.height, `${where}.viewport.height`) },
      waitFor: typeof it.waitFor === "string" ? it.waitFor : undefined,
      steps,
      fullPage: it.fullPage !== false,
      reference,
    };
  });
  return { baseUrl, items };
}

export function loadConfig(root, file = "show-me.config.json") {
  const abs = path.resolve(root, file);
  let text;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch {
    throw new Error(`找不到設定檔 ${abs}`);
  }
  return parseConfig(JSON.parse(text), root);
}
