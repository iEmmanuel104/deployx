# Changelog

All notable changes to DeployX are documented in this file. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Conventional Commits](https://www.conventionalcommits.org/).

---

## [Unreleased] — prod-r2 polish round

### Added

- **OPENAPI** — `@fastify/swagger` + `@fastify/swagger-ui` registered at
  `/api/docs`; OpenAPI 3 spec auto-generated from the Fastify-Zod schemas
  so the dashboard, CLI, and external clients have a single source of
  truth for the wire format.
- **EMAIL** — Resend integration scaffolding for transactional auth
  flows: password reset (`POST /api/v1/auth/password/reset`) and email
  verification (`POST /api/v1/auth/email/verify`). Tokens are
  single-use, 1-hour-TTL, and stored hashed alongside `users`.
- **WEBHOOK** — `POST /api/v1/webhooks/git/:provider` receiver with
  HMAC-SHA256 verification (`X-Hub-Signature-256` for GitHub-style
  payloads). Validated pushes enqueue a build job for the matching
  project automatically — no CLI deploy needed for git-driven flows.
- **UX** — Silent JWT refresh in the dashboard: a single in-flight
  promise rotates the access token transparently before expiry, so a
  live tab no longer kicks users back to `/login` every 15 minutes.
  CLI gains `deployx deployments list/get/logs <project>` for parity
  with the dashboard's Deployments tab.
- **BUILDER** — `buildType: dockerfile` now short-circuits Nixpacks and
  feeds the repo's `Dockerfile` directly to `buildImageFromContext()`.
  Validates that the file exists before queuing the build.
- **LIVE** — End-to-end stack verification: the local
  `docker-compose.dev.yml` brings up traefik + docker-proxy + api +
  dashboard, and the Playwright happy-path suite (T28) covers register
  → create project → deploy → live container → delete.

### Changed — POLISH (this PR)

- **Auth queries are now typed Drizzle calls.** Round-1 SEC shipped the
  account-lockout / token-version flow against `users.failed_login_attempts`,
  `users.locked_until`, and `users.token_version` via raw `sql\`...\``
  template strings because the columns were owned by a different stream.
  Now that the columns exist in the merged schema, the lockout reads,
  failed-login counter writes, lockout-reset writes, refresh lookup, and
  logout token-bump are all expressed as typed `db.select(...)` /
  `db.update(...)` calls. The structural-widening hack on the `users`
  table reference is gone.
- **`deployments.errorMsg` and `buildLog` capped at 64 KB.** Both
  the build and deploy handlers now run any failure message and the
  build log through `truncate()` (UTF-8-byte-safe, in
  `apps/api/src/utils/truncate.ts`) before writing to SQLite, suffixing
  with `\n[...truncated]`. Prevents a runaway exception or multi-MB
  docker build log from bloating the row or breaking dashboard rendering.
  Covered by unit tests in `apps/api/src/utils/__tests__/truncate.test.ts`.
- **Env loading + secret-validation centralized.** New `loadEnv()` helper
  in `@deployx/config` replaces both the inline `import "dotenv/config"`
  and the inline `assertProductionSecrets()` in `apps/api/src/index.ts`.
  It loads `.env` idempotently and fail-fast validates
  `ENCRYPTION_KEY` / `JWT_SECRET` are present and not set to the
  documented placeholder. Skipped under `NODE_ENV=test`. Single call
  site lets future worker processes pick up the same checks for free.

### Infrastructure

- **Optional rclone backup for Traefik certs.** Installer adds an
  opt-in section gated on `RCLONE_REMOTE`: when set, it installs
  `rclone`, writes `/etc/rclone.conf` (chmod 0600) from env
  (`RCLONE_TYPE`, `RCLONE_ACCESS_KEY_ID`, `RCLONE_SECRET_ACCESS_KEY`,
  `RCLONE_ENDPOINT`, `RCLONE_REGION`), and installs
  `/etc/cron.daily/deployx-cert-backup` that runs
  `rclone sync /var/lib/deployx/certs ${RCLONE_REMOTE}:deployx-certs/`.
  When `RCLONE_REMOTE` is unset the installer prints a hint and skips —
  operators who don't need offsite cert backup pay no setup cost.

### Docs

- **CHANGELOG.md** — Round-2 `[Unreleased]` section added (this
  entry). README screenshot refresh is deferred to the LIVE stream so
  the captures match the post-r2 dashboard.

---

## [Unreleased] — prod-r1 hardening round

### Added — OPS stream (this PR)

- **Installer host hardening (O3)** — `infra/installer/install.sh` now
  installs and enables `ufw`, `fail2ban`, and `unattended-upgrades` and
  writes an SSH drop-in at `/etc/ssh/sshd_config.d/99-deployx-hardening.conf`
  (`PasswordAuthentication no`, `PermitRootLogin prohibit-password`,
  `PubkeyAuthentication yes`, `PermitEmptyPasswords no`). UFW default policy
  is now `deny incoming` / `allow outgoing` with only 22/80/443 allowed.
  Includes a safety guard that **skips** the password-auth disable when
  `/root/.ssh/authorized_keys` is empty so the installer cannot lock the
  operator out of a fresh VPS.
- **Installer idempotency (O1)** — repeat runs now do
  `git fetch && git reset --hard origin/main` instead of attempting a
  fresh clone over an existing tree. Docker / system user / directories /
  SSH config writes are all idempotent.
- **Installer PLATFORM_DOMAIN validation (O2)** — RFC-1123 hostname (or
  bare IPv4) is validated immediately after OS detection, before any
  destructive system change.
- **Litestream snapshot verification (O4)** — after enabling the systemd
  unit, the installer polls `litestream snapshots` for up to 60s and
  exits non-zero if the creds are filled but no snapshot lands.
- **Traefik default middleware chain (O6)** — `infra/traefik/dynamic.yml`
  adds:
  - `gzip-compress` — Traefik `compress` middleware
  - `secure-headers` — HSTS 1y w/ subdomains+preload, nosniff, `SAMEORIGIN`
    frame-options, `strict-origin-when-cross-origin` referrer policy, CSP
  - `rate-limit` — 100 req/s sustained, 200 burst, per source IP
  - `default-chain` — chain of the three above; apply per-router via
    `traefik.http.routers.<name>.middlewares=default-chain@file`
- **Restore runbook (O5)** — `docs/RESTORE.md` covers full-VPS rebuild,
  in-place DB corruption recovery, point-in-time forensics, and the
  rclone fallback for Traefik certs.
- **OpenAPI patch (O7)** — `docs/openapi-patch.md` describes the
  `@fastify/swagger` + `@fastify/swagger-ui` integration at `/api/docs`
  for the SEC stream to apply to `apps/api/src/index.ts`. OPS does not
  own that file so the change ships as a patch description instead of
  an edit.
- **CHANGELOG.md** (this file) — establishes a tracked changelog.

### Changed

- **README Known Limitations table (O8)** — marked the installer
  hardening, idempotency, Litestream verification, Traefik default chain,
  and restore-runbook rows as ✅; OpenAPI/Swagger row stays 🚧 pending
  SEC pickup.

---

## Prior round-0 history (visible on `main` at the start of prod-r1)

These are the most recent commits that made it to `main` before this
round began. Listed here for reference; not part of the prod-r1 push.

- `8fb1487` — `fix(stack): unblock deploy pipeline + add local-test compose`
- `276b81f` — `docs(readme): flip 6 of 7 known limitations to shipped`
- `f8b667e` — `feat(installer): real Litestream setup + restore docs`
- `9c1305b` — `feat(docker,api,cli,dashboard): real log streaming`
- `8e6d3ea` — `feat(builder,api,cli): build garbage collection`
- `793dadc` — `fix(dashboard): rehydrate auth token from cookie on page load`
- `b171901` — `feat(api): add dotenv, real /readyz DB probe, turbo env passthrough`
- `d79b19b` — `docs(readme): add screenshots, walkthrough, troubleshooting, roadmap`
- `ba8bde9` — `docs(readme): add system requirements table and non-interactive install example`
- `7275a8c` — `docs: add README, CONTRIBUTING, LICENSE and upgrade installer`
- `a0774b3` — `feat(docker): add dev compose, fix Dockerfiles, auto-migrate on boot`
- `cd635bd` — `chore(db): add initial drizzle migration (8 tables)`

For the older sprint-merge history, see `git log --oneline main`.
