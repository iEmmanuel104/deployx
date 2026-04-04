import type { DeployxDb } from "@deployx/db";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; email: string; role: string };
    user: { sub: string; email: string; role: string };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    db: DeployxDb;
  }
}
