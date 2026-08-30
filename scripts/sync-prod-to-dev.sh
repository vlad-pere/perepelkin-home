#!/usr/bin/env bash
# Sync production database to local dev environment.
# Run from the project root on your local machine.
#
# Usage:
#   ./scripts/sync-prod-to-dev.sh
#
# Requires SSH access to the production server.
# Set PROD_SSH_HOST to override (default: user@your-server).

set -euo pipefail

REMOTE_HOST="${PROD_SSH_HOST:-user@your-server}"
REMOTE_DIR="/home/user/docker/apps/perepelkin-home"
REMOTE_DB="app:/app/data/perepelkin-home.db"
LOCAL_DB="apps/server/data/perepelkin-home.db"

echo "=== Sync prod → local dev (DB) ==="

# 1. Copy DB from prod container to host on server
echo "[1/3] Copying production DB on server..."
ssh "$REMOTE_HOST" "
  cd $REMOTE_DIR
  docker compose cp $REMOTE_DB /tmp/perepelkin-dev-sync.db
"

# 2. SCP to local machine
echo "[2/3] Downloading..."
mkdir -p "$(dirname "$LOCAL_DB")"
scp "$REMOTE_HOST:/tmp/perepelkin-dev-sync.db" "$LOCAL_DB"

# 3. Cleanup on server
ssh "$REMOTE_HOST" "rm -f /tmp/perepelkin-dev-sync.db"

echo "[3/3] Done. Local DB: $LOCAL_DB"
echo "  Restart dev server to pick up changes."
echo "=== Done. ==="
