# Disaster Recovery Runbook

## Availability Target
The platform is designed for a 99.99% uptime target, which allows about 52.6 minutes of unplanned downtime per year. Run production on Kubernetes across at least three nodes and use managed PostgreSQL, Redis, Kafka, object storage, and load balancing where available.

## Recovery Objectives
- RTO: 15 minutes for stateless services, 30 minutes for database restore or regional failover.
- RPO: 5 minutes when PostgreSQL PITR or managed continuous backup is enabled, 24 hours when only the bundled daily CronJob is used.
- Backup retention: 30 daily logical backups by default.

## Backup Sources
- PostgreSQL: `infra/backups/backup.sh` for Docker Compose and `infra/k8s/prod/backup-cronjob.yaml` for Kubernetes.
- Compliance uploads: replicate the backing persistent volume or move uploads to durable object storage.
- Kafka: keep topic definitions and broker storage replicated; replay ledger events after restore.
- Grafana dashboards and alerting: kept as code under `infra/grafana` and `infra/monitoring`.

## Restore Procedure
1. Freeze writes at the ingress or payment provider callback layer.
2. Provision PostgreSQL and restore the most recent verified backup.
3. For Docker Compose, run `BACKUP_FILE=/backups/archive/shop-backup-YYYYMMDDHHMMSS.sql.gz PGPASSWORD=... ./infra/backups/restore.sh`.
4. For Kubernetes, start a one-off PostgreSQL client pod with the backup PVC mounted and run the same restore command.
5. Recreate Redis and Kafka from durable storage or managed-service snapshots.
6. Redeploy `kubectl apply -k infra/k8s/prod`.
7. Verify `/health` for every service, Grafana dashboards, Prometheus targets, and critical payment/ledger workflows.
8. Replay unsettled payment, wallet, and ledger events from the last known consistent offset.
9. Re-enable writes and keep the incident bridge open until error rate and latency have stayed normal for 30 minutes.

## 99.99% Production Notes
- Use managed multi-AZ PostgreSQL with synchronous standby or an operator such as CloudNativePG/Patroni. The bundled StatefulSet is suitable for non-production or bootstrap environments, not a four-nines database tier by itself.
- Use managed Kafka/Redis or clustered operators with persistent storage and cross-zone replication.
- Run at least three Kubernetes worker nodes across zones, use pod disruption budgets, and keep the ingress controller highly available.
- Send Alertmanager notifications to an external incident channel rather than only the bundled audit webhook.
