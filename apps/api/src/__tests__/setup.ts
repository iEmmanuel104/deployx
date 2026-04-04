import { sql } from "drizzle-orm";
import { buildApp } from "../index.js";
import type { FastifyInstance } from "fastify";

// DDL statements for creating test tables
const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL,
    name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', avatar_url TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE, description TEXT, source_type TEXT NOT NULL,
    git_repo TEXT, git_branch TEXT DEFAULT 'main', build_type TEXT DEFAULT 'nixpacks',
    build_cmd TEXT, start_cmd TEXT, port INTEGER DEFAULT 3000,
    status TEXT NOT NULL DEFAULT 'idle', container_id TEXT, image_tag TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version INTEGER NOT NULL,
    "trigger" TEXT NOT NULL, commit_sha TEXT, commit_msg TEXT, image_tag TEXT,
    status TEXT NOT NULL DEFAULT 'queued', build_log TEXT, error_msg TEXT,
    started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS domains (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, domain TEXT NOT NULL UNIQUE,
    is_primary INTEGER DEFAULT 0, ssl_status TEXT DEFAULT 'pending',
    ssl_cert_exp TEXT, verified_at TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS env_vars (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, key TEXT NOT NULL,
    value_enc TEXT NOT NULL, iv TEXT NOT NULL, is_build INTEGER DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(project_id, key)
  )`,
  `CREATE TABLE IF NOT EXISTS build_jobs (
    id TEXT PRIMARY KEY, deployment_id TEXT NOT NULL, type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', payload TEXT NOT NULL,
    attempts INTEGER DEFAULT 0, max_attempts INTEGER DEFAULT 3, error TEXT,
    created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL,
    ts TEXT NOT NULL, cpu_pct REAL, mem_mb REAL, mem_limit_mb REAL,
    net_rx_kb REAL, net_tx_kb REAL, blk_read_mb REAL, blk_write_mb REAL
  )`,
  `CREATE TABLE IF NOT EXISTS api_tokens (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE, last_used_at TEXT, expires_at TEXT,
    created_at TEXT NOT NULL
  )`,
];

export async function createTestApp(): Promise<FastifyInstance> {
  // Set required env vars for test
  process.env["JWT_SECRET"] = "test-secret-for-testing-only";
  process.env["DB_PATH"] = ":memory:";
  process.env["ENCRYPTION_KEY"] = "a".repeat(64); // Valid 64-char hex for tests
  process.env["PLATFORM_DOMAIN"] = "test.deployx.dev";
  process.env["NODE_ENV"] = "test";
  process.env["QUEUE_POLL_MS"] = "999999"; // Effectively disable queue polling during tests

  const app = await buildApp();

  // Create tables in the in-memory DB
  const db = app.db;
  for (const ddl of DDL_STATEMENTS) {
    db.run(sql.raw(ddl));
  }

  await app.ready();
  return app;
}

export async function registerUser(
  app: FastifyInstance,
  user?: { email?: string; password?: string; name?: string },
): Promise<{ accessToken: string; userId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email: user?.email ?? "test@test.com",
      password: user?.password ?? "password123",
      name: user?.name ?? "Test User",
    },
  });

  const body = JSON.parse(res.body) as {
    ok: boolean;
    data: { user: { id: string }; accessToken: string };
  };

  return {
    accessToken: body.data.accessToken,
    userId: body.data.user.id,
  };
}

export function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
