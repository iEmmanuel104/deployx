# DeployX — Disaster Recovery / Restore Runbook

This runbook covers restoring a DeployX install from off-site backups. It
assumes you have been running Litestream against an S3-compatible bucket
(Cloudflare R2, Backblaze B2, AWS S3, or MinIO) for the platform DB, and
optionally an `rclone` schedule for the Traefik certs directory.

If you have **never configured Litestream**, there is nothing to restore from —
the bucket fields in `/etc/litestream.yml` still hold the `REPLACE_WITH_*`
placeholders. Reinstall via `install.sh` and start fresh.

---

## Scope of what gets restored

| Component | Backed up by | Restored by |
|---|---|---|
| `platform.db` (users, projects, deployments, env vars, audit) | Litestream → S3 | `litestream restore` |
| `traefik-certs` (Let's Encrypt acme.json) | `rclone` cron (recommended) | `rclone copy` |
| `/builds/` build artifacts | Not backed up — regenerated on next deploy | N/A |
| Container images | Not backed up — Docker pulls + rebuilds | `docker compose build` |
| `/etc/deployx/.env` | Operator-managed (paste from password manager) | Manual |

> **The DB is the only piece you cannot reconstruct.** Everything else can be
> rebuilt by re-running the installer and re-deploying projects.

---

## Restore procedure (full DR — new VPS)

### 1. Provision the VPS and run the installer

```bash
# Boot a fresh Ubuntu 22.04 / 24.04 / Debian 12 VPS, then:
PLATFORM_DOMAIN=deploy.example.com ACME_EMAIL=ops@example.com \
  curl -fsSL https://raw.githubusercontent.com/iEmmanuel104/deployx/main/infra/installer/install.sh | sudo bash
```

The installer will stop short of bringing Litestream online because the
config still has `REPLACE_WITH_*` placeholders. That's the intended state for
restore.

### 2. Reinstate the Litestream config with the original bucket credentials

The bucket / access key / secret key MUST match what the previous install
replicated to.

```bash
sudo tee /etc/litestream.yml <<'EOF'
dbs:
  - path: /opt/deployx/data/platform.db
    replicas:
      - type: s3
        endpoint: https://<account>.r2.cloudflarestorage.com
        bucket: deployx-backups
        path: platform.db
        region: auto
        access-key-id: <ORIGINAL_ACCESS_KEY>
        secret-access-key: <ORIGINAL_SECRET_KEY>
        retention: 168h
        snapshot-interval: 24h
EOF
sudo chmod 0600 /etc/litestream.yml
```

### 3. Stop the platform before restoring

The DB must be quiescent during the restore.

```bash
cd /opt/deployx
sudo docker compose down
sudo systemctl stop litestream 2>/dev/null || true
```

### 4. Restore the database from the most recent replica

```bash
# -if-replica-exists: succeed silently if no replica is found (won't blow away an existing DB)
sudo litestream restore \
  -if-replica-exists \
  -config /etc/litestream.yml \
  /opt/deployx/data/platform.db
```

### 5. Verify the restored DB

```bash
# Sanity-check the schema and row counts. Adjust counts to what you remember.
sudo sqlite3 /opt/deployx/data/platform.db \
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

sudo sqlite3 /opt/deployx/data/platform.db "SELECT COUNT(*) AS users FROM users;"
sudo sqlite3 /opt/deployx/data/platform.db "SELECT COUNT(*) AS projects FROM projects;"
sudo sqlite3 /opt/deployx/data/platform.db "SELECT COUNT(*) AS deployments FROM deployments;"

# Integrity check
sudo sqlite3 /opt/deployx/data/platform.db "PRAGMA integrity_check;"
# Expected output: "ok"
```

If `integrity_check` returns anything other than `ok`, **stop and investigate**
before bringing services back up. Most likely cause is a partial restore —
re-run step 4.

### 6. (Optional) Restore Traefik certs from the rclone bucket

```bash
# Only if you had an rclone schedule writing /var/lib/deployx/certs to a bucket.
sudo rclone copy <remote>:deployx-certs /var/lib/deployx/certs --progress
sudo chown -R root:root /var/lib/deployx/certs
sudo chmod 600 /var/lib/deployx/certs/acme.json
```

Without certs restore, Let's Encrypt will re-issue on first request. That's
fine, but you may hit Let's Encrypt's "5 duplicate certs / week / domain"
limit if you do this often. Restoring the acme.json is strictly an
optimisation.

### 7. Restart the platform

```bash
sudo systemctl start litestream
cd /opt/deployx && sudo docker compose up -d
```

### 8. Smoke-test

```bash
# Health endpoints
curl -fsS https://deploy.example.com/api/v1/healthz
curl -fsS https://deploy.example.com/api/v1/readyz

# Login should accept the original credentials
# (Open the dashboard, sign in with a known account — no password reset needed.)
```

---

## Restore procedure (in-place — same VPS, corrupted DB)

If the VPS is fine but `platform.db` got corrupted (sudden power loss with
WAL not checkpointed, accidental `rm`, PM2 cluster mode mistake), the
shorter path is:

```bash
cd /opt/deployx
sudo docker compose down
sudo systemctl stop litestream

# Move the bad file aside (don't delete — you may want it for forensics)
sudo mv /opt/deployx/data/platform.db   /opt/deployx/data/platform.db.bad
sudo mv /opt/deployx/data/platform.db-shm /opt/deployx/data/platform.db-shm.bad 2>/dev/null || true
sudo mv /opt/deployx/data/platform.db-wal /opt/deployx/data/platform.db-wal.bad 2>/dev/null || true

sudo litestream restore \
  -if-replica-exists \
  -config /etc/litestream.yml \
  /opt/deployx/data/platform.db

sudo sqlite3 /opt/deployx/data/platform.db "PRAGMA integrity_check;"
sudo chown deployx:deployx /opt/deployx/data/platform.db

sudo systemctl start litestream
sudo docker compose up -d
```

---

## Restoring a point-in-time copy (forensics)

Litestream can restore to any timestamp inside the retention window
(default: 168h / 7 days):

```bash
sudo litestream restore \
  -config /etc/litestream.yml \
  -o /tmp/platform-2026-05-22T12-00-00Z.db \
  -timestamp 2026-05-22T12:00:00Z \
  /opt/deployx/data/platform.db
```

This writes to `/tmp/...` so it does NOT touch the live DB. Useful for
inspecting state at the moment a bug was reported.

---

## What to do if there is no snapshot

```
$ litestream snapshots -config /etc/litestream.yml /opt/deployx/data/platform.db
# (empty output)
```

This means Litestream was never running successfully against this bucket.
Common causes:

1. Bucket creds in `/etc/litestream.yml` were wrong from day one — check
   `journalctl -u litestream -n 200` for `AccessDenied` or `InvalidAccessKeyId`.
2. The bucket name was misspelled — Litestream creates the prefix on first
   write but does NOT auto-create the bucket itself.
3. The R2 / B2 / S3 credentials were rotated and `/etc/litestream.yml` was
   never updated — Litestream falls silent until you fix the creds.

In all three cases the platform DB is the only copy. Treat the install as
unbacked-up until the snapshot poll (the installer runs this automatically;
see O4 in install.sh) reports a confirmed snapshot.

---

## Quick reference — single-command cheatsheet

```bash
# Stop services, restore DB, restart services
cd /opt/deployx && sudo docker compose down \
  && sudo litestream restore -if-replica-exists -config /etc/litestream.yml /opt/deployx/data/platform.db \
  && sudo sqlite3 /opt/deployx/data/platform.db "PRAGMA integrity_check;" \
  && sudo docker compose up -d
```

If `integrity_check` does not print `ok`, abort and investigate before
exposing the API to traffic.
