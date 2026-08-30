#!/usr/bin/env bash
# Sync production database to local dev environment.
# Run from the project root on your local machine.
#
# Usage:
#   ./scripts/sync-prod-to-dev.sh
#
# Requires WSL with Docker access to the production containers.

set -euo pipefail

DB_PATH="/app/data/perepelkin-home.db"
LOCAL_DB="apps/server/data/perepelkin-home.db"

echo "=== Sync prod → local dev (DB) ==="

# 1. Create clean backup via SQLite
echo "[1/3] Backing up production DB..."
wsl bash -c "
  docker compose -f /home/user/docker/apps/perepelkin-home/docker-compose.yml \
    exec -T app node -e \"
const Database = require('better-sqlite3');
const db = new Database('${DB_PATH}', { readonly: true });
db.backup('/tmp/prod_dev_backup.db').then(() => { db.close(); console.log('OK'); });
\"
"

# 2. Copy to host
echo "[2/3] Copying to local..."
mkdir -p "$(dirname "$LOCAL_DB")"
wsl bash -c "docker cp perepelkin-home-app-1:/tmp/prod_dev_backup.db /mnt/c/dev/perepelkin-home/.scratch/prod_dev_backup.db"
cp ".scratch/prod_dev_backup.db" "$LOCAL_DB"
rm -f ".scratch/prod_dev_backup.db"
wsl bash -c "docker exec perepelkin-home-app-1 rm -f /tmp/prod_dev_backup.db"

echo "[3/3] Done. Local DB: $LOCAL_DB"
echo "  Restart dev server to pick up changes."
echo "=== Done. ==="
