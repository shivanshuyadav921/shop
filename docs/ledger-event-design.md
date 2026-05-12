# Ledger Event Sourcing Design

## Event store
- `ledger_events` captures every domain event in append-only form.
- Events are immutable and stored with event type, payload, and timestamp.
- This supports audit, replay, and reconciliation.

## Events emitted
- `ledger.account.created`
- `ledger.transaction.created`
- `ledger.transaction.settled`
- `ledger.transaction.refund`
- `ledger.transaction.chargeback`

## Event-driven patterns
- The ledger service writes events as part of the same database transaction that persists the ledger record.
- Downstream consumers can subscribe to the event stream and build materialized views, notification feeds, reconciliation jobs, or analytics.

## Idempotency and replay
- `Idempotency-Key` prevents duplicate transaction creation on retry.
- Events are append-only, so replay consumers can safely recover state from the event log.

## Reconciliation support
- Use `ledger_transactions` and `ledger_entries` to verify every movement.
- Store `external_id` for integration with payment gateways and bank settlement bundles.
- Event history provides an immutable audit trail for chargebacks, refunds, and settlement state changes.
