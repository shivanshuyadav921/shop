# Shop

Enterprise fintech platform implemented as a TypeScript monorepo. The repository combines shared payment-domain libraries, service packages, local infrastructure, Kubernetes manifests, and a GitHub Actions CI/CD pipeline.

## Overview

Shop is structured around a set of reusable domain libraries and independently deployable services:

- secure payment processing
- authentication and identity controls
- immutable ledger and reconciliation workflows
- fraud detection and risk analysis
- compliance and audit capabilities
- wallet, invoice, analytics, and operational services

The codebase includes both local development infrastructure and production deployment assets, so it can be worked on as a single repository from library code through Kubernetes rollout.

## Monorepo Structure

```text
shop/
|-- .github/
|   |-- actions/
|   `-- workflows/
|-- docs/
|-- infra/
|   |-- backups/
|   |-- chaos/
|   |-- k8s/
|   `-- docker-compose.yml
|-- libs/
|   |-- common-utils/
|   |-- compliance-engine/
|   |-- crypto-vault/
|   |-- distributed-transactions/
|   |-- fraud-detection/
|   `-- ledger-core/
|-- services/
|   |-- analytics-service/
|   |-- audit-service/
|   |-- auth-service/
|   |-- compliance-service/
|   |-- fraud-service/
|   |-- invoice-service/
|   |-- ledger-service/
|   |-- payment-service/
|   `-- wallet-service/
|-- Dockerfile
|-- build-and-deploy.sh
|-- package.json
`-- README.md
```

## Libraries

- `libs/common-utils`: shared helpers and common application primitives
- `libs/compliance-engine`: KYC, AML, consent, retention, and compliance workflows
- `libs/crypto-vault`: tokenization, vaulting, and cryptographic helpers
- `libs/distributed-transactions`: sagas, idempotency, retries, and resilience patterns
- `libs/fraud-detection`: risk scoring and fraud-analysis components
- `libs/ledger-core`: immutable ledger and accounting-oriented abstractions

## Services

- `services/payment-service`: payment orchestration and execution
- `services/auth-service`: authentication and access controls
- `services/ledger-service`: posting, balancing, and reconciliation
- `services/wallet-service`: wallet and balance operations
- `services/invoice-service`: invoice lifecycle management
- `services/fraud-service`: fraud policy execution
- `services/compliance-service`: compliance orchestration
- `services/analytics-service`: reporting and analytics workflows
- `services/audit-service`: audit evidence and traceability

## Technology

- Node.js workspaces
- TypeScript
- Docker and Docker Buildx
- Kubernetes with Kustomize
- GitHub Actions
- PostgreSQL, Redis, Kafka, Prometheus, Grafana, and Loki in the infrastructure layer

## Prerequisites

- Node.js `18+`
- npm `9+`
- Docker
- `kubectl` for Kubernetes validation or operations

## Quick Start

Install dependencies:

```bash
npm install
```

Build the workspace:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Start local infrastructure:

```bash
docker compose -f infra/docker-compose.yml up -d
```

Validate compose files:

```bash
docker compose -f infra/docker-compose.yml config
docker compose -f infra/docker-compose.prod.yml config
```

## Development Commands

```bash
npm run build
npm test
npm run lint
npm run format
npm run dev
```

## Operational Commands

```bash
npm run healthcheck
npm run logs
npm run status
npm run backup:full
npm run restore
npm run chaos:test
npm run verify:integrity
```

## Docker Build Model

The repository uses a single root Dockerfile. Images are built by passing the target service name as a build argument.

Example:

```bash
docker build --build-arg SERVICE_NAME=payment-service -t shop/payment-service:local .
```

## Kubernetes Deployment

Production manifests live in `infra/k8s/prod`. The deployment flow:

1. resolves the target registry coordinates
2. builds and publishes service images
3. renders manifests with resolved image references
4. validates kubeconfig and cluster access
5. applies manifests with Kustomize
6. waits for rollout completion

Render manifests locally:

```bash
kubectl kustomize infra/k8s/prod
```

## CI/CD

The pipeline is defined in `.github/workflows/ci-cd.yml`.

It performs:

1. checkout and Node setup
2. dependency installation and workspace build
3. Kubernetes manifest validation
4. Docker Compose validation
5. registry coordinate resolution
6. matrix image build and publish
7. Kubernetes deployment

### Required GitHub Secrets

- `REGISTRY_URL`
- `KUBE_CONFIG_DATA`
- `REGISTRY_USERNAME` for registries that do not use GitHub token auth
- `REGISTRY_PASSWORD` for registries that do not use GitHub token auth

### Registry Formats

Supported forms include:

- `ghcr.io/org`
- `docker.io/org`
- `registry.company.com/team`

If `REGISTRY_URL` is not configured, the workflow falls back to:

```text
ghcr.io/<repository_owner>
```

### Kubeconfig Contract

`KUBE_CONFIG_DATA` must contain base64-encoded kubeconfig content. The workflow decodes it, checks contexts, validates the active context, verifies cluster access, and only then applies manifests.

## Documentation

- [docs/ARCHITECTURE-DECISIONS.md](docs/ARCHITECTURE-DECISIONS.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/DEPLOYMENT-GUIDE.md](docs/DEPLOYMENT-GUIDE.md)
- [docs/enterprise-deployment.md](docs/enterprise-deployment.md)
- [docs/OBSERVABILITY-GUIDE.md](docs/OBSERVABILITY-GUIDE.md)
- [docs/INCIDENT-RESPONSE-RUNBOOKS.md](docs/INCIDENT-RESPONSE-RUNBOOKS.md)
- [docs/PRE-FLIGHT-VALIDATION.md](docs/PRE-FLIGHT-VALIDATION.md)
- [docs/SCALABILITY-ARCHITECTURE.md](docs/SCALABILITY-ARCHITECTURE.md)
- [docs/SECURITY-POLICIES.md](docs/SECURITY-POLICIES.md)
- [docs/security-best-practices.md](docs/security-best-practices.md)
- [docs/SERVICE-INTEGRATION-GUIDE.md](docs/SERVICE-INTEGRATION-GUIDE.md)

## Notes

- The repository is managed as a root workspace, so most developer commands should be run from the repository root.
- Some operational scripts assume a Unix-like shell environment.
- Production deployment depends on valid GitHub secrets and reachable Kubernetes credentials.
