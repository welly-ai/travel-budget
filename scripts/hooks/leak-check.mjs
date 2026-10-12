// 防外洩檢查：staged 內容不得出現真實公司名、客戶名、廠區代號等敏感詞。
// 敏感詞清單只存在本機 local-data/sensitive-terms.txt（不進 git），所以 repo 裡永遠不會出現清單本身。
// 一行一個詞，# 開頭為註解，不分大小寫，以「整個詞」比對（例如 QXP 不會命中 workspaceqxpx）。
// 不自動從真實 Excel 版面抽詞：版面裡大多是通用欄名（例如 A build date），會大量誤判；
// 含敏感縮寫的標籤（例如 …@ZZQ）會被清單裡的詞抓到。
// 清單不存在時（例如 CI、剛 clone 的機器）只提醒、不擋。
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const TERMS_FILE = "local-data/sensitive-terms.txt";

/** 讀本機的敏感詞清單。回傳 { terms, sources }；清單不存在時 sources 為空。 */
export function loadSensitiveTerms(root) {
  const path = resolve(root, TERMS_FILE);
  if (!existsSync(path)) return { terms: [], sources: [] };
  const terms = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  return { terms, sources: [TERMS_FILE] };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 詞的前後若是英數字，就要求邊界不是英數字；符號開頭或結尾（例如 @ZZQ）則不加邊界。 */
function termPattern(term) {
  const head = /^[\p{L}\p{N}_]/u.test(term) ? "(?<![\\p{L}\\p{N}_])" : "";
  const tail = /[\p{L}\p{N}_]$/u.test(term) ? "(?![\\p{L}\\p{N}_])" : "";
  return new RegExp(`${head}${escapeRegExp(term)}${tail}`, "iu");
}

/**
 * 在文字中找敏感詞。純函式。
 * @returns {{ term: string, line: number }[]}
 */
export function findSensitiveTerms(text, terms) {
  const patterns = terms.map((term) => [term, termPattern(term)]);
  const hits = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const [term, pattern] of patterns) if (pattern.test(line)) hits.push({ term, line: index + 1 });
  });
  return hits;
}
