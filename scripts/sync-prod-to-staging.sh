#!/usr/bin/env bash
# Sync production DB to staging.
# Run on the production server from the project root.
#
# Usage:
#   ./scripts/sync-prod-to-staging.sh          # DB + restart
#   ./scripts/sync-prod-to-staging.sh --db-only # DB only, no restart

set -euo pipefail

PROD_DIR="/home/user/docker/apps/perepelkin-home"
STAGING_DIR="/home/user/docker/apps/perepelkin-home-staging"
STAGING_PROJECT="perepelkin-home-staging"
DB_PATH="/app/data/perepelkin-home.db"
TMP="/tmp/perepelkin-sync.db"

DB_ONLY=false
[[ "${1:-}" == "--db-only" ]] && DB_ONLY=true

cd "$PROD_DIR"

echo "=== Sync prod → staging (DB) ==="

# 1. Copy DB from prod container to host
echo "[1/3] Copying production DB..."
rm -f "$TMP"
docker compose cp "app:${DB_PATH}" "$TMP"

# 2. Copy DB into staging container
echo "[2/3] Restoring to staging..."
docker compose --project-name "$STAGING_PROJECT" \
  -f "$STAGING_DIR/docker-compose.staging.yml" \
  --env-file "$STAGING_DIR/.env" \
  cp "$TMP" "app:${DB_PATH}"

rm -f "$TMP"

# 3. Restart staging
if [ "$DB_ONLY" = false ]; then
  echo "[3/3] Restarting staging..."
  docker compose --project-name "$STAGING_PROJECT" \
    -f "$STAGING_DIR/docker-compose.staging.yml" \
    --env-file "$STAGING_DIR/.env" \
    restart app
else
  echo "[3/3] Restart skipped (--db-only)"
fi

echo "=== Done. Staging DB = production DB. ==="
