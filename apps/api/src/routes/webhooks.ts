import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { ulid } from "ulidx";
import { projects } from "@deployx/db";
import { deriveWebhookSecret, parseEncryptionKey } from "@deployx/crypto";
import { GitWebhookPayloadSchema } from "@deployx/types";
import { requireAuth } from "../plugins/auth.js";
import { success } from "../utils/response.js";
import { getOwnedProject } from "../utils/ownership.js";
import {
  createDeploymentAndEnqueueBuild,
  BuildAlreadyInProgressError,
} from "../queue/helpers.js";

const ProjectIdParam = z.object({
  projectId: z.string().min(1),
});

const IdParam = z.object({
  id: z.string().min(1),
});

// Read the master key from env at request time so tests can swap it. Throws
// (and the request returns 500) if ENCRYPTION_KEY is missing/invalid — that
// is a server-config error, not a client problem.
function getMasterKey(): Buffer {
  const hex = process.env["ENCRYPTION_KEY"];
  if (!hex) throw new Error("ENCRYPTION_KEY not configured");
  return parseEncryptionKey(hex);
}

function webhookSecretFor(projectId: string): string {
  return deriveWebhookSecret(getMasterKey(), projectId).toString("hex");
}

function webhookUrlFor(projectId: string): string {
  const domain = process.env["PLATFORM_DOMAIN"] ?? "localhost";
  const scheme = domain === "localhost" || domain.startsWith("localhost:") ? "http" : "https";
  return `${scheme}://${domain}/api/v1/webhooks/${projectId}`;
}

// Constant-time compare of two `sha256=<hex>` signature strings. Returns
// false for any length mismatch (timingSafeEqual would throw) so callers
// can treat the result as a plain boolean.
function safeSignatureEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
  // Encapsulate the raw-body parser so it only applies inside this plugin.
  // Fastify's default JSON parser drains the request stream, leaving us with
  // no way to recompute the HMAC. We buffer the bytes as a string, stash
  // them on the request, and then JSON.parse them ourselves.
  await fastify.register(async (scoped) => {
    scoped.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (req, body, done) => {
        (req as FastifyRequest & { rawBody?: string }).rawBody =
          typeof body === "string" ? body : body.toString("utf8");
        try {
          const json = body.length === 0 ? {} : JSON.parse(body as string);
          done(null, json);
        } catch (err) {
          done(err as Error, undefined);
        }
      },
    );

    scoped.post("/api/v1/webhooks/:projectId", {
      schema: { params: ProjectIdParam },
      config: {
        // Webhook senders (GitHub etc.) hit us in bursts on busy repos.
        // Per-IP cap is still meaningful but generous; the HMAC check
        // upstream of the queue is the real gate.
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
      handler: async (request, reply) => {
        const { projectId } = request.params as z.infer<typeof ProjectIdParam>;
        const rawBody =
          (request as FastifyRequest & { rawBody?: string }).rawBody ?? "";

        const signatureHeader = request.headers["x-hub-signature-256"];
        if (typeof signatureHeader !== "string" || signatureHeader.length === 0) {
          return reply.status(401).send({
            ok: false,
            error: {
              code: "MISSING_SIGNATURE",
              message: "X-Hub-Signature-256 header is required",
            },
          });
        }

        // Look up project first so we know the slug + build config. No
        // ownership check — possession of the HMAC secret IS the auth.
        const [project] = await fastify.db
          .select()
          .from(projects)
          .where(
            and(eq(projects.id, projectId), isNull(projects.deletedAt)),
          )
          .limit(1);

        if (!project) {
          return reply.status(404).send({
            ok: false,
            error: { code: "NOT_FOUND", message: "Project not found" },
          });
        }

        const secret = webhookSecretFor(projectId);
        const expected =
          "sha256=" +
          createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

        if (!safeSignatureEqual(signatureHeader, expected)) {
          return reply.status(401).send({
            ok: false,
            error: {
              code: "INVALID_SIGNATURE",
              message: "Signature mismatch",
            },
          });
        }

        // Best-effort payload parse for commit metadata. Even if the body
        // isn't a recognized git push shape we still trigger the deploy —
        // commitSha/commitMsg just stay null.
        const parsed = GitWebhookPayloadSchema.safeParse(request.body);
        const commitSha = parsed.success
          ? parsed.data.head_commit?.id ?? parsed.data.after ?? null
          : null;
        const commitMsg = parsed.success
          ? parsed.data.head_commit?.message ?? null
          : null;

        if (project.sourceType === "git" && !project.gitRepo) {
          return reply.status(400).send({
            ok: false,
            error: {
              code: "NO_GIT_REPO",
              message: "Project has source_type=git but no git_repo configured",
            },
          });
        }

        try {
          const imageTag = `deployx/${project.slug}:deploy-${ulid()}`;
          const { deploymentId, jobId } = await createDeploymentAndEnqueueBuild(
            fastify.db,
            {
              projectId,
              trigger: "git_push",
              commitSha: commitSha ?? undefined,
              commitMsg: commitMsg ?? undefined,
              buildPayload: {
                projectId,
                sourceDir: project.gitRepo ?? "",
                imageTag,
                buildType:
                  (project.buildType as
                    | "nixpacks"
                    | "railpack"
                    | "dockerfile") ?? "nixpacks",
                buildCmd: project.buildCmd ?? null,
                startCmd: project.startCmd ?? null,
                port: project.port ?? 3000,
              },
            },
          );

          return reply
            .status(202)
            .send(success({ deploymentId, jobId, trigger: "git_push" }));
        } catch (err) {
          if (err instanceof BuildAlreadyInProgressError) {
            return reply.status(409).send({
              ok: false,
              error: {
                code: err.code,
                message: err.message,
                details: {
                  existingJobId: err.existingJobId,
                  existingDeploymentId: err.existingDeploymentId,
                },
              },
            });
          }
          throw err;
        }
      },
    });
  });

  // Auth-gated info endpoint — owners can always derive the secret on demand
  // (it is fully deterministic from ENCRYPTION_KEY + projectId), so we expose
  // it on every read rather than minting a one-time view.
  fastify.get("/api/v1/projects/:id/webhook-info", {
    schema: { params: IdParam },
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof IdParam>;
      await getOwnedProject(fastify.db, request.user.sub, id);

      return reply.send(
        success({
          url: webhookUrlFor(id),
          secret: webhookSecretFor(id),
          contentType: "application/json" as const,
          signatureHeader: "X-Hub-Signature-256" as const,
        }),
      );
    },
  });
}
