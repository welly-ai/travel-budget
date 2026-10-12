import { renderAll } from "/static/render.js";
const [, , roundId, itemId] = location.pathname.split("/");
window.__ready = false;
try {
  const data = await (await fetch(`/api/rounds/${roundId}`)).json();
  const item = data.round.items.find((i) => i.id === itemId);
  const entry = data.feedback.items[itemId];
  const img = document.getElementById("shot");
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = `/api/rounds/${roundId}/files/${item.screenshot}`; });
  const w = img.naturalWidth, h = img.naturalHeight;
  img.width = w; img.height = h;
  const svg = document.getElementById("overlay");
  renderAll(svg, entry ? entry.annotations : [], w, h, null);
  window.__size = { w, h };
  window.__ready = true;
} catch (e) { window.__error = String(e); }
