import { PoolClient } from 'pg';
import { LedgerEntry } from './types';
import { pool } from './db';

export type TransactionType = 'payment' | 'refund' | 'chargeback' | 'settlement' | 'adjustment';
export type TransactionStatus = 'pending' | 'posted' | 'settled' | 'failed' | 'refunded' | 'chargeback';

function isBalanced(entries: LedgerEntry[]) {
  const debit = entries.filter((entry) => entry.entryType === 'debit').reduce((sum, entry) => sum + toMinorUnits(entry.amount), BigInt(0));
  const credit = entries.filter((entry) => entry.entryType === 'credit').reduce((sum, entry) => sum + toMinorUnits(entry.amount), BigInt(0));
  return debit === credit;
}

function toMinorUnits(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ledger amount must be positive.');
  return BigInt(Math.round(amount * 100));
}

async function lockAccounts(client: PoolClient, accountIds: string[]) {
  const uniqueIds = Array.from(new Set(accountIds));
  if (!uniqueIds.length) return [];
  const result = await client.query(`SELECT id, balance, reserved_balance FROM ledger_accounts WHERE id = ANY($1::uuid[]) FOR UPDATE`, [uniqueIds]);
  return result.rows;
}

export async function emitLedgerEvent(eventType: string, payload: object) {
  if (!payload) return;
  await pool.query(`INSERT INTO ledger_events(event_type, payload) VALUES ($1, $2)`, [eventType, payload]);
}

