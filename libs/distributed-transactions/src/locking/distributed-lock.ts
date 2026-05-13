import { createClient, RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

/**
 * Distributed lock using Redis with automatic expiration
 * Prevents concurrent access to shared resources (payments, settlements)
 */

export interface LockOptions {
  ttlSeconds?: number; // Lock expiration
  retries?: number; // Retry attempts
  retryDelayMs?: number; // Delay between retries
  description?: string;
}

export interface LockMetadata {
  lockId: string;
  resourceId: string;
  owner: string;
  acquiredAt: Date;
  expiresAt: Date;
  description?: string;
}

export class DistributedLock {
  private redis: RedisClientType;
  private logger: pino.Logger;
  private ownedLocks: Map<string, LockMetadata> = new Map();
  private readonly keyPrefix = 'lock:';

  constructor(redis: RedisClientType, logger?: pino.Logger) {
    this.redis = redis;
    this.logger = logger || pino();
  }

  /**
   * Acquire distributed lock
   */
  async acquireLock(resourceId: string, owner: string, options: LockOptions = {}): Promise<LockMetadata> {
    const ttlSeconds = options.ttlSeconds || 60;
    const retries = options.retries || 3;
    const retryDelayMs = options.retryDelayMs || 100;

    const lockId = `${owner}:${uuidv4()}`;
    const lockKey = `${this.keyPrefix}${resourceId}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Use SET NX (set if not exists) for atomic lock acquisition
        const result = await this.redis.set(lockKey, lockId, {
          NX: true,
          EX: ttlSeconds,
        });

        if (result === 'OK') {
          const metadata: LockMetadata = {
            lockId,
            resourceId,
            owner,
            acquiredAt: new Date(),
            expiresAt: new Date(Date.now() + ttlSeconds * 1000),
            description: options.description,
          };

          this.ownedLocks.set(lockId, metadata);
          this.logger.debug(`Acquired lock for ${resourceId} (attempt ${attempt + 1}/${retries + 1})`);

          return metadata;
        }

        if (attempt < retries) {
          await this.delay(retryDelayMs * Math.pow(2, attempt)); // Exponential backoff
        }
      } catch (error) {
        this.logger.error(`Error acquiring lock for ${resourceId}:`, error);
        throw error;
      }
    }

    throw new Error(`Failed to acquire lock for ${resourceId} after ${retries + 1} attempts`);
  }

  /**
   * Release distributed lock
   */
  async releaseLock(lockId: string, resourceId: string): Promise<boolean> {
    const lockKey = `${this.keyPrefix}${resourceId}`;

    try {
      // Use Lua script for atomic compare-and-delete
      const result = await this.redis.eval(
        `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
        `,
        { keys: [lockKey], arguments: [lockId] }
      );

      if (result === 1) {
        this.ownedLocks.delete(lockId);
        this.logger.debug(`Released lock for ${resourceId}`);
        return true;
      }

      // Lock doesn't belong to us or doesn't exist
      return false;
    } catch (error) {
      this.logger.error(`Error releasing lock for ${resourceId}:`, error);
      throw error;
    }
  }

  /**
   * Extend lock expiration
   */
  async extendLock(lockId: string, resourceId: string, additionalSeconds: number): Promise<boolean> {
    const lockKey = `${this.keyPrefix}${resourceId}`;

    try {
      const result = await this.redis.eval(
        `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("expire", KEYS[1], ARGV[2])
        else
          return 0
        end
        `,
        {
          keys: [lockKey],
          arguments: [lockId, additionalSeconds.toString()],
        }
      );

      if (result === 1) {
        const metadata = this.ownedLocks.get(lockId);
        if (metadata) {
          metadata.expiresAt = new Date(Date.now() + additionalSeconds * 1000);
        }
        this.logger.debug(`Extended lock for ${resourceId}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Error extending lock for ${resourceId}:`, error);
      throw error;
    }
  }

  /**
   * Check if lock is held by us
   */
  async isLockHeldByMe(lockId: string, resourceId: string): Promise<boolean> {
    const lockKey = `${this.keyPrefix}${resourceId}`;

    try {
      const currentLockId = await this.redis.get(lockKey);
      return currentLockId === lockId;
    } catch (error) {
      this.logger.error(`Error checking lock for ${resourceId}:`, error);
      return false;
    }
  }

  /**
   * Execute function with lock (auto-release)
   */
  async withLock<T>(
    resourceId: string,
    owner: string,
    fn: (metadata: LockMetadata) => Promise<T>,
    options: LockOptions = {}
  ): Promise<T> {
    const lockMetadata = await this.acquireLock(resourceId, owner, options);

    try {
      const result = await fn(lockMetadata);
      return result;
    } finally {
      await this.releaseLock(lockMetadata.lockId, resourceId);
    }
  }

  /**
   * Get all locks owned by this process
   */
  getOwnedLocks(): LockMetadata[] {
    return Array.from(this.ownedLocks.values());
  }

  /**
   * Force release all owned locks (emergency cleanup)
   */
  async emergencyReleaseAll(): Promise<number> {
    let released = 0;

    for (const [lockId, metadata] of this.ownedLocks) {
      try {
        if (await this.releaseLock(lockId, metadata.resourceId)) {
          released++;
        }
      } catch (error) {
        this.logger.error(`Error in emergency release of ${metadata.resourceId}:`, error);
      }
    }

    return released;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default DistributedLock;
