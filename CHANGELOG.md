# Changelog

All notable changes to DeployX are documented in this file. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Conventional Commits](https://www.conventionalcommits.org/).

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
