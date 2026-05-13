import Decimal from 'decimal.js';
import pino from 'pino';

/**
 * Risk scoring model combining multiple signals
 * Produces 0-100 risk score for transaction approval
 */

export interface RiskSignals {
  deviceRisk: number; // 0-100
  behavioralRisk: number; // 0-100
  velocityRisk: number; // 0-100
  amountRisk: number; // 0-100
  geoRisk: number; // 0-100
  merchantRisk: number; // 0-100
}

export interface RiskScore {
  transactionId: string;
  riskScore: number; // 0-100
  signals: RiskSignals;
  recommendation: 'APPROVE' | 'CHALLENGE' | 'BLOCK' | 'REVIEW';
  confidence: number; // 0-1
  reasoning: string[];
}

export class RiskScorer {
  private approvalThreshold: number = 30; // Score >= this requires challenge
  private blockThreshold: number = 75; // Score >= this is blocked
  private logger: pino.Logger;

  // Weights for different risk components
  private weights = {
    device: 0.2,
    behavioral: 0.25,
    velocity: 0.2,
    amount: 0.15,
    geo: 0.15,
    merchant: 0.05,
  };

  constructor(logger?: pino.Logger) {
    this.logger = logger || pino();
  }

  /**
   * Calculate composite risk score
   */
  calculateRiskScore(
    transactionId: string,
    signals: RiskSignals,
    context?: {
      isAuthenticated: boolean;
      hasMFA: boolean;
      isKnownMerchant: boolean;
      userAge: number;
    }
  ): RiskScore {
    // Weighted average
    const baseScore = Math.round(
      signals.deviceRisk * this.weights.device +
      signals.behavioralRisk * this.weights.behavioral +
      signals.velocityRisk * this.weights.velocity +
      signals.amountRisk * this.weights.amount +
      signals.geoRisk * this.weights.geo +
      signals.merchantRisk * this.weights.merchant
    );

    let adjustedScore = baseScore;
    const reasoning: string[] = [];

    // Apply context adjustments
    if (context) {
      if (context.isAuthenticated && context.hasMFA) {
        adjustedScore = Math.max(0, adjustedScore - 15);
        reasoning.push('Authenticated with MFA');
      }

      if (context.isKnownMerchant) {
        adjustedScore = Math.max(0, adjustedScore - 10);
        reasoning.push('Known merchant');
      }

      if (context.userAge > 365 * 2) {
        // 2+ years old account
        adjustedScore = Math.max(0, adjustedScore - 10);
        reasoning.push('Established account');
      }
    }

    // Determine recommendation
    let recommendation: 'APPROVE' | 'CHALLENGE' | 'BLOCK' | 'REVIEW';

    if (adjustedScore >= this.blockThreshold) {
      recommendation = 'BLOCK';
      reasoning.push(`Risk score ${adjustedScore} exceeds block threshold`);
    } else if (adjustedScore >= this.approvalThreshold) {
      recommendation = 'CHALLENGE';
      reasoning.push(`Risk score ${adjustedScore} requires challenge`);
    } else if (signals.deviceRisk > 80 || signals.behavioralRisk > 80) {
      recommendation = 'REVIEW';
      reasoning.push('High risk in individual signal');
    } else {
      recommendation = 'APPROVE';
      reasoning.push('Risk within acceptable range');
    }

    const confidence = this.calculateConfidence(signals);

    return {
      transactionId,
      riskScore: adjustedScore,
      signals,
      recommendation,
      confidence,
      reasoning,
    };
  }

  /**
   * Calculate confidence in the risk assessment
   */
  private calculateConfidence(signals: RiskSignals): number {
    // Higher confidence when signals agree
    const avgSignal = (
      signals.deviceRisk +
      signals.behavioralRisk +
      signals.velocityRisk +
      signals.amountRisk +
      signals.geoRisk +
      signals.merchantRisk
    ) / 6;

    // Calculate variance
    const variance =
      Math.pow(signals.deviceRisk - avgSignal, 2) +
      Math.pow(signals.behavioralRisk - avgSignal, 2) +
      Math.pow(signals.velocityRisk - avgSignal, 2) +
      Math.pow(signals.amountRisk - avgSignal, 2) +
      Math.pow(signals.geoRisk - avgSignal, 2) +
      Math.pow(signals.merchantRisk - avgSignal, 2);

    const stdDev = Math.sqrt(variance / 6);

    // Lower variance = higher confidence
    const confidence = Math.max(0, 1 - stdDev / 100);

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Update approval thresholds based on performance
   */
  setThresholds(approvalThreshold: number, blockThreshold: number): void {
    this.approvalThreshold = approvalThreshold;
    this.blockThreshold = blockThreshold;
    this.logger.info(
      `Updated risk thresholds: approval=${approvalThreshold}, block=${blockThreshold}`
    );
  }

  /**
   * Update signal weights
   */
  setWeights(weights: Partial<typeof RiskScorer.prototype.weights>): void {
    this.weights = { ...this.weights, ...weights };
    this.logger.info('Updated risk scoring weights');
  }
}

export default RiskScorer;
