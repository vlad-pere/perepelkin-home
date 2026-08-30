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

# 1. Create clean backup via SQLite (avoids WAL issues)
echo "[1/4] Backing up production DB..."
docker compose exec -T app node -e "
const Database = require('better-sqlite3');
const db = new Database('${DB_PATH}', { readonly: true });
db.backup('${TMP}').then(() => { db.close(); console.log('OK'); });
"

# 2. Copy backup to host
echo "[2/4] Copying to host..."
docker compose cp "app:${TMP}" "$TMP"

# 3. Copy into staging container (docker cp sets owner to root)
echo "[3/4] Restoring to staging..."
docker compose --project-name "$STAGING_PROJECT" \
  -f "$STAGING_DIR/docker-compose.staging.yml" \
  --env-file "$STAGING_DIR/.env" \
  stop app

docker compose cp "$TMP" "perepelkin-home-staging-app-1:${DB_PATH}"

# Fix ownership (app runs as uid 1000) and remove stale WAL/SHM
docker run --rm \
  -v "${STAGING_PROJECT}_staging_data:/data" \
  alpine sh -c "chown 1000:1000 /data/perepelkin-home.db; rm -f /data/perepelkin-home.db-shm /data/perepelkin-home.db-wal"

rm -f "$TMP"

# 4. Restart staging
if [ "$DB_ONLY" = false ]; then
  echo "[4/4] Restarting staging..."
  docker compose --project-name "$STAGING_PROJECT" \
    -f "$STAGING_DIR/docker-compose.staging.yml" \
    --env-file "$STAGING_DIR/.env" \
    up -d --wait
else
  echo "[4/4] Restart skipped (--db-only)"
fi

echo "=== Done. Staging DB = production DB. ==="
