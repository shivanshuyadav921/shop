import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import pino from 'pino';

/**
 * Idempotency manager for exactly-once processing
 * Deduplicates requests based on idempotency key
 * Ensures payment transactions cannot be processed twice
 */

export interface IdempotencyRecord {
  idempotencyKey: string;
  requestHash: string;
  result: any;
  status: 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  expiresAt: Date;
}

export class IdempotencyManager {
  private records: Map<string, IdempotencyRecord> = new Map();
  private logger: pino.Logger;
  private readonly defaultTtlSeconds: number;

  constructor(ttlSeconds: number = 86400, logger?: pino.Logger) {
    this.defaultTtlSeconds = ttlSeconds;
    this.logger = logger || pino();

    // Cleanup expired entries every hour
    setInterval(() => this.cleanupExpired(), 60 * 60 * 1000);
  }

  /**
   * Check if request is already being processed (idempotent)
   */
  async checkIdempotency(
    idempotencyKey: string,
    requestData: any
  ): Promise<{
    isDuplicate: boolean;
    result?: any;
    error?: string;
  }> {
    const requestHash = this.hashRequest(requestData);
    const record = this.records.get(idempotencyKey);

    if (!record) {
      // New request
      return { isDuplicate: false };
    }

    // Check if expired
    if (new Date() > record.expiresAt) {
      this.records.delete(idempotencyKey);
      return { isDuplicate: false };
    }

    // Check if request data matches
    if (record.requestHash !== requestHash) {
      throw new Error(
        'Idempotency key reused with different request data (potential security issue)'
      );
    }

    // Return cached result
    if (record.status === 'completed') {
      this.logger.debug(`Idempotent request hit (key: ${idempotencyKey})`);
      return { isDuplicate: true, result: record.result };
    }

    if (record.status === 'failed') {
      return { isDuplicate: true, error: record.error };
    }

    // Still processing - return "in progress"
    throw new Error(`Request still processing (idempotency key: ${idempotencyKey})`);
  }

  /**
   * Record request start
   */
  startRequest(idempotencyKey: string, requestData: any): void {
    const requestHash = this.hashRequest(requestData);

    const record: IdempotencyRecord = {
      idempotencyKey,
      requestHash,
      result: null,
      status: 'processing',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.defaultTtlSeconds * 1000),
    };

    this.records.set(idempotencyKey, record);
    this.logger.debug(`Started processing idempotent request (key: ${idempotencyKey})`);
  }

  /**
   * Record successful request completion
   */
  recordSuccess(idempotencyKey: string, result: any): void {
    const record = this.records.get(idempotencyKey);
    if (record) {
      record.status = 'completed';
      record.result = result;
      record.completedAt = new Date();
      this.logger.debug(`Recorded success for idempotent request (key: ${idempotencyKey})`);
    }
  }

  /**
   * Record request failure
   */
  recordFailure(idempotencyKey: string, error: Error): void {
    const record = this.records.get(idempotencyKey);
    if (record) {
      record.status = 'failed';
      record.error = error.message;
      record.completedAt = new Date();
      this.logger.debug(`Recorded failure for idempotent request (key: ${idempotencyKey})`);
    }
  }

  /**
   * Get idempotency record (for auditing)
   */
  getRecord(idempotencyKey: string): IdempotencyRecord | null {
    const record = this.records.get(idempotencyKey);
    if (record && new Date() > record.expiresAt) {
      this.records.delete(idempotencyKey);
      return null;
    }
    return record || null;
  }

  /**
   * Hash request for deduplication
   */
  private hashRequest(requestData: any): string {
    const dataString = JSON.stringify(requestData);
    return bytesToHex(sha256(Buffer.from(dataString))).substring(0, 32);
  }

  /**
   * Cleanup expired records
   */
  private cleanupExpired(): number {
    let cleaned = 0;
    const now = new Date();

    const keysToDelete: string[] = [];
    this.records.forEach((record, key) => {
      if (now > record.expiresAt) {
        keysToDelete.push(key);
        cleaned++;
      }
    });

    keysToDelete.forEach((key) => this.records.delete(key));

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired idempotency records`);
    }

    return cleaned;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalRecords: number;
    processingCount: number;
    completedCount: number;
    failedCount: number;
  } {
    let processingCount = 0,
      completedCount = 0,
      failedCount = 0;

    this.records.forEach((record) => {
      if (record.status === 'processing') processingCount++;
      if (record.status === 'completed') completedCount++;
      if (record.status === 'failed') failedCount++;
    });

    return {
      totalRecords: this.records.size,
      processingCount,
      completedCount,
      failedCount,
    };
  }
}

export default IdempotencyManager;
