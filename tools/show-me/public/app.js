import { renderAll } from "/static/render.js";

const $ = (s) => document.querySelector(s);
const roundId = location.pathname.split("/").filter(Boolean).pop();
const TYPE_LABEL = { rect: "矩形", arrow: "箭頭", pin: "圖釘", path: "手繪" };
const TOOLS = { r: "rect", a: "arrow", p: "pin", d: "path" };
const STATUS_KEYS = { 1: "ok", 2: "change", 3: "question" };

const state = { round: null, fb: null, index: 0, tool: "select", zoom: "fit", selectedId: null, draft: null, view: "current", size: { w: 0, h: 0 }, readonly: false };
let saveTimer = null;
let saving = false;
let dirty = false;

const item = () => state.round.items[state.index];
function entry(id = item().id) {
  if (!state.fb.items[id]) state.fb.items[id] = { status: "pending", comment: "", annotations: [] };
  return state.fb.items[id];
}
const statusOf = (id) => state.fb.items[id]?.status ?? "pending";

// ---- 儲存 ----
function setSaveState(text) { $("#save-state").textContent = text; }
function scheduleSave() {
  if (state.readonly) return;
  dirty = true;
  setSaveState("尚未儲存…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 600);
}
async function flush() {
  clearTimeout(saveTimer);
  if (saving || !dirty) return;
  saving = true; dirty = false;
  setSaveState("儲存中…");
  try {
    const res = await fetch(`/api/rounds/${roundId}/feedback`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ schemaVersion: 1, items: state.fb.items }), keepalive: true });
    if (!res.ok) throw new Error((await res.json()).errors?.join("；") ?? res.statusText);
    setSaveState("已自動儲存");
  } catch (e) {
    dirty = true;
    setSaveState(`儲存失敗：${e.message}（會再試一次）`);
    saveTimer = setTimeout(flush, 3000);
  } finally {
    saving = false;
    if (dirty && !saveTimer) saveTimer = setTimeout(flush, 600);
  }
}
window.addEventListener("beforeunload", () => { if (dirty) flush(); });

// ---- 狀態列 ----
function counts() {
  const c = { ok: 0, change: 0, question: 0, pending: 0 };
  for (const it of state.round.items) c[statusOf(it.id)] += 1;
  return c;
}
function renderStatusBar() {
  const c = counts();
  const total = state.round.items.length;
  const bar = $("#statusbar");
  const btn = $("#submit");
  bar.textContent = `第 ${state.index + 1} 張／共 ${total} 張 · 已標 OK ${c.ok} · 要修改 ${c.change} · 有疑問 ${c.question}`;
  bar.classList.remove("done");
  if (state.readonly) {
    btn.hidden = true;
    return;
  }
  if (c.pending > 0) {
    bar.textContent += ` · 還剩 ${c.pending} 張沒標狀態`;
    btn.textContent = `送出本輪回饋（還剩 ${c.pending} 張）`;
  } else if (c.ok === total) {
    bar.textContent = `全部 ${total} 張都 OK。按右上角「送出本輪回饋」就完成了。`;
    bar.classList.add("done");
    btn.textContent = "送出本輪回饋（全部 OK）";
  } else {
    bar.textContent += " · 全部標完了，可以送出";
    btn.textContent = "送出本輪回饋";
  }
}

// ---- 畫面 ----
function renderStrip() {
  const strip = $("#strip");
  strip.textContent = "";
  state.round.items.forEach((it, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `thumb${i === state.index ? " cur" : ""}`;
    b.title = it.title;
    const img = document.createElement("img");
    img.src = `/api/rounds/${roundId}/files/${it.screenshot}`;
    img.alt = "";
    img.loading = "lazy";
    const no = document.createElement("span"); no.className = "no"; no.textContent = String(i + 1);
    const dot = document.createElement("span"); dot.className = `dot ${statusOf(it.id)}`;
    const cap = document.createElement("span"); cap.className = "cap"; cap.textContent = it.title;
    b.append(img, no, dot, cap);
    b.addEventListener("click", () => go(i));
    strip.append(b);
  });
}

