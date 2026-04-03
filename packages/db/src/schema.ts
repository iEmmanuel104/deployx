import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// users table
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),                    // ULID
  email: text("email").notNull().unique(),
  password: text("password").notNull(),           // bcrypt(12) hash
  name: text("name").notNull(),
  role: text("role").default("member").notNull(), // admin | member
  avatarUrl: text("avatar_url"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),                  // soft delete
});

// projects table
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  sourceType: text("source_type").notNull(),      // git | zip | image | cli
  gitRepo: text("git_repo"),
  gitBranch: text("git_branch").default("main"),
  buildType: text("build_type").default("nixpacks"), // nixpacks | railpack | dockerfile
  buildCmd: text("build_cmd"),
  startCmd: text("start_cmd"),
  port: integer("port").default(3000),
  status: text("status").default("idle").notNull(), // idle | building | running | stopped | error
  containerId: text("container_id"),
  imageTag: text("image_tag"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
});

// deployments table
export const deployments = sqliteTable("deployments", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  version: integer("version").notNull(),
  trigger: text("trigger").notNull(),             // git_push | cli | webhook | manual
  commitSha: text("commit_sha"),
  commitMsg: text("commit_msg"),
  imageTag: text("image_tag"),
  status: text("status").default("queued").notNull(), // queued | building | deploying | success | failed | cancelled
  buildLog: text("build_log"),
  errorMsg: text("error_msg"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  createdAt: text("created_at").notNull(),
});

// domains table
export const domains = sqliteTable("domains", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  domain: text("domain").notNull().unique(),
  isPrimary: integer("is_primary").default(0),
  sslStatus: text("ssl_status").default("pending"), // pending | active | error
  sslCertExp: text("ssl_cert_exp"),
  verifiedAt: text("verified_at"),
  createdAt: text("created_at").notNull(),
});

// env_vars table
export const envVars = sqliteTable("env_vars", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  key: text("key").notNull(),
  valueEnc: text("value_enc").notNull(),          // AES-256-GCM encrypted + base64
  iv: text("iv").notNull(),                       // base64 IV
  isBuild: integer("is_build").default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("env_vars_project_key_idx").on(table.projectId, table.key),
]);

// build_jobs table
export const buildJobs = sqliteTable("build_jobs", {
  id: text("id").primaryKey(),
  deploymentId: text("deployment_id").notNull().references(() => deployments.id),
  type: text("type").notNull(),                   // build | deploy | stop | restart
  status: text("status").default("pending").notNull(), // pending | running | done | failed
  payload: text("payload").notNull(),             // JSON
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
});

// metrics table (ring buffer, 7-day retention)
export const metrics = sqliteTable("metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: text("project_id").notNull(),
  ts: text("ts").notNull(),
  cpuPct: real("cpu_pct"),
  memMb: real("mem_mb"),
  memLimitMb: real("mem_limit_mb"),
  netRxKb: real("net_rx_kb"),
  netTxKb: real("net_tx_kb"),
  blkReadMb: real("blk_read_mb"),
  blkWriteMb: real("blk_write_mb"),
}, (table) => [
  index("idx_metrics_project_ts").on(table.projectId, table.ts),
]);

// api_tokens table
export const apiTokens = sqliteTable("api_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(), // SHA-256 of token
  lastUsedAt: text("last_used_at"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull(),
});
