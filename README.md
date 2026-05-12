# Shop Payment Platform

A white-label payment platform scaffold for dealer, distributor, customer, finance and compliance workflows.

## Workspace Structure

- `services/`: Node.js microservices
- `libs/`: shared runtime utilities
- `infra/docker-compose.yml`: local dev infra
- `infra/k8s/`: Kubernetes deployment templates
- `docs/architecture.md`: architecture overview

## Getting Started

1. Install dependencies
   ```bash
   npm run bootstrap
   ```

2. Start a service in development
   ```bash
   npm run start:auth
   ```

3. Build all packages
   ```bash
   npm run build
   ```
