CREATE TABLE `content_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`week_plan_id` integer NOT NULL,
	`type` text NOT NULL,
	`pillar_id` integer,
	`topic` text DEFAULT '' NOT NULL,
	`main_keyword` text,
	`angle` text DEFAULT '' NOT NULL,
	`social_format` text,
	`publish_date` text NOT NULL,
	`status` text DEFAULT 'idea' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`research_pack_id` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`week_plan_id`) REFERENCES `week_plan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pillar_id`) REFERENCES `pillar`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`research_pack_id`) REFERENCES `research_pack`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `content_item_week` ON `content_item` (`week_plan_id`,`publish_date`);--> statement-breakpoint
CREATE INDEX `content_item_ws_created` ON `content_item` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `fact_card` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`research_pack_id` integer NOT NULL,
	`source_id` integer NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`needs_check` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`research_pack_id`) REFERENCES `research_pack`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `source`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fact_card_pack` ON `fact_card` (`research_pack_id`);--> statement-breakpoint
CREATE INDEX `fact_card_source` ON `fact_card` (`source_id`);--> statement-breakpoint
CREATE TABLE `research_pack` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`week_plan_id` integer NOT NULL,
	`pillar_id` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`queries` text DEFAULT '[]' NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`week_plan_id`) REFERENCES `week_plan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pillar_id`) REFERENCES `pillar`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_pack_week_pillar` ON `research_pack` (`week_plan_id`,`pillar_id`);--> statement-breakpoint
CREATE TABLE `source` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`research_pack_id` integer NOT NULL,
	`url` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`domain` text DEFAULT '' NOT NULL,
	`origin` text DEFAULT 'auto' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`fetched_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`research_pack_id`) REFERENCES `research_pack`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_pack_url` ON `source` (`research_pack_id`,`url`);--> statement-breakpoint
CREATE TABLE `week_plan` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`week_start` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`locked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `week_plan_ws_week` ON `week_plan` (`workspace_id`,`week_start`);--> statement-breakpoint
ALTER TABLE `ai_usage` ADD `credits` integer;