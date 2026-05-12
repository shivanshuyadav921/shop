import { FraudEventType, FraudEvaluationResult, FraudTransactionPayload } from '../types';
import { config } from '../config';

interface RuleResult {
  name: string;
  weight: number;
  triggered: boolean;
  details: string;
}

export function evaluateRisk(
  payload: FraudTransactionPayload,
  recentEvents: any[],
  recentDealerEvents: any[]
): { score: number; factors: Record<string, unknown>; action: 'allow' | 'review' | 'block' } {
  const rules: RuleResult[] = [];
  const duplicate = recentEvents.some((event) => event.payment_reference && payload.paymentReference && event.payment_reference === payload.paymentReference);
  rules.push({
    name: 'duplicate_payment',
    weight: duplicate ? 35 : 0,
    triggered: duplicate,
    details: duplicate ? 'Exact payment reference seen recently' : 'No duplicate payment reference',
  });

  const sameAmountRecent = recentEvents.filter((event) => Number(event.amount) === payload.amount).length;
  const velocityScore = sameAmountRecent > 3 ? 20 : sameAmountRecent > 1 ? 10 : 0;
  rules.push({
    name: 'velocity_attack',
    weight: velocityScore,
    triggered: velocityScore > 0,
    details: `Saw ${sameAmountRecent} similar transactions recently`,
  });

  const deviceSeen = recentDealerEvents.some((event) => event.device_fingerprint && payload.deviceFingerprint && event.device_fingerprint === payload.deviceFingerprint);
  rules.push({
    name: 'device_anomaly',
    weight: deviceSeen ? 0 : 15,
    triggered: !deviceSeen,
    details: deviceSeen ? 'Known device fingerprint' : 'New or rare device fingerprint',
  });

  const ipSuspicious = payload.ipAddress ? config.suspiciousIps.includes(payload.ipAddress) : false;
  rules.push({
    name: 'suspicious_ip',
    weight: ipSuspicious ? 30 : 0,
    triggered: ipSuspicious,
    details: ipSuspicious ? `Suspicious IP ${payload.ipAddress}` : 'IP not in suspicious list',
  });

  const refundEvents = recentDealerEvents.filter((event) => event.event_type === 'refund').length;
  rules.push({
    name: 'refund_abuse',
    weight: refundEvents >= 3 ? 25 : refundEvents === 2 ? 15 : 0,
    triggered: refundEvents >= 2,
    details: `Dealer has ${refundEvents} refund/chargeback events recently`,
  });

  const averageAmount = recentDealerEvents.reduce((sum, event) => sum + Number(event.amount), 0) / Math.max(1, recentDealerEvents.length);
  const spikeWeight = payload.amount >= averageAmount * 3 && averageAmount > 0 ? 20 : 0;
  rules.push({
    name: 'large_spike',
    weight: spikeWeight,
    triggered: spikeWeight > 0,
    details: spikeWeight > 0 ? `Transaction is ${payload.amount / averageAmount}x average` : 'Amount within normal range',
  });

  const dealerRiskEvents = recentDealerEvents.filter((event) => event.risk_score > 60).length;
  const dealerRiskWeight = Math.min(20, dealerRiskEvents * 5);
  rules.push({
    name: 'dealer_risk_pattern',
    weight: dealerRiskWeight,
    triggered: dealerRiskEvents > 0,
    details: `Dealer has ${dealerRiskEvents} higher-risk events in history`,
  });

  const score = Math.min(100, rules.reduce((sum, rule) => sum + rule.weight, 0));
  let action: 'allow' | 'review' | 'block' = 'allow';
  if (score >= config.blockThreshold) action = 'block';
  else if (score >= config.reviewThreshold) action = 'review';

  const factors = rules.reduce((acc, rule) => ({
    ...acc,
    [rule.name]: { triggered: rule.triggered, weight: rule.weight, details: rule.details },
  }), {} as Record<string, unknown>);

  return { score, factors, action };
}
