// Stop（show-me）規則：UI 在最新一輪截圖之後有修改就擋下。只比對時間戳記，不連 dev server。
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const UI_DIRS = ["src/app", "src/components"];
const CONFIG = "show-me.config.json";

function newestMtime(dir) {
  let newest = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const time = entry.isDirectory() ? newestMtime(full) : entry.isFile() ? statSync(full).mtimeMs : 0;
    if (time > newest) newest = time;
  }
  return newest;
}

/** 最新一輪的 createdAt（毫秒）；讀不到或格式錯誤的 round.json 視為不存在。沒有任何有效一輪回傳 0。 */
export function latestRoundTime(root) {
  const roundsDir = join(root, ".review", "rounds");
  let latest = 0;
  let names = [];
  try {
    names = readdirSync(roundsDir);
  } catch {
    return 0;
  }
  for (const name of names) {
    try {
      const created = JSON.parse(readFileSync(join(roundsDir, name, "round.json"), "utf8"))?.createdAt;
      const time = typeof created === "string" ? Date.parse(created) : Number.NaN;
      if (Number.isFinite(time) && time > latest) latest = time;
    } catch {
      // 當作沒有這一輪。
    }
  }
  return latest;
}

/** 回傳擋下原因；不需要擋則回傳 null。 */
export function checkShowMe(root) {
  const configPath = join(root, CONFIG);
  if (!existsSync(configPath)) return null;
  const changed = Math.max(statSync(configPath).mtimeMs, ...UI_DIRS.map((dir) => newestMtime(join(root, dir))));
  const latest = latestRoundTime(root);
  if (changed <= latest) return null;
  return [
    "UI 有變更但還沒截圖給使用者看（src/app、src/components 或 show-me.config.json 晚於最新一輪截圖）。",
    '請執行：pnpm show-me:capture --summary "<本輪摘要>"',
    "完成後把看板網址交給使用者。",
  ].join("\n");
}
