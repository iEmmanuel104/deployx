#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# DeployX Platform Installer
# One-command setup for a fresh VPS. Handles everything from OS detection
# to a running platform with dashboard and API.
#
# Non-interactive usage (all prompts have defaults):
#   PLATFORM_DOMAIN=my.domain.com ACME_EMAIL=me@example.com curl ... | sudo bash
# ==============================================================================

# ── Color output helpers ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()  { echo -e "\n${CYAN}──── $* ────${NC}"; }

# ── Root check ────────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  log_error "This script must be run as root (use sudo)"
  exit 1
fi

# ── OS detection ──────────────────────────────────────────────────────────────
log_step "Detecting operating system"

if [[ ! -f /etc/os-release ]]; then
  log_error "Cannot detect OS — /etc/os-release not found"
  exit 1
fi

# shellcheck source=/dev/null
source /etc/os-release

SUPPORTED=false
case "${ID}-${VERSION_ID}" in
  ubuntu-22.04|ubuntu-24.04|debian-12)
    SUPPORTED=true
    ;;
esac

if [[ "$SUPPORTED" != "true" ]]; then
  log_error "Unsupported OS: ${PRETTY_NAME}"
  log_error "DeployX requires Ubuntu 22.04, Ubuntu 24.04, or Debian 12"
  exit 1
fi

log_ok "Detected ${PRETTY_NAME}"

