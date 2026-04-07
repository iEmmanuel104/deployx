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

# ── Install essential packages (including git) ───────────────────────────────
log_step "Installing essential packages"

apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg lsb-release git
log_ok "Essential packages installed"

# ── Clone DeployX repository ────────────────────────────────────────────────
log_step "Setting up DeployX source code"

if [[ -d /opt/deployx/.git ]]; then
  log_info "DeployX already installed, pulling latest..."
  cd /opt/deployx
  git pull origin main
  log_ok "Source code updated"
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

# ── Configure UFW + Docker firewall rules ─────────────────────────────────────
log_step "Configuring firewall (UFW)"

if command -v ufw &>/dev/null; then
  ufw --force enable

  # Allow SSH, HTTP, HTTPS
  ufw allow 22/tcp   comment "SSH"
  ufw allow 80/tcp   comment "HTTP"
  ufw allow 443/tcp  comment "HTTPS"

  # Docker-USER chain rules (PRD 22.2.1)
  # Block direct container access from external networks
  iptables -I DOCKER-USER -i eth0 -j DROP 2>/dev/null || true
  iptables -I DOCKER-USER -i eth0 -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
  iptables -I DOCKER-USER -i eth0 -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
  iptables -I DOCKER-USER -i eth0 -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || true

  log_ok "Firewall configured"
else
  log_warn "UFW not found — skipping firewall configuration"
fi

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

# ── Litestream setup (placeholder) ───────────────────────────────────────────
log_step "Litestream database replication"
log_warn "Litestream setup is a placeholder — configure for S3 backups"
# TODO: Install Litestream, create /etc/litestream.yml
# wget https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.deb
# dpkg -i litestream-v0.3.13-linux-amd64.deb
# systemctl enable litestream
# systemctl start litestream

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
