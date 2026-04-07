# Contributing to DeployX

Thank you for your interest in contributing to DeployX. This guide covers everything you need to get started.

---

## Development Setup

### Prerequisites

- Node.js 22+ (LTS)
- pnpm 9+
- Docker (for running the full platform locally)

### Clone and Install

```bash
git clone https://github.com/iEmmanuel104/deployx.git
cd deployx
pnpm install
```

### Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and generate the required secrets:

```bash
# Generate ENCRYPTION_KEY
openssl rand -hex 32

# Generate JWT_SECRET
openssl rand -hex 32
```

Paste the generated values into the corresponding fields in `.env`.

### Database Setup

```bash
pnpm db:generate    # Generate Drizzle migration files
pnpm db:migrate     # Apply migrations to SQLite
```

### Run in Development

```bash
pnpm dev            # Start all services (API on :3001, Dashboard on :3000)
```

### Other Commands

```bash
pnpm build          # Build all packages and apps
pnpm test           # Run tests
pnpm typecheck      # TypeScript type checking
pnpm lint           # ESLint
pnpm format         # Prettier formatting
```

---

## Code Conventions

### General

- **ESM only.** All files use `import`/`export`. Use `.js` extensions in relative imports (even for TypeScript files).
- **Strict TypeScript.** `strict: true` and `verbatimModuleSyntax: true` are enforced. Do not use `any`.
- **Conventional commits.** Format: `type(scope): description`. Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`.

### API

- **Zod validation** on all API inputs. Schemas live in `@deployx/types` and are validated before any business logic runs.
- **Response envelope.** All API responses follow `{ ok: true, data, meta }` for success or `{ ok: false, error: { code, message, details } }` for errors.
- **Fastify plugins.** Routes are registered using the `fastify-plugin` pattern.

### Database

- **Drizzle ORM only.** Never use raw SQL strings; always use the Drizzle query builder.
- **ULID primary keys.** All tables use ULID strings (TEXT type) for primary keys, providing lexicographic ordering.
- **ISO-8601 timestamps.** Stored as TEXT in SQLite.
- **WAL mode.** SQLite runs in WAL mode. Never use PM2 cluster mode (causes WAL corruption).

### Security (Non-Negotiable)

- **No shell string interpolation.** Always use `execFile()` with argument arrays.
- **No raw Docker socket.** Connect through docker-socket-proxy only.
- **Container hardening.** Every container must include: `CapDrop: ALL`, `SecurityOpt: no-new-privileges`, seccomp, AppArmor, `PidsLimit: 256`.
- **No `any` casts to bypass validation.**

---

## Project Structure

| Package | Description |
|---|---|
| `apps/api` | Fastify 5 control plane API server. Handles project CRUD, deployments, domains, and authentication. |
| `apps/dashboard` | SvelteKit (Svelte 5) web interface for managing projects and viewing logs. |
| `apps/cli` | Commander.js CLI tool published as the `deployx` npm package. |
| `packages/builder` | Nixpacks build wrapper. Handles cloning repos, running builds, and producing container images. |
| `packages/crypto` | AES-256-GCM encryption and HKDF key derivation for environment variable storage. |
| `packages/db` | Drizzle ORM schema definitions, SQLite client with WAL pragmas, and migration tooling. |
| `packages/docker` | Dockerode wrapper that connects through docker-socket-proxy and applies security defaults to all containers. |
| `packages/types` | Shared Zod schemas and inferred TypeScript types used across all packages. |
| `packages/config` | Platform configuration loader. Reads `deployx.yaml` and environment variables. |
| `infra/traefik` | Traefik v3 static and dynamic configuration files. |
| `infra/installer` | One-line VPS setup script (`install.sh`). |
| `infra/systemd` | systemd service unit for running DeployX as a system service. |

---

## Pull Request Process

1. **Fork the repository** and create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Follow existing code patterns.** Look at similar files in the codebase for conventions on naming, structure, and error handling.

3. **Add tests** for new functionality. Tests use vitest.

4. **Verify everything passes** before submitting:
   ```bash
   pnpm build && pnpm test && pnpm typecheck && pnpm lint
   ```

5. **Submit a pull request** with a clear description of what changed and why. Reference any related issues.

### PR Guidelines

- Keep PRs focused. One logical change per PR.
- Update or add tests for any changed behavior.
- Do not introduce new `any` types or bypass Zod validation.
- Ensure no TypeScript errors, lint warnings, or test failures.

---

## Security Vulnerabilities

If you discover a security vulnerability, **do not open a public issue.** Instead, please email the maintainer directly so the issue can be assessed and patched before public disclosure.

Contact: [iEmmanuel104](https://github.com/iEmmanuel104)

---

## License

By contributing to DeployX, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
