#!/bin/sh
set -e

if [ -z "$PGPASSWORD" ]; then
  echo "PGPASSWORD is required"
  exit 1
fi

mkdir -p /backups/archive
RETENTION_DAYS="${RETENTION_DAYS:-30}"
BACKUP_FILE="/backups/archive/shop-backup-$(date +%Y%m%d%H%M%S).sql.gz"
pg_dumpall -h "${POSTGRES_HOST:-postgres}" -U "${POSTGRES_USER:-shop}" | gzip -9 > "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
find /backups/archive -name 'shop-backup-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
echo "Backup written to $BACKUP_FILE"
