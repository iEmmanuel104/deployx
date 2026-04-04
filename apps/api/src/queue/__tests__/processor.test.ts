import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sql } from "drizzle-orm";
import { createDb, buildJobs, deployments, projects, users } from "@deployx/db";
import { QueueProcessor } from "../processor.js";
import type { JobHandler } from "../processor.js";

function createTestDb() {
  const db = createDb(":memory:");

  db.run(sql.raw(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL,
    name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', avatar_url TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  )`));
  db.run(sql.raw(`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE, description TEXT, source_type TEXT NOT NULL,
    git_repo TEXT, git_branch TEXT DEFAULT 'main', build_type TEXT DEFAULT 'nixpacks',
    build_cmd TEXT, start_cmd TEXT, port INTEGER DEFAULT 3000,
    status TEXT NOT NULL DEFAULT 'idle', container_id TEXT, image_tag TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  )`));
  db.run(sql.raw(`CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version INTEGER NOT NULL,
    "trigger" TEXT NOT NULL, commit_sha TEXT, commit_msg TEXT, image_tag TEXT,
    status TEXT NOT NULL DEFAULT 'queued', build_log TEXT, error_msg TEXT,
    started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL
  )`));
  db.run(sql.raw(`CREATE TABLE IF NOT EXISTS build_jobs (
    id TEXT PRIMARY KEY, deployment_id TEXT NOT NULL, type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', payload TEXT NOT NULL,
    attempts INTEGER DEFAULT 0, max_attempts INTEGER DEFAULT 3, error TEXT,
    created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT
  )`));

  return db;
}

const ts = () => new Date().toISOString();

function seedTestData(db: ReturnType<typeof createTestDb>) {
  db.insert(users).values({
    id: "user1", email: "test@test.com", password: "hash",
    name: "Test", role: "admin", createdAt: ts(), updatedAt: ts(),
  }).run();

  db.insert(projects).values({
    id: "proj1", userId: "user1", name: "test-app", slug: "test-app",
    sourceType: "git", status: "idle", createdAt: ts(), updatedAt: ts(),
  }).run();

  db.insert(deployments).values({
    id: "deploy1", projectId: "proj1", version: 1,
    trigger: "manual", status: "queued", createdAt: ts(),
  }).run();
}

const mockLogger = {
  info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(),
  fatal: vi.fn(), trace: vi.fn(), child: vi.fn().mockReturnThis(),
  silent: vi.fn(), level: "info",
} as unknown as import("fastify").FastifyBaseLogger;

describe("QueueProcessor", () => {
  let db: ReturnType<typeof createTestDb>;
  let processor: QueueProcessor;
  let handlers: Record<string, JobHandler>;

  beforeEach(() => {
    db = createTestDb();
    seedTestData(db);
    handlers = {
      build: vi.fn().mockResolvedValue(undefined),
      deploy: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(async () => {
    if (processor?.isRunning()) {
      await processor.stop();
    }
  });

  it("picks up a pending job and marks it done", async () => {
    db.insert(buildJobs).values({
      id: "job1", deploymentId: "deploy1", type: "build",
      status: "pending", payload: JSON.stringify({ projectId: "proj1" }),
      attempts: 0, maxAttempts: 3, createdAt: ts(),
    }).run();

    processor = new QueueProcessor({
      db, logger: mockLogger, pollIntervalMs: 50, handlers,
    });

    processor.start();
    await new Promise((r) => setTimeout(r, 200));
    await processor.stop();

    expect(handlers.build).toHaveBeenCalledTimes(1);
    const jobs = db.select().from(buildJobs).all();
    expect(jobs[0]!.status).toBe("done");
    expect(jobs[0]!.finishedAt).toBeTruthy();
  });

  it("marks job as failed when max attempts reached", async () => {
    db.insert(buildJobs).values({
      id: "job1", deploymentId: "deploy1", type: "build",
      status: "pending", payload: "{}",
      attempts: 2, maxAttempts: 3, createdAt: ts(),
    }).run();

    handlers.build = vi.fn().mockRejectedValue(new Error("build failed"));

    processor = new QueueProcessor({
      db, logger: mockLogger, pollIntervalMs: 50, handlers,
    });

    processor.start();
    await new Promise((r) => setTimeout(r, 200));
    await processor.stop();

    const jobs = db.select().from(buildJobs).all();
    expect(jobs[0]!.status).toBe("failed");
    expect(jobs[0]!.error).toBe("build failed");
  });

  it("returns job to pending for retry when under max attempts", async () => {
    db.insert(buildJobs).values({
      id: "job1", deploymentId: "deploy1", type: "build",
      status: "pending", payload: "{}",
      attempts: 0, maxAttempts: 3, createdAt: ts(),
    }).run();

    handlers.build = vi.fn().mockRejectedValue(new Error("transient error"));

    processor = new QueueProcessor({
      db, logger: mockLogger, pollIntervalMs: 50,
      baseRetryDelayMs: 100_000, handlers,
    });

    processor.start();
    await new Promise((r) => setTimeout(r, 200));
    await processor.stop();

    const jobs = db.select().from(buildJobs).all();
    expect(jobs[0]!.status).toBe("pending");
    expect(jobs[0]!.attempts).toBe(1);
    expect(jobs[0]!.error).toBe("transient error");
  });

  it("marks unknown job types as failed", async () => {
    db.insert(buildJobs).values({
      id: "job1", deploymentId: "deploy1", type: "unknown_type",
      status: "pending", payload: "{}",
      attempts: 0, maxAttempts: 3, createdAt: ts(),
    }).run();

    processor = new QueueProcessor({
      db, logger: mockLogger, pollIntervalMs: 50, handlers,
    });

    processor.start();
    await new Promise((r) => setTimeout(r, 200));
    await processor.stop();

    const jobs = db.select().from(buildJobs).all();
    expect(jobs[0]!.status).toBe("failed");
    expect(jobs[0]!.error).toContain("Unknown job type");
  });

  it("processes jobs in FIFO order", async () => {
    const order: string[] = [];

    db.insert(buildJobs).values({
      id: "job1", deploymentId: "deploy1", type: "build",
      status: "pending", payload: JSON.stringify({ order: "first" }),
      createdAt: "2026-01-01T00:00:00.000Z",
    }).run();

    db.insert(buildJobs).values({
      id: "job2", deploymentId: "deploy1", type: "deploy",
      status: "pending", payload: JSON.stringify({ order: "second" }),
      createdAt: "2026-01-01T00:00:01.000Z",
    }).run();

    handlers.build = vi.fn().mockImplementation(async () => { order.push("build"); });
    handlers.deploy = vi.fn().mockImplementation(async () => { order.push("deploy"); });

    processor = new QueueProcessor({
      db, logger: mockLogger, pollIntervalMs: 50, handlers,
    });

    processor.start();
    await new Promise((r) => setTimeout(r, 400));
    await processor.stop();

    expect(order).toEqual(["build", "deploy"]);
  });
});
