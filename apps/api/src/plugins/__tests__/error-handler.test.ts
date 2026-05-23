import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../../__tests__/setup.js";
import { redactSensitive } from "../error-handler.js";

// S5 — Verify the deep redaction helper strips sensitive keys at any nesting
// depth, and that error responses surface a requestId.

describe("Error handler — S5 redaction", () => {
  describe("redactSensitive (unit)", () => {
    it("replaces top-level sensitive keys (case-insensitive)", () => {
      const redacted = redactSensitive({
        Authorization: "Bearer SECRET",
        Cookie: "session=abc",
        password: "hunter2",
        accessToken: "AT",
        refreshToken: "RT",
        token: "TKN",
        safe: "kept",
      }) as Record<string, unknown>;

      expect(redacted["Authorization"]).toBe("[redacted]");
      expect(redacted["Cookie"]).toBe("[redacted]");
      expect(redacted["password"]).toBe("[redacted]");
      expect(redacted["accessToken"]).toBe("[redacted]");
      expect(redacted["refreshToken"]).toBe("[redacted]");
      expect(redacted["token"]).toBe("[redacted]");
      expect(redacted["safe"]).toBe("kept");
    });

    it("recursively redacts nested objects and arrays", () => {
      const input = {
        request: {
          headers: {
            authorization: "Bearer NESTED",
            "x-custom": "ok",
          },
          body: { password: "deep" },
        },
        items: [
          { token: "T1" },
          { token: "T2" },
        ],
      };
      const out = JSON.stringify(redactSensitive(input));
      expect(out).not.toContain("Bearer NESTED");
      expect(out).not.toContain("\"deep\"");
      expect(out).not.toContain("\"T1\"");
      expect(out).not.toContain("\"T2\"");
      expect(out).toContain("[redacted]");
      expect(out).toContain("x-custom");
    });

    it("handles cycles without recursing forever", () => {
      const a: Record<string, unknown> = { name: "a" };
      const b: Record<string, unknown> = { name: "b", a };
      a["b"] = b;
      const out = redactSensitive(a) as Record<string, unknown>;
      // Just needs to terminate and return *something*.
      expect(out["name"]).toBe("a");
    });

    it("preserves Error name/message/stack", () => {
      const e = new Error("kaboom");
      (e as Error & { token?: string }).token = "S3CRT";
      const out = redactSensitive(e) as Record<string, unknown>;
      expect(out["name"]).toBe("Error");
      expect(out["message"]).toBe("kaboom");
      expect(typeof out["stack"]).toBe("string");
      expect(out["token"]).toBe("[redacted]");
    });

    it("passes primitives through unchanged", () => {
      expect(redactSensitive("hello")).toBe("hello");
      expect(redactSensitive(42)).toBe(42);
      expect(redactSensitive(null)).toBe(null);
      expect(redactSensitive(undefined)).toBe(undefined);
    });
  });

  describe("error envelope", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      app = await createTestApp();
    });

    afterEach(async () => {
      await app.close();
    });

    it("attaches a requestId to every error envelope", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "nobody@nowhere.com", password: "wrong-pass" },
      });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(false);
      expect(body.error.requestId).toBeTruthy();
      expect(body.error.requestId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    });

    it("returns 400 with code VALIDATION_ERROR for bad input", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: { email: "not-email", password: "short", name: "" },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.requestId).toBeTruthy();
    });
  });
});
