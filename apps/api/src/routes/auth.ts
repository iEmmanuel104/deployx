import type { FastifyInstance } from "fastify";
import { z } from "zod";

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post("/api/v1/auth/register", {
    schema: {
      body: RegisterBody,
    },
    handler: async (_request, reply) => {
      return reply.status(201).send({
        ok: true,
        data: { message: "Not implemented" },
      });
    },
  });

  fastify.post("/api/v1/auth/login", {
    schema: {
      body: LoginBody,
    },
    handler: async (_request, reply) => {
      return reply.send({
        ok: true,
        data: { message: "Not implemented" },
      });
    },
  });

  fastify.post("/api/v1/auth/refresh", async (_request, reply) => {
    return reply.send({
      ok: true,
      data: { message: "Not implemented" },
    });
  });

  fastify.post("/api/v1/auth/logout", async (_request, reply) => {
    return reply.send({
      ok: true,
      data: { message: "Not implemented" },
    });
  });
}
