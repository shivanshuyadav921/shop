import { Pool } from 'pg';
import { config } from './config';

export const pool = new Pool({ connectionString: config.dbUrl });

export async function initSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS dealers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      gstin TEXT,
      credit_limit NUMERIC(18,2) NOT NULL DEFAULT 0,
      current_outstanding NUMERIC(18,2) NOT NULL DEFAULT 0,
      credit_score INT NOT NULL DEFAULT 650,
      status TEXT NOT NULL DEFAULT 'active',
      metadata JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      dealer_id UUID REFERENCES dealers(id) ON DELETE CASCADE,
      invoice_number TEXT NOT NULL UNIQUE,
      issue_date DATE NOT NULL,
      due_date DATE NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      gst_rate NUMERIC(5,2) NOT NULL,
      gst_amount NUMERIC(18,2) NOT NULL,
      total_amount NUMERIC(18,2) NOT NULL,
      outstanding_amount NUMERIC(18,2) NOT NULL,
      financed_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'issued',
      metadata JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS invoice_payments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
      amount NUMERIC(18,2) NOT NULL,
      paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      payment_method TEXT NOT NULL,
      reference TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed',
      metadata JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS invoice_reminders (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
      dealer_id UUID REFERENCES dealers(id) ON DELETE CASCADE,
      reminder_type TEXT NOT NULL,
      sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      channel TEXT NOT NULL,
      payload JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoice_penalties (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
      penalty_amount NUMERIC(18,2) NOT NULL,
      calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      details JSONB DEFAULT '{}'::JSONB
    );
  `);
}
