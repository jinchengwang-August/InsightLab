ALTER TABLE `profiles` ADD `auth_id` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `headline` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `bio` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `location` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `website` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `avatar_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_auth_id_unique` ON `profiles` (`auth_id`);