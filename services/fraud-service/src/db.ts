import { Pool } from 'pg';
import { config } from './config';

export const pool = new Pool({ connectionString: config.dbUrl });

export async function initSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS fraud_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      transaction_id TEXT NOT NULL,
      dealer_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      currency TEXT NOT NULL,
      ip_address TEXT,
      device_fingerprint TEXT,
      payment_reference TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      risk_score INT NOT NULL DEFAULT 0,
      risk_factors JSONB NOT NULL DEFAULT '{}'::JSONB,
      metadata JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_fraud_events_transaction_id ON fraud_events(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_fraud_events_dealer_id ON fraud_events(dealer_id);
    CREATE INDEX IF NOT EXISTS idx_fraud_events_ip_address ON fraud_events(ip_address);
    CREATE INDEX IF NOT EXISTS idx_fraud_events_device_fingerprint ON fraud_events(device_fingerprint);

    CREATE TABLE IF NOT EXISTS fraud_alerts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      event_id UUID REFERENCES fraud_events(id) ON DELETE CASCADE,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      channel TEXT NOT NULL DEFAULT 'dashboard',
      payload JSONB NOT NULL DEFAULT '{}'::JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      processed_at TIMESTAMP WITH TIME ZONE
    );

    CREATE TABLE IF NOT EXISTS fraud_reviews (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      event_id UUID REFERENCES fraud_events(id) ON DELETE CASCADE,
      transaction_id TEXT NOT NULL,
      dealer_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewer_id TEXT,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE
    );
  `);
}
