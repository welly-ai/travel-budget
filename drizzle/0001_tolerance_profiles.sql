CREATE TABLE `tolerance_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`max_increase_pct` real NOT NULL,
	`max_decrease_pct` real NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tolerance_profiles_name_idx` ON `tolerance_profiles` (`name`);