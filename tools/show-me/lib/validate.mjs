// 手寫驗證（行為等同 Zod parse：回傳清理過的新物件，多餘欄位丟掉，形狀不對就回報所有錯誤）。
import { isSafeId } from "./paths.mjs";

export const STATUSES = ["pending", "ok", "change", "question"];
export const ANNOTATION_TYPES = ["rect", "arrow", "pin", "path"];
export const LIMITS = { comment: 5000, annotationText: 2000, annotations: 200, pathPoints: 3000, coord: 100000 };

export const REF_FILE = /^[A-Za-z0-9][A-Za-z0-9_-]*\.ref\.(png|jpg|jpeg|webp)$/;
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

function coord(v, where, errors) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > LIMITS.coord) {
    errors.push(`${where} 必須是 0～${LIMITS.coord} 的數字`);
    return 0;
  }
  return Math.round(v * 10) / 10;
}

function str(v, max, where, errors, { optional = false } = {}) {
  if (v === undefined && optional) return "";
  if (typeof v !== "string") {
    errors.push(`${where} 必須是字串`);
    return "";
  }
  if (v.length > max) {
    errors.push(`${where} 超過 ${max} 字`);
    return "";
  }
  return v;
}

function validateAnnotation(a, where, errors) {
  if (!isObj(a)) {
    errors.push(`${where} 必須是物件`);
    return null;
  }
  const id = a["id"];
  if (!isSafeId(id)) errors.push(`${where}.id 不合法`);
  const n = a["n"];
  if (!Number.isInteger(n) || n < 1 || n > 9999) errors.push(`${where}.n 必須是正整數`);
  const text = str(a["text"], LIMITS.annotationText, `${where}.text`, errors, { optional: true });
  const base = { id: String(id), n: Number(n), text };
  const type = a["type"];
  switch (type) {
    case "rect":
      return { ...base, type, x: coord(a["x"], `${where}.x`, errors), y: coord(a["y"], `${where}.y`, errors), w: coord(a["w"], `${where}.w`, errors), h: coord(a["h"], `${where}.h`, errors) };
    case "arrow":
      return { ...base, type, x1: coord(a["x1"], `${where}.x1`, errors), y1: coord(a["y1"], `${where}.y1`, errors), x2: coord(a["x2"], `${where}.x2`, errors), y2: coord(a["y2"], `${where}.y2`, errors) };
    case "pin":
      return { ...base, type, x: coord(a["x"], `${where}.x`, errors), y: coord(a["y"], `${where}.y`, errors) };
    case "path": {
      const pts = a["points"];
      if (!Array.isArray(pts) || pts.length < 1 || pts.length > LIMITS.pathPoints) {
        errors.push(`${where}.points 必須是 1～${LIMITS.pathPoints} 個點`);
        return { ...base, type, points: [] };
      }
      const points = pts.map((p, i) => {
        if (!Array.isArray(p) || p.length !== 2) {
          errors.push(`${where}.points[${i}] 必須是 [x, y]`);
          return [0, 0];
        }
        return [coord(p[0], `${where}.points[${i}][0]`, errors), coord(p[1], `${where}.points[${i}][1]`, errors)];
      });
      return { ...base, type, points };
    }
    default:
      errors.push(`${where}.type 必須是 ${ANNOTATION_TYPES.join("／")}`);
      return null;
  }
}

// itemIds：該輪合法的 item id；未提供時只檢查 id 格式。
export function validateFeedback(input, { itemIds } = {}) {
  const errors = [];
  if (!isObj(input)) return { ok: false, errors: ["payload 必須是物件"] };
  if (input["schemaVersion"] !== 1) errors.push("schemaVersion 必須是 1");
  const rawItems = input["items"];
  const items = {};
  if (!isObj(rawItems)) {
    errors.push("items 必須是物件");
  } else {
    for (const [itemId, entry] of Object.entries(rawItems)) {
      const where = `items.${itemId}`;
      if (!isSafeId(itemId)) {
        errors.push(`${where}：item id 不合法`);
        continue;
      }
      if (itemIds && !itemIds.includes(itemId)) {
        errors.push(`${where}：本輪沒有這個 item`);
        continue;
      }
      if (!isObj(entry)) {
        errors.push(`${where} 必須是物件`);
        continue;
      }
      const status = entry["status"];
      if (!STATUSES.includes(status)) errors.push(`${where}.status 必須是 ${STATUSES.join("／")}`);
      const comment = str(entry["comment"], LIMITS.comment, `${where}.comment`, errors, { optional: true });
      const rawAnn = entry["annotations"];
      const annotations = [];
      if (rawAnn === undefined) {
        // 視為沒有標注
      } else if (!Array.isArray(rawAnn) || rawAnn.length > LIMITS.annotations) {
        errors.push(`${where}.annotations 必須是最多 ${LIMITS.annotations} 筆的陣列`);
      } else {
        const seen = new Set();
        rawAnn.forEach((a, i) => {
          const parsed = validateAnnotation(a, `${where}.annotations[${i}]`, errors);
          if (!parsed) return;
          if (seen.has(parsed.id)) errors.push(`${where}.annotations[${i}].id 重複`);
          seen.add(parsed.id);
          annotations.push(parsed);
        });
      }
      items[itemId] = { status, comment, annotations };
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { schemaVersion: 1, items } };
}

export function validateRound(input) {
  const errors = [];
  if (!isObj(input)) return { ok: false, errors: ["round.json 必須是物件"] };
  if (input["schemaVersion"] !== 1) errors.push("schemaVersion 必須是 1");
  if (!isSafeId(input["id"])) errors.push("id 不合法");
  if (!["open", "submitted", "resolved"].includes(String(input["status"]))) errors.push("status 不合法");
  if (typeof input["createdAt"] !== "string") errors.push("createdAt 必須是字串");
  if (typeof input["gitSha"] !== "string") errors.push("gitSha 必須是字串");
  if (typeof input["summary"] !== "string") errors.push("summary 必須是字串");
  const items = input["items"];
  if (!Array.isArray(items)) {
    errors.push("items 必須是陣列");
  } else {
    items.forEach((it, i) => {
      if (!isObj(it)) return void errors.push(`items[${i}] 必須是物件`);
      if (!isSafeId(it["id"])) errors.push(`items[${i}].id 不合法`);
      if (typeof it["title"] !== "string") errors.push(`items[${i}].title 必須是字串`);
      if (typeof it["screenshot"] !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*\.png$/.test(it["screenshot"])) errors.push(`items[${i}].screenshot 必須是 .png 檔名`);
      if (it["reference"] !== undefined && (typeof it["reference"] !== "string" || !REF_FILE.test(it["reference"]))) errors.push(`items[${i}].reference 必須是圖檔檔名`);
      const vp = it["viewport"];
      if (!isObj(vp) || !Number.isInteger(vp["width"]) || !Number.isInteger(vp["height"])) errors.push(`items[${i}].viewport 需要整數 width／height`);
    });
    const ids = items.map((it) => (isObj(it) ? it["id"] : undefined));
    if (new Set(ids).size !== ids.length) errors.push("items 的 id 不可重複");
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input };
}