function renderPanel() {
  const it = item();
  const e = entry();
  $("#item-title").textContent = it.title;
  $("#item-meta").textContent = `${it.route}｜${it.viewport.width}×${it.viewport.height}`;
  $("#item-desc").textContent = it.description ?? "";
  for (const b of document.querySelectorAll(".vm")) b.addEventListener("click", () => { state.view = b.dataset.view; renderView(); });
$("#opacity").addEventListener("input", renderView);
for (const b of document.querySelectorAll(".st")) {
    b.classList.toggle("active", b.dataset.status === e.status);
    b.disabled = state.readonly;
  }
  const ta = $("#comment");
  if (document.activeElement !== ta) ta.value = e.comment;
  ta.disabled = state.readonly;
  renderAnnList();
}

function renderAnnList() {
  const list = $("#ann-list");
  list.textContent = "";
  const anns = entry().annotations;
  $("#ann-count").textContent = anns.length ? `（${anns.length}）` : "";
  $("#ann-empty").hidden = anns.length > 0;
  for (const a of anns) {
    const li = document.createElement("li");
    li.dataset.id = a.id;
    li.className = a.id === state.selectedId ? "sel" : "";
    const n = document.createElement("span"); n.className = "n"; n.textContent = String(a.n);
    const ty = document.createElement("span"); ty.className = "ty"; ty.textContent = TYPE_LABEL[a.type];
    const input = document.createElement("input");
    input.type = "text"; input.maxLength = 2000; input.value = a.text; input.placeholder = "這裡要改什麼？"; input.disabled = state.readonly;
    input.addEventListener("input", () => { a.text = input.value; scheduleSave(); });
    input.addEventListener("focus", () => select(a.id, false));
    const del = document.createElement("button");
    del.type = "button"; del.className = "btn del"; del.textContent = "刪除"; del.disabled = state.readonly;
    del.addEventListener("click", (ev) => { ev.stopPropagation(); removeAnn(a.id); });
    li.append(n, ty, input, del);
    li.addEventListener("click", () => select(a.id, false));
    list.append(li);
  }
}

function drawOverlay() {
  const anns = state.draft ? [...entry().annotations, state.draft] : entry().annotations;
  renderAll($("#overlay"), anns, state.size.w, state.size.h, state.selectedId);
}

function applyZoom() {
  const { w } = state.size;
  const vp = $("#viewport");
  if (!w) return;
  const avail = state.view === "side" ? (vp.clientWidth - 14) / 2 : vp.clientWidth - 2;
  let scale = state.zoom === "fit" ? Math.min(1, avail / w) : state.zoom;
  scale = Math.max(0.1, Math.min(4, scale));
  $("#canvas").style.width = `${Math.round(w * scale)}px`;
  $("#ref-side").style.width = `${Math.round(w * scale)}px`;
  $("#zoom-label").textContent = state.zoom === "fit" ? "符合寬度" : `${Math.round(scale * 100)}%`;
}
function currentScale() { return $("#canvas").clientWidth / state.size.w; }
function zoomBy(f) {
  state.zoom = Math.max(0.1, Math.min(4, currentScale() * f));
  applyZoom();
}

function renderView() {
  const ref = item().reference;
  if (!ref) state.view = "current";
  $("#view-modes").hidden = !ref;
  for (const b of document.querySelectorAll(".vm")) b.classList.toggle("active", b.dataset.view === state.view);
  $("#refcol").hidden = state.view !== "side";
  const over = $("#ref-over");
  over.hidden = state.view !== "overlay";
  over.className = "ref-over";
  $("#opacity-box").hidden = state.view !== "overlay";
  over.style.opacity = String($("#opacity").value / 100);
  if (ref) {
    const url = `/api/rounds/${roundId}/files/${ref}`;
    if ($("#ref-side").getAttribute("src") !== url) { $("#ref-side").src = url; over.src = url; }
  }
  applyZoom();
}

function renderTools() {
  for (const b of document.querySelectorAll(".tool")) {
    b.classList.toggle("active", b.dataset.tool === state.tool);
    b.disabled = state.readonly;
  }
  $("#canvas").classList.toggle("drawing", state.tool !== "select" && !state.readonly);
  $("#canvas").classList.toggle("readonly", state.readonly);
}

function refreshAll() {
  renderStrip(); renderPanel(); renderStatusBar(); renderTools(); renderView(); drawOverlay();
}

