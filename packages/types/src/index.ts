import { z } from "zod";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const UserRoleSchema = z.enum(["admin", "member"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const ProjectStatusSchema = z.enum([
  "idle",
  "building",
  "running",
  "stopped",
  "error",
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const DeploymentStatusSchema = z.enum([
  "queued",
  "building",
  "deploying",
  "success",
  "failed",
  "cancelled",
]);
export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;

export const DeploymentTriggerSchema = z.enum([
  "git_push",
  "cli",
  "webhook",
  "manual",
]);
export type DeploymentTrigger = z.infer<typeof DeploymentTriggerSchema>;

export const BuildJobStatusSchema = z.enum([
  "pending",
  "running",
  "done",
  "failed",
]);
export type BuildJobStatus = z.infer<typeof BuildJobStatusSchema>;

export const BuildJobTypeSchema = z.enum([
  "build",
  "deploy",
  "stop",
  "restart",
]);
export type BuildJobType = z.infer<typeof BuildJobTypeSchema>;

export const SourceTypeSchema = z.enum(["git", "zip", "image", "cli"]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const BuildTypeSchema = z.enum([
  "nixpacks",
  "railpack",
  "dockerfile",
]);
export type BuildType = z.infer<typeof BuildTypeSchema>;

export const SslStatusSchema = z.enum(["pending", "active", "error"]);
export type SslStatus = z.infer<typeof SslStatusSchema>;

// ─── Table Schemas ───────────────────────────────────────────────────────────

export const UserSchema = z.object({
  id: z.string().describe("ULID primary key"),
  email: z.string().email(),
  password: z.string().min(1).describe("bcrypt12 hash"),
  name: z.string().min(1),
  role: UserRoleSchema.default("member"),
  avatar_url: z.string().url().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type User = z.infer<typeof UserSchema>;

export const ProjectSchema = z.object({
  id: z.string().describe("ULID primary key"),
  user_id: z.string().min(1),
  name: z.string().min(1).describe("Unique per user"),
  slug: z.string().min(1).describe("URL-safe, unique, used for subdomains"),
  description: z.string().nullable().optional(),
  source_type: SourceTypeSchema,
  git_repo: z.string().nullable().optional(),
  git_branch: z.string().default("main"),
  build_type: BuildTypeSchema.default("nixpacks"),
  build_cmd: z.string().nullable().optional(),
  start_cmd: z.string().nullable().optional(),
  port: z.number().int().positive().default(3000),
  status: ProjectStatusSchema.default("idle"),
  container_id: z.string().nullable().optional(),
  image_tag: z.string().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const DeploymentSchema = z.object({
  id: z.string().describe("ULID primary key"),
  project_id: z.string().min(1),
  version: z.number().int().positive().describe("Monotonically increasing"),
  trigger: DeploymentTriggerSchema,
  commit_sha: z.string().nullable().optional(),
  commit_msg: z.string().nullable().optional(),
  image_tag: z.string().nullable().optional(),
  status: DeploymentStatusSchema.default("queued"),
  build_log: z.string().nullable().optional(),
  error_msg: z.string().nullable().optional(),
  started_at: z.string().datetime().nullable().optional(),
  finished_at: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime(),
});
export type Deployment = z.infer<typeof DeploymentSchema>;

export const DomainSchema = z.object({
  id: z.string().describe("ULID primary key"),
  project_id: z.string().min(1),
  domain: z.string().min(1).describe("Globally unique"),
  is_primary: z.number().int().min(0).max(1).default(0),
  ssl_status: SslStatusSchema.default("pending"),
  ssl_cert_exp: z.string().datetime().nullable().optional(),
  verified_at: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime(),
});
export type Domain = z.infer<typeof DomainSchema>;

export const EnvVarSchema = z.object({
  id: z.string().describe("ULID primary key"),
  project_id: z.string().min(1),
  key: z.string().min(1),
  value_enc: z.string().min(1).describe("AES-256-GCM encrypted"),
  iv: z.string().min(1).describe("Base64-encoded initialization vector"),
  is_build: z.number().int().min(0).max(1).default(0),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type EnvVar = z.infer<typeof EnvVarSchema>;

export const BuildJobSchema = z.object({
  id: z.string().describe("ULID primary key"),
  deployment_id: z.string().min(1),
  type: BuildJobTypeSchema,
  status: BuildJobStatusSchema.default("pending"),
  payload: z.string().min(1).describe("JSON-encoded payload"),
  attempts: z.number().int().nonnegative().default(0),
  max_attempts: z.number().int().positive().default(3),
  error: z.string().nullable().optional(),
  created_at: z.string().datetime(),
  started_at: z.string().datetime().nullable().optional(),
  finished_at: z.string().datetime().nullable().optional(),
});
export type BuildJob = z.infer<typeof BuildJobSchema>;

export const MetricSchema = z.object({
  id: z.number().int().positive().describe("AUTOINCREMENT primary key"),
  project_id: z.string().min(1),
  ts: z.string().datetime().describe("ISO timestamp, 5s intervals"),
  cpu_pct: z.number().min(0).max(100),
  mem_mb: z.number().nonnegative(),
  mem_limit_mb: z.number().nonnegative(),
  net_rx_kb: z.number().nonnegative(),
  net_tx_kb: z.number().nonnegative(),
  blk_read_mb: z.number().nonnegative(),
  blk_write_mb: z.number().nonnegative(),
});
export type Metric = z.infer<typeof MetricSchema>;

export const ApiTokenSchema = z.object({
  id: z.string().describe("ULID primary key"),
  user_id: z.string().min(1),
  name: z.string().min(1),
  token_hash: z.string().min(1).describe("SHA-256 hash, globally unique"),
  last_used_at: z.string().datetime().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime(),
});
export type ApiToken = z.infer<typeof ApiTokenSchema>;

// ─── Insert Schemas (omit auto-generated fields) ────────────────────────────

export const InsertUserSchema = UserSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});
export type InsertUser = z.infer<typeof InsertUserSchema>;

export const InsertProjectSchema = ProjectSchema.omit({
  id: true,
  container_id: true,
  image_tag: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});
export type InsertProject = z.infer<typeof InsertProjectSchema>;

export const InsertDeploymentSchema = DeploymentSchema.omit({
  id: true,
  started_at: true,
  finished_at: true,
  created_at: true,
});
export type InsertDeployment = z.infer<typeof InsertDeploymentSchema>;

export const InsertDomainSchema = DomainSchema.omit({
  id: true,
  ssl_cert_exp: true,
  verified_at: true,
  created_at: true,
});
export type InsertDomain = z.infer<typeof InsertDomainSchema>;

export const InsertEnvVarSchema = EnvVarSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertEnvVar = z.infer<typeof InsertEnvVarSchema>;

export const InsertBuildJobSchema = BuildJobSchema.omit({
  id: true,
  attempts: true,
  error: true,
  created_at: true,
  started_at: true,
  finished_at: true,
});
export type InsertBuildJob = z.infer<typeof InsertBuildJobSchema>;

export const InsertMetricSchema = MetricSchema.omit({
  id: true,
});
export type InsertMetric = z.infer<typeof InsertMetricSchema>;

export const InsertApiTokenSchema = ApiTokenSchema.omit({
  id: true,
  last_used_at: true,
  created_at: true,
});
export type InsertApiToken = z.infer<typeof InsertApiTokenSchema>;

// ─── API Response Envelopes ──────────────────────────────────────────────────

export const ApiMetaSchema = z.object({
  ts: z.string().datetime(),
  version: z.string(),
});
export type ApiMeta = z.infer<typeof ApiMetaSchema>;

export const ApiSuccessResponseSchema = <T extends z.ZodTypeAny>(
  dataSchema: T,
) =>
  z.object({
    ok: z.literal(true),
    data: dataSchema,
    meta: ApiMetaSchema,
  });

export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
  meta: ApiMeta;
}

export const ApiErrorDetailSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiErrorDetail = z.infer<typeof ApiErrorDetailSchema>;

export const ApiErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: ApiErrorDetailSchema,
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ─── DeployxConfig (deployx.yaml) ────────────────────────────────────────────

export const HealthCheckSchema = z.object({
  path: z.string().default("/health"),
  interval: z.string().default("30s"),
  timeout: z.string().default("5s"),
  retries: z.number().int().positive().default(3),
});
export type HealthCheck = z.infer<typeof HealthCheckSchema>;

export const BuildConfigSchema = z.object({
  type: BuildTypeSchema.default("nixpacks"),
  dockerfile: z.string().optional(),
  command: z.string().optional(),
});
export type BuildConfig = z.infer<typeof BuildConfigSchema>;

export const RunConfigSchema = z.object({
  command: z.string().optional(),
  port: z.number().int().positive().default(3000),
  health_check: HealthCheckSchema.optional(),
});
export type RunConfig = z.infer<typeof RunConfigSchema>;

export const ResourcesConfigSchema = z.object({
  cpu: z.string().default("1"),
  memory: z.string().default("512m"),
});
export type ResourcesConfig = z.infer<typeof ResourcesConfigSchema>;

export const ScalingConfigSchema = z.object({
  min_replicas: z.number().int().positive().default(1),
  max_replicas: z.number().int().positive().default(1),
});
export type ScalingConfig = z.infer<typeof ScalingConfigSchema>;

export const DeployxConfigSchema = z.object({
  name: z.string().min(1),
  build: BuildConfigSchema.optional(),
  run: RunConfigSchema.optional(),
  resources: ResourcesConfigSchema.optional(),
  domains: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  scaling: ScalingConfigSchema.optional(),
});
export type DeployxConfig = z.infer<typeof DeployxConfigSchema>;

// ─── Platform Config ─────────────────────────────────────────────────────────

export const PlatformConfigSchema = z.object({
  PLATFORM_DOMAIN: z.string().min(1),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "Must be 64 hex characters (32 bytes)"),
  JWT_SECRET: z.string().min(1),
  DB_PATH: z.string().default("/data/platform.db"),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("production"),
  ACME_EMAIL: z.string().email().optional(),
  BACKUP_BUCKET: z.string().optional(),
});
export type PlatformConfig = z.infer<typeof PlatformConfigSchema>;
