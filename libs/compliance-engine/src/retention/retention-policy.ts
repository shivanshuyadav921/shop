import pino from 'pino';

/**
 * Regulatory data retention policies
 * Ensures data is kept/deleted per jurisdiction requirements
 */

export enum Jurisdiction {
  US = 'US',
  EU = 'EU', // GDPR
  UK = 'UK',
  AUSTRALIA = 'AUSTRALIA',
  CANADA = 'CANADA',
}

export interface RetentionPolicy {
  jurisdiction: Jurisdiction;
  dataType: string; // e.g., "transaction", "kyc", "audit"
  retentionYears: number;
  deleteAfterYears?: number;
  specialRules?: string;
}

export class RetentionPolicyManager {
  private policies: Map<string, RetentionPolicy> = new Map();
  private logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.logger = logger || pino();
    this.initializeDefaultPolicies();
  }

  /**
   * Register retention policy
   */
  registerPolicy(jurisdiction: Jurisdiction, dataType: string, retentionYears: number, specialRules?: string): void {
    const policyKey = `${jurisdiction}:${dataType}`;

    const policy: RetentionPolicy = {
      jurisdiction,
      dataType,
      retentionYears,
      deleteAfterYears: retentionYears + 1, // Grace period
      specialRules,
    };

    this.policies.set(policyKey, policy);
    this.logger.info(
      `Registered retention policy: ${jurisdiction} ${dataType} (${retentionYears} years)`
    );
  }

  /**
   * Get retention period for data
   */
  getRetentionPeriod(jurisdiction: Jurisdiction, dataType: string): number | null {
    const policyKey = `${jurisdiction}:${dataType}`;
    const policy = this.policies.get(policyKey);
    return policy?.retentionYears || null;
  }

  /**
   * Check if data should be deleted
   */
  shouldDelete(jurisdiction: Jurisdiction, dataType: string, createdAt: Date): boolean {
    const policyKey = `${jurisdiction}:${dataType}`;
    const policy = this.policies.get(policyKey);

    if (!policy) return false;

    const deleteAfterDate = new Date(createdAt);
    deleteAfterDate.setFullYear(deleteAfterDate.getFullYear() + (policy.deleteAfterYears || policy.retentionYears + 1));

    return new Date() > deleteAfterDate;
  }

  /**
   * Get days until deletion
   */
  getDaysUntilDeletion(jurisdiction: Jurisdiction, dataType: string, createdAt: Date): number {
    const policyKey = `${jurisdiction}:${dataType}`;
    const policy = this.policies.get(policyKey);

    if (!policy) return -1;

    const deleteAfterDate = new Date(createdAt);
    deleteAfterDate.setFullYear(deleteAfterDate.getFullYear() + (policy.deleteAfterYears || policy.retentionYears + 1));

    const now = new Date();
    const daysLeft = Math.ceil((deleteAfterDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return Math.max(0, daysLeft);
  }

  /**
   * Get all policies for jurisdiction
   */
  getPoliciesForJurisdiction(jurisdiction: Jurisdiction): RetentionPolicy[] {
    const policies: RetentionPolicy[] = [];

    for (const policy of this.policies.values()) {
      if (policy.jurisdiction === jurisdiction) {
        policies.push(policy);
      }
    }

    return policies;
  }

  /**
   * Mark data for deletion
   */
  scheduleForDeletion(dataId: string, jurisdiction: Jurisdiction, dataType: string, createdAt: Date): {
    scheduleId: string;
    deleteDate: Date;
  } {
    const policyKey = `${jurisdiction}:${dataType}`;
    const policy = this.policies.get(policyKey);

    if (!policy) {
      throw new Error(`No retention policy for ${jurisdiction}:${dataType}`);
    }

    const deleteDate = new Date(createdAt);
    deleteDate.setFullYear(deleteDate.getFullYear() + (policy.deleteAfterYears || policy.retentionYears + 1));

    this.logger.info(`Scheduled data ${dataId} for deletion on ${deleteDate.toISOString()}`);

    return {
      scheduleId: `delete_${dataId}`,
      deleteDate,
    };
  }

  private initializeDefaultPolicies(): void {
    // GDPR (EU) - 7 years for financial transactions
    this.registerPolicy(Jurisdiction.EU, 'transaction', 7, 'GDPR Article 5(1)(e)');
    this.registerPolicy(Jurisdiction.EU, 'kyc', 10, 'GDPR + AML');
    this.registerPolicy(Jurisdiction.EU, 'audit', 7, 'Financial regulations');
    this.registerPolicy(Jurisdiction.EU, 'dispute', 3, 'After resolution');

    // US - Reg E requires 3 years for disputes
    this.registerPolicy(Jurisdiction.US, 'transaction', 3, 'Regulation E');
    this.registerPolicy(Jurisdiction.US, 'kyc', 5, 'FinCEN requirements');
    this.registerPolicy(Jurisdiction.US, 'audit', 3, 'Gramm-Leach-Bliley');

    // UK - 6 years for business records
    this.registerPolicy(Jurisdiction.UK, 'transaction', 6, 'Companies House');
    this.registerPolicy(Jurisdiction.UK, 'kyc', 6, 'MLR2017');

    // Australia - 7 years
    this.registerPolicy(Jurisdiction.AUSTRALIA, 'transaction', 7, 'AML/CTF Act');
    this.registerPolicy(Jurisdiction.AUSTRALIA, 'kyc', 7, 'AML/CTF Act');

    // Canada - 7 years
    this.registerPolicy(Jurisdiction.CANADA, 'transaction', 7, 'FINTRAC requirements');
    this.registerPolicy(Jurisdiction.CANADA, 'kyc', 7, 'KYC regulations');
  }
}

export default RetentionPolicyManager;
