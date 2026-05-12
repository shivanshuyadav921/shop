import { Pool } from 'pg';
import { config } from './config';

export const pool = new Pool({ connectionString: config.dbUrl });

export async function initSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS rail_provider_configs (
      provider_id TEXT PRIMARY KEY,
      provider_type TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      config JSONB NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS rail_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      idempotency_key TEXT UNIQUE,
      provider_id TEXT NOT NULL,
      rail_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      amount NUMERIC(18,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      external_reference TEXT,
      beneficiary JSONB,
      request_payload JSONB NOT NULL,
      response_payload JSONB,
      failure_reason TEXT,
      metadata JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_rail_transactions_provider_reference ON rail_transactions(provider_id, external_reference);
    CREATE INDEX IF NOT EXISTS idx_rail_transactions_status_updated ON rail_transactions(status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_rail_transactions_provider_status ON rail_transactions(provider_id, status);
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rail_transactions_amount_positive') THEN
        ALTER TABLE rail_transactions ADD CONSTRAINT rail_transactions_amount_positive CHECK (amount > 0) NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rail_transactions_status_valid') THEN
        ALTER TABLE rail_transactions ADD CONSTRAINT rail_transactions_status_valid CHECK (status IN ('pending', 'initiated', 'success', 'failed', 'reconciled', 'cancelled')) NOT VALID;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS rail_callbacks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      transaction_id UUID REFERENCES rail_transactions(id) ON DELETE SET NULL,
      provider_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS rail_reconciliation_jobs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_name TEXT NOT NULL,
      status TEXT NOT NULL,
      details JSONB,
      run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      completed_at TIMESTAMP WITH TIME ZONE
    );
  `);
}
