import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import pino from 'pino';

/**
 * Hash-chained journal for transaction audit trail
 * Every transaction is linked to the previous one via cryptographic hash
 * Provides tamper-evident audit log
 */

export interface JournalEntry {
  id: string;
  transactionId: string;
  account: string;
  debit?: string;
  credit?: string;
  description: string;
  hash: string; // Hash of this entry + previous
  previousHash: string; // Link to previous entry
  sequenceNumber: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface JournalPeriod {
  periodId: string;
  startDate: Date;
  endDate: Date;
  entries: number;
  startHash: string;
  endHash: string;
  periodHash: string; // Hash of the entire period
}

export class HashChainedJournal {
  private entries: JournalEntry[] = [];
  private entryMap: Map<string, JournalEntry> = new Map();
  private lastHash: string = '0x0000_journal_start';
  private sequenceNumber: number = 0;
  private periods: Map<string, JournalPeriod> = new Map();
  private logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.logger = logger || pino();
  }

  /**
   * Record journal entry (appends to hash chain)
   */
  recordEntry(
    transactionId: string,
    account: string,
    description: string,
    amount: string,
    isDebit: boolean,
    metadata?: Record<string, any>
  ): JournalEntry {
    const entryId = `je_${uuidv4()}`;
    this.sequenceNumber++;

    const debit = isDebit ? amount : undefined;
    const credit = !isDebit ? amount : undefined;

    // Hash: hash(previousHash | entryId | account | amount | isDebit)
    const dataToHash = `${this.lastHash}|${entryId}|${account}|${amount}|${isDebit}`;
    const entryHash = bytesToHex(sha256(Buffer.from(dataToHash)));

    const entry: JournalEntry = {
      id: entryId,
      transactionId,
      account,
      debit,
      credit,
      description,
      hash: entryHash,
      previousHash: this.lastHash,
      sequenceNumber: this.sequenceNumber,
      timestamp: new Date(),
      metadata,
    };

    this.entries.push(entry);
    this.entryMap.set(entryId, entry);
    this.lastHash = entryHash;

    this.logger.debug(`Recorded journal entry: ${entryId} (seq: ${this.sequenceNumber})`);

    return entry;
  }

  /**
   * Verify journal integrity
   */
  verifyIntegrity(): {
    valid: boolean;
    errors: string[];
    lastValidIndex: number;
  } {
    const errors: string[] = [];
    let previousHash = '0x0000_journal_start';
    let lastValidIndex = -1;

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];

      if (entry.previousHash !== previousHash) {
        errors.push(
          `Entry ${i}: previousHash mismatch at seq ${entry.sequenceNumber}`
        );
        break;
      }

      // Verify entry hash
      const isDebit = !!entry.debit;
      const amount = entry.debit || entry.credit || '0';
      const dataToHash = `${entry.previousHash}|${entry.id}|${entry.account}|${amount}|${isDebit}`;
      const calculatedHash = bytesToHex(sha256(Buffer.from(dataToHash)));

      if (calculatedHash !== entry.hash) {
        errors.push(`Entry ${i}: hash mismatch at seq ${entry.sequenceNumber}`);
        break;
      }

      previousHash = entry.hash;
      lastValidIndex = i;
    }

    return {
      valid: errors.length === 0,
      errors,
      lastValidIndex,
    };
  }

  /**
   * Close period and seal with hash
   */
  closePeriod(periodStartDate: Date, periodEndDate: Date): JournalPeriod {
    const periodId = `period_${uuidv4()}`;
    const periodEntries = this.entries.filter(
      (e) => e.timestamp >= periodStartDate && e.timestamp <= periodEndDate
    );

    let startHash = '0x0000';
    let endHash = this.lastHash;

    if (periodEntries.length > 0) {
      startHash = periodEntries[0].previousHash;
      endHash = periodEntries[periodEntries.length - 1].hash;
    }

    // Hash the entire period
    const periodDataToHash = `${startHash}|${endHash}|${periodId}|${periodEntries.length}`;
    const periodHash = bytesToHex(sha256(Buffer.from(periodDataToHash)));

    const period: JournalPeriod = {
      periodId,
      startDate: periodStartDate,
      endDate: periodEndDate,
      entries: periodEntries.length,
      startHash,
      endHash,
      periodHash,
    };

    this.periods.set(periodId, period);

    this.logger.info(
      `Closed period ${periodId}: ${periodEntries.length} entries, hash: ${periodHash.substring(0, 16)}...`
    );

    return period;
  }

  /**
   * Get entry by ID
   */
  getEntry(entryId: string): JournalEntry | null {
    return this.entryMap.get(entryId) || null;
  }

  /**
   * Get entries by transaction
   */
  getEntriesByTransaction(transactionId: string): JournalEntry[] {
    return this.entries.filter((e) => e.transactionId === transactionId);
  }

  /**
   * Get entries by account
   */
  getEntriesByAccount(account: string, startDate?: Date, endDate?: Date): JournalEntry[] {
    return this.entries.filter((e) => {
      if (e.account !== account) return false;
      if (startDate && e.timestamp < startDate) return false;
      if (endDate && e.timestamp > endDate) return false;
      return true;
    });
  }

  /**
   * Get all entries (audit trail)
   */
  getAllEntries(): ReadonlyArray<JournalEntry> {
    return Object.freeze([...this.entries]);
  }

  /**
   * Get current chain head hash
   */
  getCurrentHash(): string {
    return this.lastHash;
  }

  /**
   * Get period by ID
   */
  getPeriod(periodId: string): JournalPeriod | null {
    return this.periods.get(periodId) || null;
  }

  /**
   * Get all periods
   */
  getAllPeriods(): JournalPeriod[] {
    return Array.from(this.periods.values());
  }

  /**
   * Get entry count
   */
  getEntryCount(): number {
    return this.entries.length;
  }

  /**
   * Compute daily totals
   */
  getDailyTotals(date: Date): {
    date: string;
    debits: string;
    credits: string;
    count: number;
  } {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const dayEntries = this.entries.filter(
      (e) => e.timestamp >= dayStart && e.timestamp <= dayEnd
    );

    let debits = new Decimal(0);
    let credits = new Decimal(0);

    for (const entry of dayEntries) {
      if (entry.debit) debits = debits.add(new Decimal(entry.debit));
      if (entry.credit) credits = credits.add(new Decimal(entry.credit));
    }

    return {
      date: date.toISOString().split('T')[0],
      debits: debits.toString(),
      credits: credits.toString(),
      count: dayEntries.length,
    };
  }
}

export default HashChainedJournal;
