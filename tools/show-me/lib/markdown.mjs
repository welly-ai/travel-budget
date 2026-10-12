// 產生給 agent 讀的 feedback.md。路徑一律用相對於 repo 根目錄的 POSIX 斜線，agent 與 Windows 都能直接用。
import { summarizeFeedback } from "./store.mjs";

const STATUS_LABEL = { ok: "OK", change: "要修改", question: "有疑問", pending: "未標記" };
const TYPE_LABEL = { rect: "矩形框", arrow: "箭頭", pin: "圖釘", path: "手繪" };

const r = (n) => Math.round(n);

export function describeGeometry(a) {
  switch (a.type) {
    case "rect":
      return `左上 (${r(a.x)}, ${r(a.y)})，寬 ${r(a.w)} × 高 ${r(a.h)}`;
    case "arrow":
      return `起點 (${r(a.x1)}, ${r(a.y1)}) → 終點 (${r(a.x2)}, ${r(a.y2)})`;
    case "pin":
      return `位置 (${r(a.x)}, ${r(a.y)})`;
    case "path": {
      const xs = a.points.map((p) => p[0]);
      const ys = a.points.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return `外框 左上 (${r(x)}, ${r(y)})，寬 ${r(Math.max(...xs) - x)} × 高 ${r(Math.max(...ys) - y)}（${a.points.length} 點）`;
    }
  }
}

const oneLine = (s) => s.replace(/\s*\n\s*/g, " ／ ");

export function annotatedName(itemId) {
  return `${itemId}.annotated.png`;
}

// annotated：已成功產生標注圖的 item id 集合。
// 結構：先列「要修改／有疑問」（依截圖順序，含完整標注），OK 與未標記收成一行一項放最後。
export function renderFeedbackMd(round, feedback, { annotated = new Set(), submittedAt } = {}) {
  const base = `.review/rounds/${round.id}`;
  const counts = summarizeFeedback(round, feedback);
  const blank = { status: "pending", comment: "", annotations: [] };
  const rows = round.items.map((item, index) => ({ item, index: index + 1, entry: feedback.items[item.id] ?? blank }));
  const todo = rows.filter((x) => x.entry.status === "change" || x.entry.status === "question");
  const lines = [];
  lines.push(`# 回饋：輪次 ${round.id}`, "");
  lines.push(`**下一步**：逐條處理下面「要處理」的 ${todo.length} 項，處理完在下一輪摘要中用 #編號 逐條回應（已改／未改＋原因）。`, "");
  lines.push(`- 統計：要修改 ${counts.change}｜有疑問 ${counts.question}｜OK ${counts.ok}｜未標記 ${counts.pending}`);
  lines.push(`- git：${round.gitSha}｜建立：${round.createdAt}${submittedAt ? `｜送出：${submittedAt}` : ""}`);
  lines.push("- 座標單位：截圖原始像素，原點在左上角。", "");

  lines.push(`## 要處理（${todo.length} 項）`, "");
  if (todo.length === 0) lines.push("（沒有。全部 OK 或未標記。）", "");
  for (const { item, index, entry } of todo) {
    lines.push(`### ${index}. ${item.title}（${item.id}）`, "");
    lines.push(`- 狀態：${STATUS_LABEL[entry.status]}`);
    if (item.description) lines.push(`- 說明（agent）：${oneLine(item.description)}`);
    lines.push(`- 頁面：${item.route}｜viewport ${item.viewport.width}×${item.viewport.height}`);
    if (item.reference) lines.push(`- 參考圖（目標）：${base}/${item.reference}`);
    lines.push(`- 原始截圖：${base}/${item.screenshot}`);
    if (annotated.has(item.id)) lines.push(`- 標注後截圖：${base}/${annotatedName(item.id)}`);
    if (item.previousItemId) lines.push(`- 上一輪同一項：${item.previousItemId}`);
    lines.push(`- 整體留言：${entry.comment.trim() ? oneLine(entry.comment.trim()) : "（無）"}`);
    if (entry.annotations.length > 0) {
      lines.push("", "標注：", "");
      for (const a of entry.annotations) {
        lines.push(`- #${a.n} [${TYPE_LABEL[a.type]}] ${describeGeometry(a)} — ${a.text.trim() ? oneLine(a.text.trim()) : "（無文字）"}`);
      }
    }
    lines.push("");
  }

  const rest = rows.filter((x) => x.entry.status === "ok" || x.entry.status === "pending");
  if (rest.length > 0) {
    lines.push(`## OK／未標記（${rest.length} 項）`, "");
    for (const { item, index, entry } of rest) {
      const extra = entry.comment.trim() ? `｜留言：${oneLine(entry.comment.trim())}` : "";
      lines.push(`- ${index}. ${item.title}（${item.id}）：${STATUS_LABEL[entry.status]}${extra}`);
    }
    lines.push("");
  }
  if (round.summary.trim()) lines.push("## 本輪摘要（agent 當時寫的）", "", round.summary.trim(), "");
  return `${lines.join("\n")}\n`;
}
