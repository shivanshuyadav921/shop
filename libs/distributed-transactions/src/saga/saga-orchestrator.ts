import { v4 as uuidv4 } from 'uuid';
import PgBoss from 'pg-boss';
import pino from 'pino';

/**
 * Choreography-based Saga pattern for distributed transactions
 * Implements compensating transactions for rollback
 */

export interface SagaStep {
  id: string;
  name: string;
  action: (context: SagaContext) => Promise<any>;
  compensation: (context: SagaContext, result: any) => Promise<void>;
  timeout?: number; // milliseconds
  retries?: number;
}

export interface SagaContext {
  sagaId: string;
  userId: string;
  steps: Map<string, any>; // step results
  metadata: Record<string, any>;
  startedAt: Date;
  completedAt?: Date;
}

export enum SagaStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  COMPENSATING = 'COMPENSATING',
  FAILED = 'FAILED',
}

export interface SagaExecution {
  sagaId: string;
  status: SagaStatus;
  context: SagaContext;
  executedSteps: string[];
  failedStep?: string;
  error?: string;
  completedAt?: Date;
}

export class SagaOrchestrator {
  private pgBoss: PgBoss;
  private logger: pino.Logger;
  private sagas: Map<string, SagaExecution> = new Map();
  private sagaSteps: Map<string, SagaStep[]> = new Map();

  constructor(pgBoss: PgBoss, logger?: pino.Logger) {
    this.pgBoss = pgBoss;
    this.logger = logger || pino();
  }

  /**
   * Register a saga definition with its steps
   */
  registerSaga(sagaName: string, steps: SagaStep[]): void {
    this.sagaSteps.set(sagaName, steps);
    this.logger.info(`Registered saga: ${sagaName} with ${steps.length} steps`);
  }

  /**
   * Execute saga end-to-end
   */
  async executeSaga(sagaName: string, context: Partial<SagaContext>): Promise<SagaExecution> {
    const steps = this.sagaSteps.get(sagaName);
    if (!steps) {
      throw new Error(`Saga ${sagaName} not registered`);
    }

    const sagaId = uuidv4();
    const sagaContext: SagaContext = {
      sagaId,
      userId: context.userId || '',
      steps: new Map(),
      metadata: context.metadata || {},
      startedAt: new Date(),
    };

    const execution: SagaExecution = {
      sagaId,
      status: SagaStatus.IN_PROGRESS,
      context: sagaContext,
      executedSteps: [],
    };

    this.sagas.set(sagaId, execution);

    try {
      this.logger.info(`Starting saga ${sagaName} (${sagaId})`);

      // Execute each step
      for (const step of steps) {
        try {
          const timeout = step.timeout || 30000;
          const result = await this.executeWithTimeout(
            step.action(sagaContext),
            timeout,
            `Step ${step.name}`
          );

          sagaContext.steps.set(step.id, result);
          execution.executedSteps.push(step.id);

          this.logger.debug(`Step ${step.name} completed for saga ${sagaId}`);
        } catch (error) {
          execution.failedStep = step.id;
          execution.error = (error as Error).message;

          this.logger.error(
            `Step ${step.name} failed for saga ${sagaId}: ${(error as Error).message}`
          );

          // Start compensation
          await this.compensate(steps, execution);
          execution.status = SagaStatus.FAILED;
          execution.completedAt = new Date();
          this.sagas.set(sagaId, execution);

          throw new Error(`Saga ${sagaName} failed at step ${step.name}: ${(error as Error).message}`);
        }
      }

      // All steps succeeded
      execution.status = SagaStatus.COMPLETED;
      execution.completedAt = new Date();
      sagaContext.completedAt = new Date();

      this.logger.info(`Saga ${sagaName} (${sagaId}) completed successfully`);

      return execution;
    } catch (error) {
      this.logger.error(`Saga ${sagaName} execution failed:`, error);
      throw error;
    }
  }

  /**
   * Compensation: reverse executed steps
   */
  private async compensate(steps: SagaStep[], execution: SagaExecution): Promise<void> {
    const context = execution.context;
    execution.status = SagaStatus.COMPENSATING;

    this.logger.info(`Starting compensation for saga ${execution.sagaId}`);

    // Reverse order compensation
    for (let i = execution.executedSteps.length - 1; i >= 0; i--) {
      const stepId = execution.executedSteps[i];
      const step = steps.find((s) => s.id === stepId);

      if (!step) continue;

      try {
        const result = context.steps.get(step.id);
        await step.compensation(context, result);
        this.logger.debug(`Compensated step ${step.name}`);
      } catch (error) {
        this.logger.error(`Compensation failed for step ${step.name}:`, error);
        // Continue compensation even if one step fails
      }
    }
  }

  /**
   * Execute promise with timeout
   */
  private executeWithTimeout<T>(promise: Promise<T>, ms: number, operationName: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${operationName} timeout after ${ms}ms`)), ms)
      ),
    ]);
  }

  /**
   * Get saga execution status
   */
  getSagaStatus(sagaId: string): SagaExecution | null {
    return this.sagas.get(sagaId) || null;
  }

  /**
   * Retry a failed saga (idempotent)
   */
  async retrySaga(sagaId: string, sagaName: string): Promise<SagaExecution> {
    const previousExecution = this.sagas.get(sagaId);
    if (!previousExecution) {
      throw new Error(`Saga ${sagaId} not found`);
    }

    return this.executeSaga(sagaName, previousExecution.context);
  }

  /**
   * Async saga execution via job queue
   */
  async queueSaga(sagaName: string, context: Partial<SagaContext>): Promise<string> {
    const jobId = await this.pgBoss.send(
      `saga:${sagaName}`,
      { sagaName, context },
      { retryLimit: 3, retryDelay: 60 }
    );

    if (jobId === null) {
      throw new Error(`Failed to queue saga ${sagaName}`);
    }

    return jobId;
  }
}

export default SagaOrchestrator;
