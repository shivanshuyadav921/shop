import pino from 'pino';

/**
 * Provider failover strategy for payment processing
 * Automatically switches between primary and backup providers
 */

export enum ProviderStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
}

export interface Provider {
  id: string;
  name: string;
  endpoint: string;
  priority: number; // Lower = higher priority
  healthCheckInterval: number; // milliseconds
  status: ProviderStatus;
  lastHealthCheck?: Date;
  successRate?: number;
  failureCount?: number;
  responseTime?: number;
}

export interface FailoverPolicy {
  maxFailures: number; // Mark unhealthy after this many failures
  healthCheckTimeout: number;
  degradedThreshold: number; // Success rate below this = degraded
}

export class ProviderFailoverManager {
  private providers: Map<string, Provider> = new Map();
  private policy: FailoverPolicy;
  private logger: pino.Logger;
  private healthCheckTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(policy?: Partial<FailoverPolicy>, logger?: pino.Logger) {
    this.policy = {
      maxFailures: 5,
      healthCheckTimeout: 5000,
      degradedThreshold: 0.9,
      ...policy,
    };
    this.logger = logger || pino();
  }

  /**
   * Register a payment provider
   */
  registerProvider(provider: Provider): void {
    this.providers.set(provider.id, provider);
    this.logger.info(`Registered provider: ${provider.name} (priority: ${provider.priority})`);

    // Start health checks
    this.scheduleHealthCheck(provider.id);
  }

  /**
   * Get best available provider
   */
  getActiveProvider(): Provider | null {
    const sorted = Array.from(this.providers.values())
      .filter((p) => p.status !== ProviderStatus.UNHEALTHY)
      .sort((a, b) => {
        // Prefer healthy over degraded
        if (a.status !== b.status) {
          return a.status === ProviderStatus.HEALTHY ? -1 : 1;
        }
        // Then by priority
        return a.priority - b.priority;
      });

    return sorted[0] || null;
  }

  /**
   * Get all providers in fallback order
   */
  getProviderFallbackChain(): Provider[] {
    return Array.from(this.providers.values())
      .filter((p) => p.status !== ProviderStatus.UNHEALTHY)
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === ProviderStatus.HEALTHY ? -1 : 1;
        }
        return a.priority - b.priority;
      });
  }

  /**
   * Record successful transaction
   */
  recordSuccess(providerId: string, responseTimeMs: number): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;

    if (!provider.failureCount) provider.failureCount = 0;
    if (!provider.successRate) provider.successRate = 0;

    provider.failureCount = Math.max(0, provider.failureCount - 1);

    // Update success rate with exponential moving average
    const totalAttempts = 10; // Use window of recent attempts
    provider.successRate = (provider.successRate * (totalAttempts - 1) + 1) / totalAttempts;
    provider.responseTime = responseTimeMs;

    // Update status
    if (provider.status === ProviderStatus.UNHEALTHY && provider.failureCount === 0) {
      provider.status = ProviderStatus.DEGRADED;
    } else if (provider.status === ProviderStatus.DEGRADED && provider.successRate > this.policy.degradedThreshold) {
      provider.status = ProviderStatus.HEALTHY;
      this.logger.info(`Provider ${provider.name} recovered to HEALTHY`);
    }
  }

  /**
   * Record failed transaction
   */
  recordFailure(providerId: string, error: Error): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;

    if (!provider.failureCount) provider.failureCount = 0;
    if (!provider.successRate) provider.successRate = 1;

    provider.failureCount++;

    // Update success rate
    const totalAttempts = 10;
    provider.successRate = (provider.successRate * (totalAttempts - 1)) / totalAttempts;

    // Update status
    if (provider.failureCount >= this.policy.maxFailures) {
      provider.status = ProviderStatus.UNHEALTHY;
      this.logger.error(
        `Provider ${provider.name} marked UNHEALTHY after ${provider.failureCount} failures`
      );
    } else if (provider.status === ProviderStatus.HEALTHY && provider.successRate < this.policy.degradedThreshold) {
      provider.status = ProviderStatus.DEGRADED;
      this.logger.warn(`Provider ${provider.name} degraded to DEGRADED (success rate: ${(provider.successRate * 100).toFixed(1)}%)`);
    }
  }

  /**
   * Schedule health checks
   */
  private scheduleHealthCheck(providerId: string): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;

    const timer = setInterval(async () => {
      try {
        // Simulate health check (would be real HTTP check in production)
        const startTime = Date.now();
        const responseTime = Date.now() - startTime;

        provider.lastHealthCheck = new Date();

        // In production, would make actual HTTP request
        if (Math.random() > 0.95) {
          // Simulate occasional failures
          throw new Error('Health check failed');
        }

        this.recordSuccess(providerId, responseTime);
      } catch (error) {
        this.recordFailure(providerId, error as Error);
      }
    }, provider.healthCheckInterval);

    this.healthCheckTimers.set(providerId, timer);
  }

  /**
   * Get provider statistics
   */
  getProviderStats(providerId: string): Provider | null {
    return this.providers.get(providerId) || null;
  }

  /**
   * Get all provider statistics
   */
  getAllProviderStats(): Provider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Manual provider override
   */
  setProviderStatus(providerId: string, status: ProviderStatus): void {
    const provider = this.providers.get(providerId);
    if (provider) {
      provider.status = status;
      this.logger.info(`Manually set ${provider.name} to ${status}`);
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.healthCheckTimers.forEach((timer) => clearInterval(timer));
    this.healthCheckTimers.clear();
  }
}

export default ProviderFailoverManager;
