import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import pino from 'pino';

/**
 * End-of-day reconciliation
 * Validates ledger against external sources and books final state
 */

export enum ReconciliationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  MATCHED = 'MATCHED',
  PARTIAL_MATCH = 'PARTIAL_MATCH',
  UNMATCHED = 'UNMATCHED',
  LOCKED = 'LOCKED',
}

export interface ReconciliationRecord {
  id: string;
  date: Date;
  source: string; // e.g., "bank", "gateway", "internal"
  account: string;
  externalBalance: string;
  internalBalance: string;
  difference: string;
  status: ReconciliationStatus;
  adjustments?: Array<{
    id: string;
    description: string;
    amount: string;
  }>;
  completedAt?: Date;
  lockedAt?: Date;
}

export interface DailySettlement {
  date: Date;
  account: string;
  openingBalance: string;
  transactions: number;
  totalDebits: string;
  totalCredits: string;
  closingBalance: string;
  reconciled: boolean;
}

export class ReconciliationManager {
  private reconciliations: Map<string, ReconciliationRecord> = new Map();
  private settlements: Map<string, DailySettlement> = new Map();
  private logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.logger = logger || pino();
  }

  /**
   * Start daily reconciliation
   */
  startReconciliation(
    source: string,
    account: string,
    externalBalance: string
  ): ReconciliationRecord {
    const record: ReconciliationRecord = {
      id: `recon_${uuidv4()}`,
      date: new Date(),
      source,
      account,
      externalBalance,
      internalBalance: '0',
      difference: '0',
      status: ReconciliationStatus.IN_PROGRESS,
      adjustments: [],
    };

    this.reconciliations.set(record.id, record);
    this.logger.info(`Started reconciliation for ${account} from ${source}`);

    return record;
  }

  /**
   * Match against internal ledger
   */
  matchReconciliation(
    reconciliationId: string,
    internalBalance: string
  ): {
    matched: boolean;
    difference: string;
  } {
    const record = this.reconciliations.get(reconciliationId);
    if (!record) {
      throw new Error(`Reconciliation ${reconciliationId} not found`);
    }

    const external = new Decimal(record.externalBalance);
    const internal = new Decimal(internalBalance);
    const difference = external.minus(internal);

    record.internalBalance = internalBalance;
    record.difference = difference.toString();

    if (difference.isZero()) {
      record.status = ReconciliationStatus.MATCHED;
      this.logger.info(`Reconciliation ${reconciliationId} MATCHED`);
      return { matched: true, difference: '0' };
    } else {
      record.status = ReconciliationStatus.UNMATCHED;
      this.logger.warn(
        `Reconciliation ${reconciliationId} UNMATCHED (difference: ${difference.toString()})`
      );
      return { matched: false, difference: difference.toString() };
    }
  }

  /**
   * Record adjustment for reconciliation
   */
  addAdjustment(
    reconciliationId: string,
    description: string,
    amount: string
  ): ReconciliationRecord | null {
    const record = this.reconciliations.get(reconciliationId);
    if (!record) return null;

    if (!record.adjustments) {
      record.adjustments = [];
    }

    record.adjustments.push({
      id: `adj_${uuidv4()}`,
      description,
      amount,
    });

    // Recalculate difference
    let totalAdjustments = new Decimal(0);
    for (const adj of record.adjustments) {
      totalAdjustments = totalAdjustments.add(new Decimal(adj.amount));
    }

    const external = new Decimal(record.externalBalance);
    const internal = new Decimal(record.internalBalance);
    const newDifference = external.minus(internal).minus(totalAdjustments);

    record.difference = newDifference.toString();

    if (newDifference.isZero()) {
      record.status = ReconciliationStatus.MATCHED;
    } else if (newDifference.abs().lt(new Decimal(0.01))) {
      record.status = ReconciliationStatus.PARTIAL_MATCH;
    }

    this.logger.debug(
      `Added adjustment to reconciliation ${reconciliationId}: ${description}`
    );

    return record;
  }

  /**
   * Lock reconciliation (finalize for the day)
   */
  lockReconciliation(reconciliationId: string): ReconciliationRecord | null {
    const record = this.reconciliations.get(reconciliationId);
    if (!record) return null;

    if (record.status !== ReconciliationStatus.MATCHED) {
      throw new Error(
        `Cannot lock unmatched reconciliation (status: ${record.status})`
      );
    }

    record.status = ReconciliationStatus.LOCKED;
    record.lockedAt = new Date();
    record.completedAt = new Date();

    this.logger.info(`Locked reconciliation ${reconciliationId}`);

    return record;
  }

  /**
   * Record daily settlement
   */
  recordSettlement(
    account: string,
    openingBalance: string,
    transactionCount: number,
    totalDebits: string,
    totalCredits: string
  ): DailySettlement {
    const closingBalance = new Decimal(openingBalance)
      .add(new Decimal(totalDebits))
      .minus(new Decimal(totalCredits))
      .toString();

    const settlement: DailySettlement = {
      date: new Date(),
      account,
      openingBalance,
      transactions: transactionCount,
      totalDebits,
      totalCredits,
      closingBalance,
      reconciled: false,
    };

    const key = `${account}:${new Date().toISOString().split('T')[0]}`;
    this.settlements.set(key, settlement);

    this.logger.info(
      `Recorded settlement for ${account}: ${closingBalance} (${transactionCount} txns)`
    );

    return settlement;
  }

  /**
   * Mark settlement as reconciled
   */
  markSettlementReconciled(account: string, date: Date): void {
    const key = `${account}:${date.toISOString().split('T')[0]}`;
    const settlement = this.settlements.get(key);
    if (settlement) {
      settlement.reconciled = true;
    }
  }

  /**
   * Get reconciliation status
   */
  getReconciliation(reconciliationId: string): ReconciliationRecord | null {
    return this.reconciliations.get(reconciliationId) || null;
  }

  /**
   * Get settlement
   */
  getSettlement(account: string, date: Date): DailySettlement | null {
    const key = `${account}:${date.toISOString().split('T')[0]}`;
    return this.settlements.get(key) || null;
  }

  /**
   * Get all reconciliations for date range
   */
  getReconciliationsByDate(startDate: Date, endDate: Date): ReconciliationRecord[] {
    return Array.from(this.reconciliations.values()).filter(
      (r) => r.date >= startDate && r.date <= endDate
    );
  }
}

export default ReconciliationManager;
