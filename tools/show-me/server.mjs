// show-me 回饋看板伺服器：純 Node，只綁 127.0.0.1。
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { annotateRound } from "./lib/annotate.mjs";
import { annotatedName, renderFeedbackMd } from "./lib/markdown.mjs";
import { isSafeId, isSafeName, resolveInside } from "./lib/paths.mjs";
import { defaultRoot, listRounds, readFeedback, readRound, reportsDir, roundDir, saveFeedback, summarizeFeedback, writeFileAtomic, writeJsonAtomic, writeRound } from "./lib/store.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "public");
const assetsDir = path.join(here, "assets");
const MAX_BODY = 4 * 1024 * 1024;

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };
const BOARD_CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; form-action 'none'";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function send(res, status, body, type = "text/plain; charset=utf-8", extra = {}) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra });
  res.end(body);
}
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), MIME[".json"]);

function sendFile(res, file, extra = {}) {
  let data;
  try {
    data = fs.readFileSync(file);
  } catch {
    return send(res, 404, "找不到檔案");
  }
  send(res, 200, data, MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream", extra);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c); // 超過上限後只消耗不保存，讓用戶端能收到 413
    });
    req.on("end", () => (size > MAX_BODY ? reject(Object.assign(new Error("內容太大"), { status: 413 })) : resolve(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", reject);
  });
}

