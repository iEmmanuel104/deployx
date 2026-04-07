CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`last_used_at` text,
	`expires_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `build_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`deployment_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text NOT NULL,
	`attempts` integer DEFAULT 0,
	`max_attempts` integer DEFAULT 3,
	`error` text,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version` integer NOT NULL,
	`trigger` text NOT NULL,
	`commit_sha` text,
	`commit_msg` text,
	`image_tag` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`build_log` text,
	`error_msg` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `domains` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`domain` text NOT NULL,
	`is_primary` integer DEFAULT 0,
	`ssl_status` text DEFAULT 'pending',
	`ssl_cert_exp` text,
	`verified_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `domains_domain_unique` ON `domains` (`domain`);--> statement-breakpoint
CREATE TABLE `env_vars` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`key` text NOT NULL,
	`value_enc` text NOT NULL,
	`iv` text NOT NULL,
	`is_build` integer DEFAULT 0,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `env_vars_project_key_idx` ON `env_vars` (`project_id`,`key`);--> statement-breakpoint
CREATE TABLE `metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`ts` text NOT NULL,
	`cpu_pct` real,
	`mem_mb` real,
	`mem_limit_mb` real,
	`net_rx_kb` real,
	`net_tx_kb` real,
	`blk_read_mb` real,
	`blk_write_mb` real
);
--> statement-breakpoint
CREATE INDEX `idx_metrics_project_ts` ON `metrics` (`project_id`,`ts`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`source_type` text NOT NULL,
	`git_repo` text,
	`git_branch` text DEFAULT 'main',
	`build_type` text DEFAULT 'nixpacks',
	`build_cmd` text,
	`start_cmd` text,
	`port` integer DEFAULT 3000,
	`status` text DEFAULT 'idle' NOT NULL,
	`container_id` text,
	`image_tag` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`avatar_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);