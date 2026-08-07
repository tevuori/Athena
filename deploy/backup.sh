#!/usr/bin/env bash
# Athena — SQLite backup script.
#
# Creates a consistent snapshot of the production SQLite database using
# `VACUUM INTO` (SQLite's online backup), copies it out of the Docker
# container, compresses it, and retains the last N backups.
#
# Usage:
#   ./deploy/backup.sh                # backup to ./backups/ (default)
#   BACKUP_DIR=/var/backups/athena ./deploy/backup.sh
#
# Cron (daily at 3am, keep 14 days):
#   0 3 * * * /path/to/Athena/deploy/backup.sh >> /var/log/athena-backup.log 2>&1
#
# Restore:
#   gunzip < backups/athena-2026-08-07.db.gz | docker compose exec -T server sh -c 'cat > /app/data/athena.db'
#   docker compose restart server

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_DIR"

BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
CONTAINER_DB="/app/data/athena.db"
CONTAINER_BACKUP="/app/data/athena-backup-$TIMESTAMP.db"

mkdir -p "$BACKUP_DIR"

# Verify the server container is running.
if ! docker compose ps server | grep -q "Up\|healthy"; then
  echo "[$(date)] ERROR: athena-server container is not running — skipping backup."
  exit 1
fi

# Step 1: Create a consistent snapshot inside the container using VACUUM INTO.
# This is safe to run while the server is actively writing — SQLite handles
# the locking internally and produces a byte-for-byte consistent copy.
echo "[$(date)] Creating SQLite snapshot via VACUUM INTO..."
if ! docker compose exec -T server bun -e "
  const { Database } = require('bun:sqlite');
  const db = new Database('$CONTAINER_DB', { readonly: true });
  db.exec(\"VACUUM INTO '$CONTAINER_BACKUP'\");
  db.close();
"; then
  echo "[$(date)] ERROR: VACUUM INTO failed — database may be locked or corrupt."
  exit 1
fi

# Step 2: Copy the snapshot out of the container and compress it.
LOCAL_FILE="$BACKUP_DIR/athena-$TIMESTAMP.db"
echo "[$(date)] Copying snapshot from container..."
docker compose cp server:"$CONTAINER_BACKUP" "$LOCAL_FILE"

# Clean up the in-container backup file.
docker compose exec -T server rm -f "$CONTAINER_BACKUP" 2>/dev/null || true

echo "[$(date)] Compressing backup..."
gzip -f "$LOCAL_FILE"
LOCAL_GZ="$LOCAL_FILE.gz"
SIZE=$(du -h "$LOCAL_GZ" | cut -f1)
echo "[$(date)] Backup saved: $LOCAL_GZ ($SIZE)"

# Step 3: Retention — delete backups older than RETENTION_DAYS.
DELETED=$(find "$BACKUP_DIR" -name "athena-*.db.gz" -mtime +"$RETENTION_DAYS" -print -delete 2>/dev/null | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] Cleaned up $DELETED backup(s) older than $RETENTION_DAYS days."
fi

BACKUP_COUNT=$(find "$BACKUP_DIR" -name "athena-*.db.gz" | wc -l)
echo "[$(date)] Done. $BACKUP_COUNT backup(s) in $BACKUP_DIR."
