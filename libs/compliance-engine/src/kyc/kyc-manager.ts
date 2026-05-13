import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

/**
 * KYC (Know Your Customer) implementation
 * Manages customer identity verification and onboarding
 */

export enum KYCLevel {
  NONE = 'NONE',
  BASIC = 'BASIC', // Email + phone verified
  STANDARD = 'STANDARD', // ID + address verified
  ENHANCED = 'ENHANCED', // Source of funds + advanced verification
}

export enum VerificationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export interface KYCProfile {
  userId: string;
  kycLevel: KYCLevel;
  status: VerificationStatus;
  identity: {
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    documentType: string; // passport, driver's_license, etc.
    documentNumber: string; // Encrypted
    documentExpiry: Date;
    documentCountry: string;
  };
  address: {
    street: string; // Encrypted
    city: string;
    state: string;
    postalCode: string; // Encrypted
    country: string;
    verificationDate?: Date;
  };
  contact: {
    email: string; // Encrypted
    phone: string; // Encrypted
    emailVerified: boolean;
    phoneVerified: boolean;
  };
  riskProfile: {
    pep: boolean; // Politically exposed person
    sanctions: boolean; // Sanctions list match
    adverseMedia: boolean; // Negative news
    riskScore: number; // 0-100
  };
  sourceOfFunds?: {
    source: string;
    verifiedAt?: Date;
  };
  createdAt: Date;
  lastUpdatedAt: Date;
  expiresAt?: Date;
  approvedBy?: string;
}

export class KYCManager {
  private profiles: Map<string, KYCProfile> = new Map();
  private logger: pino.Logger;
  private verificationHistory: Map<string, Array<{ status: VerificationStatus; timestamp: Date; reason?: string }>> =
    new Map();

  constructor(logger?: pino.Logger) {
    this.logger = logger || pino();
  }

  /**
   * Initiate KYC verification
   */
  initiateVerification(
    userId: string,
    basicInfo: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
    }
  ): KYCProfile {
    const profile: KYCProfile = {
      userId,
      kycLevel: KYCLevel.NONE,
      status: VerificationStatus.PENDING,
      identity: {
        firstName: basicInfo.firstName,
        lastName: basicInfo.lastName,
        dateOfBirth: new Date(),
        documentType: '',
        documentNumber: '',
        documentExpiry: new Date(),
        documentCountry: '',
      },
      address: {
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: '',
      },
      contact: {
        email: basicInfo.email,
        phone: basicInfo.phone,
        emailVerified: false,
        phoneVerified: false,
      },
      riskProfile: {
        pep: false,
        sanctions: false,
        adverseMedia: false,
        riskScore: 0,
      },
      createdAt: new Date(),
      lastUpdatedAt: new Date(),
    };

    this.profiles.set(userId, profile);
    this.recordVerificationStatus(userId, VerificationStatus.PENDING);

    this.logger.info(`Initiated KYC verification for user ${userId}`);

    return profile;
  }

  /**
   * Update identity verification
   */
  updateIdentity(
    userId: string,
    identity: {
      dateOfBirth: Date;
      documentType: string;
      documentNumber: string; // Encrypted server-side
      documentExpiry: Date;
      documentCountry: string;
    }
  ): KYCProfile | null {
    const profile = this.profiles.get(userId);
    if (!profile) return null;

    profile.identity = { ...profile.identity, ...identity };
    profile.status = VerificationStatus.IN_PROGRESS;
    profile.lastUpdatedAt = new Date();

    this.logger.debug(`Updated identity verification for user ${userId}`);

    return profile;
  }

  /**
   * Update address verification
   */
  updateAddress(
    userId: string,
    address: {
      street: string; // Encrypted
      city: string;
      state: string;
      postalCode: string; // Encrypted
      country: string;
    }
  ): KYCProfile | null {
    const profile = this.profiles.get(userId);
    if (!profile) return null;

    profile.address = { ...profile.address, ...address };
    profile.address.verificationDate = new Date();
    profile.kycLevel = Math.max(profile.kycLevel, KYCLevel.STANDARD) as any;
    profile.lastUpdatedAt = new Date();

    this.logger.debug(`Updated address verification for user ${userId}`);

    return profile;
  }

  /**
   * Approve KYC profile
   */
  approveKYC(userId: string, level: KYCLevel, approvedBy: string): KYCProfile | null {
    const profile = this.profiles.get(userId);
    if (!profile) return null;

    profile.status = VerificationStatus.APPROVED;
    profile.kycLevel = level;
    profile.approvedBy = approvedBy;
    profile.expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
    profile.lastUpdatedAt = new Date();

    this.recordVerificationStatus(userId, VerificationStatus.APPROVED);
    this.logger.info(`Approved KYC for user ${userId} at level ${level}`);

    return profile;
  }

  /**
   * Reject KYC profile
   */
  rejectKYC(userId: string, reason: string): KYCProfile | null {
    const profile = this.profiles.get(userId);
    if (!profile) return null;

    profile.status = VerificationStatus.REJECTED;
    profile.lastUpdatedAt = new Date();

    this.recordVerificationStatus(userId, VerificationStatus.REJECTED, reason);
    this.logger.warn(`Rejected KYC for user ${userId}: ${reason}`);

    return profile;
  }

  /**
   * Check if user is KYC verified at level
   */
  isVerifiedAt(userId: string, requiredLevel: KYCLevel): boolean {
    const profile = this.profiles.get(userId);
    if (!profile) return false;

    if (profile.status !== VerificationStatus.APPROVED) return false;
    if (profile.kycLevel < requiredLevel) return false;
    if (profile.expiresAt && new Date() > profile.expiresAt) return false;

    return true;
  }

  /**
   * Get KYC profile
   */
  getProfile(userId: string): KYCProfile | null {
    return this.profiles.get(userId) || null;
  }

  /**
   * Record verification status change
   */
  private recordVerificationStatus(userId: string, status: VerificationStatus, reason?: string): void {
    if (!this.verificationHistory.has(userId)) {
      this.verificationHistory.set(userId, []);
    }

    const history = this.verificationHistory.get(userId);
    if (history) {
      history.push({ status, timestamp: new Date(), reason });
    }
  }

  /**
   * Get verification history
   */
  getVerificationHistory(userId: string): Array<{ status: VerificationStatus; timestamp: Date; reason?: string }> {
    return this.verificationHistory.get(userId) || [];
  }
}

export default KYCManager;
