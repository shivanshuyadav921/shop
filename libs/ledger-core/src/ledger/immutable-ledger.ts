import { v4 as uuidv4 } from 'uuid';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import Decimal from 'decimal.js';
import pino from 'pino';

/**
 * Immutable append-only ledger - core of fintech systems
 * All entries are permanent, hashchained for integrity
 */

export enum EntryType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export enum LedgerStatus {
  POSTED = 'POSTED',
  PENDING = 'PENDING',
  REVERSED = 'REVERSED',
}

export interface LedgerEntry {
  id: string;
  entryType: EntryType;
  account: string; // e.g., "merchant:123:usd"
  amount: string; // Use string for precision (Decimal will convert)
  transactionId: string;
  description: string;
  status: LedgerStatus;
  reference?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  postedAt?: Date;
  hash: string; // Hash of this entry + previous entry
  previousHash: string; // Link to previous entry
  sequenceNumber: number;
}

export interface LedgerBalance {
  account: string;
  debitSum: string;
  creditSum: string;
  balance: string;
  lastUpdated: Date;
}

export class ImmutableLedger {
  private entries: LedgerEntry[] = [];
  private entryMap: Map<string, LedgerEntry> = new Map();
  private accountBalances: Map<string, LedgerBalance> = new Map();
  private lastHash: string = '0x0000';
  private sequenceNumber: number = 0;
  private logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.logger = logger || pino();
  }

  /**
   * Post a ledger entry (immutable append)
   */
  postEntry(
    entryType: EntryType,
    account: string,
    amount: string,
    transactionId: string,
    description: string,
    reference?: string,
    metadata?: Record<string, any>
  ): LedgerEntry {
    const amountDecimal = new Decimal(amount);

    if (amountDecimal.lte(0)) {
      throw new Error('Amount must be positive');
    }

    const entryId = `led_${uuidv4()}`;
    this.sequenceNumber++;

    // Calculate hash: hash(previousHash | entryId | account | amount | type)
    const dataToHash = `${this.lastHash}|${entryId}|${account}|${amount}|${entryType}`;
    const entryHash = bytesToHex(sha256(Buffer.from(dataToHash)));

    const entry: LedgerEntry = {
      id: entryId,
      entryType,
      account,
      amount: amount,
      transactionId,
      description,
      status: LedgerStatus.POSTED,
      reference,
      metadata,
      createdAt: new Date(),
      postedAt: new Date(),
      hash: entryHash,
      previousHash: this.lastHash,
      sequenceNumber: this.sequenceNumber,
    };

    // Append (immutable)
    this.entries.push(entry);
    this.entryMap.set(entryId, entry);

    // Update chain
    this.lastHash = entryHash;

    // Update balance
    this.updateBalance(account, entryType, amountDecimal);

    this.logger.debug(
      `Posted ledger entry: ${entryId} (${account} ${entryType} ${amount})`
    );

    return entry;
  }

  /**
   * Reverse an entry (creates offsetting entry, doesn't delete)
   */
  reverseEntry(entryId: string, reason: string): LedgerEntry {
    const originalEntry = this.entryMap.get(entryId);
    if (!originalEntry) {
      throw new Error(`Entry ${entryId} not found`);
    }

    if (originalEntry.status === LedgerStatus.REVERSED) {
      throw new Error(`Entry ${entryId} already reversed`);
    }

    // Create reversing entry with opposite type
    const reversingType = originalEntry.entryType === EntryType.DEBIT ? EntryType.CREDIT : EntryType.DEBIT;

    const reversingEntry = this.postEntry(
      reversingType,
      originalEntry.account,
      originalEntry.amount,
      originalEntry.transactionId,
      `Reversal: ${reason}`,
      `REV:${entryId}`,
      { ...originalEntry.metadata, reversalReason: reason }
    );

    // Mark original as reversed
    originalEntry.status = LedgerStatus.REVERSED;

    this.logger.info(`Reversed entry ${entryId} with ${reversingEntry.id}`);

    return reversingEntry;
  }

  /**
   * Get all entries for an account
   */
  getAccountEntries(account: string): LedgerEntry[] {
    return this.entries.filter((e) => e.account === account && e.status !== LedgerStatus.REVERSED);
  }

  /**
   * Get balance for account
   */
  getBalance(account: string): LedgerBalance | null {
    return this.accountBalances.get(account) || null;
  }

  /**
   * Verify ledger integrity (hash chain validation)
   */
  verifyIntegrity(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    let previousHash = '0x0000';

    for (const entry of this.entries) {
      if (entry.previousHash !== previousHash) {
        errors.push(
          `Entry ${entry.id}: previousHash mismatch. Expected ${previousHash}, got ${entry.previousHash}`
        );
      }

      // Verify entry hash
      const dataToHash = `${entry.previousHash}|${entry.id}|${entry.account}|${entry.amount}|${entry.entryType}`;
      const calculatedHash = bytesToHex(sha256(Buffer.from(dataToHash)));

      if (calculatedHash !== entry.hash) {
        errors.push(
          `Entry ${entry.id}: hash mismatch. Expected ${calculatedHash}, got ${entry.hash}`
        );
      }

      previousHash = entry.hash;
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get entry by ID
   */
  getEntry(entryId: string): LedgerEntry | null {
    return this.entryMap.get(entryId) || null;
  }

  /**
   * Get entries by transaction ID
   */
  getEntriesByTransaction(transactionId: string): LedgerEntry[] {
    return this.entries.filter((e) => e.transactionId === transactionId);
  }

  /**
   * Get all entries (audit trail)
   */
  getAllEntries(): ReadonlyArray<LedgerEntry> {
    return Object.freeze([...this.entries]);
  }

  /**
   * Get current chain head hash
   */
  getChainHeadHash(): string {
    return this.lastHash;
  }

  /**
   * Update account balance (internal)
   */
  private updateBalance(account: string, entryType: EntryType, amount: Decimal): void {
    let balance = this.accountBalances.get(account);

    if (!balance) {
      balance = {
        account,
        debitSum: '0',
        creditSum: '0',
        balance: '0',
        lastUpdated: new Date(),
      };
      this.accountBalances.set(account, balance);
    }

    const debitSum = new Decimal(balance.debitSum);
    const creditSum = new Decimal(balance.creditSum);

    if (entryType === EntryType.DEBIT) {
      balance.debitSum = debitSum.add(amount).toString();
    } else {
      balance.creditSum = creditSum.add(amount).toString();
    }

    // Balance = Debit - Credit (for typical accounting)
    balance.balance = new Decimal(balance.debitSum).minus(new Decimal(balance.creditSum)).toString();
    balance.lastUpdated = new Date();
  }
}

export default ImmutableLedger;
