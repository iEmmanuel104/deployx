import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { ulid } from "ulidx";
import { envVars } from "@deployx/db";
import { encrypt, deriveProjectKey, parseEncryptionKey } from "@deployx/crypto";
import { requireAuth } from "../plugins/auth.js";
import { success } from "../utils/response.js";
import { getOwnedProject } from "../utils/ownership.js";

const ProjectIdParam = z.object({
  projectId: z.string().min(1),
});

const EnvKeyParam = z.object({
  projectId: z.string().min(1),
  key: z.string().min(1),
});

const SetEnvBody = z.object({
  key: z.string().min(1).regex(/^[A-Z_][A-Z0-9_]*$/),
  value: z.string(),
  is_build: z.boolean().default(false),
});

export async function envVarRoutes(fastify: FastifyInstance): Promise<void> {
  // List env vars (keys only, no values)
  fastify.get("/api/v1/projects/:projectId/env", {
    schema: { params: ProjectIdParam },
    preHandler: [requireAuth],
    handler: async (request, reply) => {
      const params = request.params as z.infer<typeof ProjectIdParam>;
      await getOwnedProject(fastify.db, request.user.sub, params.projectId);

      const rows = await fastify.db
        .select({
          id: envVars.id,
          key: envVars.key,
          isBuild: envVars.isBuild,
          createdAt: envVars.createdAt,
          updatedAt: envVars.updatedAt,
        })
        .from(envVars)
        .where(eq(envVars.projectId, params.projectId));

      return reply.send(success(rows));
    },
  });

  // Set env var
  fastify.post("/api/v1/projects/:projectId/env", {
    schema: { params: ProjectIdParam, body: SetEnvBody },
    preHandler: [requireAuth],
    handler: async (request, reply) => {
      const params = request.params as z.infer<typeof ProjectIdParam>;
      const body = request.body as z.infer<typeof SetEnvBody>;
      await getOwnedProject(fastify.db, request.user.sub, params.projectId);

      const encryptionKeyHex = process.env["ENCRYPTION_KEY"];
      if (!encryptionKeyHex) {
        const err = new Error("Encryption key not configured") as Error & { statusCode: number };
        err.statusCode = 500;
        throw err;
      }

      const masterKey = parseEncryptionKey(encryptionKeyHex);
      const projectKey = deriveProjectKey(masterKey, params.projectId);
      const { ciphertext, iv } = encrypt(body.value, projectKey);

      const now = new Date().toISOString();
      const isBuildInt = body.is_build ? 1 : 0;

      // Check if key already exists for this project
      const [existing] = await fastify.db
        .select({ id: envVars.id })
        .from(envVars)
        .where(and(eq(envVars.projectId, params.projectId), eq(envVars.key, body.key)))
        .limit(1);

      let id: string;

      if (existing) {
        id = existing.id;
        await fastify.db
          .update(envVars)
          .set({
            valueEnc: ciphertext,
            iv,
            isBuild: isBuildInt,
            updatedAt: now,
          })
          .where(eq(envVars.id, existing.id));
      } else {
        id = ulid();
        await fastify.db.insert(envVars).values({
          id,
          projectId: params.projectId,
          key: body.key,
          valueEnc: ciphertext,
          iv,
          isBuild: isBuildInt,
          createdAt: now,
          updatedAt: now,
        });
      }

      return reply.status(201).send(success({ id, key: body.key, isBuild: body.is_build }));
    },
  });

  // Delete env var
  fastify.delete("/api/v1/projects/:projectId/env/:key", {
    schema: { params: EnvKeyParam },
    preHandler: [requireAuth],
    handler: async (request, reply) => {
      const params = request.params as z.infer<typeof EnvKeyParam>;
      await getOwnedProject(fastify.db, request.user.sub, params.projectId);

      const [existing] = await fastify.db
        .select({ id: envVars.id })
        .from(envVars)
        .where(and(eq(envVars.projectId, params.projectId), eq(envVars.key, params.key)))
        .limit(1);

      if (!existing) {
        const err = new Error("Environment variable not found") as Error & { statusCode: number };
        err.statusCode = 404;
        throw err;
      }

      await fastify.db
        .delete(envVars)
        .where(eq(envVars.id, existing.id));

      return reply.send(success({ key: params.key, deleted: true }));
    },
  });
}
