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
  const terms = decodeTermsFile(readFileSync(path))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  return { terms, sources: [TERMS_FILE] };
}

/**
 * 依 BOM 解碼清單。Windows PowerShell 5.1 的 `>`／Out-File 預設寫出 UTF-16LE；
 * 若照 UTF-8 讀，每個詞都夾著 NUL，永遠比對不到，檢查會靜默放行。
 * 沒有 BOM 卻含 NUL 時，無法確定編碼，直接報錯，不能當作通過。
 */
export function decodeTermsFile(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString("utf16le");
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  if (buffer.includes(0)) {
    throw new Error(`${TERMS_FILE} 含 NUL 位元組但沒有 BOM，無法判斷編碼；請存成 UTF-8（例如 PowerShell 用 Set-Content -Encoding utf8）`);
  }
  const text = buffer.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 邊界只對 ASCII 英數字有意義：詞的開頭（結尾）若是英數字，前（後）一個字元就不能是英數字。
 * 中文等沒有詞界的文字，以及符號開頭（例如 @ZZQ），一律用子字串比對。
 */
function termPattern(term) {
  const head = /^[A-Za-z0-9_]/.test(term) ? "(?<![A-Za-z0-9_])" : "";
  const tail = /[A-Za-z0-9_]$/.test(term) ? "(?![A-Za-z0-9_])" : "";
  return new RegExp(`${head}${escapeRegExp(term)}${tail}`, "iu");
}

/**
 * 在文字中找敏感詞。純函式。
 * 回傳的 termIndex 是詞在清單中的位置（從 1 起算）。對外訊息只印檔名、行號與 termIndex，
 * 不印詞本身：hook 輸出會進到 agent 的對話紀錄，印出來等於再外洩一次。
 * @returns {{ term: string, termIndex: number, line: number }[]}
 */
export function findSensitiveTerms(text, terms) {
  const patterns = terms.map((term, index) => [term, index + 1, termPattern(term)]);
  const hits = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const [term, termIndex, pattern] of patterns) if (pattern.test(line)) hits.push({ term, termIndex, line: index + 1 });
  });
  return hits;
}
