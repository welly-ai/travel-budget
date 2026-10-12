// 路徑安全：所有來自請求、設定檔或 JSON 的名稱，一律先過這裡才能組成檔案路徑。
import fs from "node:fs";
import path from "node:path";

export class UnsafePathError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsafePathError";
  }
}

// 單一路徑片段：不含分隔符號（/ \）、冒號、控制字元，不以點開頭，不含連續兩個點。
const NAME = /^[\p{L}\p{N}][\p{L}\p{N}._ -]*$/u;
// 輪次 id、item id：只允許 ASCII。
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function isSafeName(name) {
  return typeof name === "string" && name.length > 0 && name.length <= 128 && NAME.test(name) && !name.includes("..") && !name.endsWith(".") && !name.endsWith(" ");
}

export function isSafeId(id) {
  return typeof id === "string" && ID.test(id);
}

export function assertSafeName(name, label = "名稱") {
  if (!isSafeName(name)) throw new UnsafePathError(`${label}不合法：${JSON.stringify(name)}`);
  return name;
}

export function assertSafeId(id, label = "id") {
  if (!isSafeId(id)) throw new UnsafePathError(`${label}不合法：${JSON.stringify(id)}`);
  return id;
}

// 把 root 底下的子路徑組出來；每個片段都必須是安全名稱，且結果（含符號連結）不得跑出 root。
export function resolveInside(root, ...names) {
  const parts = names.map((n) => assertSafeName(n));
  const base = path.resolve(root);
  const full = path.join(base, ...parts);
  const rel = path.relative(base, full);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) throw new UnsafePathError("路徑跑出允許範圍");
  let real = full;
  try {
    real = fs.realpathSync(full);
  } catch {
    return full; // 尚不存在（要新建的檔案），名稱已驗證過
  }
  const realBase = fs.realpathSync(base);
  const realRel = path.relative(realBase, real);
  if (realRel.startsWith("..") || path.isAbsolute(realRel)) throw new UnsafePathError("符號連結指向允許範圍之外");
  return full;
}

// repo 內的任意相對路徑（例如設定檔裡的參考圖 local-data/…）。
// 接受 / 或 \ 分隔；拒絕絕對路徑、磁碟機代號、.. 與符號連結跑出 root。
const BAD_CHARS = /[\u0000-\u001f<>:"|?*]/;
export function resolveRepoFile(root, rel) {
  if (typeof rel !== "string" || rel.length === 0 || rel.length > 400) throw new UnsafePathError(`路徑不合法：${JSON.stringify(rel)}`);
  if (rel.startsWith("/") || rel.startsWith("\\") || /^[A-Za-z]:/.test(rel)) throw new UnsafePathError(`不可使用絕對路徑：${rel}`);
  const parts = rel.split(/[\\/]/);
  for (const p of parts) {
    if (p === "" || p === "." || p === ".." || BAD_CHARS.test(p) || p.endsWith(" ") || p.endsWith(".")) throw new UnsafePathError(`路徑不合法：${rel}`);
  }
  const base = path.resolve(root);
  const full = path.join(base, ...parts);
  const realBase = fs.realpathSync(base);
  let real;
  try {
    real = fs.realpathSync(full);
  } catch {
    throw new UnsafePathError(`找不到檔案：${rel}`);
  }
  const relReal = path.relative(realBase, real);
  if (relReal === "" || relReal.startsWith("..") || path.isAbsolute(relReal)) throw new UnsafePathError(`路徑必須在 repo 內：${rel}`);
  return real;
}