export async function createAccount(ownerId: string, ownerType: string, accountType: string, currency = 'INR', metadata: object = {}) {
  const result = await pool.query(
    `INSERT INTO ledger_accounts(owner_id, owner_type, account_type, currency, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [ownerId, ownerType, accountType, currency, metadata]
  );
  await emitLedgerEvent('ledger.account.created', { account: result.rows[0] });
  return result.rows[0];
}

export async function getAccount(accountId: string) {
  const result = await pool.query(`SELECT *, (balance - reserved_balance) AS available_balance FROM ledger_accounts WHERE id = $1`, [accountId]);
  return result.rows[0] || null;
}

export async function getTransaction(transactionId: string) {
  const result = await pool.query(`SELECT * FROM ledger_transactions WHERE id = $1`, [transactionId]);
  if (!result.rows.length) return null;
  const transaction = result.rows[0];
  const entries = await pool.query(`SELECT * FROM ledger_entries WHERE transaction_id = $1 ORDER BY created_at`, [transactionId]);
  return { ...transaction, entries: entries.rows };
}

export async function createLedgerTransaction(
  externalId: string | null,
  idempotencyKey: string | null,
  type: TransactionType,
  status: TransactionStatus,
  description: string,
  entries: LedgerEntry[],
  metadata: object = {},
  referenceTransactionId: string | null = null
) {
  if (!isBalanced(entries)) {
    throw new Error('Ledger entries must balance debit and credit.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (idempotencyKey) {
      const existing = await client.query(`SELECT response FROM idempotency_keys WHERE key = $1 FOR UPDATE`, [idempotencyKey]);
      if (existing.rows.length) {
        await client.query('ROLLBACK');
        return existing.rows[0].response;
      }
    }

    const accountIds = entries.map((entry) => entry.accountId);
    const lockedAccounts = await lockAccounts(client, accountIds);
    if (lockedAccounts.length !== Array.from(new Set(accountIds)).length) {
      throw new Error('One or more ledger accounts not found or locked.');
    }

    for (const entry of entries) {
      if (entry.entryType === 'debit') {
        const account = lockedAccounts.find((row) => row.id === entry.accountId);
        if (!account) throw new Error(`Account not found: ${entry.accountId}`);
        const available = Number(account.balance) - Number(account.reserved_balance);
        if (available < entry.amount) {
          throw new Error(`Insufficient available balance on account ${entry.accountId}`);
        }
      }
    }

    const totalDebit = entries.filter((entry) => entry.entryType === 'debit').reduce((sum, entry) => sum + entry.amount, 0);
    const totalCredit = entries.filter((entry) => entry.entryType === 'credit').reduce((sum, entry) => sum + entry.amount, 0);

    const transactionResult = await client.query(
      `INSERT INTO ledger_transactions(external_id, idempotency_key, type, status, description, total_debit, total_credit, reference_transaction_id, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [externalId, idempotencyKey, type, status, description, totalDebit, totalCredit, referenceTransactionId, metadata]
    );

    const transaction = transactionResult.rows[0];
    const insertText = `INSERT INTO ledger_entries(transaction_id, account_id, entry_type, amount, currency, posted, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7)`;

    for (const entry of entries) {
      await client.query(insertText, [transaction.id, entry.accountId, entry.entryType, entry.amount, entry.currency || 'INR', status !== 'pending', entry.metadata || {}]);

      if (status === 'pending' && entry.entryType === 'debit') {
        await client.query(`UPDATE ledger_accounts SET reserved_balance = reserved_balance + $1, updated_at = now() WHERE id = $2`, [entry.amount, entry.accountId]);
      }

      if (status !== 'pending') {
        if (entry.entryType === 'debit') {
          await client.query(`UPDATE ledger_accounts SET balance = balance - $1, updated_at = now() WHERE id = $2`, [entry.amount, entry.accountId]);
        } else {
          await client.query(`UPDATE ledger_accounts SET balance = balance + $1, updated_at = now() WHERE id = $2`, [entry.amount, entry.accountId]);
        }
      }
    }

    if (idempotencyKey) {
      await client.query(`INSERT INTO idempotency_keys(key, transaction_id, response) VALUES ($1, $2, $3)`, [idempotencyKey, transaction.id, JSON.stringify(transaction)]);
    }

    await client.query('COMMIT');
    await emitLedgerEvent('ledger.transaction.created', { transactionId: transaction.id, type, status, externalId });

    return transaction;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function settleLedgerTransaction(transactionId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const transactionResult = await client.query(`SELECT * FROM ledger_transactions WHERE id = $1 FOR UPDATE`, [transactionId]);
    if (!transactionResult.rows.length) throw new Error('Transaction not found');
    const transaction = transactionResult.rows[0];
    if (transaction.status !== 'pending') throw new Error('Only pending transactions can be settled.');

    const entryRows = await client.query(`SELECT * FROM ledger_entries WHERE transaction_id = $1 FOR UPDATE`, [transactionId]);
    if (!entryRows.rows.length) throw new Error('Transaction has no ledger entries.');

    for (const entry of entryRows.rows) {
      if (entry.entry_type === 'debit') {
        await client.query(`UPDATE ledger_accounts SET reserved_balance = reserved_balance - $1, balance = balance - $1, updated_at = now() WHERE id = $2`, [entry.amount, entry.account_id]);
      } else {
        await client.query(`UPDATE ledger_accounts SET balance = balance + $1, updated_at = now() WHERE id = $2`, [entry.amount, entry.account_id]);
      }
    }

    await client.query(`UPDATE ledger_entries SET posted = TRUE WHERE transaction_id = $1`, [transactionId]);
    await client.query(`UPDATE ledger_transactions SET status = 'settled', updated_at = now() WHERE id = $1`, [transactionId]);

    await client.query('COMMIT');
    await emitLedgerEvent('ledger.transaction.settled', { transactionId });
    return getTransaction(transactionId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function reverseTransaction(originalTransactionId: string, type: TransactionType, reason: string) {
  const original = await getTransaction(originalTransactionId);
  if (!original) throw new Error('Original transaction not found.');

  const reversedEntries: LedgerEntry[] = (original.entries as any[]).map((entry) => ({
    accountId: entry.account_id,
    entryType: entry.entry_type === 'debit' ? 'credit' : 'debit',
    amount: Number(entry.amount),
    currency: entry.currency,
    metadata: { reversedFrom: originalTransactionId, reason },
  }));

  const reversal = await createLedgerTransaction(null, null, type, 'posted', `Reversal for transaction ${originalTransactionId}`, reversedEntries, { reason }, originalTransactionId);
  await emitLedgerEvent(`ledger.transaction.${type}`, { originalTransactionId, reversalId: reversal.id, reason });
  return reversal;
}