function go(i) {
  if (i < 0 || i >= state.round.items.length || i === state.index) return;
  state.index = i; state.selectedId = null; state.draft = null; state.view = "current";
  state.size = { w: 0, h: 0 };
  loadImage();
  refreshAll();
}

function loadImage() {
  const img = $("#shot");
  img.onload = () => {
    state.size = { w: img.naturalWidth, h: img.naturalHeight };
    applyZoom(); drawOverlay();
  };
  img.src = `/api/rounds/${roundId}/files/${item().screenshot}`;
}

// ---- 標注 ----
function select(id, scroll = true) {
  state.selectedId = id;
  drawOverlay();
  for (const li of document.querySelectorAll("#ann-list li")) {
    li.classList.toggle("sel", li.dataset.id === id);
    if (scroll && li.dataset.id === id) { li.scrollIntoView({ block: "nearest" }); li.querySelector("input")?.focus(); }
  }
}
function removeAnn(id) {
  const e = entry();
  e.annotations = e.annotations.filter((a) => a.id !== id);
  if (state.selectedId === id) state.selectedId = null;
  scheduleSave(); renderAnnList(); drawOverlay();
}
function nextNumber() { return entry().annotations.reduce((m, a) => Math.max(m, a.n), 0) + 1; }
function newId() { return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
function commit(a) {
  entry().annotations.push(a);
  state.draft = null; state.selectedId = a.id;
  scheduleSave(); renderAnnList(); drawOverlay(); renderStatusBar();
  document.querySelector(`#ann-list li[data-id="${a.id}"] input`)?.focus();
}

const svg = $("#overlay");
function point(ev) {
  const r = svg.getBoundingClientRect();
  const { w, h } = state.size;
  const cl = (v, max) => Math.max(0, Math.min(max, v));
  return { x: Math.round(cl((ev.clientX - r.left) / r.width * w, w)), y: Math.round(cl((ev.clientY - r.top) / r.height * h, h)) };
}
let origin = null;
svg.addEventListener("pointerdown", (ev) => {
  if (ev.button !== 0 || state.readonly) return;
  if (state.tool === "select") {
    const g = ev.target.closest?.("g[data-id]");
    select(g ? g.dataset.id : null);
    return;
  }
  const p = point(ev);
  origin = p;
  svg.setPointerCapture(ev.pointerId);
  const base = { id: "draft", n: nextNumber(), text: "" };
  switch (state.tool) {
    case "rect": state.draft = { ...base, type: "rect", x: p.x, y: p.y, w: 0, h: 0 }; break;
    case "arrow": state.draft = { ...base, type: "arrow", x1: p.x, y1: p.y, x2: p.x, y2: p.y }; break;
    case "pin": state.draft = { ...base, type: "pin", x: p.x, y: p.y }; break;
    case "path": state.draft = { ...base, type: "path", points: [[p.x, p.y]] }; break;
    default: break;
  }
  drawOverlay();
});
svg.addEventListener("pointermove", (ev) => {
  const d = state.draft;
  if (!d || !origin) return;
  const p = point(ev);
  if (d.type === "rect") Object.assign(d, { x: Math.min(origin.x, p.x), y: Math.min(origin.y, p.y), w: Math.abs(p.x - origin.x), h: Math.abs(p.y - origin.y) });
  else if (d.type === "arrow") Object.assign(d, { x2: p.x, y2: p.y });
  else if (d.type === "pin") Object.assign(d, { x: p.x, y: p.y });
  else if (d.type === "path") {
    const last = d.points[d.points.length - 1];
    if (Math.hypot(p.x - last[0], p.y - last[1]) >= 3 && d.points.length < 3000) d.points.push([p.x, p.y]);
  }
  drawOverlay();
});
function finish() {
  const d = state.draft;
  origin = null;
  if (!d) return;
  const tiny = (d.type === "rect" && (d.w < 6 || d.h < 6)) || (d.type === "arrow" && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 8) || (d.type === "path" && d.points.length < 3);
  if (tiny) { state.draft = null; drawOverlay(); return; }
  commit({ ...d, id: newId() });
}
svg.addEventListener("pointerup", finish);
svg.addEventListener("pointercancel", () => { state.draft = null; origin = null; drawOverlay(); });

// ---- 事件 ----
for (const b of document.querySelectorAll(".tool")) b.addEventListener("click", () => { state.tool = b.dataset.tool; renderTools(); });
function setStatus(s) {
  if (state.readonly) return;
  const e = entry();
  e.status = e.status === s ? "pending" : s;
  scheduleSave(); renderPanel(); renderStatusBar(); renderStrip();
}
for (const b of document.querySelectorAll(".vm")) b.addEventListener("click", () => { state.view = b.dataset.view; renderView(); });
$("#opacity").addEventListener("input", renderView);
for (const b of document.querySelectorAll(".st")) b.addEventListener("click", () => setStatus(b.dataset.status));
$("#comment").addEventListener("input", (ev) => { entry().comment = ev.target.value; scheduleSave(); });
$("#zoom-in").addEventListener("click", () => zoomBy(1.25));
$("#zoom-out").addEventListener("click", () => zoomBy(0.8));
$("#zoom-label").addEventListener("click", () => { state.zoom = state.zoom === "fit" ? 1 : "fit"; applyZoom(); });
window.addEventListener("resize", applyZoom);

document.addEventListener("keydown", (ev) => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const typing = ev.target instanceof HTMLElement && ev.target.matches("input, textarea");
  if (ev.key === "Escape") {
    if (typing) ev.target.blur();
    if (state.draft) { state.draft = null; origin = null; drawOverlay(); }
    else if (state.selectedId) select(null);
    else { state.tool = "select"; renderTools(); }
    return;
  }
  if (typing) return;
  if (ev.key === "ArrowLeft") { go(state.index - 1); ev.preventDefault(); }
  else if (ev.key === "ArrowRight") { go(state.index + 1); ev.preventDefault(); }
  else if (STATUS_KEYS[ev.key]) setStatus(STATUS_KEYS[ev.key]);
  else if (TOOLS[ev.key.toLowerCase()] && !state.readonly) { state.tool = TOOLS[ev.key.toLowerCase()]; renderTools(); }
  else if ((ev.key === "Delete" || ev.key === "Backspace") && state.selectedId && !state.readonly) { removeAnn(state.selectedId); ev.preventDefault(); }
});

