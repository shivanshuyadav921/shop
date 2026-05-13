import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import pino from 'pino';

/**
 * Behavioral analytics for transaction patterns
 * Detects unusual behavior that may indicate fraud
 */

export interface UserBehavior {
  userId: string;
  totalTransactions: number;
  averageAmount: string;
  minAmount: string;
  maxAmount: string;
  standardDeviation: string;
  transactionsPerDay: number;
  preferredMerchants: string[];
  preferredCountries: string[];
  usualTransactionTime: string; // e.g., "09:00-17:00"
  lastTransactionAt: Date;
}

export interface BehaviorFlag {
  flagId: string;
  userId: string;
  transactionId: string;
  flag: string; // e.g., "unusual_amount", "velocity_exceeded", "new_merchant"
  severity: 'low' | 'medium' | 'high';
  details: string;
  flaggedAt: Date;
}

export class BehaviorAnalyzer {
  private userBehaviors: Map<string, UserBehavior> = new Map();
  private behaviorFlags: Map<string, BehaviorFlag[]> = new Map();
  private transactionHistory: Array<{
    userId: string;
    transactionId: string;
    amount: string;
    merchant: string;
    country: string;
    timestamp: Date;
  }> = [];
  private logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.logger = logger || pino();
  }

  /**
   * Record transaction for behavior learning
   */
  recordTransaction(
    userId: string,
    transactionId: string,
    amount: string,
    merchant: string,
    country: string
  ): void {
    this.transactionHistory.push({
      userId,
      transactionId,
      amount,
      merchant,
      country,
      timestamp: new Date(),
    });

    // Update behavior profile
    this.updateBehaviorProfile(userId);
  }

  /**
   * Analyze transaction against behavior
   */
  analyzeTransaction(
    userId: string,
    transactionId: string,
    amount: string,
    merchant: string,
    country: string
  ): { flags: BehaviorFlag[]; riskScore: number } {
    const flags: BehaviorFlag[] = [];
    let riskScore = 0;

    const behavior = this.userBehaviors.get(userId);
    if (!behavior) {
      // New user - higher scrutiny
      flags.push({
        flagId: `flag_${uuidv4()}`,
        userId,
        transactionId,
        flag: 'new_user',
        severity: 'medium',
        details: 'User has no transaction history',
        flaggedAt: new Date(),
      });
      riskScore += 25;
    } else {
      // Check amount against historical
      const amountDecimal = new Decimal(amount);
      const avgAmount = new Decimal(behavior.averageAmount);
      const stdDev = new Decimal(behavior.standardDeviation);

      const deviations = amountDecimal.minus(avgAmount).abs().div(stdDev.gt(0) ? stdDev : new Decimal(1));

      if (deviations.gt(3)) {
        flags.push({
          flagId: `flag_${uuidv4()}`,
          userId,
          transactionId,
          flag: 'unusual_amount',
          severity: 'high',
          details: `Amount ${amount} is ${deviations.toFixed(1)}σ above average`,
          flagedAt: new Date(),
        });
        riskScore += 40;
      }

      // Check for new merchant
      if (!behavior.preferredMerchants.includes(merchant)) {
        flags.push({
          flagId: `flag_${uuidv4()}`,
          userId,
          transactionId,
          flag: 'new_merchant',
          severity: 'low',
          details: `First transaction with merchant: ${merchant}`,
          flagedAt: new Date(),
        });
        riskScore += 15;
      }

      // Check for new country
      if (!behavior.preferredCountries.includes(country)) {
        flags.push({
          flagId: `flag_${uuidv4()}`,
          userId,
          transactionId,
          flag: 'new_country',
          severity: 'medium',
          details: `First transaction from country: ${country}`,
          flagedAt: new Date(),
        });
        riskScore += 30;
      }

      // Check velocity
      const recentTxns = this.getRecentTransactions(userId, 24 * 60 * 60 * 1000);
      if (recentTxns > behavior.transactionsPerDay * 2) {
        flags.push({
          flagId: `flag_${uuidv4()}`,
          userId,
          transactionId,
          flag: 'velocity_exceeded',
          severity: 'high',
          details: `User exceeded normal daily transaction count`,
          flagedAt: new Date(),
        });
        riskScore += 45;
      }
    }

    // Store flags
    if (!this.behaviorFlags.has(userId)) {
      this.behaviorFlags.set(userId, []);
    }
    this.behaviorFlags.get(userId)?.push(...flags);

    return { flags, riskScore: Math.min(100, riskScore) };
  }

  /**
   * Update user behavior profile
   */
  private updateBehaviorProfile(userId: string): void {
    const userTxns = this.transactionHistory.filter((t) => t.userId === userId);

    if (userTxns.length === 0) return;

    const amounts = userTxns.map((t) => new Decimal(t.amount));
    const avgAmount = amounts.reduce((a, b) => a.add(b), new Decimal(0)).div(amounts.length);

    // Calculate standard deviation
    const variance = amounts
      .map((a) => a.minus(avgAmount).pow(2))
      .reduce((a, b) => a.add(b), new Decimal(0))
      .div(amounts.length);
    const stdDev = variance.sqrt();

    // Transaction frequency
    const now = new Date();
    const last24h = userTxns.filter((t) => now.getTime() - t.timestamp.getTime() < 24 * 60 * 60 * 1000);

    // Extract merchants and countries
    const merchants = [...new Set(userTxns.map((t) => t.merchant))];
    const countries = [...new Set(userTxns.map((t) => t.country))];

    const behavior: UserBehavior = {
      userId,
      totalTransactions: userTxns.length,
      averageAmount: avgAmount.toString(),
      minAmount: Decimal.min(...amounts).toString(),
      maxAmount: Decimal.max(...amounts).toString(),
      standardDeviation: stdDev.toString(),
      transactionsPerDay: Math.ceil(last24h.length),
      preferredMerchants: merchants.slice(0, 10),
      preferredCountries: countries.slice(0, 5),
      usualTransactionTime: '09:00-17:00', // Would calculate from data
      lastTransactionAt: userTxns[userTxns.length - 1].timestamp,
    };

    this.userBehaviors.set(userId, behavior);
  }

  /**
   * Get recent transaction count
   */
  private getRecentTransactions(userId: string, timeWindowMs: number): number {
    const now = new Date();
    return this.transactionHistory.filter(
      (t) => t.userId === userId && now.getTime() - t.timestamp.getTime() < timeWindowMs
    ).length;
  }

  /**
   * Get user behavior profile
   */
  getUserBehavior(userId: string): UserBehavior | null {
    return this.userBehaviors.get(userId) || null;
  }

  /**
   * Get flags for user
   */
  getUserFlags(userId: string, limit?: number): BehaviorFlag[] {
    const flags = this.behaviorFlags.get(userId) || [];
    return limit ? flags.slice(-limit) : flags;
  }
}

export default BehaviorAnalyzer;
