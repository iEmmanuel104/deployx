import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createDb, buildJobs, deployments, projects, users } from "@deployx/db";
import { handleBuildJob } from "../../queue/handlers/build.js";
import type { JobContext } from "../processor.js";

// Mock the builder module
vi.mock("@deployx/builder", () => ({
  buildWithNixpacks: vi.fn().mockResolvedValue({
    imageTag: "deployx/test-app:v1",
    buildLog: "Build succeeded",
    durationMs: 5000,
  }),
}));

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

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn().mockReturnThis(),
  silent: vi.fn(),
  level: "info",
} as unknown as import("fastify").FastifyBaseLogger;

const BUILD_PAYLOAD = {
  projectId: "proj1",
  deploymentId: "deploy1",
  sourceDir: "/builds/test-app",
  imageTag: "deployx/test-app:v1",
  buildType: "nixpacks",
  buildCmd: null,
  startCmd: null,
  port: 3000,
};

describe("Build-deploy chain", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set PLATFORM_DOMAIN for deploy payload
    process.env["PLATFORM_DOMAIN"] = "test.deployx.dev";

    db = createTestDb();

    // Seed user
    db.insert(users)
      .values({
        id: "user1",
        email: "test@test.com",
        password: "hash",
        name: "Test",
        role: "admin",
        createdAt: ts(),
        updatedAt: ts(),
      })
      .run();

    // Seed project
    db.insert(projects)
      .values({
        id: "proj1",
        userId: "user1",
        name: "test-app",
        slug: "test-app",
        sourceType: "git",
        status: "idle",
        port: 3000,
        createdAt: ts(),
        updatedAt: ts(),
      })
      .run();

    // Seed deployment
    db.insert(deployments)
      .values({
        id: "deploy1",
        projectId: "proj1",
        version: 1,
        trigger: "manual",
        status: "queued",
        createdAt: ts(),
      })
      .run();

    // Seed build job
    db.insert(buildJobs)
      .values({
        id: "job1",
        deploymentId: "deploy1",
        type: "build",
        status: "running",
        payload: JSON.stringify(BUILD_PAYLOAD),
        attempts: 1,
        maxAttempts: 3,
        createdAt: ts(),
        startedAt: ts(),
      })
      .run();
  });

  it("enqueues a deploy job after a successful build", async () => {
    const ctx: JobContext = {
      job: db.select().from(buildJobs).where(eq(buildJobs.id, "job1")).get()!,
      db,
      logger: mockLogger,
    };

    await handleBuildJob(ctx);

    // Verify a deploy job was created
    const jobs = db.select().from(buildJobs).all();
    const deployJobs = jobs.filter((j) => j.type === "deploy");
    expect(deployJobs).toHaveLength(1);
    expect(deployJobs[0]!.status).toBe("pending");
    expect(deployJobs[0]!.deploymentId).toBe("deploy1");
  });

  it("deploy job has the correct payload (imageTag, slug, port)", async () => {
    const ctx: JobContext = {
      job: db.select().from(buildJobs).where(eq(buildJobs.id, "job1")).get()!,
      db,
      logger: mockLogger,
    };

    await handleBuildJob(ctx);

    const jobs = db.select().from(buildJobs).all();
    const deployJob = jobs.find((j) => j.type === "deploy");
    expect(deployJob).toBeTruthy();

    const payload = JSON.parse(deployJob!.payload) as Record<string, unknown>;
    expect(payload.imageTag).toBe("deployx/test-app:v1");
    expect(payload.slug).toBe("test-app");
    expect(payload.port).toBe(3000);
    expect(payload.projectId).toBe("proj1");
    expect(payload.deploymentId).toBe("deploy1");
    expect(payload.platformDomain).toBe("test.deployx.dev");
  });

  it("does NOT create a deploy job when the build fails", async () => {
    // Override mock to reject
    const { buildWithNixpacks } = await import("@deployx/builder");
    vi.mocked(buildWithNixpacks).mockRejectedValueOnce(
      new Error("Build failed: OOM"),
    );

    const ctx: JobContext = {
      job: db.select().from(buildJobs).where(eq(buildJobs.id, "job1")).get()!,
      db,
      logger: mockLogger,
    };

    await expect(handleBuildJob(ctx)).rejects.toThrow("Build failed: OOM");

    // No deploy job should exist
    const jobs = db.select().from(buildJobs).all();
    const deployJobs = jobs.filter((j) => j.type === "deploy");
    expect(deployJobs).toHaveLength(0);

    // Deployment should be marked as failed
    const dep = db
      .select()
      .from(deployments)
      .where(eq(deployments.id, "deploy1"))
      .get()!;
    expect(dep.status).toBe("failed");
    expect(dep.errorMsg).toBe("Build failed: OOM");
  });
});
