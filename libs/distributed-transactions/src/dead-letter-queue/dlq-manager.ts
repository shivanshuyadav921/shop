import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

/**
 * Dead Letter Queue (DLQ) for failed messages
 * Captures failed payments/transactions for later retry and analysis
 */

export enum DLQItemStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  RETRY_SCHEDULED = 'RETRY_SCHEDULED',
  ARCHIVED = 'ARCHIVED',
  PERMANENT_FAILURE = 'PERMANENT_FAILURE',
}

export interface DLQItem {
  id: string;
  originalId: string; // Original transaction/payment ID
  messageType: string;
  payload: any;
  error: string;
  retryCount: number;
  maxRetries: number;
  status: DLQItemStatus;
  createdAt: Date;
  nextRetryAt?: Date;
  lastAttemptAt?: Date;
  archive?: {
    reason: string;
    archivedAt: Date;
  };
}

export class DeadLetterQueueManager {
  private dlq: Map<string, DLQItem> = new Map();
  private logger: pino.Logger;
  private readonly defaultMaxRetries: number;
  private readonly retryDelayMs: number;

  constructor(defaultMaxRetries: number = 5, retryDelayMs: number = 5000, logger?: pino.Logger) {
    this.defaultMaxRetries = defaultMaxRetries;
    this.retryDelayMs = retryDelayMs;
    this.logger = logger || pino();

    // Process DLQ periodically
    setInterval(() => this.processRetries(), 60 * 1000);
  }

  /**
   * Add failed message to DLQ
   */
  addToQueue(
    originalId: string,
    messageType: string,
    payload: any,
    error: Error,
    maxRetries?: number
  ): DLQItem {
    const dlqId = `dlq_${uuidv4()}`;
    const item: DLQItem = {
      id: dlqId,
      originalId,
      messageType,
      payload,
      error: error.message,
      retryCount: 0,
      maxRetries: maxRetries || this.defaultMaxRetries,
      status: DLQItemStatus.QUEUED,
      createdAt: new Date(),
      nextRetryAt: new Date(Date.now() + this.retryDelayMs),
    };

    this.dlq.set(dlqId, item);

    this.logger.warn(
      `Added to DLQ: ${originalId} (${messageType}) - Error: ${error.message}`
    );

    return item;
  }

  /**
   * Mark item as processing
   */
  async markProcessing(dlqId: string): Promise<DLQItem | null> {
    const item = this.dlq.get(dlqId);
    if (!item) return null;

    item.status = DLQItemStatus.PROCESSING;
    item.lastAttemptAt = new Date();

    return item;
  }

  /**
   * Mark item as retryable (reschedule)
   */
  markForRetry(dlqId: string, nextRetryDelayMs?: number): DLQItem | null {
    const item = this.dlq.get(dlqId);
    if (!item) return null;

    item.retryCount++;
    item.status = DLQItemStatus.RETRY_SCHEDULED;
    item.nextRetryAt = new Date(
      Date.now() + (nextRetryDelayMs || this.retryDelayMs * Math.pow(2, item.retryCount - 1))
    );

    this.logger.info(
      `Scheduled retry for ${item.originalId} (attempt ${item.retryCount}/${item.maxRetries})`
    );

    return item;
  }

  /**
   * Mark item as permanently failed
   */
  markPermanentFailure(dlqId: string, reason: string): DLQItem | null {
    const item = this.dlq.get(dlqId);
    if (!item) return null;

    item.status = DLQItemStatus.PERMANENT_FAILURE;
    item.archive = {
      reason,
      archivedAt: new Date(),
    };

    this.logger.error(
      `Marked permanent failure for ${item.originalId}: ${reason}`
    );

    return item;
  }

  /**
   * Get ready-to-retry items
   */
  getReadyForRetry(): DLQItem[] {
    const readyItems: DLQItem[] = [];
    const now = new Date();

    this.dlq.forEach((item) => {
      if (
        item.status === DLQItemStatus.RETRY_SCHEDULED &&
        item.nextRetryAt &&
        now >= item.nextRetryAt &&
        item.retryCount < item.maxRetries
      ) {
        readyItems.push(item);
      }
    });

    return readyItems;
  }

  /**
   * Process retries
   */
  private async processRetries(): Promise<void> {
    const readyItems = this.getReadyForRetry();

    if (readyItems.length === 0) return;

    this.logger.info(`Processing ${readyItems.length} DLQ items for retry`);

    readyItems.forEach((item) => {
      // Emit event for retry processing
      item.status = DLQItemStatus.PROCESSING;
    });
  }

  /**
   * Get DLQ item by ID
   */
  getItem(dlqId: string): DLQItem | null {
    return this.dlq.get(dlqId) || null;
  }

  /**
   * Get all items for a transaction
   */
  getItemsByOriginalId(originalId: string): DLQItem[] {
    const items: DLQItem[] = [];
    this.dlq.forEach((item) => {
      if (item.originalId === originalId) {
        items.push(item);
      }
    });
    return items;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalItems: number;
    queued: number;
    processing: number;
    retryScheduled: number;
    archived: number;
    permanentFailures: number;
  } {
    let queued = 0,
      processing = 0,
      retryScheduled = 0,
      archived = 0,
      permanentFailures = 0;

    this.dlq.forEach((item) => {
      if (item.status === DLQItemStatus.QUEUED) queued++;
      else if (item.status === DLQItemStatus.PROCESSING) processing++;
      else if (item.status === DLQItemStatus.RETRY_SCHEDULED) retryScheduled++;
      else if (item.status === DLQItemStatus.ARCHIVED) archived++;
      else if (item.status === DLQItemStatus.PERMANENT_FAILURE) permanentFailures++;
    });

    return {
      totalItems: this.dlq.size,
      queued,
      processing,
      retryScheduled,
      archived,
      permanentFailures,
    };
  }

  /**
   * Get all failed items for analysis/alerting
   */
  getFailedItems(maxAge?: number): DLQItem[] {
    const failed: DLQItem[] = [];
    const now = new Date();

    this.dlq.forEach((item) => {
      const isRelevantStatus =
        item.status === DLQItemStatus.QUEUED ||
        item.status === DLQItemStatus.RETRY_SCHEDULED ||
        item.status === DLQItemStatus.PERMANENT_FAILURE;

      if (isRelevantStatus) {
        if (!maxAge || now.getTime() - item.createdAt.getTime() < maxAge) {
          failed.push(item);
        }
      }
    });

    return failed;
  }
}

export default DeadLetterQueueManager;
