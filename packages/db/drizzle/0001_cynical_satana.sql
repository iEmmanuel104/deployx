PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`response_hash` text NOT NULL,
	`status_code` integer NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `__new_api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`last_used_at` text,
	`expires_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_api_tokens`("id", "user_id", "name", "token_hash", "last_used_at", "expires_at", "created_at") SELECT "id", "user_id", "name", "token_hash", "last_used_at", "expires_at", "created_at" FROM `api_tokens`;--> statement-breakpoint
DROP TABLE `api_tokens`;--> statement-breakpoint
ALTER TABLE `__new_api_tokens` RENAME TO `api_tokens`;--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `__new_build_jobs` (
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
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_build_jobs`("id", "deployment_id", "type", "status", "payload", "attempts", "max_attempts", "error", "created_at", "started_at", "finished_at") SELECT "id", "deployment_id", "type", "status", "payload", "attempts", "max_attempts", "error", "created_at", "started_at", "finished_at" FROM `build_jobs`;--> statement-breakpoint
DROP TABLE `build_jobs`;--> statement-breakpoint
ALTER TABLE `__new_build_jobs` RENAME TO `build_jobs`;--> statement-breakpoint
CREATE INDEX `idx_build_jobs_status_type` ON `build_jobs` (`status`,`type`);--> statement-breakpoint
CREATE TABLE `__new_deployments` (
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
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_deployments`("id", "project_id", "version", "trigger", "commit_sha", "commit_msg", "image_tag", "status", "build_log", "error_msg", "started_at", "finished_at", "created_at") SELECT "id", "project_id", "version", "trigger", "commit_sha", "commit_msg", "image_tag", "status", "build_log", "error_msg", "started_at", "finished_at", "created_at" FROM `deployments`;--> statement-breakpoint
DROP TABLE `deployments`;--> statement-breakpoint
ALTER TABLE `__new_deployments` RENAME TO `deployments`;--> statement-breakpoint
CREATE INDEX `idx_deployments_project_id` ON `deployments` (`project_id`);--> statement-breakpoint
CREATE TABLE `__new_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`domain` text NOT NULL,
	`is_primary` integer DEFAULT 0,
	`ssl_status` text DEFAULT 'pending',
	`ssl_cert_exp` text,
	`verified_at` text,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_domains`("id", "project_id", "domain", "is_primary", "ssl_status", "ssl_cert_exp", "verified_at", "created_at", "deleted_at") SELECT "id", "project_id", "domain", "is_primary", "ssl_status", "ssl_cert_exp", "verified_at", "created_at", NULL FROM `domains`;--> statement-breakpoint
DROP TABLE `domains`;--> statement-breakpoint
ALTER TABLE `__new_domains` RENAME TO `domains`;--> statement-breakpoint
CREATE UNIQUE INDEX `domains_domain_unique` ON `domains` (`domain`);--> statement-breakpoint
CREATE INDEX `idx_domains_project_id` ON `domains` (`project_id`);--> statement-breakpoint
CREATE TABLE `__new_env_vars` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`key` text NOT NULL,
	`value_enc` text NOT NULL,
	`iv` text NOT NULL,
	`is_build` integer DEFAULT 0,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_env_vars`("id", "project_id", "key", "value_enc", "iv", "is_build", "created_at", "updated_at") SELECT "id", "project_id", "key", "value_enc", "iv", "is_build", "created_at", "updated_at" FROM `env_vars`;--> statement-breakpoint
DROP TABLE `env_vars`;--> statement-breakpoint
ALTER TABLE `__new_env_vars` RENAME TO `env_vars`;--> statement-breakpoint
CREATE UNIQUE INDEX `env_vars_project_key_idx` ON `env_vars` (`project_id`,`key`);--> statement-breakpoint
CREATE INDEX `idx_env_vars_project_id` ON `env_vars` (`project_id`);--> statement-breakpoint
CREATE TABLE `__new_projects` (
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
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_projects`("id", "user_id", "name", "slug", "description", "source_type", "git_repo", "git_branch", "build_type", "build_cmd", "start_cmd", "port", "status", "container_id", "image_tag", "created_at", "updated_at", "deleted_at") SELECT "id", "user_id", "name", "slug", "description", "source_type", "git_repo", "git_branch", "build_type", "build_cmd", "start_cmd", "port", "status", "container_id", "image_tag", "created_at", "updated_at", "deleted_at" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_projects_user_id` ON `projects` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `failed_login_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `locked_until` text;--> statement-breakpoint
ALTER TABLE `users` ADD `token_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=ON;