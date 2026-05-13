import pino from 'pino';

/**
 * Circuit breaker pattern for provider failover
 * Prevents cascading failures by failing fast when services are down
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures to trigger open
  successThreshold: number; // Number of successes to close after half-open
  timeout: number; // Milliseconds before transitioning to half-open
  name: string;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  openedAt?: Date;
  transitionsToHalfOpen: number;
}

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private openedAt?: Date;
  private transitionsToHalfOpen: number = 0;
  private timer?: NodeJS.Timeout;
  private logger: pino.Logger;

  constructor(config: CircuitBreakerConfig, logger?: pino.Logger) {
    this.config = config;
    this.logger = logger || pino();
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      throw new Error(
        `Circuit breaker ${this.config.name} is OPEN. Service unavailable.`
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.lastSuccessTime = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Success in closed state, reset failure count
      this.failureCount = 0;
    }

    this.logger.debug(
      `[CircuitBreaker ${this.config.name}] Success. State: ${this.state}, Successes: ${this.successCount}`
    );
  }

  private onFailure(): void {
    this.lastFailureTime = new Date();

    if (this.state === CircuitState.CLOSED) {
      this.failureCount++;

      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionToOpen();
      }

      this.logger.warn(
        `[CircuitBreaker ${this.config.name}] Failure (${this.failureCount}/${this.config.failureThreshold})`
      );
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Failure in half-open, go back to open
      this.transitionToOpen();
      this.logger.warn(`[CircuitBreaker ${this.config.name}] Failed in HALF_OPEN, returning to OPEN`);
    }
  }

  private transitionToOpen(): void {
    this.state = CircuitState.OPEN;
    this.openedAt = new Date();
    this.failureCount = 0;
    this.successCount = 0;

    this.logger.error(`[CircuitBreaker ${this.config.name}] Transitioned to OPEN`);

    // Schedule transition to half-open
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.transitionToHalfOpen();
    }, this.config.timeout);
  }

  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.failureCount = 0;
    this.successCount = 0;
    this.transitionsToHalfOpen++;

    this.logger.info(
      `[CircuitBreaker ${this.config.name}] Transitioned to HALF_OPEN (attempt #${this.transitionsToHalfOpen})`
    );
  }

  private transitionToClosed(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAt = undefined;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.logger.info(`[CircuitBreaker ${this.config.name}] Transitioned to CLOSED`);
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      openedAt: this.openedAt,
      transitionsToHalfOpen: this.transitionsToHalfOpen,
    };
  }

  /**
   * Manual reset (emergency)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAt = undefined;
    this.transitionsToHalfOpen = 0;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.logger.info(`[CircuitBreaker ${this.config.name}] Manual reset`);
  }

  /**
   * Check if circuit is healthy
   */
  isHealthy(): boolean {
    return this.state === CircuitState.CLOSED;
  }
}

export default CircuitBreaker;
