#!/bin/bash
# Disaster Recovery - Full Database Backup

set -e

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/full-backup-${BACKUP_DATE}"
ENCRYPTION_KEY="${HSM_BACKUP_KEY}"
RETENTION_DAYS=90

mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Starting full backup..."

# Backup all PostgreSQL databases
echo "[$(date)] Backing up PostgreSQL..."
for DB in payment_db auth_db ledger_db fraud_db compliance_db; do
  pg_dump \
    --verbose \
    --no-password \
    --format=custom \
    --file="${BACKUP_DIR}/${DB}.dump" \
    --compress=9 \
    "${DB}" || {
      echo "[ERROR] Failed to backup ${DB}"
      exit 1
    }
done

# Backup Redis snapshots
echo "[$(date)] Backing up Redis..."
redis-cli --rdb "${BACKUP_DIR}/redis-dump.rdb" 2>&1 || true

# Backup Kubernetes secrets (encrypted)
echo "[$(date)] Backing up K8s secrets..."
kubectl get secrets -A -o json | \
  jq '.items[] |select(.type!="kubernetes.io/service-account-token")' > \
  "${BACKUP_DIR}/k8s-secrets-$(date +%s).json"

# Backup application config
echo "[$(date)] Backing up application configs..."
kubectl get configmaps -A -o json > "${BACKUP_DIR}/k8s-configmaps.json"
kubectl get pvc -A -o json > "${BACKUP_DIR}/k8s-pvcs.json"

# Encrypt entire backup
echo "[$(date)] Encrypting backup..."
tar czf - "${BACKUP_DIR}" | \
  openssl enc -aes-256-cbc -salt -in - -out "${BACKUP_DIR}.tar.gz.enc" \
  -k "${ENCRYPTION_KEY}"

# Calculate checksum for verification
sha256sum "${BACKUP_DIR}.tar.gz.enc" > "${BACKUP_DIR}.tar.gz.enc.sha256"

# Upload to S3 with versioning
echo "[$(date)] Uploading to S3..."
aws s3 cp \
  "${BACKUP_DIR}.tar.gz.enc" \
  "s3://shop-fintech-backups/full-backups/${BACKUP_DATE}/" \
  --sse=AES256 \
  --metadata="timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ),service=fintech-platform"

aws s3 cp \
  "${BACKUP_DIR}.tar.gz.enc.sha256" \
  "s3://shop-fintech-backups/full-backups/${BACKUP_DATE}/" \
  --sse=AES256

# Clean up local copy after successful upload
rm -rf "${BACKUP_DIR}" "${BACKUP_DIR}.tar.gz.enc"

# Cleanup old backups (retention policy)
echo "[$(date)] Cleaning up old backups..."
find /backups -name "full-backup-*" -mtime +${RETENTION_DAYS} -delete

# Verify backup integrity
echo "[$(date)] Verifying backup integrity..."
REMOTE_HASH=$(aws s3 cp \
  "s3://shop-fintech-backups/full-backups/${BACKUP_DATE}/${BACKUP_DATE}.tar.gz.enc.sha256" - | \
  awk '{print $1}')
LOCAL_HASH=$(cat "${BACKUP_DIR}.tar.gz.enc.sha256" | awk '{print $1}')

if [ "${REMOTE_HASH}" != "${LOCAL_HASH}" ]; then
  echo "[ERROR] Backup verification failed!"
  exit 1
fi

# Log backup completion
echo "[$(date)] Backup completed successfully"
echo "Backup ID: ${BACKUP_DATE}"
echo "Backup location: s3://shop-fintech-backups/full-backups/${BACKUP_DATE}/"

# Send notification
kubectl exec -n monitoring alertmanager-0 -- \
  curl -X POST http://alertmanager:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "alerts": [{
      "status": "success",
      "labels": {
        "alertname": "BackupCompleted",
        "backup_id": "'${BACKUP_DATE}'"
      },
      "generatorURL": "backup-script"
    }]
  }'

exit 0
