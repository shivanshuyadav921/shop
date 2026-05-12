# Production Readiness Review

## Executive Summary
The platform has been upgraded away from prototype behavior in the highest-risk fintech paths: payment provider execution, wallet balances, auth token storage, OTP storage, compliance verification, and ledger integrity. Production now fails fast when required secrets/providers are missing instead of silently using defaults.

## Findings Addressed
- Weak payment rail implementation: removed dummy/mock providers and added configured signed HTTP provider adapters.
- Hardcoded wallet UX/API behavior: replaced static balances and pretend transfers with PostgreSQL-backed wallets, idempotent transfers, row locks, and balance constraints.
- Security gaps: production secrets are now required; refresh tokens and OTPs are stored as SHA-256 digests; payment reconciliation requires an internal token.
- Compliance risk: PAN/GST/bank checks now call an external verification provider in production instead of relying only on format checks.
- Database inefficiencies: added indexes and constraints for auth login attempts, OTP lookup, refresh tokens, rail transactions, ledger entries, ledger events, and wallet transfers.
- Money correctness: ledger balance checks no longer compare floating-point sums directly.

## Remaining Production Requirements
- Create `shop-platform-secrets` before Kubernetes deployment with `DATABASE_URL`, `DATABASE_PASSWORD`, `JWT_SECRET`, `INTERNAL_API_TOKEN`, `PAYMENT_PROVIDER_CONFIGS`, `COMPLIANCE_VERIFICATION_API_BASE_URL`, and `COMPLIANCE_VERIFICATION_API_TOKEN`.
- Configure a real payment provider contract for `PAYMENT_PROVIDER_CONFIGS`; the adapter expects signed JSON responses with `status` and a provider reference.
- Configure a real compliance provider. Local regex validation is only a development fallback.
- Put auth, payment, ledger, wallet, compliance, and admin routes behind an API gateway that validates user identity and tenant authorization.
- Move compliance documents to encrypted object storage for multi-node production; the current PVC/local filesystem path is acceptable only for controlled single-region deployments.

## UX Risks
This repo does not contain a customer or operations frontend. API-level UX still needs:
- Consistent error codes and correlation IDs.
- Admin workflows for KYC review, payment reconciliation, disputes, and ledger drill-down.
- Operator-safe dashboards for failed provider callbacks, stuck pending transactions, and risk-review queues.

## Scalability Risks
- The bundled PostgreSQL, Redis, and Kafka manifests are bootstrap-grade. Four-nines production should use managed multi-AZ services or mature operators.
- Compliance document storage should be object storage, not pod-local or single PVC storage.
- Fraud rules are deterministic and synchronous; production should add model-versioned risk scoring and asynchronous decision audits.

## Compliance Risks
- PCI scope must be formally assessed before card data is introduced.
- PII fields need retention policies, data export/delete workflows, and field-level encryption where required.
- Audit logs should be immutable or exported to WORM storage.
