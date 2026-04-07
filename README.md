# DeployX

**Lightweight, open-source, self-hosted PaaS. Deploy web apps on a single VPS.**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## What is DeployX?

DeployX is a self-hosted alternative to Railway, Render, and Coolify. It lets you deploy and manage multiple web applications on a single VPS with a clean dashboard and API -- no vendor lock-in, no per-seat pricing, no usage-based surprises.

- **Affordable hosting.** Run multiple apps on a single $6/month VPS instead of paying per-app on managed platforms.
- **Minimal overhead.** ~200MB memory footprint vs 2GB+ for alternatives like Coolify.
- **Security-first design.** No shell string interpolation, hardened containers, encrypted secrets, Docker socket proxy isolation.
- **Multi-language support.** Deploy Node.js, Python, Go, Rust, Ruby, and more via Nixpacks auto-detection.
- **Automatic SSL.** Traefik v3 handles TLS certificates via Let's Encrypt with zero configuration.
- **Simple deployment.** Push a git repo, Docker image, or tarball. DeployX builds and routes it automatically.

---

## Quick Start (VPS)

Deploy DeployX on a fresh VPS with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/iEmmanuel104/deployx/main/infra/installer/install.sh | sudo bash
```

This single command:

1. Installs Docker, Node.js, pnpm, and Nixpacks
2. Generates encryption keys and JWT secrets
3. Creates a system user and required directories
4. Runs database migrations
5. Starts all services via Docker Compose
6. Verifies health and prints the dashboard URL

**Supported operating systems:** Ubuntu 22.04/24.04, Debian 12

---

## Quick Start (Local Development)

```bash
git clone https://github.com/iEmmanuel104/deployx.git
cd deployx
pnpm install
cp .env.example .env  # Then fill in secrets (see Environment Variables below)
pnpm db:generate && pnpm db:migrate
pnpm dev  # API on :3001, Dashboard on :3000
```

Or with Docker:

```bash
docker network create proxy-network
docker compose -f docker-compose.dev.yml up --build
# Dashboard: http://localhost:3000
# API: http://localhost:3001
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Default | Description |
|---|---|---|---|
| `PLATFORM_DOMAIN` | Yes | -- | Your domain (e.g., `deployx.example.com`) |
| `ENCRYPTION_KEY` | Yes | -- | 64 hex chars for AES-256-GCM. Generate: `openssl rand -hex 32` |
| `JWT_SECRET` | Yes | -- | 64 hex chars for JWT signing. Generate: `openssl rand -hex 32` |
| `DB_PATH` | No | `/data/platform.db` | SQLite database file path |
| `PORT` | No | `3001` | API server port |
| `NODE_ENV` | No | `production` | Environment (`production` or `development`) |
| `ACME_EMAIL` | No | -- | Email for Let's Encrypt SSL certificate registration |
| `DEPLOYX_VERSION` | No | `latest` | Platform version tag for Docker images |

---

## Architecture

DeployX uses a four-plane layered architecture:

- **Infrastructure Plane** -- Docker Engine runs containers; Traefik v3 handles reverse proxying, TLS termination, and automatic SSL via Let's Encrypt.
- **Control Plane** -- A Fastify 5 API server manages projects, deployments, and domains. A SQLite-backed job queue handles async operations (builds, health checks, cleanup).
- **Presentation Plane** -- A SvelteKit (Svelte 5) dashboard provides the web UI. A Commander.js CLI offers terminal-based management.
- **Data Plane** -- SQLite in WAL mode (via Drizzle ORM) stores all platform state. The filesystem stores build artifacts and logs.

---

## Project Structure

```text
deployx/
├── apps/
│   ├── api/            # Fastify API server (port 3001)
│   ├── dashboard/      # SvelteKit web UI (port 3000)
│   └── cli/            # Commander.js CLI tool
├── packages/
│   ├── builder/        # Nixpacks build wrapper
│   ├── crypto/         # AES-256-GCM encryption utilities
│   ├── db/             # Drizzle ORM schema + SQLite client
│   ├── docker/         # Docker client with security defaults + Traefik labels
│   ├── types/          # Shared Zod schemas and TypeScript types
│   └── config/         # Platform config loader (deployx.yaml + env)
└── infra/
    ├── traefik/        # Traefik reverse proxy configuration
    ├── installer/      # VPS one-line setup script
    └── systemd/        # systemd service unit
```

---

## How It Works

1. **Create a project.** Point DeployX at a git repository, Docker image, or uploaded archive.
2. **Automatic build.** DeployX clones the source and builds it with Nixpacks, which auto-detects the language and framework.
3. **Hardened container.** A Docker container is created with security defaults: all capabilities dropped, no-new-privileges, seccomp and AppArmor profiles, PID limits.
4. **Automatic routing.** Traefik picks up the new container via Docker labels and configures routing with automatic TLS certificates.
5. **Live.** Your app is accessible at `your-project.your-domain.com`.

Projects are managed through the web dashboard, the CLI, or the REST API. No per-project infrastructure setup is needed -- add repos and deploy.

---

## Security

DeployX is built with a security-first approach. These measures are enforced at the code level, not left to configuration:

- **No shell string interpolation.** All subprocess calls use `execFile()` with parameterized argument arrays. This eliminates the command injection class of vulnerabilities entirely.
- **Container hardening.** Every container runs with `CapDrop: ALL`, `SecurityOpt: no-new-privileges`, seccomp and AppArmor profiles, and a PID limit of 256.
- **Build isolation.** Build containers run with `NetworkMode: none` to prevent exfiltration during builds.
- **Encrypted environment variables.** Secrets are stored with AES-256-GCM encryption using per-project keys derived via HKDF.
- **Docker socket proxy.** Application code never accesses the Docker socket directly. All Docker API calls go through a restricted proxy that allowlists specific endpoints.
- **Authentication.** JWT access tokens with 15-minute expiry, httpOnly SameSite=Strict refresh cookies, and rate limiting on auth endpoints (5 failures = 15-minute lockout).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 LTS |
| Language | TypeScript (strict mode) |
| API | Fastify 5 |
| Dashboard | SvelteKit (Svelte 5) |
| Database | SQLite + Drizzle ORM |
| Containers | Docker + Traefik v3 |
| Builds | Nixpacks |
| Monorepo | Turborepo + pnpm |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code conventions, and the pull request process.

---

## License

Apache 2.0 -- see [LICENSE](LICENSE) for the full text.
