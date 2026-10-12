// 標注的 SVG 繪製。看板與「產生標注後截圖」的渲染頁共用同一份，兩邊畫出來才會一致。
const NS = "http://www.w3.org/2000/svg";
const RED = "#D93030";
const HALO = "#FDDA5A";

function el(name, attrs, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

// 線寬與圖釘大小依截圖寬度換算，看起來在不同尺寸的截圖上都差不多。
export function unitFor(width) {
  return Math.max(3, Math.round(width / 300));
}

export function anchorOf(a) {
  switch (a.type) {
    case "rect":
    case "pin":
      return { x: a.x, y: a.y };
    case "arrow":
      return { x: a.x1, y: a.y1 };
    case "path":
      return { x: a.points[0]?.[0] ?? 0, y: a.points[0]?.[1] ?? 0 };
    default:
      return { x: 0, y: 0 };
  }
}

function badge(g, a, u) {
  const { x, y } = anchorOf(a);
  const radius = u * 3.6;
  el("circle", { cx: x, cy: y, r: radius, fill: RED, stroke: "#fff", "stroke-width": u * 0.6 }, g);
  const t = el("text", { x, y, "text-anchor": "middle", "dominant-baseline": "central", fill: "#fff", "font-size": u * 4.2, "font-weight": 700, "font-family": "sans-serif" }, g);
  t.textContent = String(a.n);
}

function strokeShape(name, attrs, g, u, selected) {
  if (selected) el(name, { ...attrs, fill: "none", stroke: HALO, "stroke-width": u * 3.6, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.9 }, g);
  const main = el(name, { ...attrs, stroke: RED, "stroke-width": u, "stroke-linecap": "round", "stroke-linejoin": "round", fill: attrs.fill ?? "none" }, g);
  // 選取模式下點線條附近就能選到
  el(name, { ...attrs, fill: "none", stroke: "transparent", "stroke-width": u * 5, "pointer-events": "stroke" }, g);
  return main;
}

export function buildShape(a, u, selected) {
  const g = document.createElementNS(NS, "g");
  g.setAttribute("data-id", a.id);
  switch (a.type) {
    case "rect":
      strokeShape("rect", { x: a.x, y: a.y, width: a.w, height: a.h, fill: "rgba(217,48,48,0.08)" }, g, u, selected);
      break;
    case "arrow": {
      const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
      const len = u * 5;
      const left = [a.x2 - len * Math.cos(angle - 0.45), a.y2 - len * Math.sin(angle - 0.45)];
      const right = [a.x2 - len * Math.cos(angle + 0.45), a.y2 - len * Math.sin(angle + 0.45)];
      strokeShape("line", { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 }, g, u, selected);
      strokeShape("polyline", { points: `${left.join(",")} ${a.x2},${a.y2} ${right.join(",")}` }, g, u, selected);
      break;
    }
    case "path":
      strokeShape("polyline", { points: a.points.map((p) => p.join(",")).join(" ") }, g, u, selected);
      break;
    case "pin":
      if (selected) el("circle", { cx: a.x, cy: a.y, r: u * 5.6, fill: HALO, opacity: 0.9 }, g);
      break;
    default:
      break;
  }
  badge(g, a, u);
  return g;
}

export function renderAll(svg, annotations, width, height, selectedId) {
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const u = unitFor(width);
  // 被選取的畫在最上層
  const ordered = [...annotations].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId));
  for (const a of ordered) svg.appendChild(buildShape(a, u, a.id === selectedId));
}
