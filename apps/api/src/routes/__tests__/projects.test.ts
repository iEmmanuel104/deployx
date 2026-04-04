import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser, authHeaders } from "../../__tests__/setup.js";

describe("Project Routes", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    const user = await registerUser(app, {
      email: "projectowner@test.com",
      password: "password123",
      name: "Project Owner",
    });
    token = user.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── List ──────────────────────────────────────────────────────────────────

  it("lists projects — 200 empty array when none exist", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual([]);
  });

  // ─── Create ────────────────────────────────────────────────────────────────

  it("creates a project — 201 with project data", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders(token),
      payload: {
        name: "My App",
        slug: "my-app",
        source_type: "git",
        git_repo: "https://github.com/user/repo",
        build_type: "nixpacks",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.id).toBeTruthy();
    expect(body.data.name).toBe("My App");
    expect(body.data.slug).toBe("my-app");
    expect(body.data.sourceType).toBe("git");
    expect(body.data.status).toBe("idle");
  });

  it("rejects duplicate slug — 409", async () => {
    // Create first
    await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders(token),
      payload: {
        name: "Dupe Slug App",
        slug: "dupe-slug",
        source_type: "git",
        build_type: "nixpacks",
      },
    });

    // Try to create with same slug
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders(token),
      payload: {
        name: "Another App",
        slug: "dupe-slug",
        source_type: "git",
        build_type: "nixpacks",
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });

  // ─── Get ───────────────────────────────────────────────────────────────────

  it("gets a project by id — 200", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders(token),
      payload: {
        name: "Get Me",
        slug: "get-me",
        source_type: "cli",
        build_type: "dockerfile",
      },
    });

    const createBody = JSON.parse(createRes.body);
    const projectId = createBody.data.id;

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(projectId);
    expect(body.data.name).toBe("Get Me");
  });

  it("returns 404 for non-existent project", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/projects/nonexistent-id-12345",
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });

  // ─── Update ────────────────────────────────────────────────────────────────

  it("updates a project — 200 with updated fields", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders(token),
      payload: {
        name: "Update Me",
        slug: "update-me",
        source_type: "git",
        build_type: "nixpacks",
        port: 3000,
      },
    });

    const projectId = JSON.parse(createRes.body).data.id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}`,
      headers: authHeaders(token),
      payload: {
        name: "Updated Name",
        port: 8080,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.name).toBe("Updated Name");
    expect(body.data.port).toBe(8080);
  });

  // ─── Delete (soft) ─────────────────────────────────────────────────────────

  it("soft-deletes a project — 200 with deleted: true", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders(token),
      payload: {
        name: "Delete Me",
        slug: "delete-me",
        source_type: "git",
        build_type: "nixpacks",
      },
    });

    const projectId = JSON.parse(createRes.body).data.id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.deleted).toBe(true);
    expect(body.data.id).toBe(projectId);
  });

  it("excludes deleted projects from list", async () => {
    // Create and delete a project
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders(token),
      payload: {
        name: "Ghost Project",
        slug: "ghost-project",
        source_type: "git",
        build_type: "nixpacks",
      },
    });

    const projectId = JSON.parse(createRes.body).data.id;

    await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}`,
      headers: authHeaders(token),
    });

    // List should not include the deleted project
    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
      headers: authHeaders(token),
    });

    const listBody = JSON.parse(listRes.body);
    const found = listBody.data.find((p: { id: string }) => p.id === projectId);
    expect(found).toBeUndefined();
  });

  // ─── Deploy trigger ────────────────────────────────────────────────────────

  it("triggers a deploy — 202 with deploymentId and jobId", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders(token),
      payload: {
        name: "Deploy Target",
        slug: "deploy-target",
        source_type: "git",
        git_repo: "https://github.com/user/deploy-repo",
        build_type: "nixpacks",
      },
    });

    const projectId = JSON.parse(createRes.body).data.id;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/deploy`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.deploymentId).toBeTruthy();
    expect(body.data.jobId).toBeTruthy();
  });

  // ─── Stop without container ────────────────────────────────────────────────

  it("rejects stop when no container is running — 400", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders(token),
      payload: {
        name: "No Container",
        slug: "no-container",
        source_type: "git",
        build_type: "nixpacks",
      },
    });

    const projectId = JSON.parse(createRes.body).data.id;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/stop`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });

  // ─── Ownership isolation ───────────────────────────────────────────────────

  it("user A cannot access user B's project — 404", async () => {
    // Register user B
    const userB = await registerUser(app, {
      email: "userb@test.com",
      password: "password123",
      name: "User B",
    });

    // Create a project with user A's token
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders(token),
      payload: {
        name: "Secret Project",
        slug: "secret-project",
        source_type: "git",
        build_type: "nixpacks",
      },
    });

    const projectId = JSON.parse(createRes.body).data.id;

    // User B tries to access it
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}`,
      headers: authHeaders(userB.accessToken),
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });
});
