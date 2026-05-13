import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

/**
 * Immutable audit vault for compliance
 * Records all system actions for regulatory inspection and forensics
 */

export enum AuditAction {
  USER_CREATED = 'USER_CREATED',
  USER_VERIFIED = 'USER_VERIFIED',
  TRANSACTION_INITIATED = 'TRANSACTION_INITIATED',
  TRANSACTION_COMPLETED = 'TRANSACTION_COMPLETED',
  TRANSACTION_DECLINED = 'TRANSACTION_DECLINED',
  SETTLEMENT_PROCESSED = 'SETTLEMENT_PROCESSED',
  DISPUTE_FILED = 'DISPUTE_FILED',
  COMPLIANCE_CHECK = 'COMPLIANCE_CHECK',
  DATA_EXPORT = 'DATA_EXPORT',
  ADMIN_ACTION = 'ADMIN_ACTION',
  SECURITY_ALERT = 'SECURITY_ALERT',
}

export interface AuditLog {
  logId: string;
  action: AuditAction;
  userId: string;
  actor: string; // User or system making the action
  resource: string; // Entity being acted upon
  resourceId: string;
  changes?: Record<string, { before: any; after: any }>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  hash: string; // For tamper detection
}

export class AuditVault {
  private logs: AuditLog[] = [];
  private logIndex: Map<string, AuditLog[]> = new Map(); // Resource -> logs
  private logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.logger = logger || pino();
  }

  /**
   * Record audit event
   */
  recordAction(
    action: AuditAction,
    userId: string,
    actor: string,
    resource: string,
    resourceId: string,
    details?: {
      changes?: Record<string, { before: any; after: any }>;
      metadata?: Record<string, any>;
      ipAddress?: string;
      userAgent?: string;
    }
  ): AuditLog {
    const logId = `audit_${uuidv4()}`;

    const log: AuditLog = {
      logId,
      action,
      userId,
      actor,
      resource,
      resourceId,
      changes: details?.changes,
      metadata: details?.metadata,
      ipAddress: details?.ipAddress,
      userAgent: details?.userAgent,
      timestamp: new Date(),
      hash: this.generateHash(logId, action, resourceId),
    };

    this.logs.push(log);

    // Index by resource
    const resourceKey = `${resource}:${resourceId}`;
    if (!this.logIndex.has(resourceKey)) {
      this.logIndex.set(resourceKey, []);
    }
    this.logIndex.get(resourceKey)?.push(log);

    this.logger.debug(`Recorded audit: ${action} on ${resource}/${resourceId} by ${actor}`);

    return log;
  }

  /**
   * Get audit trail for resource
   */
  getResourceAuditTrail(resource: string, resourceId: string, limit?: number): AuditLog[] {
    const resourceKey = `${resource}:${resourceId}`;
    const logs = this.logIndex.get(resourceKey) || [];
    return limit ? logs.slice(-limit) : logs;
  }

  /**
   * Get user's audit trail
   */
  getUserAuditTrail(userId: string, limit?: number): AuditLog[] {
    const userLogs = this.logs.filter((l) => l.userId === userId);
    return limit ? userLogs.slice(-limit) : userLogs;
  }

  /**
   * Get logs by action type
   */
  getLogsByAction(action: AuditAction, startDate?: Date, endDate?: Date): AuditLog[] {
    return this.logs.filter((l) => {
      if (l.action !== action) return false;
      if (startDate && l.timestamp < startDate) return false;
      if (endDate && l.timestamp > endDate) return false;
      return true;
    });
  }

  /**
   * Get all logs (for compliance export)
   */
  getAllLogs(startDate?: Date, endDate?: Date): AuditLog[] {
    return this.logs.filter((l) => {
      if (startDate && l.timestamp < startDate) return false;
      if (endDate && l.timestamp > endDate) return false;
      return true;
    });
  }

  /**
   * Export audit logs in compliance format (CSV/JSON)
   */
  exportForCompliance(format: 'json' | 'csv' = 'json', startDate?: Date, endDate?: Date): string {
    const logs = this.getAllLogs(startDate, endDate);

    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    } else {
      // CSV export
      const headers = ['logId', 'action', 'userId', 'actor', 'resource', 'resourceId', 'timestamp'];
      const rows = logs.map((l) => [
        l.logId,
        l.action,
        l.userId,
        l.actor,
        l.resource,
        l.resourceId,
        l.timestamp.toISOString(),
      ]);

      const csv = [headers, ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');

      return csv;
    }
  }

  /**
   * Verify audit log integrity
   */
  verifyIntegrity(): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    for (const log of this.logs) {
      const expectedHash = this.generateHash(log.logId, log.action, log.resourceId);
      if (log.hash !== expectedHash) {
        errors.push(`Log ${log.logId}: hash mismatch (tamper detected)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get audit statistics
   */
  getStatistics(startDate?: Date, endDate?: Date): {
    totalLogs: number;
    actionCounts: Record<string, number>;
    uniqueUsers: number;
  } {
    const logs = this.getAllLogs(startDate, endDate);

    const actionCounts: Record<string, number> = {};
    const users = new Set<string>();

    for (const log of logs) {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
      users.add(log.userId);
    }

    return {
      totalLogs: logs.length,
      actionCounts,
      uniqueUsers: users.size,
    };
  }

  private generateHash(logId: string, action: string, resourceId: string): string {
    // Simplified hash - would use cryptographic hash in production
    const data = `${logId}|${action}|${resourceId}`;
    return Buffer.from(data).toString('hex').substring(0, 16);
  }
}

export default AuditVault;
