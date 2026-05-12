# Architecture Overview

## Domain Services

- `auth-service`: authentication, authorization, JWT, RBAC
- `invoice-service`: invoice creation, lifecycle, dispute tracking
- `payment-service`: payment orchestration, transaction processing, settlement handoff
- `wallet-service`: wallet balance, internal transfers, payouts
- `fraud-service`: risk scoring, velocity checks, transaction screening
- `audit-service`: immutable audit and event logging

## Infrastructure

- `PostgreSQL`: service-owned transactional storage
- `Redis`: session cache, rate limiting, distributed locks
- `Kafka`: event messaging between domains
- `Docker`: container packaging
- `Kubernetes`: production orchestration

## Deployment Pattern

- `docker-compose` for local development
- `k8s` base and overlay manifests for environment-specific deployment

## Service Boundaries

Each service owns a database and publishes events for domain state changes. Internal APIs are used for synchronous workflows when required.
