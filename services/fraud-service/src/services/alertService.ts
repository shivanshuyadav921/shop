import { pool } from '../db';
import { FraudAlert } from '../types';

export async function createAlert(eventId: string, severity: FraudAlert['severity'], message: string, payload: Record<string, unknown>) {
  const result = await pool.query(
    'INSERT INTO fraud_alerts (event_id, severity, message, channel, payload) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [eventId, severity, message, 'dashboard', payload]
  );
  return result.rows[0] as FraudAlert;
}

export async function listAlerts() {
  const result = await pool.query('SELECT * FROM fraud_alerts ORDER BY created_at DESC');
  return result.rows as FraudAlert[];
}

export async function acknowledgeAlert(alertId: string) {
  const result = await pool.query(
    'UPDATE fraud_alerts SET status = $1, processed_at = now() WHERE id = $2 RETURNING *',
    ['acknowledged', alertId]
  );
  return result.rows[0] as FraudAlert;
}
