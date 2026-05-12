export type FraudEventType = 'payment' | 'refund' | 'chargeback';
export type FraudEventStatus = 'pending' | 'review' | 'blocked' | 'approved' | 'monitor';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ReviewStatus = 'pending' | 'approved' | 'blocked' | 'dismissed';

export interface FraudTransactionPayload {
  transactionId: string;
  dealerId: string;
  amount: number;
  currency: string;
  transactionType: FraudEventType;
  paymentReference?: string;
  ipAddress?: string;
  deviceFingerprint?: string;
  metadata?: Record<string, unknown>;
}

export interface FraudEvaluationResult {
  transactionId: string;
  riskScore: number;
  status: FraudEventStatus;
  action: 'allow' | 'block' | 'review';
  riskFactors: Record<string, unknown>;
  alertId?: string;
}

export interface FraudAlert {
  id: string;
  eventId: string;
  severity: AlertSeverity;
  message: string;
  status: 'open' | 'acknowledged' | 'resolved';
  channel: 'email' | 'sms' | 'dashboard';
  payload: Record<string, unknown>;
  created_at: string;
  processed_at?: string;
}

export interface FraudReview {
  id: string;
  eventId: string;
  transactionId: string;
  dealerId: string;
  status: ReviewStatus;
  reviewerId?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}
