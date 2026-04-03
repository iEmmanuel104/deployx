import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";

interface ApiErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function buildErrorEnvelope(
  code: string,
  message: string,
  details?: unknown,
): ApiErrorEnvelope {
  return {
    ok: false,
    error: { code, message, ...(details !== undefined && { details }) },
  };
}

async function errorHandler(fastify: FastifyInstance): Promise<void> {
  fastify.setErrorHandler(
    (error: Error & { statusCode?: number; validation?: unknown }, _request: FastifyRequest, reply: FastifyReply) => {
      fastify.log.error(error);

      // Zod validation errors
      if (error instanceof ZodError) {
        return reply.status(400).send(
          buildErrorEnvelope(
            "VALIDATION_ERROR",
            "Request validation failed",
            error.flatten(),
          ),
        );
      }

      // Fastify schema validation errors
      if (error.validation) {
        return reply.status(400).send(
          buildErrorEnvelope(
            "VALIDATION_ERROR",
            error.message,
            error.validation,
          ),
        );
      }

      // Known HTTP errors
      const statusCode = error.statusCode;
      if (statusCode && statusCode >= 400 && statusCode < 500) {
        return reply.status(statusCode).send(
          buildErrorEnvelope(
            `HTTP_${statusCode}`,
            error.message,
          ),
        );
      }

      // Unknown / 500 errors
      return reply.status(500).send(
        buildErrorEnvelope(
          "INTERNAL_SERVER_ERROR",
          "An unexpected error occurred",
        ),
      );
    },
  );
}

export const errorHandlerPlugin = fp(errorHandler, {
  name: "error-handler",
});
