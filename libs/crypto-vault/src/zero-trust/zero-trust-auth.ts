import crypto from 'crypto';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

/**
 * Zero-trust authentication framework
 * Implements device verification, certificate pinning, and continuous trust evaluation
 */
export interface TrustContext {
  deviceId: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
  certificateFingerprint: string;
  deviceRiskScore: number;
  lastVerifiedAt: Date;
}

export interface ChallengeResponse {
  challenge: string;
  nonce: string;
  signature: string;
  timestamp: number;
  deviceCertificate: string;
}

export class ZeroTrustAuthenticator {
  private trustedCertificates: Map<string, string> = new Map(); // fingerprint -> cert
  private deviceContexts: Map<string, TrustContext> = new Map();
  private challengeCache: Map<string, { challenge: string; expiresAt: Date }> = new Map();

  /**
   * Register a device with certificate pinning
   */
  registerDevice(
    deviceId: string,
    userId: string,
    certificatePem: string
  ): { fingerprint: string; pinned: boolean } {
    const fingerprint = this.generateCertificateFingerprint(certificatePem);
    this.trustedCertificates.set(fingerprint, certificatePem);

    return {
      fingerprint,
      pinned: true,
    };
  }

  /**
   * Generate fingerprint for certificate pinning
   */
  private generateCertificateFingerprint(certificatePem: string): string {
    const hash = sha256(Buffer.from(certificatePem));
    return bytesToHex(hash).substring(0, 40);
  }

  /**
   * Create authentication challenge
   */
  createChallenge(deviceId: string): { challenge: string; nonce: string; expiresAt: Date } {
    const challenge = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minute expiry

    const cacheKey = `${deviceId}:${challenge}`;
    this.challengeCache.set(cacheKey, { challenge, expiresAt });

    return { challenge, nonce, expiresAt };
  }

  /**
   * Verify challenge response and establish trust context
   */
  verifyChallenge(
    deviceId: string,
    userId: string,
    response: ChallengeResponse,
    contextData: {
      ipAddress: string;
      userAgent: string;
      deviceRiskScore: number;
    }
  ): { verified: boolean; context?: TrustContext } {
    const cacheKey = `${deviceId}:${response.challenge}`;
    const cached = this.challengeCache.get(cacheKey);

    if (!cached || new Date() > cached.expiresAt) {
      return { verified: false };
    }

    // Verify certificate
    const certFingerprint = this.generateCertificateFingerprint(response.deviceCertificate);
    if (!this.trustedCertificates.has(certFingerprint)) {
      return { verified: false };
    }

    // Verify signature
    const signatureData = `${response.challenge}|${response.nonce}|${response.timestamp}`;
    const isSignatureValid = this.verifySignature(
      signatureData,
      response.signature,
      response.deviceCertificate
    );

    if (!isSignatureValid) {
      return { verified: false };
    }

    // Verify timestamp freshness (within 1 minute)
    const now = Date.now();
    if (Math.abs(now - response.timestamp) > 60000) {
      return { verified: false };
    }

    const trustContext: TrustContext = {
      deviceId,
      userId,
      ipAddress: contextData.ipAddress,
      userAgent: contextData.userAgent,
      certificateFingerprint: certFingerprint,
      deviceRiskScore: contextData.deviceRiskScore,
      lastVerifiedAt: new Date(),
    };

    this.deviceContexts.set(`${userId}:${deviceId}`, trustContext);
    this.challengeCache.delete(cacheKey);

    return { verified: true, context: trustContext };
  }

  /**
   * Verify device signature (RSA-SHA256)
   */
  private verifySignature(data: string, signature: string, certificatePem: string): boolean {
    try {
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(data);
      return verifier.verify(certificatePem, Buffer.from(signature, 'hex'));
    } catch {
      return false;
    }
  }

  /**
   * Evaluate trust score based on context anomalies
   */
  evaluateTrustScore(
    userId: string,
    deviceId: string,
    currentContext: {
      ipAddress: string;
      userAgent: string;
      timestamp: number;
    }
  ): { trustScore: number; requiresStepUp: boolean } {
    const contextKey = `${userId}:${deviceId}`;
    const previousContext = this.deviceContexts.get(contextKey);

    if (!previousContext) {
      // New device, require step-up
      return { trustScore: 0.3, requiresStepUp: true };
    }

    let trustScore = 1.0;

    // Check IP change (significant trust reduction)
    if (previousContext.ipAddress !== currentContext.ipAddress) {
      trustScore *= 0.6;
    }

    // Check user agent change
    if (previousContext.userAgent !== currentContext.userAgent) {
      trustScore *= 0.8;
    }

    // Check device risk score
    trustScore *= 1 - previousContext.deviceRiskScore / 100;

    // Check time since last verification
    const timeSinceVerification = currentContext.timestamp - previousContext.lastVerifiedAt.getTime();
    const daysSinceVerification = timeSinceVerification / (24 * 60 * 60 * 1000);

    if (daysSinceVerification > 7) {
      trustScore *= 0.7; // Reduce trust after 7 days
    }

    const requiresStepUp = trustScore < 0.8;

    return { trustScore: Math.max(0, Math.min(1, trustScore)), requiresStepUp };
  }

  /**
   * Get trust context for user + device
   */
  getTrustContext(userId: string, deviceId: string): TrustContext | null {
    return this.deviceContexts.get(`${userId}:${deviceId}`) || null;
  }

  /**
   * List all trusted devices for user
   */
  listTrustedDevices(userId: string): TrustContext[] {
    const devices: TrustContext[] = [];
    this.deviceContexts.forEach((context) => {
      if (context.userId === userId) {
        devices.push(context);
      }
    });
    return devices;
  }

  /**
   * Revoke device trust
   */
  revokeDevice(userId: string, deviceId: string): boolean {
    return this.deviceContexts.delete(`${userId}:${deviceId}`);
  }
}

export default ZeroTrustAuthenticator;
