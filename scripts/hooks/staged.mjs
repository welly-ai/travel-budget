// pre-commit 的 staged 路徑規則（純函式，方便測試）。
/** @param {readonly string[]} paths  git 回報的路徑（正斜線）。回傳違規說明清單。 */
export function checkStagedPaths(paths) {
  const problems = [];
  for (const raw of paths) {
    const path = raw.replace(/\\/g, "/");
    const lower = path.toLowerCase();
    if ((lower === "local-data" || lower.startsWith("local-data/")) && lower !== "local-data/readme.md") {
      problems.push(`${path}：local-data/ 是真實公司資料，不得提交`);
    } else if (/\.(xlsx|xlsm)$/.test(lower) && !lower.startsWith("tests/fixtures/synthetic/")) {
      problems.push(`${path}：Excel 檔只允許放在 tests/fixtures/synthetic/（合成資料）`);
    } else if (/\.db$/.test(lower)) {
      problems.push(`${path}：資料庫檔不得提交`);
    }
  }
  return problems;
}
