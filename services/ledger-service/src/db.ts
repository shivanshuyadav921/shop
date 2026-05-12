import { Pool } from 'pg';
import { config } from './config';

export const pool = new Pool({ connectionString: config.dbUrl });

export async function initSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS ledger_accounts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      owner_id TEXT NOT NULL,
      owner_type TEXT NOT NULL,
      account_type TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
      reserved_balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      metadata JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_accounts_owner ON ledger_accounts(owner_id, owner_type);
    CREATE INDEX IF NOT EXISTS idx_ledger_accounts_active_currency ON ledger_accounts(is_active, currency);

    CREATE TABLE IF NOT EXISTS ledger_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      external_id TEXT,
      idempotency_key TEXT UNIQUE,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      description TEXT,
      total_debit NUMERIC(18, 2) NOT NULL,
      total_credit NUMERIC(18, 2) NOT NULL,
      reference_transaction_id UUID,
      metadata JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_transactions_status ON ledger_transactions(status);
    CREATE INDEX IF NOT EXISTS idx_ledger_transactions_external_id ON ledger_transactions(external_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_transactions_created ON ledger_transactions(created_at DESC);

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE CASCADE,
      account_id UUID REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
      entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
      amount NUMERIC(18, 2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      posted BOOLEAN NOT NULL DEFAULT FALSE,
      metadata JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE SET NULL,
      response JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ledger_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction ON ledger_entries(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_created ON ledger_entries(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ledger_events_created ON ledger_events(created_at DESC);

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_accounts_balance_non_negative') THEN
        ALTER TABLE ledger_accounts ADD CONSTRAINT ledger_accounts_balance_non_negative CHECK (balance >= 0 AND reserved_balance >= 0) NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_entries_amount_positive') THEN
        ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_amount_positive CHECK (amount > 0) NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_transactions_balanced') THEN
        ALTER TABLE ledger_transactions ADD CONSTRAINT ledger_transactions_balanced CHECK (total_debit = total_credit) NOT VALID;
      END IF;
    END $$;
  `);
}