# ── Early PLATFORM_DOMAIN validation (O2) ────────────────────────────────────
# If the operator passed PLATFORM_DOMAIN via env, validate it BEFORE any
# destructive system change. We accept either a valid RFC-1123 hostname OR a
# bare IPv4 address (some users install against a raw VPS IP first, then add
# DNS later). Empty PLATFORM_DOMAIN is allowed here — it triggers an
# interactive prompt later.
if [[ -n "${PLATFORM_DOMAIN:-}" ]]; then
  if [[ "$PLATFORM_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    log_ok "PLATFORM_DOMAIN '$PLATFORM_DOMAIN' is a bare IPv4 — accepting"
  elif ! [[ "$PLATFORM_DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$ ]]; then
    log_err "PLATFORM_DOMAIN '$PLATFORM_DOMAIN' is not a valid hostname"
    log_err "Must match RFC-1123: lowercase letters, digits, hyphens; dots between labels."
    exit 1
  fi
fi

# ── Install essential packages (including git) ───────────────────────────────
log_step "Installing essential packages"

apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg lsb-release git
log_ok "Essential packages installed"

# ── Clone DeployX repository ────────────────────────────────────────────────
log_step "Setting up DeployX source code"

if [[ -d /opt/deployx/.git ]]; then
  log_info "DeployX already installed, hard-resetting to origin/main (O1 idempotency)..."
  cd /opt/deployx
  git fetch origin
  git reset --hard origin/main
  log_ok "Source code updated to origin/main"
else
  log_info "Cloning DeployX repository..."
  # Ensure /opt/deployx exists but is empty (or absent) before cloning
  if [[ -d /opt/deployx ]]; then
    # Directory exists but is not a git repo — preserve data subdirs, clone to temp
    log_info "Existing /opt/deployx found without git, merging..."
    TMPDIR=$(mktemp -d)
    git clone https://github.com/iEmmanuel104/deployx.git "$TMPDIR"
    cp -rn "$TMPDIR"/. /opt/deployx/ 2>/dev/null || true
    mv "$TMPDIR/.git" /opt/deployx/.git 2>/dev/null || true
    rm -rf "$TMPDIR"
    log_ok "Source code merged into /opt/deployx"
  else
    git clone https://github.com/iEmmanuel104/deployx.git /opt/deployx
    log_ok "Source code cloned to /opt/deployx"
  fi
fi

# ── Install Docker Engine if not present ──────────────────────────────────────
log_step "Checking Docker installation"

if command -v docker &>/dev/null; then
  DOCKER_VERSION=$(docker --version | awk '{print $3}' | tr -d ',')
  log_ok "Docker already installed (v${DOCKER_VERSION})"
else
  log_info "Installing Docker Engine..."

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} \
    $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable docker
  systemctl start docker

  log_ok "Docker Engine installed successfully"
fi

# ── Create Docker proxy network ───────────────────────────────────────────────
log_step "Creating Docker network"

docker network create proxy-network 2>/dev/null || true
log_ok "proxy-network ready"

# ── Host hardening: UFW + SSH + fail2ban + unattended-upgrades (O3) ──────────
log_step "Host hardening (UFW + SSH + fail2ban + unattended-upgrades)"

# Install hardening packages (idempotent — apt is a no-op if already installed)
apt-get install -y -qq ufw fail2ban unattended-upgrades

# UFW: default deny inbound, allow only SSH/HTTP/HTTPS
if command -v ufw &>/dev/null; then
  ufw --force default deny incoming
  ufw --force default allow outgoing
  ufw allow 22/tcp   comment "SSH" >/dev/null
  ufw allow 80/tcp   comment "HTTP" >/dev/null
  ufw allow 443/tcp  comment "HTTPS" >/dev/null
  ufw --force enable >/dev/null

  # Docker-USER chain rules (PRD 22.2.1)
  # Block direct container access from external networks
  iptables -I DOCKER-USER -i eth0 -j DROP 2>/dev/null || true
  iptables -I DOCKER-USER -i eth0 -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
  iptables -I DOCKER-USER -i eth0 -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
  iptables -I DOCKER-USER -i eth0 -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || true

  log_ok "UFW: default-deny incoming, 22/80/443 allowed"
else
  log_warn "UFW not available after install attempt — skipping firewall configuration"
fi

# SSH hardening — only proceed if we will not lock the operator out
SSH_AUTH_KEYS_FILE="/root/.ssh/authorized_keys"
if [[ -s "$SSH_AUTH_KEYS_FILE" ]]; then
  log_info "Found authorized_keys for root — safe to disable password auth"
  mkdir -p /etc/ssh/sshd_config.d
  cat > /etc/ssh/sshd_config.d/99-deployx-hardening.conf <<'SSHEOF'
# DeployX SSH hardening (written by installer)
PasswordAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
PermitEmptyPasswords no
SSHEOF
  chmod 0644 /etc/ssh/sshd_config.d/99-deployx-hardening.conf

  # Cloud-init's drop-in often re-enables password auth — override it idempotently
  if [[ -f /etc/ssh/sshd_config.d/50-cloud-init.conf ]]; then
    cat > /etc/ssh/sshd_config.d/50-cloud-init.conf <<'CIEOF'
# Overridden by DeployX installer to keep password auth disabled
PasswordAuthentication no
CIEOF
  fi

  if sshd -t 2>/dev/null; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
    log_ok "SSH hardened (key-only auth, root prohibit-password)"
  else
    log_warn "sshd -t failed after writing hardening config — NOT reloading sshd"
    log_warn "Inspect /etc/ssh/sshd_config.d/ manually before reloading"
  fi
else
  echo ""
  log_warn "╔══════════════════════════════════════════════════════════════════╗"
  log_warn "║  SSH HARDENING SKIPPED — no SSH key found in $SSH_AUTH_KEYS_FILE"
  log_warn "║                                                                  "
  log_warn "║  Disabling password auth now would lock you out of this VPS.    "
  log_warn "║  To complete hardening:                                          "
  log_warn "║    1. ssh-copy-id root@<this-vps-ip>   (from your workstation)  "
  log_warn "║    2. Re-run this installer                                      "
  log_warn "║                                                                  "
  log_warn "║  Password auth remains ENABLED until you do this.                "
  log_warn "╚══════════════════════════════════════════════════════════════════╝"
  echo ""
fi

# fail2ban — protect SSH against brute force (default jail.d/sshd config is fine)
systemctl enable --now fail2ban 2>/dev/null && log_ok "fail2ban enabled" || \
  log_warn "Could not enable fail2ban — check 'systemctl status fail2ban'"

# unattended-upgrades — apply security patches automatically
systemctl enable --now unattended-upgrades 2>/dev/null && log_ok "unattended-upgrades enabled" || \
  log_warn "Could not enable unattended-upgrades"

# ── Create platform directories ───────────────────────────────────────────────
log_step "Creating platform directories"

DIRS=(
  /opt/deployx
  /opt/deployx/data
  /opt/deployx/builds
  /opt/deployx/logs
  /etc/deployx
)

for dir in "${DIRS[@]}"; do
  mkdir -p "$dir"
  log_info "Created $dir"
done

log_ok "Platform directories created"

# ── Create deployx system user ────────────────────────────────────────────────
log_step "Creating deployx system user"

if id "deployx" &>/dev/null; then
  log_ok "User 'deployx' already exists"
else
  adduser --system --group --home /opt/deployx --shell /usr/sbin/nologin deployx
  usermod -aG docker deployx
  log_ok "User 'deployx' created and added to docker group"
fi

# ── Generate secrets ──────────────────────────────────────────────────────────
log_step "Generating secrets"

ENCRYPTION_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)

log_ok "Encryption key generated (64 hex chars)"
log_ok "JWT secret generated (64 hex chars)"

# ── Domain configuration ────────────────────────────────────────────────────
log_step "Configuring domain"

if [[ -z "${PLATFORM_DOMAIN:-}" ]]; then
  SERVER_IP=$(curl -sf https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
  log_info "Server IP: ${SERVER_IP}"
  log_info ""
  log_info "Enter your domain name (e.g., deployx.example.com)"
  log_info "Or press Enter to use the server IP (${SERVER_IP}):"
  read -r PLATFORM_DOMAIN || true
  PLATFORM_DOMAIN=${PLATFORM_DOMAIN:-$SERVER_IP}
fi
log_ok "Platform domain: ${PLATFORM_DOMAIN}"

# ── ACME email configuration ────────────────────────────────────────────────
log_step "Configuring SSL certificates"

if [[ -z "${ACME_EMAIL:-}" ]]; then
  log_info "Enter email for Let's Encrypt SSL certificates (optional):"
  read -r ACME_EMAIL || true
  ACME_EMAIL=${ACME_EMAIL:-admin@${PLATFORM_DOMAIN}}
fi
log_ok "ACME email: ${ACME_EMAIL}"

# ── Create environment file ───────────────────────────────────────────────────
log_step "Creating environment configuration"

ENV_FILE="/etc/deployx/.env"

if [[ -f "$ENV_FILE" ]]; then
  log_warn "Environment file already exists at ${ENV_FILE}"
  log_warn "Backing up to ${ENV_FILE}.bak"
  cp "$ENV_FILE" "${ENV_FILE}.bak"
fi

# Validate ACME email format
if [[ ! "$ACME_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
  log_warn "ACME_EMAIL '${ACME_EMAIL}' may not be a valid email — Let's Encrypt may reject it"
fi

cat > "$ENV_FILE" <<EOF
# DeployX Platform Configuration
# Generated by install.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Platform
PLATFORM_DOMAIN=${PLATFORM_DOMAIN}
NODE_ENV=production
PORT=3001

# Database
DB_PATH=/opt/deployx/data/platform.db

# Security — DO NOT SHARE THESE VALUES
ENCRYPTION_KEY=${ENCRYPTION_KEY}
JWT_SECRET=${JWT_SECRET}

# TLS / Let's Encrypt
ACME_EMAIL=${ACME_EMAIL}

# Docker
DOCKER_HOST=tcp://docker-proxy:2375
DEPLOYX_VERSION=latest
EOF

chmod 600 "$ENV_FILE"
chown deployx:deployx "$ENV_FILE"

log_ok "Environment file written to ${ENV_FILE}"

# ── TCP tuning (PRD 19.5) ────────────────────────────────────────────────────
log_step "Applying TCP / kernel tuning"

cat > /etc/sysctl.d/99-deployx.conf <<'EOF'
# DeployX kernel tuning

# Increase socket buffer sizes
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216

# Connection handling
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_max_syn_backlog = 65535

# TIME_WAIT optimization
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15

# Keepalive tuning
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5

# File descriptor limits
fs.file-max = 2097152
fs.inotify.max_user_watches = 524288

# VM tuning
vm.swappiness = 10
vm.dirty_ratio = 60
vm.dirty_background_ratio = 2
EOF

sysctl --system > /dev/null 2>&1

log_ok "Kernel parameters applied"

# ── Docker daemon.json (log rotation, build GC — PRD 21.4) ───────────────────
log_step "Configuring Docker daemon"

DAEMON_JSON="/etc/docker/daemon.json"

cat > "$DAEMON_JSON" <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "builder": {
    "gc": {
      "enabled": true,
      "defaultKeepStorage": "10GB",
      "policy": [
        { "keepStorage": "10GB", "filter": ["unused-for=168h"] },
        { "keepStorage": "20GB" }
      ]
    }
  },
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 65536,
      "Soft": 65536
    }
  }
}
EOF

systemctl restart docker
log_ok "Docker daemon configured with log rotation and build GC"

# ── Install Nixpacks ─────────────────────────────────────────────────────────
log_step "Installing Nixpacks"

if command -v nixpacks &>/dev/null; then
  NIXPACKS_VERSION=$(nixpacks --version 2>/dev/null | awk '{print $2}')
  log_ok "Nixpacks already installed (v${NIXPACKS_VERSION})"
else
  log_info "Installing Nixpacks..."
  curl -fsSL https://nixpacks.com/install.sh | bash
  log_ok "Nixpacks installed"
fi

# ── Verify Node.js and pnpm ─────────────────────────────────────────────────
log_step "Verifying Node.js and pnpm"

if ! command -v node &>/dev/null; then
  log_info "Installing Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
NODE_VER=$(node --version)
log_ok "Node.js ${NODE_VER}"

if ! command -v pnpm &>/dev/null; then
  log_info "Installing pnpm..."
  npm install -g pnpm@9
fi
log_ok "pnpm $(pnpm --version)"

# ── Run database migrations ──────────────────────────────────────────────────
log_step "Running database migrations"

if [[ -f /opt/deployx/package.json ]]; then
  cd /opt/deployx
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  pnpm db:migrate
  log_ok "Database migrations applied"
  cd -
else
  log_warn "Project files not found at /opt/deployx — skipping migrations"
  log_warn "Run 'pnpm db:migrate' after copying project files"
fi

# ── Set ownership ─────────────────────────────────────────────────────────────
log_step "Setting file ownership"

chown -R deployx:deployx /opt/deployx
log_ok "Ownership set for /opt/deployx"

# ── PM2 setup ────────────────────────────────────────────────────────────────
log_step "Setting up PM2 process manager"

if command -v pm2 &>/dev/null; then
  log_ok "PM2 already installed"
else
  npm install -g pm2
  log_ok "PM2 installed"
fi

cat > /opt/deployx/ecosystem.config.cjs <<'PMEOF'
module.exports = {
  apps: [
    {
      name: "deployx-api",
      script: "/opt/deployx/apps/api/dist/index.js",
      cwd: "/opt/deployx",
      exec_mode: "fork",
      instances: 1,
      env_file: "/etc/deployx/.env",
      max_memory_restart: "512M",
      log_file: "/opt/deployx/logs/api.log",
      error_file: "/opt/deployx/logs/api-error.log",
      out_file: "/opt/deployx/logs/api-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
PMEOF

chown deployx:deployx /opt/deployx/ecosystem.config.cjs
pm2 startup systemd -u deployx --hp /opt/deployx 2>/dev/null || true
log_ok "PM2 ecosystem config created (fork mode — required for SQLite)"

# ── Litestream setup ─────────────────────────────────────────────────────────
log_step "Litestream database replication"

LITESTREAM_VERSION="0.3.13"
LITESTREAM_DEB="litestream-v${LITESTREAM_VERSION}-linux-amd64.deb"

if command -v litestream &>/dev/null; then
  log_ok "Litestream already installed ($(litestream version 2>&1 | head -1))"
else
  log_info "Installing Litestream v${LITESTREAM_VERSION}"
  TMP_DEB="/tmp/${LITESTREAM_DEB}"
  if curl -fsSL -o "$TMP_DEB" \
    "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/${LITESTREAM_DEB}"; then
    dpkg -i "$TMP_DEB" >/dev/null 2>&1 || apt-get install -f -y >/dev/null
    rm -f "$TMP_DEB"
    log_ok "Litestream installed"
  else
    log_warn "Could not download Litestream — skipping backup setup"
    log_warn "Install manually: https://litestream.io/install/"
  fi
fi

# Write the litestream config in disabled/template form. The platform DB path
# is real but the replica target intentionally has placeholder credentials so
# the daemon refuses to start until the operator fills them in. This keeps
# fresh installs from silently shipping data nowhere.
if [[ -f /etc/litestream.yml ]]; then
  log_ok "Litestream config already exists at /etc/litestream.yml"
else
  cat > /etc/litestream.yml <<'LSEOF'
# DeployX SQLite replication — fill in your S3-compatible backup target
# before enabling the systemd service.
#
# Tested backends: Cloudflare R2, Backblaze B2, AWS S3, MinIO.
# Restore:  litestream restore -o /data/platform.db.restored s3://BUCKET/platform.db
# Verify:   sqlite3 /data/platform.db.restored "select count(*) from users"

dbs:
  - path: /data/platform.db
    replicas:
      - type: s3
        endpoint: REPLACE_WITH_S3_ENDPOINT   # e.g. https://<account>.r2.cloudflarestorage.com
        bucket: REPLACE_WITH_BUCKET_NAME
        path: platform.db
        region: auto                          # R2 uses "auto"; AWS S3 uses e.g. "us-east-1"
        access-key-id: REPLACE_WITH_ACCESS_KEY
        secret-access-key: REPLACE_WITH_SECRET_KEY
        retention: 168h                       # 7 days of WAL retention
        snapshot-interval: 24h
        validation-interval: 12h
LSEOF
  chmod 0600 /etc/litestream.yml
  log_ok "Litestream config template written to /etc/litestream.yml (chmod 0600)"
fi

if command -v litestream &>/dev/null; then
  # Don't auto-enable: the placeholder config will fail. Surface the next step.
  if grep -q "REPLACE_WITH_" /etc/litestream.yml; then
    log_warn "Litestream is installed but NOT yet enabled."
    log_warn "Edit /etc/litestream.yml with your S3-compatible bucket details, then:"
    log_warn "  systemctl enable --now litestream"
    log_warn "Litestream NOT active until you fill /etc/litestream.yml"
  else
    systemctl enable --now litestream 2>/dev/null || \
      log_warn "Could not enable litestream service automatically — run 'systemctl enable --now litestream'"
    log_ok "Litestream service enabled — polling for first snapshot (O4)"

    # Poll for up to 60s expecting at least one snapshot from the configured replica.
    LS_DB_PATH="/data/platform.db"
    [[ -f "/opt/deployx/data/platform.db" ]] && LS_DB_PATH="/opt/deployx/data/platform.db"

    LS_OK=false
    for i in $(seq 1 30); do
      if litestream snapshots -config /etc/litestream.yml "$LS_DB_PATH" 2>/dev/null | grep -qE '^[a-z0-9-]+\s'; then
        LS_OK=true
        break
      fi
      sleep 2
    done

    if [[ "$LS_OK" == "true" ]]; then
      log_ok "Litestream snapshot confirmed — replication is live"
    else
      log_err "Litestream creds appear filled but no snapshot appeared in 60s."
      log_err "Inspect: journalctl -u litestream -n 100"
      log_err "Inspect: litestream snapshots -config /etc/litestream.yml $LS_DB_PATH"
      exit 1
    fi
  fi
fi

# ── rclone backup for Traefik certs (optional) ────────────────────────────────
# Litestream replicates the SQLite DB, but the ACME cert store at
# /var/lib/deployx/certs is not a SQLite file and needs a separate
# object-storage backup. Opt-in: only runs when RCLONE_REMOTE is set in the
# installer environment. When unset we print a hint and skip — operators who
# don't need offsite cert backup pay no setup cost.
log_step "rclone backup for Traefik certs (optional)"

if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  if command -v rclone &>/dev/null; then
    log_ok "rclone already installed ($(rclone --version 2>&1 | head -1))"
  else
    log_info "Installing rclone"
    apt-get install -y -qq rclone || {
      log_warn "rclone install failed — skipping cert backup setup"
    }
  fi

  if command -v rclone &>/dev/null; then
    install -d -m 0755 /var/lib/deployx/certs

    # Write /etc/rclone.conf from env. RCLONE_REMOTE names the remote (e.g.
    # "deployx-backup") and is also used as the prefix on the rclone sync
    # command below. RCLONE_TYPE / RCLONE_ACCESS_KEY_ID /
    # RCLONE_SECRET_ACCESS_KEY / RCLONE_ENDPOINT / RCLONE_REGION drive the
    # body. Defaults target an S3-compatible provider (R2, Backblaze B2, AWS).
    cat > /etc/rclone.conf <<RCEOF
[${RCLONE_REMOTE}]
type = ${RCLONE_TYPE:-s3}
provider = ${RCLONE_PROVIDER:-Other}
access_key_id = ${RCLONE_ACCESS_KEY_ID:-}
secret_access_key = ${RCLONE_SECRET_ACCESS_KEY:-}
endpoint = ${RCLONE_ENDPOINT:-}
region = ${RCLONE_REGION:-auto}
RCEOF
    chmod 0600 /etc/rclone.conf
    log_ok "rclone config written to /etc/rclone.conf (chmod 0600)"

    # Cron drop-in — runs daily via /etc/cron.daily. Idempotent: overwriting
    # is safe because the file owns its lifecycle.
    cat > /etc/cron.daily/deployx-cert-backup <<CRONEOF
#!/bin/bash
# DeployX — sync Traefik cert store to remote object storage daily.
set -euo pipefail
/usr/bin/rclone --config /etc/rclone.conf sync \\
  /var/lib/deployx/certs ${RCLONE_REMOTE}:deployx-certs/ \\
  >> /var/log/deployx-cert-backup.log 2>&1
CRONEOF
    chmod 0755 /etc/cron.daily/deployx-cert-backup
    log_ok "Daily cert backup cron installed at /etc/cron.daily/deployx-cert-backup"
  fi
else
  log_info "RCLONE_REMOTE not set — skipping cert backup setup."
  log_info "To enable, re-run installer with: RCLONE_REMOTE=name RCLONE_ACCESS_KEY_ID=... RCLONE_SECRET_ACCESS_KEY=... RCLONE_ENDPOINT=https://... ./install.sh"
fi

# ── Build Docker images ──────────────────────────────────────────────────────
log_step "Building Docker images (this may take 5-10 minutes)"

COMPOSE_FILE="/opt/deployx/docker-compose.dev.yml"
COMPOSE_FALLBACK="/opt/deployx/docker-compose.yml"

if [[ -f "$COMPOSE_FILE" ]]; then
  cd /opt/deployx
  docker compose -f docker-compose.dev.yml build 2>&1 | tail -5
  log_ok "Docker images built"
elif [[ -f "$COMPOSE_FALLBACK" ]]; then
  COMPOSE_FILE="$COMPOSE_FALLBACK"
  cd /opt/deployx
  docker compose build 2>&1 | tail -5
  log_ok "Docker images built (using docker-compose.yml)"
else
  log_warn "No docker-compose file found — skipping image build"
fi

# ── Start platform with Docker Compose ────────────────────────────────────────
log_step "Starting DeployX platform"

if [[ -f "$COMPOSE_FILE" ]]; then
  cd /opt/deployx
  docker compose -f "$(basename "$COMPOSE_FILE")" up -d

  log_info "Waiting for API to become healthy..."
  MAX_RETRIES=30
  RETRY_COUNT=0

  while [[ $RETRY_COUNT -lt $MAX_RETRIES ]]; do
    if curl -sf "http://localhost:3001/healthz" > /dev/null 2>&1; then
      log_ok "API health check passed"
      break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 2
  done

  if [[ $RETRY_COUNT -eq $MAX_RETRIES ]]; then
    log_warn "API health check did not pass within 60 seconds"
    log_warn "Check logs: docker compose -f $(basename "$COMPOSE_FILE") logs api"
  fi

  if curl -sf "http://localhost:3000" > /dev/null 2>&1; then
    log_ok "Dashboard is responding"
  else
    log_warn "Dashboard not yet responding — may need more time to start"
  fi
else
  log_warn "No docker-compose file found at /opt/deployx/"
  log_warn "Copy project files to /opt/deployx/ and run: docker compose up -d"
fi

# ── Install systemd service ──────────────────────────────────────────────────
if [[ -f /opt/deployx/infra/systemd/deployx.service ]]; then
  cp /opt/deployx/infra/systemd/deployx.service /etc/systemd/system/deployx.service
  systemctl daemon-reload
  systemctl enable deployx
  log_ok "Systemd service installed and enabled"
else
  log_warn "Systemd service file not found — skipping"
fi

# ── Success ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                  ║${NC}"
echo -e "${GREEN}║   DeployX Platform installed successfully!                       ║${NC}"
echo -e "${GREEN}║                                                                  ║${NC}"
echo -e "${GREEN}║   Config:     /etc/deployx/.env                                  ║${NC}"
echo -e "${GREEN}║   Source:     /opt/deployx/                                      ║${NC}"
echo -e "${GREEN}║   Data:       /opt/deployx/data/                                 ║${NC}"
echo -e "${GREEN}║   Logs:       /opt/deployx/logs/                                 ║${NC}"
echo -e "${GREEN}║                                                                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Setup complete! Open your browser to:${NC}"
echo -e "${CYAN}  Dashboard: https://${PLATFORM_DOMAIN}${NC}"
echo -e "${CYAN}  API:       https://${PLATFORM_DOMAIN}/api${NC}"
echo ""
echo -e "Next steps:"
echo -e "  1. Register an account on the dashboard and start deploying your apps"
echo -e "  2. Projects are added via the dashboard — no per-project server setup needed"
echo ""
if [[ "$PLATFORM_DOMAIN" != *"."*"."* ]] && [[ ! "$PLATFORM_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo -e "${YELLOW}DNS reminder:${NC}"
  echo -e "  Point an A record for ${CYAN}${PLATFORM_DOMAIN}${NC} to this server's IP"
  echo -e "  Add a wildcard A record: ${CYAN}*.${PLATFORM_DOMAIN}${NC} -> this server's IP"
  echo -e "  (Wildcard DNS is required for automatic per-app subdomains)"
  echo ""
elif [[ "$PLATFORM_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo -e "${YELLOW}Note:${NC} You are using an IP address (${PLATFORM_DOMAIN})."
  echo -e "  For SSL and custom subdomains, set up a domain name later by editing:"
  echo -e "  ${CYAN}/etc/deployx/.env${NC}"
  echo ""
else
  echo -e "${YELLOW}DNS reminder:${NC}"
  echo -e "  Ensure A records for ${CYAN}${PLATFORM_DOMAIN}${NC} and ${CYAN}*.${PLATFORM_DOMAIN}${NC} point to this server"
  echo -e "  (Wildcard DNS is required for automatic per-app subdomains)"
  echo ""
fi
