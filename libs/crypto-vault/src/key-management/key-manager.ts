import crypto from 'crypto';
import { bytesToHex } from '@noble/hashes/utils';

/**
 * Enterprise key management with key versioning, rotation, and access control
 */
export interface KeyMetadata {
  id: string;
  keyType: 'encryption' | 'signing' | 'authentication';
  algorithm: string;
  createdAt: Date;
  rotatedAt?: Date;
  expiresAt?: Date;
  version: number;
  isActive: boolean;
  purpose: string;
}

export class KeyManager {
  private keys: Map<string, { key: Buffer; metadata: KeyMetadata }> = new Map();
  private keyHistory: Map<string, KeyMetadata[]> = new Map();

  /**
   * Generate new encryption key (AES-256)
   */
  generateEncryptionKey(): { key: string; metadata: KeyMetadata } {
    const keyBuffer = crypto.randomBytes(32);
    const keyId = 'enc_' + bytesToHex(crypto.randomBytes(16));

    const metadata: KeyMetadata = {
      id: keyId,
      keyType: 'encryption',
      algorithm: 'AES-256-GCM',
      createdAt: new Date(),
      version: 1,
      isActive: true,
      purpose: 'Data encryption',
    };

    this.keys.set(keyId, { key: keyBuffer, metadata });
    this.addToHistory(keyId, metadata);

    return {
      key: keyBuffer.toString('hex'),
      metadata,
    };
  }

  /**
   * Generate new signing key (ECDSA)
   */
  generateSigningKey(): { publicKey: string; privateKey: string; metadata: KeyMetadata } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const keyId = 'sig_' + bytesToHex(crypto.randomBytes(16));

    const metadata: KeyMetadata = {
      id: keyId,
      keyType: 'signing',
      algorithm: 'ECDSA-P256',
      createdAt: new Date(),
      version: 1,
      isActive: true,
      purpose: 'Transaction signing',
    };

    this.keys.set(keyId, { key: Buffer.from(privateKey), metadata });
    this.addToHistory(keyId, metadata);

    return {
      publicKey,
      privateKey,
      metadata,
    };
  }

  /**
   * Generate new HMAC key
   */
  generateHMACKey(): { key: string; metadata: KeyMetadata } {
    const keyBuffer = crypto.randomBytes(32);
    const keyId = 'hmac_' + bytesToHex(crypto.randomBytes(16));

    const metadata: KeyMetadata = {
      id: keyId,
      keyType: 'authentication',
      algorithm: 'HMAC-SHA256',
      createdAt: new Date(),
      version: 1,
      isActive: true,
      purpose: 'Request authentication',
    };

    this.keys.set(keyId, { key: keyBuffer, metadata });
    this.addToHistory(keyId, metadata);

    return {
      key: keyBuffer.toString('hex'),
      metadata,
    };
  }

  /**
   * Get active key by type
   */
  getActiveKey(keyType: KeyMetadata['keyType']): { key: Buffer; metadata: KeyMetadata } | null {
    for (const entry of this.keys.values()) {
      if (entry.metadata.keyType === keyType && entry.metadata.isActive) {
        if (!entry.metadata.expiresAt || new Date() < entry.metadata.expiresAt) {
          return entry;
        }
      }
    }
    return null;
  }

  /**
   * Get specific key by ID
   */
  getKey(keyId: string): { key: Buffer; metadata: KeyMetadata } | null {
    return this.keys.get(keyId) || null;
  }

  /**
   * Rotate key to new version
   */
  rotateKey(keyId: string, newKeyBuffer: Buffer): KeyMetadata {
    const existing = this.keys.get(keyId);
    if (!existing) {
      throw new Error(`Key ${keyId} not found`);
    }

    // Mark old as inactive
    existing.metadata.isActive = false;
    existing.metadata.rotatedAt = new Date();

    // Create new version
    const newMetadata: KeyMetadata = {
      ...existing.metadata,
      version: existing.metadata.version + 1,
      createdAt: new Date(),
      isActive: true,
      rotatedAt: undefined,
    };

    const newKeyId = `${keyId}_v${newMetadata.version}`;
    this.keys.set(newKeyId, { key: newKeyBuffer, metadata: newMetadata });
    this.addToHistory(keyId, newMetadata);

    return newMetadata;
  }

  /**
   * Get key history for auditing
   */
  getKeyHistory(keyId: string): KeyMetadata[] {
    return this.keyHistory.get(keyId) || [];
  }

  /**
   * List all active keys
   */
  listActiveKeys(): KeyMetadata[] {
    const active: KeyMetadata[] = [];
    this.keys.forEach((entry) => {
      if (entry.metadata.isActive && (!entry.metadata.expiresAt || new Date() < entry.metadata.expiresAt)) {
        active.push(entry.metadata);
      }
    });
    return active;
  }

  /**
   * Mark key as expired
   */
  expireKey(keyId: string): void {
    const entry = this.keys.get(keyId);
    if (entry) {
      entry.metadata.expiresAt = new Date();
      entry.metadata.isActive = false;
    }
  }

  /**
   * Delete key (permanent removal)
   */
  deleteKey(keyId: string): boolean {
    return this.keys.delete(keyId);
  }

  private addToHistory(keyId: string, metadata: KeyMetadata): void {
    if (!this.keyHistory.has(keyId)) {
      this.keyHistory.set(keyId, []);
    }
    const history = this.keyHistory.get(keyId);
    if (history) {
      history.push(metadata);
    }
  }
}

export default KeyManager;
