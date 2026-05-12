import { Pool } from 'pg';
import { config } from './config';

export const pool = new Pool({ connectionString: config.dbUrl });

export async function initSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS analytics_reports (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      report_name TEXT NOT NULL,
      generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      payload JSONB NOT NULL
    );

    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_gmv_daily AS
      SELECT issue_date::date AS date, SUM(total_amount) AS gmv
      FROM invoices
      GROUP BY issue_date::date
      ORDER BY issue_date::date;

    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_settlement_success_rate AS
      SELECT
        COUNT(*) FILTER (WHERE status = 'confirmed')::numeric / NULLIF(COUNT(*), 0) * 100 AS success_rate,
        COUNT(*) FILTER (WHERE status <> 'confirmed') AS failed_payments,
        DATE(paid_at)::date AS date
      FROM invoice_payments
      GROUP BY DATE(paid_at);

    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dealer_utilization AS
      SELECT id AS dealer_id,
        credit_limit,
        current_outstanding,
        CASE WHEN credit_limit > 0 THEN current_outstanding / credit_limit * 100 ELSE 0 END AS utilization_percent
      FROM dealers;

    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_outstanding_credit AS
      SELECT dealer_id, SUM(outstanding_amount) AS outstanding_credit
      FROM invoices
      GROUP BY dealer_id;

    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_fraud_alerts_daily AS
      SELECT DATE(created_at) AS date, COUNT(*) AS alert_count,
        COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count
      FROM fraud_alerts
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at);

    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_refund_ratio AS
      SELECT
        DATE(created_at) AS date,
        SUM(CASE WHEN event_type = 'refund' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) AS refund_ratio
      FROM fraud_events
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at);
  `);
}
