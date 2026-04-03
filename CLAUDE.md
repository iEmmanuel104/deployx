# DeployX — Claude Code Project Instructions

## Project Overview

DeployX is a lightweight, open-source, self-hosted PaaS (Platform-as-a-Service). It enables developers to deploy, manage, and monitor web applications on a single VPS with Railway/Render-quality UX at a fraction of the cost.

**License:** Apache 2.0
**Stage:** Phase 0 (MVP development)

## Architecture

Four-plane layered architecture:
- **Infrastructure Plane:** Docker Engine + Traefik v3 reverse proxy
- **Control Plane:** Node.js 22 LTS Fastify API + job queue (`apps/api`)
- **Presentation Plane:** SvelteKit (Svelte 5) dashboard + Commander.js CLI (`apps/dashboard`, `apps/cli`)
- **Data Plane:** SQLite (WAL mode) + Drizzle ORM + filesystem (`packages/db`)

## Monorepo Structure

```
deployx/
├── apps/
│   ├── api/          # Fastify control plane (port 3001)
│   ├── dashboard/    # SvelteKit web UI (port 3000)
│   └── cli/          # Commander.js CLI (npm package: deployx)
├── packages/
│   ├── db/           # Drizzle ORM schema + SQLite client
│   ├── docker/       # dockerode wrapper via docker-socket-proxy
│   ├── types/        # Shared Zod schemas + TypeScript types
│   └── config/       # Platform config loader (deployx.yaml + env)
├── infra/
│   ├── traefik/      # traefik.yml + dynamic.yml
│   ├── installer/    # install.sh (VPS setup script)
│   └── systemd/      # deployx.service
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

## Tech Stack

- **Runtime:** Node.js 22 LTS, ESM-only
- **Language:** TypeScript (strict mode, verbatimModuleSyntax)
- **Package Manager:** pnpm with workspace protocol
- **Monorepo:** Turborepo
- **API:** Fastify 5 with fastify-type-provider-zod
- **Dashboard:** SvelteKit (Svelte 5 runes syntax)
- **CLI:** Commander.js + chalk + ora
- **Database:** SQLite 3.45+ with Drizzle ORM, WAL mode
- **Docker SDK:** dockerode via docker-socket-proxy (Tecnativa)
- **Reverse Proxy:** Traefik v3
- **Validation:** Zod schemas (shared in @deployx/types)

## Code Conventions

- **ESM only** — all files use `import`/`export`, `.js` extensions in relative imports
- **Strict TypeScript** — `strict: true`, `verbatimModuleSyntax: true`
- **Zod validation** — all API inputs validated with Zod schemas before any business logic
- **API envelope** — all responses use `{ ok: true, data, meta }` or `{ ok: false, error: { code, message, details } }`
- **Fastify plugins** — routes use the plugin pattern with `fastify-plugin`
- **Drizzle ORM** — never raw SQL strings; use the query builder
- **ULID primary keys** — lexicographic ordering, TEXT type in SQLite
- **ISO-8601 timestamps** — stored as TEXT in SQLite

## SECURITY RULES (CRITICAL)

These rules are non-negotiable. Violations create P0 vulnerabilities.

### 1. No Shell String Interpolation
NEVER use string interpolation for shell commands — always use `execFile()` with parameterized arrays. This prevents command injection (the root cause of 7/11 Coolify CVEs).

### 2. No Raw Docker Socket
- NEVER mount `/var/run/docker.sock` directly in application code
- ALWAYS connect through docker-socket-proxy at `http://docker-proxy:2375`
- The proxy restricts which Docker API calls are allowed

### 3. Container Hardening
Every container created by DeployX MUST include:
- SecurityOpt: no-new-privileges, seccomp:default, apparmor:docker-default
- CapDrop: ALL
- Privileged: NEVER set to true
- PidsLimit: 256
- User: 1000:1000

### 4. Secrets Encryption
- Environment variables stored with AES-256-GCM encryption
- Per-project keys derived via HKDF from master key
- Never log or expose decrypted values

### 5. Input Validation
- All API inputs validated with Zod schemas BEFORE any business logic
- Project names/slugs: alphanumeric + hyphen only, max 48 chars
- Domain names: RFC-1123 validated
- Env var keys: uppercase alphanumeric + underscore only
- Build commands: no shell metacharacters (|, &, ;, $)

### 6. Authentication
- JWT access tokens: 15-minute expiry, HS256
- Refresh tokens: 7-day expiry, httpOnly SameSite=Strict cookie
- API tokens: SHA-256 hashed in DB, shown once
- Rate limiting: 5 failed logins = 15-minute IP lockout

## Database Rules

- **PM2 fork mode only** — NEVER use cluster mode with SQLite (causes WAL corruption)
- **WAL mode required** — apply pragmas at connection open time (see packages/db/src/client.ts)
- **Single writer** — SQLite supports one writer at a time; use busy_timeout=5000

## Common Commands

```bash
pnpm install              # Install all dependencies
pnpm dev                  # Start all apps in dev mode
pnpm build                # Build all packages and apps
pnpm typecheck            # TypeScript type checking
pnpm lint                 # ESLint
pnpm format               # Prettier format
pnpm db:generate          # Generate Drizzle migrations
pnpm db:migrate           # Run migrations
```

## Key Files

- `packages/types/src/index.ts` — All Zod schemas and TypeScript types
- `packages/db/src/schema.ts` — Drizzle ORM database schema
- `packages/db/src/client.ts` — SQLite connection with WAL pragmas
- `packages/docker/src/index.ts` — Docker client with security defaults
- `apps/api/src/index.ts` — Fastify server entry point
- `apps/api/src/routes/` — API route handlers
- `docker-compose.yml` — Platform service orchestration
- `infra/traefik/traefik.yml` — Traefik reverse proxy config
