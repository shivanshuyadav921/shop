# Ledger Transaction Workflows

## Payment workflow
1. Create a `payment` transaction with `pending` status.
2. Debit the payer account and reserve the funds.
3. Credit the receiver account entry is created but not posted until settlement.
4. When payment clears, call `/ledger/transactions/:id/settle`.
5. The ledger posts entries, updates account balances, and transitions status to `settled`.

## Settlement workflow
- Settlement runs as a batch to move pending payment entries into posted state.
- The service ensures row-level locking on accounts and transaction rows to eliminate race conditions.
- Settlement is idempotent and safe to retry using stored `idempotency_key` values.

## Refund workflow
1. Create a `refund` reversal transaction referencing the original payment.
2. Generate reversed debit and credit entries.
3. Post the refund immediately to restore account balances.
4. Store reversal metadata for reconciliation.

## Chargeback workflow
1. Create a `chargeback` reversal transaction on the disputed payment.
2. Reverse original entries and post with `chargeback` type.
3. Mark the original transaction as having a chargeback via metadata or reference ID.

## Reconciliation
- Use `ledger_entries` to verify each transaction is balanced.
- Compare `ledger_transactions.total_debit` against `total_credit` for every transaction.
- Audit trailing and event logs make reconciliation data recoverable if the primary write path fails.

## Race condition protection
- All write workflows use PostgreSQL transactions and `SELECT ... FOR UPDATE` locks on ledger accounts.
- Pending reserves are tracked separately through `reserved_balance` so concurrent holds do not overdraw accounts.
- Idempotency keys prevent duplicate transaction creation from retries.
