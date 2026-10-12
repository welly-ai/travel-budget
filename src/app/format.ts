const timeFormat = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** ISO 時間字串 → 「2031/01/01 08:00」（台北時間）。 */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** 人次、人天：最多一位小數，整數不帶小數點。 */
export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
