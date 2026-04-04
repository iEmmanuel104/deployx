import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { ulid } from "ulidx";
import { domains } from "@deployx/db";
import { DOMAIN_REGEX } from "@deployx/types";
import { requireAuth } from "../plugins/auth.js";
import { success } from "../utils/response.js";
import { getOwnedProject } from "../utils/ownership.js";

const ProjectIdParam = z.object({
  projectId: z.string().min(1),
});

const DomainParams = z.object({
  projectId: z.string().min(1),
  id: z.string().min(1),
});

const AddDomainBody = z.object({
  domain: z.string().min(1).regex(DOMAIN_REGEX, "Must be a valid RFC-1123 domain name"),
});

export async function domainRoutes(fastify: FastifyInstance): Promise<void> {
  // List domains
  fastify.get("/api/v1/projects/:projectId/domains", {
    schema: { params: ProjectIdParam },
    preHandler: [requireAuth],
    handler: async (request, reply) => {
      const params = request.params as z.infer<typeof ProjectIdParam>;
      await getOwnedProject(fastify.db, request.user.sub, params.projectId);

      const rows = await fastify.db
        .select()
        .from(domains)
        .where(eq(domains.projectId, params.projectId));

      return reply.send(success(rows));
    },
  });

  // Add domain
  fastify.post("/api/v1/projects/:projectId/domains", {
    schema: { params: ProjectIdParam, body: AddDomainBody },
    preHandler: [requireAuth],
    handler: async (request, reply) => {
      const params = request.params as z.infer<typeof ProjectIdParam>;
      const body = request.body as z.infer<typeof AddDomainBody>;
      await getOwnedProject(fastify.db, request.user.sub, params.projectId);

      // Check global uniqueness
      const [existing] = await fastify.db
        .select({ id: domains.id })
        .from(domains)
        .where(eq(domains.domain, body.domain))
        .limit(1);

      if (existing) {
        const err = new Error("Domain already registered") as Error & { statusCode: number };
        err.statusCode = 409;
        throw err;
      }

      const now = new Date().toISOString();
      const id = ulid();
      const newDomain = {
        id,
        projectId: params.projectId,
        domain: body.domain,
        isPrimary: 0,
        sslStatus: "pending" as const,
        sslCertExp: null,
        verifiedAt: null,
        createdAt: now,
      };

      await fastify.db.insert(domains).values(newDomain);

      return reply.status(201).send(success(newDomain));
    },
  });

  // Remove domain
  fastify.delete("/api/v1/projects/:projectId/domains/:id", {
    schema: { params: DomainParams },
    preHandler: [requireAuth],
    handler: async (request, reply) => {
      const params = request.params as z.infer<typeof DomainParams>;
      await getOwnedProject(fastify.db, request.user.sub, params.projectId);

      const [domainRow] = await fastify.db
        .select({ id: domains.id })
        .from(domains)
        .where(and(eq(domains.id, params.id), eq(domains.projectId, params.projectId)))
        .limit(1);

      if (!domainRow) {
        const err = new Error("Domain not found") as Error & { statusCode: number };
        err.statusCode = 404;
        throw err;
      }

      await fastify.db
        .delete(domains)
        .where(eq(domains.id, params.id));

      return reply.send(success({ id: params.id, deleted: true }));
    },
  });
}
