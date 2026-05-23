import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser, authHeaders } from "../../__tests__/setup.js";

describe("A4 system/info trim", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    const u = await registerUser(app, { email: "sys@test.com" });
    token = u.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("does not expose hostname and reports memory in GB", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/system/info",
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.hostname).toBeUndefined();
    expect(body.data.totalMemory).toBeUndefined();
    expect(typeof body.data.totalMemoryGB).toBe("number");
    expect(typeof body.data.freeMemoryGB).toBe("number");
  });

  it("requires auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/system/info",
    });
    expect(res.statusCode).toBe(401);
  });
});