function homePage(root) {
  const rounds = listRounds(root);
  let reports = [];
  try {
    reports = fs.readdirSync(reportsDir(root)).filter((n) => n.endsWith(".html") && isSafeName(n)).map((n) => ({ name: n, mtime: fs.statSync(path.join(reportsDir(root), n)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
  } catch {
    // 沒有報告資料夾
  }
  const rows = rounds.map((r) => {
    const fb = readFeedback(root, r);
    const c = summarizeFeedback(r, fb);
    let pill;
    if (r.status === "open") pill = c.pending === 0 ? `<span class="pill g">標完了，等你送出</span>` : `<span class="pill">還剩 ${c.pending} 張沒標</span>`;
    else if (r.status === "submitted") pill = `<span class="pill r">待處理 ${c.change + c.question} 項</span>`;
    else pill = `<span class="pill g">已處理</span>`;
    const detail = `共 ${r.items.length} 張｜OK ${c.ok}｜要修改 ${c.change}｜有疑問 ${c.question}`;
    return `<a class="card" href="/rounds/${esc(r.id)}"><strong>${esc(r.id)}</strong> ${pill}<br><span class="muted">${esc(detail)}</span>${r.summary.trim() ? `<br><span class="muted">${esc(r.summary.trim().split("\n")[0].slice(0, 120))}</span>` : ""}</a>`;
  });
  const reportRows = reports.map((p) => `<a class="card" href="/reports/${encodeURIComponent(p.name)}"><strong>${esc(p.name.replace(/\.html$/, ""))}</strong> <span class="muted">${esc(new Date(p.mtime).toLocaleString("zh-TW"))}</span></a>`);
  const pending = rounds.filter((r) => r.status === "open").length;
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>show-me</title><link rel="stylesheet" href="/welly.css"></head><body><div class="wrap">
<p class="eyebrow">show-me</p><h1>${pending > 0 ? `有 ${pending} 輪等你看` : "目前沒有等你看的輪次"}</h1><p class="lede">點下面的輪次，逐張看截圖、標注、留言，最後按「送出本輪回饋」。</p><div class="rule"></div>
<h2>輪次（${rounds.length}）</h2>${rows.join("") || `<p class="muted">還沒有輪次。請 agent 執行截圖。</p>`}
<h2>報告頁（${reports.length}）</h2>${reportRows.join("") || `<p class="muted">還沒有報告頁。</p>`}
<p class="foot">只在這台電腦上運作（127.0.0.1），資料在 .review/，不會上傳。</p></div></body></html>`;
}

// annotator：可注入（測試用）；預設用 playwright 把標注畫進截圖。
export async function startServer({ root = defaultRoot, port = 8770, annotator = annotateRound } = {}) {
  const locks = new Set();

  async function handle(req, res) {
    const addr = server.address();
    const actual = typeof addr === "object" && addr ? addr.port : port;
    const host = req.headers.host ?? "";
    if (host !== `127.0.0.1:${actual}` && host !== `localhost:${actual}`) return send(res, 403, "不允許的 Host");
    const method = req.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      const origin = req.headers.origin;
      if (origin !== undefined && origin !== `http://${host}`) return send(res, 403, "不允許的 Origin");
    }
    const url = new URL(req.url ?? "/", `http://${host}`);
    let parts;
    try {
      parts = url.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
    } catch {
      return send(res, 400, "網址格式錯誤");
    }
    const [a, b, c, d, e] = parts;

    if (method === "GET" || method === "HEAD") {
      if (parts.length === 0) return send(res, 200, homePage(root), MIME[".html"], { "content-security-policy": BOARD_CSP });
      if (parts.length === 1 && a === "welly.css") return sendFile(res, path.join(assetsDir, "welly.css"));
      if (a === "static" && parts.length === 2 && isSafeName(b)) {
        const f = resolveInside(publicDir, b);
        if (path.extname(b) === ".html") return send(res, 404, "找不到");
        return sendFile(res, f);
      }
      if (a === "reports" && parts.length === 2 && b === "welly.css") return sendFile(res, path.join(assetsDir, "welly.css"));
      if (a === "reports" && parts.length === 2 && b.endsWith(".html") && isSafeName(b)) return sendFile(res, resolveInside(reportsDir(root), b));
      if (a === "rounds" && parts.length === 2 && isSafeId(b)) return readRound(root, b) ? sendFile(res, path.join(publicDir, "board.html"), { "content-security-policy": BOARD_CSP }) : send(res, 404, "找不到這一輪");
      if (a === "render" && parts.length === 3 && isSafeId(b) && isSafeId(c)) return sendFile(res, path.join(publicDir, "render.html"), { "content-security-policy": BOARD_CSP });
      if (a === "api" && b === "rounds" && isSafeId(c)) {
        const round = readRound(root, c);
        if (!round) return sendJson(res, 404, { error: "找不到這一輪" });
        if (parts.length === 3) return sendJson(res, 200, { round, feedback: readFeedback(root, round) });
        if (d === "files" && parts.length === 5 && isSafeName(e)) {
          const allowed = new Set([...round.items.flatMap((i) => [i.screenshot, i.reference].filter(Boolean)), ...round.items.map((i) => annotatedName(i.id))]);
          if (!allowed.has(e)) return send(res, 404, "找不到檔案");
          return sendFile(res, resolveInside(roundDir(root, c), e));
        }
      }
      return send(res, 404, "找不到");
    }

    if (a === "api" && b === "rounds" && isSafeId(c)) {
      const round = readRound(root, c);
      if (!round) return sendJson(res, 404, { error: "找不到這一輪" });
      if (method === "PUT" && d === "feedback" && parts.length === 4) {
        if (round.status !== "open") return sendJson(res, 409, { error: "這一輪已送出，不能再修改" });
        let payload;
        try {
          payload = JSON.parse(await readBody(req));
        } catch (err) {
          if (err?.status === 413) return sendJson(res, 413, { error: "內容太大" });
          return sendJson(res, 400, { errors: ["不是合法的 JSON"] });
        }
        const saved = saveFeedback(root, round, payload);
        return saved.ok ? sendJson(res, 200, { ok: true, updatedAt: saved.value.updatedAt }) : sendJson(res, 400, { errors: saved.errors });
      }
      if (method === "POST" && d === "submit" && parts.length === 4) {
        if (round.status !== "open") return sendJson(res, 409, { error: "這一輪已經送出過了" });
        if (locks.has(c)) return sendJson(res, 409, { error: "正在送出中" });
        locks.add(c);
        try {
          const feedback = readFeedback(root, round);
          const submittedAt = new Date().toISOString();
          const origin = `http://127.0.0.1:${actual}`;
          const { done, warnings } = await annotator(root, round, feedback, origin);
          const dir = roundDir(root, c);
          writeFileAtomic(path.join(dir, "feedback.md"), renderFeedbackMd(round, feedback, { annotated: new Set(done), submittedAt }));
          writeJsonAtomic(path.join(dir, "feedback.json"), { ...feedback, status: "submitted", submittedAt });
          writeRound(root, { ...round, status: "submitted", submittedAt });
          return sendJson(res, 200, { ok: true, feedbackMd: `.review/rounds/${c}/feedback.md`, annotated: done, warnings });
        } catch (err) {
          return sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        } finally {
          locks.delete(c);
        }
      }
    }
    return send(res, 404, "找不到");
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (!res.headersSent) send(res, 500, err instanceof Error ? err.message : "伺服器錯誤");
      else res.end();
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;
  return { server, port: actualPort, url: `http://127.0.0.1:${actualPort}`, close: () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { port: { type: "string", default: process.env["SHOW_ME_PORT"] ?? "8770" }, root: { type: "string" } } });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`--port 不合法：${values.port}`);
    process.exit(1);
  }
  try {
    const s = await startServer({ port, ...(values.root ? { root: path.resolve(values.root) } : {}) });
    console.log(`show-me 看板已啟動：${s.url}`);
    console.log("只在本機（127.0.0.1）提供服務。按 Ctrl+C 停止。");
  } catch (err) {
    console.error(err?.code === "EADDRINUSE" ? `埠 ${port} 已被占用。換一個：node tools/show-me/server.mjs --port 8771` : `啟動失敗：${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