// ---- 送出 ----
$("#submit").addEventListener("click", async () => {
  const c = counts();
  if (c.pending > 0 && !confirm(`還有 ${c.pending} 張沒標狀態，仍要送出嗎？（送出後這一輪就不能再改）`)) return;
  if (c.pending === 0 && !confirm("送出後這一輪就不能再改，確定嗎？")) return;
  dirty = true; await flush();
  $("#submit").disabled = true;
  setSaveState("送出中，正在產生標注截圖…");
  try {
    const res = await fetch(`/api/rounds/${roundId}/submit`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.errors?.join("；") ?? body.error ?? res.statusText);
    state.round.status = "submitted";
    state.readonly = true;
    setSaveState("已送出");
    showBanner(body.warnings?.length ? `已送出，但有警告：${body.warnings.join("；")}` : "已送出。請回到 agent，說「我送出回饋了」。");
    refreshAll();
  } catch (e) {
    $("#submit").disabled = false;
    setSaveState(`送出失敗：${e.message}`);
  }
});

function showBanner(text) { const b = $("#banner"); b.textContent = text; b.hidden = false; }

async function init() {
  const res = await fetch(`/api/rounds/${roundId}`);
  if (!res.ok) { $("#round-title").textContent = "找不到這一輪"; return; }
  const data = await res.json();
  state.round = data.round; state.fb = data.feedback;
  state.readonly = data.round.status !== "open";
  document.title = `回饋看板 ${data.round.id}`;
  $("#round-title").textContent = `輪次 ${data.round.id}`;
  if (data.round.summary.trim()) { $("#summary-text").textContent = data.round.summary.trim(); $("#summary-box").hidden = false; }
  if (state.readonly) showBanner(data.round.status === "resolved" ? "這一輪已送出，agent 也處理完了（唯讀）。" : "這一輪已送出（唯讀），等 agent 處理。");
  if (data.round.items.length === 0) { $("#round-title").textContent += "（沒有項目）"; return; }
  loadImage();
  refreshAll();
}
init();
