import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { projects } from "@deployx/db";
import { createTestApp, registerUser, authHeaders } from "../../__tests__/setup.js";

async function createProject(
  app: FastifyInstance,
  token: string,
  slug: string,
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: authHeaders(token),
    payload: {
      name: "Guard App",
      slug,
      source_type: "git",
      git_repo: "https://github.com/u/r",
      build_type: "nixpacks",
    },
  });
  return JSON.parse(res.body).data.id;
}

describe("A1 status guards", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    const u = await registerUser(app, { email: "guards@test.com" });
    token = u.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("deploy returns 409 PROJECT_BUSY when project status is `building`", async () => {
    const id = await createProject(app, token, "guard-deploy");

    // Flip status to building directly in the DB.
    await app.db
      .update(projects)
      .set({ status: "building" })
      .where(eq(projects.id, id));

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${id}/deploy`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("PROJECT_BUSY");
  });

  it("stop returns 409 PROJECT_BUSY when project is already stopped", async () => {
    const id = await createProject(app, token, "guard-stop");

    await app.db
      .update(projects)
      .set({ status: "stopped", containerId: "container-xyz" })
      .where(eq(projects.id, id));

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${id}/stop`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe("PROJECT_BUSY");
  });

  it("restart returns 409 when project is not running", async () => {
    const id = await createProject(app, token, "guard-restart");

    await app.db
      .update(projects)
      .set({ status: "stopped", containerId: "container-xyz" })
      .where(eq(projects.id, id));

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${id}/restart`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe("PROJECT_BUSY");
  });

  it("restart succeeds when project status is `running`", async () => {
    const id = await createProject(app, token, "guard-restart-ok");

    await app.db
      .update(projects)
      .set({ status: "running", containerId: "container-running" })
      .where(eq(projects.id, id));

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${id}/restart`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(202);
  });
});
