#!/usr/bin/env bash
# Tear down the DeployX local end-to-end stack started by scripts/up-local.sh.
#
# - docker compose down -v (removes containers AND named volumes so the next
#   `up-local.sh` starts from a clean DB).
# - Removes .env.local (which carried freshly-generated secrets).
# - Removes the proxy-network if no other containers are still attached.
#
# Usage: scripts/down-local.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="$REPO_ROOT/.env.local"
COMPOSE_FILE="$REPO_ROOT/docker-compose.local.yml"

# docker compose can run without the env file as long as we don't reference
# unset vars during teardown. Fall back to a synthetic empty file if it's gone
# (e.g. caller already removed it manually).
if [[ ! -f "$ENV_FILE" ]]; then
  TMP_ENV="$(mktemp)"
  trap 'rm -f "$TMP_ENV"' EXIT
  cat >"$TMP_ENV" <<EOF
PLATFORM_DOMAIN=localhost
ENCRYPTION_KEY=00000000000000000000000000000000
JWT_SECRET=00000000000000000000000000000000
EOF
  ENV_FILE="$TMP_ENV"
  echo "[down-local] .env.local missing — using synthetic env for teardown"
fi

echo "[down-local] stopping services + removing volumes…"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down -v --remove-orphans || true

# Only delete the real .env.local, not a synthetic one.
if [[ -f "$REPO_ROOT/.env.local" ]]; then
  rm -f "$REPO_ROOT/.env.local"
  echo "[down-local] removed .env.local"
fi

# Try to remove proxy-network. Fails (and we ignore) if user-deployed projects
# are still attached to it; that's the safe behaviour.
if docker network inspect proxy-network >/dev/null 2>&1; then
  if docker network rm proxy-network >/dev/null 2>&1; then
    echo "[down-local] removed docker network proxy-network"
  else
    echo "[down-local] proxy-network still in use — leaving it"
  fi
fi

echo "[down-local] done."
