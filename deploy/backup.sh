#!/usr/bin/env bash
# Mavino — PostgreSQL backup script.
#
# Creates a consistent snapshot of the production PostgreSQL database using
# pg_dump (custom format), compresses it, and retains the last N backups.
#
# Usage:
#   ./deploy/backup.sh                # backup to ./backups/ (default)
#   BACKUP_DIR=/var/backups/mavino ./deploy/backup.sh
#
# Cron (daily at 3am, keep 14 days):
#   0 3 * * * /path/to/Mavino/deploy/backup.sh >> /var/log/mavino-backup.log 2>&1
#
# Restore:
#   gunzip < backups/mavino-2026-08-07.dump.gz | docker compose exec -T db pg_restore --clean --if-exists -U athena -d athena
#   docker compose restart server

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_DIR"

BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
DB_NAME="${POSTGRES_DB:-athena}"
DB_USER="${POSTGRES_USER:-athena}"

mkdir -p "$BACKUP_DIR"

# Verify the db container is running.
if ! docker compose ps db | grep -q "Up\|healthy"; then
  echo "[$(date)] ERROR: mavino-db container is not running — skipping backup."
  exit 1
fi

# Step 1: Create a consistent snapshot using pg_dump (custom format, compressed).
echo "[$(date)] Creating PostgreSQL snapshot via pg_dump..."
LOCAL_FILE="$BACKUP_DIR/mavino-$TIMESTAMP.dump"
if ! docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$LOCAL_FILE"; then
  echo "[$(date)] ERROR: pg_dump failed — database may be unavailable."
  rm -f "$LOCAL_FILE"
  exit 1
fi

# Step 2: Compress the backup (pg_dump -Fc already compresses, but gzip adds
# another layer and makes the extension recognizable).
echo "[$(date)] Compressing backup..."
gzip -f "$LOCAL_FILE"
LOCAL_GZ="$LOCAL_FILE.gz"
SIZE=$(du -h "$LOCAL_GZ" | cut -f1)
echo "[$(date)] Backup saved: $LOCAL_GZ ($SIZE)"

# Step 3: Retention — delete backups older than RETENTION_DAYS.
DELETED=$(find "$BACKUP_DIR" -name "mavino-*.dump.gz" -mtime +"$RETENTION_DAYS" -print -delete 2>/dev/null | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] Cleaned up $DELETED backup(s) older than $RETENTION_DAYS days."
fi

BACKUP_COUNT=$(find "$BACKUP_DIR" -name "mavino-*.dump.gz" | wc -l)
echo "[$(date)] Done. $BACKUP_COUNT backup(s) in $BACKUP_DIR."
