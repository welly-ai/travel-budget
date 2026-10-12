import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startServer } from "../../../tools/show-me/server.mjs";
import { reportsDir, roundDir } from "../../../tools/show-me/lib/store.mjs";
import { makeRound, rectEntry, tmpRoot } from "./helpers";

type Started = Awaited<ReturnType<typeof startServer>>;
const open: Started[] = [];
afterEach(async () => {
  for (const s of open.splice(0)) await s.close();
});

async function boot(root: string) {
  const s = await startServer({ root, port: 0, annotator: () => Promise.resolve({ done: ["home"], warnings: [] }) });
  open.push(s);
  return s;
}

// fetch 會正規化網址（吃掉 ../），要原樣送出請求就得用 node:http。
function raw(port: number, rawPath: string, host = `127.0.0.1:${port}`): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: rawPath, headers: { host } }, (res) => {
      let body = "";
      res.on("data", (c: Buffer) => (body += c.toString()));
      res.on("end", () => { resolve({ status: res.statusCode ?? 0, body }); });
    });
    req.on("error", reject);
    req.end();
  });
}

const put = (s: Started, id: string, body: unknown) =>
  fetch(`${s.url}/api/rounds/${id}/feedback`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("show-me 伺服器", () => {
  it("只綁 127.0.0.1，首頁列出輪次與待處理數", async () => {
    const root = tmpRoot();
    const round = makeRound(root);
    const s = await boot(root);
    const addr = s.server.address();
    expect(typeof addr === "object" && addr?.address).toBe("127.0.0.1");
    const html = await (await fetch(s.url)).text();
    expect(html).toContain(round.id);
    expect(html).toContain("還剩 2 張沒標");
  });

  it("提供 welly.css 與報告頁", async () => {
    const root = tmpRoot();
    fs.mkdirSync(reportsDir(root), { recursive: true });
    fs.writeFileSync(path.join(reportsDir(root), "階段回報.html"), "<h1>報告</h1>");
    const s = await boot(root);
    expect((await fetch(`${s.url}/welly.css`)).status).toBe(200);
    expect((await fetch(`${s.url}/reports/welly.css`)).status).toBe(200);
    expect(await (await fetch(`${s.url}/reports/${encodeURIComponent("階段回報.html")}`)).text()).toContain("報告");
  });

  it.each(["/reports/..%2f..%2fpackage.json", "/reports/..%5c..%5cpackage.json", "/reports/%2e%2e/x.html", "/static/..%2fserver.mjs", "/static/../server.mjs", "/reports/..%2f..%2f..%2fetc%2fpasswd.html", "/api/rounds/..%2f..%2fx", "/rounds/..%5cx"])("路徑穿越被擋：%s", async (p) => {
    const root = tmpRoot();
    makeRound(root);
    const s = await boot(root);
    const r = await raw(s.port, p);
    expect([400, 404]).toContain(r.status);
    expect(r.body).not.toContain("\"name\"");
    expect(r.body).not.toContain("startServer");
  });

  it("看板與渲染頁不含行內 script（CSP 會擋，標注截圖會因此失敗）", async () => {
    const root = tmpRoot();
    const round = makeRound(root);
    const s = await boot(root);
    for (const p of [`/rounds/${round.id}`, `/render/${round.id}/home`]) {
      const html = await (await fetch(s.url + p)).text();
      expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
    }
  });

  it("檔案路由只提供該輪登記的檔案", async () => {
    const root = tmpRoot();
    const round = makeRound(root);
    fs.writeFileSync(path.join(roundDir(root, round.id), "home.png"), "PNG");
    fs.writeFileSync(path.join(roundDir(root, round.id), "round.json.bak"), "secret");
    const s = await boot(root);
    expect((await fetch(`${s.url}/api/rounds/${round.id}/files/home.png`)).status).toBe(200);
    expect((await fetch(`${s.url}/api/rounds/${round.id}/files/round.json`)).status).toBe(404);
    expect((await fetch(`${s.url}/api/rounds/${round.id}/files/round.json.bak`)).status).toBe(404);
  });

  it("拒絕非本機 Host（防 DNS rebinding）與跨站 Origin", async () => {
    const root = tmpRoot();
    const round = makeRound(root);
    const s = await boot(root);
    expect((await raw(s.port, "/", "evil.example.com")).status).toBe(403);
    const res = await fetch(`${s.url}/api/rounds/${round.id}/feedback`, { method: "PUT", headers: { origin: "http://evil.example.com", "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(403);
  });

  it("PUT feedback：合法的寫入；不合法的 400；超大的 413", async () => {
    const root = tmpRoot();
    const round = makeRound(root);
    const s = await boot(root);
    expect((await put(s, round.id, { schemaVersion: 1, items: { home: rectEntry } })).status).toBe(200);
    const saved: unknown = JSON.parse(fs.readFileSync(path.join(roundDir(root, round.id), "feedback.json"), "utf8"));
    expect(saved).toMatchObject({ roundId: round.id, status: "draft" });
    expect((await put(s, round.id, { schemaVersion: 1, items: { home: { status: "bad" } } })).status).toBe(400);
    expect((await put(s, round.id, { schemaVersion: 1, items: { nope: rectEntry } })).status).toBe(400);
    const big = await fetch(`${s.url}/api/rounds/${round.id}/feedback`, { method: "PUT", body: "x".repeat(5 * 1024 * 1024) });
    expect(big.status).toBe(413);
  });

  it("送出：產生 feedback.md、標記 submitted，之後不能再改或重複送出", async () => {
    const root = tmpRoot();
    const round = makeRound(root);
    const s = await boot(root);
    await put(s, round.id, { schemaVersion: 1, items: { home: rectEntry, detail: { status: "ok", comment: "", annotations: [] } } });
    const res = await fetch(`${s.url}/api/rounds/${round.id}/submit`, { method: "POST" });
    expect(res.status).toBe(200);
    const md = fs.readFileSync(path.join(roundDir(root, round.id), "feedback.md"), "utf8");
    expect(md).toContain("標題太小");
    expect(md).toContain("home.annotated.png");
    const r2: unknown = JSON.parse(fs.readFileSync(path.join(roundDir(root, round.id), "round.json"), "utf8"));
    expect(r2).toMatchObject({ status: "submitted" });
    expect((await put(s, round.id, { schemaVersion: 1, items: {} })).status).toBe(409);
    expect((await fetch(`${s.url}/api/rounds/${round.id}/submit`, { method: "POST" })).status).toBe(409);
  });
});
