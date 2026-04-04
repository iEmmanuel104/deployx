import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { createDb, buildJobs, deployments, projects, users } from "@deployx/db";
import { enqueueJob, createDeploymentAndEnqueueBuild } from "../helpers.js";

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
}

describe("enqueueJob", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    seedTestData(db);
    db.insert(deployments).values({
      id: "deploy1", projectId: "proj1", version: 1,
      trigger: "manual", status: "queued", createdAt: ts(),
    }).run();
  });

  it("creates a job with ULID id and pending status", async () => {
    const jobId = await enqueueJob(db, {
      deploymentId: "deploy1",
      type: "build",
      payload: { projectId: "proj1", containerId: "c1" },
    });

    expect(jobId).toBeTruthy();
    expect(jobId.length).toBeGreaterThan(20);

    const jobs = db.select().from(buildJobs).all();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.status).toBe("pending");
    expect(jobs[0]!.type).toBe("build");
    expect(jobs[0]!.attempts).toBe(0);
    expect(jobs[0]!.maxAttempts).toBe(3);
  });

  it("stores payload as JSON string", async () => {
    await enqueueJob(db, {
      deploymentId: "deploy1",
      type: "stop",
      payload: { projectId: "proj1", containerId: "abc123" },
    });

    const jobs = db.select().from(buildJobs).all();
    const parsed = JSON.parse(jobs[0]!.payload) as Record<string, unknown>;
    expect(parsed.projectId).toBe("proj1");
    expect(parsed.containerId).toBe("abc123");
  });

  it("respects custom maxAttempts", async () => {
    await enqueueJob(db, {
      deploymentId: "deploy1",
      type: "build",
      payload: { projectId: "proj1", containerId: "c1" },
      maxAttempts: 5,
    });

    const jobs = db.select().from(buildJobs).all();
    expect(jobs[0]!.maxAttempts).toBe(5);
  });
});

describe("createDeploymentAndEnqueueBuild", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    seedTestData(db);
  });

  it("creates deployment and build job atomically", async () => {
    const result = await createDeploymentAndEnqueueBuild(db, {
      projectId: "proj1",
      trigger: "manual",
      buildPayload: {
        projectId: "proj1",
        sourceDir: "/builds/test",
        imageTag: "deployx/test:v1",
        buildType: "nixpacks",
        port: 3000,
      },
    });

    expect(result.deploymentId).toBeTruthy();
    expect(result.jobId).toBeTruthy();

    const deps = db.select().from(deployments).all();
    expect(deps).toHaveLength(1);
    expect(deps[0]!.version).toBe(1);
    expect(deps[0]!.status).toBe("queued");

    const jobs = db.select().from(buildJobs).all();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.type).toBe("build");
  });

  it("auto-increments deployment version", async () => {
    await createDeploymentAndEnqueueBuild(db, {
      projectId: "proj1",
      trigger: "manual",
      buildPayload: {
        projectId: "proj1", sourceDir: "/builds/test",
        imageTag: "deployx/test:v1", buildType: "nixpacks", port: 3000,
      },
    });

    await createDeploymentAndEnqueueBuild(db, {
      projectId: "proj1",
      trigger: "cli",
      buildPayload: {
        projectId: "proj1", sourceDir: "/builds/test",
        imageTag: "deployx/test:v2", buildType: "nixpacks", port: 3000,
      },
    });

    const deps = db.select().from(deployments).all();
    expect(deps).toHaveLength(2);
    const versions = deps.map((d) => d.version).sort();
    expect(versions).toEqual([1, 2]);
  });

  it("includes commit info when provided", async () => {
    await createDeploymentAndEnqueueBuild(db, {
      projectId: "proj1",
      trigger: "git_push",
      commitSha: "abc123",
      commitMsg: "fix: bug",
      buildPayload: {
        projectId: "proj1", sourceDir: "/builds/test",
        imageTag: "deployx/test:v1", buildType: "nixpacks", port: 3000,
      },
    });

    const deps = db.select().from(deployments).all();
    expect(deps[0]!.commitSha).toBe("abc123");
    expect(deps[0]!.commitMsg).toBe("fix: bug");
  });
});
