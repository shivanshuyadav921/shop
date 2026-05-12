import { Pool } from 'pg';
import { config } from './config';

export const pool = new Pool({ connectionString: config.dbUrl });

export async function initSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS compliance_entities (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      dealer_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      pan TEXT NOT NULL,
      gstin TEXT NOT NULL,
      bank_account TEXT NOT NULL,
      ifsc TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      risk_category TEXT NOT NULL DEFAULT 'low',
      verification_metadata JSONB DEFAULT '{}'::JSONB,
      metadata JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS compliance_documents (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entity_id UUID REFERENCES compliance_entities(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      metadata JSONB DEFAULT '{}'::JSONB,
      uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS compliance_approvals (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entity_id UUID REFERENCES compliance_entities(id) ON DELETE CASCADE,
      reviewer_id TEXT,
      action TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE
    );

    CREATE TABLE IF NOT EXISTS compliance_audit_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entity_id UUID REFERENCES compliance_entities(id) ON DELETE CASCADE,
      user_id TEXT,
      action TEXT NOT NULL,
      details JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );
  `);
}
