import { pool } from '../db';
import { AnalyticsDashboard, AnalyticsReport } from '../types';
import { config } from '../config';

export async function refreshMaterializedViews() {
  await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_gmv_daily');
  await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_settlement_success_rate');
  await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dealer_utilization');
  await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_outstanding_credit');
  await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_fraud_alerts_daily');
  await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_refund_ratio');
}

export async function getDashboardMetrics(): Promise<AnalyticsDashboard> {
  const gmvResult = await pool.query('SELECT SUM(gmv) AS gmv FROM mv_gmv_daily');
  const successResult = await pool.query('SELECT AVG(success_rate) AS settlement_success_rate, SUM(failed_payments) AS failed_payments FROM mv_settlement_success_rate');
  const utilizationResult = await pool.query('SELECT AVG(utilization_percent) AS utilization_percent FROM mv_dealer_utilization');
  const outstandingResult = await pool.query('SELECT SUM(outstanding_credit) AS outstanding_credit FROM mv_outstanding_credit');
  const fraudResult = await pool.query('SELECT SUM(alert_count) AS alert_count FROM mv_fraud_alerts_daily');
  const refundResult = await pool.query('SELECT AVG(refund_ratio) AS refund_ratio FROM mv_refund_ratio');

  return {
    gmv: Number(gmvResult.rows[0]?.gmv ?? 0),
    settlementSuccessRate: Number(successResult.rows[0]?.settlement_success_rate ?? 0),
    failedPayments: Number(successResult.rows[0]?.failed_payments ?? 0),
    dealerUtilization: Number(utilizationResult.rows[0]?.utilization_percent ?? 0),
    outstandingCredit: Number(outstandingResult.rows[0]?.outstanding_credit ?? 0),
    fraudAlerts: Number(fraudResult.rows[0]?.alert_count ?? 0),
    refundRatio: Number(refundResult.rows[0]?.refund_ratio ?? 0),
  };
}

export async function getMaterializedView(name: string) {
  const allowed = new Set([
    'mv_gmv_daily',
    'mv_settlement_success_rate',
    'mv_dealer_utilization',
    'mv_outstanding_credit',
    'mv_fraud_alerts_daily',
    'mv_refund_ratio',
  ]);
  if (!allowed.has(name)) {
    throw new Error('Invalid materialized view');
  }
  const result = await pool.query(`SELECT * FROM ${name} ORDER BY 1 DESC LIMIT 100`);
  return result.rows;
}

export async function generateScheduledReport(reportName: string): Promise<AnalyticsReport> {
  const dashboard = await getDashboardMetrics();
  const result = await pool.query(
    'INSERT INTO analytics_reports (report_name, payload) VALUES ($1, $2) RETURNING *',
    [reportName, dashboard]
  );
  return result.rows[0];
}

export async function listReports(limit = 20) {
  const result = await pool.query('SELECT * FROM analytics_reports ORDER BY generated_at DESC LIMIT $1', [limit]);
  return result.rows as AnalyticsReport[];
}
