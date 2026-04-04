import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser, authHeaders } from "../../__tests__/setup.js";

describe("Deployment Routes", () => {
  let app: FastifyInstance;
  let token: string;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const user = await registerUser(app, {
      email: "deployer@test.com",
      password: "password123",
      name: "Deployer",
    });
    token = user.accessToken;

    // Create a project to use for deployment tests
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders(token),
      payload: {
        name: "Deploy Project",
        slug: "deploy-project",
        source_type: "git",
        git_repo: "https://github.com/user/deploy-test",
        build_type: "nixpacks",
      },
    });

    projectId = JSON.parse(createRes.body).data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── List (empty) ─────────────────────────────────────────────────────────

  it("lists deployments — 200 empty array when none exist", async () => {
    // Create a fresh project with no deployments
    const freshRes = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders(token),
      payload: {
        name: "Empty Deploy Project",
        slug: "empty-deploy-project",
        source_type: "git",
        git_repo: "https://github.com/user/empty",
        build_type: "nixpacks",
      },
    });

    const freshProjectId = JSON.parse(freshRes.body).data.id;

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${freshProjectId}/deployments`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual([]);
  });

  // ─── List with data ───────────────────────────────────────────────────────

  it("lists deployments after triggering a deploy — 200", async () => {
    // Trigger a deploy first
    await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/deploy`,
      headers: authHeaders(token),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/deployments`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].projectId).toBe(projectId);
    expect(body.data[0].status).toBe("queued");
  });

  // ─── Get deployment ───────────────────────────────────────────────────────

  it("gets a single deployment by id — 200", async () => {
    // Trigger a deploy and capture the deploymentId
    const deployRes = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/deploy`,
      headers: authHeaders(token),
    });

    const deploymentId = JSON.parse(deployRes.body).data.deploymentId;

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/deployments/${deploymentId}`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(deploymentId);
    expect(body.data.projectId).toBe(projectId);
    expect(body.data.trigger).toBe("manual");
  });

  // ─── Get non-existent deployment ──────────────────────────────────────────

  it("returns 404 for non-existent deployment", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/deployments/nonexistent-deploy-id`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });

  // ─── Rollback non-successful deployment ───────────────────────────────────

  it("rejects rollback of a non-successful deployment — 400", async () => {
    // Trigger a deploy (will be in "queued" status due to disabled queue)
    const deployRes = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/deploy`,
      headers: authHeaders(token),
    });

    const deploymentId = JSON.parse(deployRes.body).data.deploymentId;

    // Try to rollback a queued deployment
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/deployments/${deploymentId}/rollback`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error.message).toContain("non-successful");
  });
});
