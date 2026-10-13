-- 預設容許範圍設定（±30%）。專案的 toleranceProfileId 為 null 時用它；id 對應 DEFAULT_TOLERANCE_PROFILE_ID。
INSERT OR IGNORE INTO `tolerance_profiles` (`id`, `name`, `max_increase_pct`, `max_decrease_pct`, `version`, `updated_by`, `updated_at`)
VALUES ('default', '預設（±30%）', 30, 30, 1, NULL, unixepoch() * 1000);
