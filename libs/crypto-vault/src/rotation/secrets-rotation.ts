import crypto from 'crypto';
import { bytesToHex } from '@noble/hashes/utils';

/**
 * Automatic secrets rotation with zero-downtime key migration
 * Supports rotating encryption keys, API keys, and credentials
 */
export interface RotationConfig {
  secretName: string;
  rotationIntervalDays: number;
  gracePeriodDays: number; // Time to accept old key after rotation
  maxVersions: number; // Keep this many old versions
}

export interface RotatedSecret {
  version: number;
  secret: string;
  createdAt: Date;
  rotatedAt?: Date;
  status: 'active' | 'deprecated' | 'expired';
}

export class SecretsRotationManager {
  private secrets: Map<string, RotatedSecret[]> = new Map();
  private rotationConfigs: Map<string, RotationConfig> = new Map();
  private rotationTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Register a secret for automatic rotation
   */
  registerSecret(config: RotationConfig, initialSecret: string): void {
    this.rotationConfigs.set(config.secretName, config);

    const rotatedSecret: RotatedSecret = {
      version: 1,
      secret: initialSecret,
      createdAt: new Date(),
      status: 'active',
    };

    this.secrets.set(config.secretName, [rotatedSecret]);

    // Schedule automatic rotation
    this.scheduleRotation(config.secretName);
  }

  /**
   * Get current active secret
   */
  getActiveSecret(secretName: string): RotatedSecret | null {
    const versions = this.secrets.get(secretName);
    if (!versions) return null;

    const active = versions.find((v) => v.status === 'active');
    return active || null;
  }

  /**
   * Get all secrets that can still be used (active + deprecated within grace period)
   */
  getValidSecrets(secretName: string): RotatedSecret[] {
    const versions = this.secrets.get(secretName);
    if (!versions) return [];

    const config = this.rotationConfigs.get(secretName);
    if (!config) return [];

    const now = new Date();
    const gracePeriod = config.gracePeriodDays * 24 * 60 * 60 * 1000;

    return versions.filter((v) => {
      if (v.status === 'active') return true;
      if (v.status === 'deprecated' && v.rotatedAt) {
        return now.getTime() - v.rotatedAt.getTime() < gracePeriod;
      }
      return false;
    });
  }

  /**
   * Rotate to a new secret
   */
  async rotateSecret(secretName: string, newSecret: string): Promise<RotatedSecret> {
    const versions = this.secrets.get(secretName);
    if (!versions) {
      throw new Error(`Secret ${secretName} not registered`);
    }

    const config = this.rotationConfigs.get(secretName);
    if (!config) {
      throw new Error(`Configuration for ${secretName} not found`);
    }

    // Mark old active as deprecated
    const activeVersion = versions.find((v) => v.status === 'active');
    if (activeVersion) {
      activeVersion.status = 'deprecated';
      activeVersion.rotatedAt = new Date();
    }

    // Add new active version
    const newVersion: RotatedSecret = {
      version: Math.max(...versions.map((v) => v.version), 0) + 1,
      secret: newSecret,
      createdAt: new Date(),
      status: 'active',
    };

    versions.push(newVersion);

    // Cleanup old versions, keeping only maxVersions
    if (versions.length > config.maxVersions) {
      const expiredCount = versions.length - config.maxVersions;
      const expired = versions
        .filter((v) => v.status === 'expired')
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, expiredCount);

      expired.forEach((v) => {
        const idx = versions.indexOf(v);
        if (idx > -1) versions.splice(idx, 1);
      });
    }

    this.secrets.set(secretName, versions);
    this.scheduleRotation(secretName);

    return newVersion;
  }

  /**
   * Generate new secret (cryptographically secure)
   */
  generateNewSecret(length: number = 32): string {
    return bytesToHex(crypto.randomBytes(length));
  }

  /**
   * Schedule automatic rotation
   */
  private scheduleRotation(secretName: string): void {
    // Clear existing timer
    const existingTimer = this.rotationTimers.get(secretName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const config = this.rotationConfigs.get(secretName);
    if (!config) return;

    const rotationMs = config.rotationIntervalDays * 24 * 60 * 60 * 1000;

    const timer = setTimeout(async () => {
      try {
        const newSecret = this.generateNewSecret();
        await this.rotateSecret(secretName, newSecret);
        console.log(`[SecretsRotation] Rotated secret: ${secretName}`);
      } catch (error) {
        console.error(`[SecretsRotation] Failed to rotate ${secretName}:`, error);
      }

      // Reschedule
      this.scheduleRotation(secretName);
    }, rotationMs);

    this.rotationTimers.set(secretName, timer);
  }

  /**
   * Force immediate rotation (emergency)
   */
  async emergencyRotate(secretName: string): Promise<RotatedSecret> {
    const newSecret = this.generateNewSecret();
    return this.rotateSecret(secretName, newSecret);
  }

  /**
   * Mark old versions as expired after grace period
   */
  cleanupExpiredSecrets(secretName: string): number {
    const versions = this.secrets.get(secretName);
    if (!versions) return 0;

    const config = this.rotationConfigs.get(secretName);
    if (!config) return 0;

    const now = new Date();
    const gracePeriod = config.gracePeriodDays * 24 * 60 * 60 * 1000;

    let cleaned = 0;
    versions.forEach((v) => {
      if (v.status === 'deprecated' && v.rotatedAt) {
        if (now.getTime() - v.rotatedAt.getTime() > gracePeriod) {
          v.status = 'expired';
          cleaned++;
        }
      }
    });

    return cleaned;
  }
}

export default SecretsRotationManager;
