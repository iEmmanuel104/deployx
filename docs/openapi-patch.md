# OpenAPI / Swagger UI patch for `apps/api/src/index.ts`

This document describes the OpenAPI / Swagger UI changes the OPS stream
needs SEC (owner of `apps/api/src/index.ts`) to apply. OPS does not own
that file, so the change is written here as a patch description instead of
edited directly.

## Goal

- Auto-generate an OpenAPI 3.x schema from the Zod schemas already
  registered via `fastify-type-provider-zod`.
- Mount Swagger UI at **`/api/docs`** so operators can browse and try the
  API without having to read source code.

## Dependencies to add (in `apps/api/package.json`)

```json
{
  "dependencies": {
    "@fastify/swagger": "^9.0.0",
    "@fastify/swagger-ui": "^5.0.0"
  }
}
```

> The Zod-friendly serializer comes from the existing
> `fastify-type-provider-zod` package via its `jsonSchemaTransform` helper.

Then run:

```bash
pnpm -F @deployx/api install
```

## Code patch — `apps/api/src/index.ts`

### 1. Add the imports near the existing fastify-plugin imports

```ts
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
```

### 2. Register `@fastify/swagger` and `@fastify/swagger-ui` AFTER the validator/serializer compilers are set, BEFORE any route plugin

Locate this block (around line 40 in the current file):

```ts
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// ... cors / cookie / jwt / rate-limit / websocket / error-handler / auth ...
```

Insert the swagger registration *immediately after* the auth plugin
registration (current line 75) and *before* the route plugin registrations
(current line 126):

```ts
// ── OpenAPI + Swagger UI (browse the API at /api/docs) ─────────────────────
await app.register(swagger, {
  openapi: {
    info: {
      title: "DeployX API",
      description:
        "Control-plane API for DeployX. All endpoints under /api/v1 require a Bearer access token unless explicitly marked public.",
      version: process.env["DEPLOYX_VERSION"] ?? "0.1.0",
    },
    servers: [
      {
        url: `https://${process.env["PLATFORM_DOMAIN"] ?? "localhost"}`,
        description: "This DeployX instance",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  transform: jsonSchemaTransform,
});

await app.register(swaggerUi, {
  routePrefix: "/api/docs",
  uiConfig: {
    docExpansion: "list",
    deepLinking: true,
    persistAuthorization: true,
  },
  // Keep the spec JSON reachable at /api/docs/json for codegen tooling.
  staticCSP: true,
});
```

### 3. Verify after restart

```bash
curl -fsS http://localhost:3001/api/docs/json | jq '.info.title'
# "DeployX API"

# Open the UI:
#   http://localhost:3001/api/docs
```

## Things to double-check

- **CSP** — Traefik's `secure-headers` middleware (see `infra/traefik/dynamic.yml`)
  must allow inline scripts/styles on `/api/docs` (the SwaggerUI bundle is
  inline). The default CSP in this repo already permits `'unsafe-inline'`
  for both `script-src` and `style-src`, so the UI loads fine.
- **Route prefix collisions** — make sure no other plugin registers a
  route under `/api/docs`. None currently does.
- **JWT in the UI** — operators can paste an access token via the
  "Authorize" button at the top right of `/api/docs`. With
  `persistAuthorization: true`, the token survives page reloads (kept in
  `localStorage`).
- **Production exposure** — `/api/docs` reveals the full API surface.
  That's fine for a self-hosted PaaS where operators are the only users;
  if you ever sell hosted DeployX, gate `/api/docs` behind an admin role.

---

**OPS will message team-lead when this file lands so SEC can pick it up
without grepping for the change.**
