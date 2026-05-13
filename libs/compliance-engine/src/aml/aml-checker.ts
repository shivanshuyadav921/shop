import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

/**
 * AML (Anti-Money Laundering) screening
 * Checks against sanctions lists and performs transaction monitoring
 */

export enum AMLCheckType {
  SANCTIONS = 'SANCTIONS', // OFAC, UN, EU lists
  PEP = 'PEP', // Politically exposed persons
  ADVERSE_MEDIA = 'ADVERSE_MEDIA',
  TRANSACTION_MONITORING = 'TRANSACTION_MONITORING',
}

export enum AMLStatus {
  CLEAR = 'CLEAR',
  PENDING_REVIEW = 'PENDING_REVIEW',
  BLOCKED = 'BLOCKED',
}

export interface AMLCheck {
  checkId: string;
  userId: string;
  checkType: AMLCheckType;
  status: AMLStatus;
  match: boolean;
  matchDetails?: string;
  confidence: number; // 0-1
  performedAt: Date;
  expiresAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
}

export interface TransactionMonitoringAlert {
  alertId: string;
  transactionId: string;
  userId: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  amount?: string;
  createdAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  action?: string;
}

export class AMLChecker {
  private checks: Map<string, AMLCheck> = new Map();
  private alerts: Map<string, TransactionMonitoringAlert> = new Map();
  private logger: pino.Logger;
  private sanctionsListCache: Set<string> = new Set(); // User names/entities on sanctions lists
  private pepListCache: Set<string> = new Set(); // PEP database

  constructor(logger?: pino.Logger) {
    this.logger = logger || pino();
    this.initializeListCache();
  }

  /**
   * Check user against sanctions lists
   */
  async checkSanctions(userId: string, name: string, country: string): Promise<AMLCheck> {
    const checkId = `aml_${uuidv4()}`;

    // In production, would query real sanctions lists (OFAC, UN, EU)
    const match = this.sanctionsListCache.has(name.toUpperCase());

    const check: AMLCheck = {
      checkId,
      userId,
      checkType: AMLCheckType.SANCTIONS,
      status: match ? AMLStatus.BLOCKED : AMLStatus.CLEAR,
      match,
      matchDetails: match ? `Potential match on sanctions list for ${country}` : undefined,
      confidence: match ? 0.95 : 0.99,
      performedAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    };

    this.checks.set(checkId, check);

    if (match) {
      this.logger.warn(`Sanctions check BLOCKED for user ${userId}: ${name}`);
    }

    return check;
  }

  /**
   * Check if user is politically exposed person
   */
  async checkPEP(userId: string, name: string, country: string): Promise<AMLCheck> {
    const checkId = `aml_${uuidv4()}`;

    // Query PEP database
    const match = this.pepListCache.has(name.toUpperCase());

    const check: AMLCheck = {
      checkId,
      userId,
      checkType: AMLCheckType.PEP,
      status: match ? AMLStatus.PENDING_REVIEW : AMLStatus.CLEAR,
      match,
      matchDetails: match ? `Potential PEP match: ${name}` : undefined,
      confidence: match ? 0.9 : 0.99,
      performedAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    };

    this.checks.set(checkId, check);

    if (match) {
      this.logger.info(`PEP check flagged for user ${userId}: ${name}`);
    }

    return check;
  }

  /**
   * Monitor transaction against suspicious patterns
   */
  monitorTransaction(
    transactionId: string,
    userId: string,
    amount: string,
    context: {
      isNewUser: boolean;
      velocityHigh: boolean;
      amountUnusual: boolean;
      countryHighRisk: boolean;
    }
  ): TransactionMonitoringAlert | null {
    let riskFactors = 0;
    let reason = '';

    if (context.isNewUser) {
      riskFactors++;
      reason += 'New user; ';
    }
    if (context.velocityHigh) {
      riskFactors++;
      reason += 'High transaction velocity; ';
    }
    if (context.amountUnusual) {
      riskFactors++;
      reason += 'Unusual amount; ';
    }
    if (context.countryHighRisk) {
      riskFactors++;
      reason += 'High-risk country; ';
    }

    if (riskFactors === 0) return null;

    let severity: 'low' | 'medium' | 'high' = 'low';
    if (riskFactors >= 3) severity = 'high';
    else if (riskFactors === 2) severity = 'medium';

    const alert: TransactionMonitoringAlert = {
      alertId: `alert_${uuidv4()}`,
      transactionId,
      userId,
      reason: reason.trim(),
      severity,
      amount,
      createdAt: new Date(),
    };

    this.alerts.set(alert.alertId, alert);

    this.logger.warn(`AML alert generated for transaction ${transactionId} (severity: ${severity})`);

    return alert;
  }

  /**
   * Get AML check
   */
  getCheck(checkId: string): AMLCheck | null {
    return this.checks.get(checkId) || null;
  }

  /**
   * Get user's latest checks
   */
  getUserChecks(userId: string): AMLCheck[] {
    const userChecks: AMLCheck[] = [];
    for (const check of this.checks.values()) {
      if (check.userId === userId) {
        userChecks.push(check);
      }
    }
    return userChecks.sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime());
  }

  /**
   * Get pending review alerts
   */
  getPendingReviewAlerts(): TransactionMonitoringAlert[] {
    return Array.from(this.alerts.values()).filter((a) => !a.reviewedAt);
  }

  /**
   * Review alert
   */
  reviewAlert(alertId: string, action: string, reviewedBy: string): TransactionMonitoringAlert | null {
    const alert = this.alerts.get(alertId);
    if (!alert) return null;

    alert.reviewedAt = new Date();
    alert.reviewedBy = reviewedBy;
    alert.action = action;

    this.logger.info(`Reviewed AML alert ${alertId}: ${action}`);

    return alert;
  }

  /**
   * Initialize sanctions and PEP list cache (in production, sync from external sources)
   */
  private initializeListCache(): void {
    // Would load from:
    // - OFAC SDN list
    // - UN Consolidated List
    // - EU sanctions
    // - Various PEP databases
    // For demo, pre-populate with examples
    this.sanctionsListCache.add('OSAMA BIN LADEN');
    this.sanctionsListCache.add('KIM JONG UN');

    this.pepListCache.add('VLADIMIR PUTIN');
    this.pepListCache.add('XI JINPING');
  }
}

export default AMLChecker;
