# DeployX — End-to-End Test Stack

The repository ships a `docker-compose.local.yml` profile that brings up the
full DeployX stack (Traefik + docker-socket-proxy + api + dashboard) on
**port 80 only**, without TLS / Let's Encrypt. The Playwright suite under
`apps/dashboard/playwright/` can then drive the live system against a real
test app (`https://github.com/iEmmanuel104/keep-alive-pinger`) to prove the
deployment pipeline works end-to-end.

This document covers how to run it.

---

## Prerequisites

| Requirement | Why |
|---|---|
| Docker Engine + Compose plugin | builds + runs the platform containers |
| `openssl` | generates fresh ENCRYPTION_KEY / JWT_SECRET per run |
| `curl` | health-probes the stack before tests start |
| `pnpm` 9.15+, Node 22+ | runs the Playwright suite |
| Free TCP ports `80` and `8080` | Traefik HTTP + Traefik dashboard |

The test rig uses [`localtest.me`](https://readme.localtest.me), which
publicly resolves `*.localtest.me` to `127.0.0.1`. No host file edits or
DNS changes are needed.

---

## Quick start

From the repository root:

```bash
# One-shot: bring up the stack, run E2E, tear down.
RUN_E2E=1 pnpm test:e2e
```

This is wired up in `package.json` as a compound script that runs
`scripts/up-local.sh && pnpm -F @deployx/dashboard test:e2e && scripts/down-local.sh`.

If you want finer-grained control:

```bash
# 1) Bring the stack up.
scripts/up-local.sh

# 2) (optional) install Playwright browsers if you haven't already.
pnpm -F @deployx/dashboard exec playwright install --with-deps chromium

# 3) Run only the live happy path.
RUN_E2E=1 pnpm -F @deployx/dashboard test:e2e --grep "happy path"

# 4) Or run everything, then tear down.
RUN_E2E=1 pnpm -F @deployx/dashboard test:e2e
scripts/down-local.sh
```

---

## What `up-local.sh` does

1. Generates a fresh `.env.local` containing
   - `PLATFORM_DOMAIN=localhost`
   - `ENCRYPTION_KEY` (64 hex chars from `openssl rand -hex 32`)
   - `JWT_SECRET` (64 hex chars from `openssl rand -hex 32`)
2. Creates the `proxy-network` external Docker network if missing.
3. Builds and starts the compose services in detached mode.
4. Waits up to 120s for
   - the dashboard to respond at `http://localhost/`
   - the api `/healthz` to return `200` (probed via `docker compose exec`)
5. Prints the URLs and exits.

If either probe times out, the script tails the last 100 lines from
`traefik`, `dashboard`, and `api` and exits non-zero.

## What `down-local.sh` does

1. `docker compose down -v --remove-orphans` — kills containers + volumes,
   so the next `up-local.sh` starts with a fresh SQLite DB.
2. Removes the generated `.env.local`.
3. Removes `proxy-network` if no other containers are still attached.

`-v` is intentional. The encryption key changes every run, so any leftover
encrypted env vars from a previous boot would fail to decrypt.

---

## What the happy-path spec does

`apps/dashboard/playwright/happy-path.spec.ts` — gated on `RUN_E2E=1` — runs
this end-to-end flow:

1. Register a unique user via the public API.
2. Log in through the dashboard UI.
3. Navigate to **/projects** → confirm the empty state.
4. Create a project named **"Pinger E2E"** with
   - `git_repo: https://github.com/iEmmanuel104/keep-alive-pinger.git`
   - `git_branch: main`
   - `build_type: nixpacks`
   - `port: 3000`
5. Poll `/api/v1/projects/:id` every 5 s, up to **5 min**, waiting for
   `status === "running"`. Fails fast on `failed`/`crashed`/`error`.
6. Open the **Domains** tab and add `pinger-e2e-<rand>.localtest.me`.
7. Curl `http://localhost/` with `Host: pinger-e2e-<rand>.localtest.me` until
   Traefik proxies through to the pinger container, then assert the body has
   `running: true`.

Total runtime is bounded at **10 minutes** per test.

The follow-up `pinger-deploy.spec.ts` discovers the pinger router via
Traefik's `:8080/api/http/routers` endpoint and re-verifies the public route
is still serving. It's a smoke check that the previous deploy didn't silently
crash between specs.

---

## Troubleshooting

**The stack fails to come up.**

```bash
docker compose --env-file .env.local -f docker-compose.local.yml logs --tail 200
```

Common causes:

| Symptom | Fix |
|---|---|
| Port 80 already bound (`address already in use`) | `sudo lsof -iTCP:80 -sTCP:LISTEN` and stop whatever's running |
| `proxy-network` exists but Traefik can't find services | `docker network rm proxy-network` then re-run `up-local.sh` |
| api fails with `JWT_SECRET … default placeholder` | `.env.local` is empty / stale — delete it and re-run |
| Nixpacks build hangs at "Building" | `DOCKER_BUILDKIT=0` is set in compose; if you've overridden it, revert |

**The project never reaches `status: "running"`.**

Tail the api logs and look for the queue worker output:

```bash
docker compose --env-file .env.local -f docker-compose.local.yml logs -f api
```

The deploy goes through these statuses:
`pending → cloning → building → starting → running` (happy path), or
`pending → … → failed` (with the error in `deployments.error_msg`).

Inspect the deployment row directly:

```bash
docker compose --env-file .env.local -f docker-compose.local.yml exec api \
  sqlite3 /data/platform.db \
  'SELECT status, error_msg FROM deployments ORDER BY created_at DESC LIMIT 5;'
```

**Traefik returns 404 for the new domain.**

Domains added via the dashboard write a `domains` row but the Traefik
dynamic file provider needs to pick it up. The compose file uses the docker
provider with container labels, so domains added to *user* projects are
served once the runtime container has the matching label. If the deploy is
still in progress, give it another 10 seconds. If `running` was reached but
the route still 404s, that's a real bug — capture the output of:

```bash
curl http://localhost:8080/api/http/routers | jq
```

**Playwright says "Requires live docker-compose stack — set RUN_E2E=1".**

The suite intentionally skips by default to keep CI green when the stack
isn't running. Export `RUN_E2E=1` for the spec to execute.

---

## Cleanup

```bash
scripts/down-local.sh
```

If something is wedged, the heavy-handed option is:

```bash
docker compose --env-file .env.local -f docker-compose.local.yml down -v --remove-orphans
docker network rm proxy-network 2>/dev/null || true
rm -f .env.local
```
