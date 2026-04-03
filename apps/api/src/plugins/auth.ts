import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyRequest {
    authenticate: () => Promise<void>;
  }
}

async function auth(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest("authenticate", async function (this: FastifyRequest) {
    // Stub: actual JWT verification will be added later
    const authHeader = this.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      const error = new Error("Unauthorized") as Error & { statusCode: number };
      error.statusCode = 401;
      throw error;
    }

    try {
      // TODO: verify JWT and attach user to request
      await this.jwtVerify();
    } catch {
      const error = new Error("Invalid or expired token") as Error & { statusCode: number };
      error.statusCode = 401;
      throw error;
    }
  });
}

/** Pre-handler hook for protected routes. */
export async function requireAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  await request.authenticate();
}

export const authPlugin = fp(auth, {
  name: "auth",
  dependencies: [],
});
