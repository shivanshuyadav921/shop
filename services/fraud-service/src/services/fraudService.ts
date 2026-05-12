import { pool } from '../db';
import { FraudEventStatus, FraudEvaluationResult, FraudTransactionPayload, ReviewStatus } from '../types';
import { evaluateRisk } from './ruleEngine';
import { createAlert } from './alertService';
import { config } from '../config';

function normalizeStatus(action: 'allow' | 'block' | 'review'): FraudEventStatus {
  if (action === 'block') return 'blocked';
  if (action === 'review') return 'review';
  return 'pending';
}

export async function runFraudCheck(payload: FraudTransactionPayload): Promise<FraudEvaluationResult> {
  const recentEvents = (await pool.query(
    `SELECT * FROM fraud_events WHERE dealer_id = $1 AND created_at >= now() - interval '10 minutes' ORDER BY created_at DESC LIMIT 20`,
    [payload.dealerId]
  )).rows;

  const recentDealerEvents = (await pool.query(
    `SELECT * FROM fraud_events WHERE dealer_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [payload.dealerId]
  )).rows;

  const { score, factors, action } = evaluateRisk(payload, recentEvents, recentDealerEvents);
  const status = normalizeStatus(action);

  const result = await pool.query(
    `INSERT INTO fraud_events (transaction_id, dealer_id, event_type, amount, currency, ip_address, device_fingerprint, payment_reference, status, risk_score, risk_factors, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [
      payload.transactionId,
      payload.dealerId,
      payload.transactionType,
      payload.amount,
      payload.currency,
      payload.ipAddress || null,
      payload.deviceFingerprint || null,
      payload.paymentReference || null,
      status,
      score,
      factors,
      payload.metadata || {},
    ]
  );

  const event = result.rows[0];
  let alertId: string | undefined;

  if (score >= config.alertThreshold) {
    const severity: any = score >= 90 ? 'critical' : score >= 75 ? 'high' : score >= 60 ? 'medium' : 'low';
    const alert = await createAlert(event.id, severity, `Fraud risk event detected for transaction ${payload.transactionId}`, {
      transactionId: payload.transactionId,
      dealerId: payload.dealerId,
      score,
      action,
    });
    alertId = alert.id;
  }

  return {
    transactionId: payload.transactionId,
    riskScore: score,
    status,
    action,
    riskFactors: factors,
    alertId,
  };
}

export async function getFraudEvent(eventId: string) {
  const result = await pool.query('SELECT * FROM fraud_events WHERE id = $1', [eventId]);
  return result.rows[0];
}

export async function listFraudEvents(limit = 50) {
  const result = await pool.query('SELECT * FROM fraud_events ORDER BY created_at DESC LIMIT $1', [limit]);
  return result.rows;
}

export async function listReviewQueue() {
  const result = await pool.query('SELECT * FROM fraud_reviews WHERE status = $1 ORDER BY created_at DESC', ['pending']);
  return result.rows;
}

export async function createReview(eventId: string, transactionId: string, dealerId: string) {
  const result = await pool.query(
    'INSERT INTO fraud_reviews (event_id, transaction_id, dealer_id, status) VALUES ($1, $2, $3, $4) RETURNING *',
    [eventId, transactionId, dealerId, 'pending']
  );
  return result.rows[0];
}

export async function submitReview(reviewId: string, reviewerId: string, status: ReviewStatus, notes?: string) {
  const event = await pool.query('SELECT event_id, transaction_id, dealer_id FROM fraud_reviews WHERE id = $1', [reviewId]);
  if (!event.rows.length) throw new Error('Review not found');
  const row = event.rows[0];

  const updated = await pool.query(
    'UPDATE fraud_reviews SET status = $1, reviewer_id = $2, notes = $3, updated_at = now() WHERE id = $4 RETURNING *',
    [status, reviewerId, notes || null, reviewId]
  );

  const actionStatus = status === 'blocked' ? 'blocked' : status === 'approved' ? 'approved' : 'pending';
  await pool.query('UPDATE fraud_events SET status = $1, updated_at = now() WHERE id = $2', [actionStatus, row.event_id]);
  return updated.rows[0];
}

export async function blockTransaction(eventId: string) {
  const result = await pool.query('UPDATE fraud_events SET status = $1, updated_at = now() WHERE id = $2 RETURNING *', ['blocked', eventId]);
  return result.rows[0];
}
