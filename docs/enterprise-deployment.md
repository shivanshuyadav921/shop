# Enterprise Deployment Guide

This document summarizes the production deployment architecture for the Shop payment platform with a 99.99% uptime target.

## Scope
- Docker production compose for staging and integration
- Kubernetes manifests for production-grade deployment
- CI/CD pipeline for build, image publish, and deployment
- Observability with Prometheus, Grafana, Loki, and alerting
- Log aggregation and centralized tracing support
- Backups, restore procedures, and disaster recovery runbook

Current database baseline:
- `docs/auth-db-schema.sql` defines users, sessions, devices, login attempts, OTPs, IP/geo controls, and audit logs.
- `docs/ledger-db-schema.sql` defines double-entry accounts, transactions, entries, idempotency keys, and ledger events.

## Docker Compose
The `infra/docker-compose.prod.yml` file defines:
- Highly available application services
- PostgreSQL data persistence
- Redis persistence
- Kafka and Zookeeper for event streaming
- Monitoring stack: Prometheus, Alertmanager, Grafana, Loki, Promtail
- Exporters and blackbox probes for PostgreSQL, Redis, Kafka, and service health checks
- Scheduled compressed PostgreSQL backups with retention

> Note: Docker Compose is ideal for staging and local enterprise integration. Production-grade HA should use Kubernetes or managed cloud services.

## Kubernetes
The `infra/k8s/prod` folder contains the production Kubernetes manifests:
- `kustomization.yaml`
- `namespace.yaml`
- `production-stack.yaml`
- `backup-cronjob.yaml`

### Production strategies
- Deploy each microservice as a Deployment with 3 replicas
- Add readiness and liveness probes for failover
- Use PodDisruptionBudgets and HPAs for critical services
- Use namespace network policies and TLS ingress
- Keep secrets in Kubernetes Secrets and configuration in ConfigMaps
- Use Ingress for path-based routing with TLS
- Use Grafana dashboards and Prometheus alert rules for SLO monitoring

## CI/CD
The GitHub Actions workflow in `.github/workflows/ci-cd.yml` supports:
- build validation on PRs and pushes
- docker image build and push to a registry
- Kubernetes deployment on `main`

### Required secrets
- `REGISTRY_URL`
- `REGISTRY_USERNAME`
- `REGISTRY_PASSWORD`
- `KUBE_CONFIG_DATA`
- `shop-platform-tls` Kubernetes TLS secret in the production namespace

Create the `shop-platform-secrets` Kubernetes secret before deploying. It must include:
- `DATABASE_URL`
- `DATABASE_PASSWORD`
- `JWT_SECRET`
- `AUTH_NOTIFICATION_WEBHOOK_URL`
- `AUTH_NOTIFICATION_WEBHOOK_TOKEN`
- `INTERNAL_API_TOKEN`
- `PAYMENT_PROVIDER_CONFIGS`
- `COMPLIANCE_VERIFICATION_API_BASE_URL`
- `COMPLIANCE_VERIFICATION_API_TOKEN`

## Monitoring
The monitoring stack is defined in `infra/monitoring` and includes:
- Prometheus scrape configuration
- Alertmanager routing and notification rules
- Grafana provisioning and dashboard definitions
- Loki and Promtail for logs

## Log aggregation
Logs are centralized via Promtail into Loki. Grafana can visualize logs and cross-link service traces.

## Backups and disaster recovery
Backups are defined in `infra/backups` and `infra/k8s/prod/backup-cronjob.yaml`. The detailed restore and incident checklist is in `docs/disaster-recovery.md`.

### DR checklist
1. Failover database to replica or restore last backup
2. Recover Redis state via snapshot or cached data
3. Recreate Kafka topics and partitions from cluster metadata
4. Redeploy Kubernetes manifests across healthy nodes
5. Validate service health and replay any unsettled transactions
