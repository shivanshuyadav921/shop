#!/bin/sh
set -e

if [ -z "$BACKUP_FILE" ]; then
  echo "BACKUP_FILE environment variable is required"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

if [ -z "$PGPASSWORD" ]; then
  echo "PGPASSWORD is required"
  exit 1
fi

case "$BACKUP_FILE" in
  *.gz)
    gzip -dc "$BACKUP_FILE" | psql -h "${POSTGRES_HOST:-postgres}" -U "${POSTGRES_USER:-shop}"
    ;;
  *)
    psql -h "${POSTGRES_HOST:-postgres}" -U "${POSTGRES_USER:-shop}" -f "$BACKUP_FILE"
    ;;
esac
echo "Restore completed from $BACKUP_FILE"
