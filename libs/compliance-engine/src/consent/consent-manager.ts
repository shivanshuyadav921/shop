import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

/**
 * User consent and preference management
 * Tracks all user consents for GDPR/CCPA compliance
 */

export enum ConsentType {
  MARKETING = 'MARKETING',
  ANALYTICS = 'ANALYTICS',
  DATA_SHARING = 'DATA_SHARING',
  COMMUNICATIONS = 'COMMUNICATIONS',
  PROFILING = 'PROFILING',
  TERMS_OF_SERVICE = 'TERMS_OF_SERVICE',
}

export interface UserConsent {
  consentId: string;
  userId: string;
  consentType: ConsentType;
  granted: boolean;
  grantedAt?: Date;
  withdrawnAt?: Date;
  version: string; // Policy version
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export class ConsentManager {
  private consents: Map<string, UserConsent[]> = new Map(); // userId -> consents
  private logger: pino.Logger;
  private consentVersions: Map<ConsentType, string> = new Map(); // For versioning

  constructor(logger?: pino.Logger) {
    this.logger = logger || pino();
    this.initializeVersions();
  }

  /**
   * Grant consent
   */
  grantConsent(
    userId: string,
    consentType: ConsentType,
    details?: {
      ipAddress?: string;
      userAgent?: string;
      metadata?: Record<string, any>;
    }
  ): UserConsent {
    const consent: UserConsent = {
      consentId: `consent_${uuidv4()}`,
      userId,
      consentType,
      granted: true,
      grantedAt: new Date(),
      version: this.consentVersions.get(consentType) || '1.0',
      ipAddress: details?.ipAddress,
      userAgent: details?.userAgent,
      metadata: details?.metadata,
    };

    if (!this.consents.has(userId)) {
      this.consents.set(userId, []);
    }

    // Withdraw any previous consent for same type
    const userConsents = this.consents.get(userId)!;
    for (const existing of userConsents) {
      if (existing.consentType === consentType && existing.granted) {
        existing.granted = false;
      }
    }

    userConsents.push(consent);

    this.logger.info(`User ${userId} granted consent for ${consentType}`);

    return consent;
  }

  /**
   * Withdraw consent
   */
  withdrawConsent(userId: string, consentType: ConsentType): UserConsent | null {
    const userConsents = this.consents.get(userId);
    if (!userConsents) return null;

    const activeConsent = userConsents.find((c) => c.consentType === consentType && c.granted);
    if (!activeConsent) return null;

    activeConsent.granted = false;
    activeConsent.withdrawnAt = new Date();

    this.logger.info(`User ${userId} withdrew consent for ${consentType}`);

    return activeConsent;
  }

  /**
   * Check if user has consent
   */
  hasConsent(userId: string, consentType: ConsentType): boolean {
    const userConsents = this.consents.get(userId) || [];
    const activeConsent = userConsents.find((c) => c.consentType === consentType && c.granted);
    return !!activeConsent;
  }

  /**
   * Get user's consent status
   */
  getUserConsents(userId: string): {
    [key in ConsentType]?: boolean;
  } {
    const userConsents = this.consents.get(userId) || [];
    const status: any = {};

    for (const type of Object.values(ConsentType)) {
      status[type] = userConsents.some((c) => c.consentType === type && c.granted);
    }

    return status;
  }

  /**
   * Get consent history for user
   */
  getConsentHistory(userId: string): UserConsent[] {
    return this.consents.get(userId) || [];
  }

  /**
   * Delete user's consent records (right to be forgotten)
   */
  deleteUserConsents(userId: string): void {
    this.consents.delete(userId);
    this.logger.info(`Deleted all consent records for user ${userId}`);
  }

  /**
   * Bulk consent request (e.g., on signup)
   */
  requestBulkConsent(
    userId: string,
    types: ConsentType[],
    details?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): UserConsent[] {
    const consents: UserConsent[] = [];

    for (const type of types) {
      const consent = this.grantConsent(userId, type, details);
      consents.push(consent);
    }

    return consents;
  }

  private initializeVersions(): void {
    // Initialize policy versions
    this.consentVersions.set(ConsentType.MARKETING, '2.0');
    this.consentVersions.set(ConsentType.ANALYTICS, '2.0');
    this.consentVersions.set(ConsentType.DATA_SHARING, '1.5');
    this.consentVersions.set(ConsentType.COMMUNICATIONS, '2.0');
    this.consentVersions.set(ConsentType.PROFILING, '1.0');
    this.consentVersions.set(ConsentType.TERMS_OF_SERVICE, '3.0');
  }
}

export default ConsentManager;
