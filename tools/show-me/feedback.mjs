// agent 用的 CLI：
//   node tools/show-me/feedback.mjs --latest         印出最新一輪「已送出、尚未處理」的 feedback.md 路徑與摘要
//   node tools/show-me/feedback.mjs --resolve <id>   標記該輪已由 agent 處理
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { defaultRoot, latestPending, markResolved, readFeedback, roundDir } from "./lib/store.mjs";

const { values } = parseArgs({ options: { latest: { type: "boolean" }, resolve: { type: "string" }, root: { type: "string" } } });
const root = values.root ? path.resolve(values.root) : defaultRoot;

if (values.resolve) {
  const res = markResolved(root, values.resolve);
  if (!res.ok) {
    console.error(`錯誤：${res.error}`);
    process.exit(1);
  }
  console.log(`已標記輪次 ${res.round.id} 為已處理。下一輪的摘要請逐條回應 #編號（已改／未改＋原因）。`);
} else if (values.latest) {
  const round = latestPending(root);
  if (!round) {
    console.log("沒有待處理的回饋（沒有已送出且未處理的輪次）。");
    process.exit(0);
  }
  const file = path.join(roundDir(root, round.id), "feedback.md");
  if (!fs.existsSync(file)) {
    console.error(`錯誤：輪次 ${round.id} 已送出，但找不到 ${file}`);
    process.exit(1);
  }
  const fb = readFeedback(root, round);
  const label = { change: "要修改", question: "有疑問" };
  const todo = round.items.filter((it) => fb.items[it.id]?.status === "change" || fb.items[it.id]?.status === "question");
  console.log(`輪次：${round.id}（送出：${round.submittedAt ?? "?"}）`);
  console.log(`feedback.md：${file}`);
  console.log(`待處理 ${todo.length} 項，OK ${round.items.filter((it) => fb.items[it.id]?.status === "ok").length} 項：`);
  for (const it of todo) {
    const e = fb.items[it.id];
    const comment = e.comment.trim().replace(/\s+/g, " ").slice(0, 80);
    console.log(`- [${label[e.status]}] ${it.title}（${it.id}）：${e.annotations.length} 個標注${comment ? `｜${comment}` : ""}`);
  }
  console.log("請讀 feedback.md 與其中列出的 *.annotated.png，處理完執行：");
  console.log(`  node tools/show-me/feedback.mjs --resolve ${round.id}`);
} else {
  console.error("用法：feedback.mjs --latest | --resolve <輪次 id>");
  process.exit(1);
}
