#!/bin/bash
# Disaster Recovery - Full System Restore

set -e

BACKUP_ID="${1:?Usage: disaster-recovery-restore.sh <BACKUP_ID>}"
RESTORE_DIR="/restore/${BACKUP_ID}"
ENCRYPTION_KEY="${HSM_BACKUP_KEY}"

mkdir -p "${RESTORE_DIR}"

echo "[$(date)] Starting disaster recovery restore from backup ${BACKUP_ID}..."

# Download backup from S3
echo "[$(date)] Downloading backup from S3..."
aws s3 cp \
  "s3://shop-fintech-backups/full-backups/${BACKUP_ID}/" \
  "${RESTORE_DIR}/" \
  --recursive \
  --sse=AES256

# Verify checksum
echo "[$(date)] Verifying backup integrity..."
cd "${RESTORE_DIR}"
sha256sum -c *.sha256 || {
  echo "[ERROR] Backup integrity check failed"
  exit 1
}

# Decrypt backup
echo "[$(date)] Decrypting backup..."
openssl enc -aes-256-cbc -d \
  -in "${BACKUP_ID}.tar.gz.enc" \
  -out "${BACKUP_ID}.tar.gz" \
  -k "${ENCRYPTION_KEY}"

# Extract
tar xzf "${BACKUP_ID}.tar.gz"

# STOP PRODUCTION SERVICES
echo "[CRITICAL] Stopping production services..."
kubectl scale deployment -n shop-fintech --all --replicas=0
sleep 30

# Restore PostgreSQL databases
echo "[$(date)] Restoring PostgreSQL databases..."
for DUMP_FILE in full-backup-*/*.dump; do
  DB_NAME=$(basename "${DUMP_FILE}" .dump)
  echo "Restoring ${DB_NAME}..."
  
  # Drop existing DB if exists
  dropdb "${DB_NAME}" 2>/dev/null || true
  createdb "${DB_NAME}"
  
  # Restore dump
  pg_restore \
    --verbose \
    --no-password \
    --clean \
    --if-exists \
    --exit-on-error \
    -d "${DB_NAME}" \
    "${DUMP_FILE}" || {
      echo "[ERROR] Failed to restore ${DB_NAME}"
      exit 1
    }
done

# Restore Redis
echo "[$(date)] Restoring Redis..."
redis-cli SHUTDOWN NOSAVE 2>/dev/null || true
sleep 5
cp full-backup-*/redis-dump.rdb /var/lib/redis/
redis-server --daemonize yes

# Restore Kubernetes resources
echo "[$(date)] Restoring Kubernetes configuration..."
kubectl apply -f full-backup-*/k8s-configmaps.json
kubectl apply -f full-backup-*/k8s-pvcs.json

# Verify data integrity
echo "[$(date)] Verifying restored data..."
for DB in payment_db auth_db ledger_db fraud_db compliance_db; do
  COUNT=$(psql "${DB}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'")
  echo "Database ${DB}: ${COUNT} tables"
done

# Perform ledger reconciliation
echo "[$(date)] Performing ledger reconciliation..."
kubectl exec -n shop-fintech deployment/ledger-service -- \
  npm run reconcile:full 2>&1 || {
    echo "[ERROR] Ledger reconciliation failed - possible data corruption"
    exit 1
  }

# START SERVICES
echo "[$(date)] Starting services (gradual rollout)..."
for i in {1..3}; do
  kubectl scale deployment -n shop-fintech --all --replicas=$((i))
  echo "Scaled to $((i)) replicas, waiting 30s..."
  sleep 30
  
  # Health check
  HEALTHY=$(kubectl get pods -n shop-fintech -o jsonpath='{.items[?(@.status.conditions[?(@.type=="Ready")].status=="True")].metadata.name}' | wc -w)
  echo "Healthy pods: ${HEALTHY}"
  
  if [ "${HEALTHY}" -lt "$((i))" ]; then
    echo "[WARNING] Not all pods healthy at scale ${i}"
  fi
done

# Verify all services
echo "[$(date)] Final verification..."
kubectl rollout status deployment -n shop-fintech --all --timeout=5m

# Cleanup
rm -rf "${RESTORE_DIR}"

echo "[$(date)] Disaster recovery restore completed successfully"
echo "All systems restored from backup ${BACKUP_ID}"
echo "Please verify business continuity"

exit 0
