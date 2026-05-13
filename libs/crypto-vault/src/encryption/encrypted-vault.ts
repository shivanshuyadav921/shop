import crypto from 'crypto';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

/**
 * Encrypted vault for storing sensitive data at rest
 * Implements AES-256-GCM encryption with authenticated encryption
 */
export interface VaultEntry {
  id: string;
  encryptedData: string;
  iv: string;
  authTag: string;
  algorithm: string;
  createdAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, string>;
}

export class EncryptedVault {
  private masterKey: Buffer;
  private vault: Map<string, VaultEntry> = new Map();
  private readonly algorithm = 'aes-256-gcm';

  constructor(masterKeyHex: string) {
    this.masterKey = Buffer.from(masterKeyHex, 'hex');
    if (this.masterKey.length !== 32) {
      throw new Error('Master key must be 256 bits (32 bytes)');
    }
  }

  /**
   * Store encrypted data in vault
   */
  store(
    id: string,
    plaintext: string,
    expirySeconds?: number,
    metadata?: Record<string, string>
  ): VaultEntry {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);

    let encryptedData = cipher.update(plaintext, 'utf8', 'hex');
    encryptedData += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    const entry: VaultEntry = {
      id,
      encryptedData,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: this.algorithm,
      createdAt: new Date(),
      expiresAt: expirySeconds ? new Date(Date.now() + expirySeconds * 1000) : undefined,
      metadata,
    };

    this.vault.set(id, entry);
    return entry;
  }

  /**
   * Retrieve and decrypt data from vault
   */
  retrieve(id: string): string | null {
    const entry = this.vault.get(id);
    if (!entry) {
      return null;
    }

    // Check expiration
    if (entry.expiresAt && new Date() > entry.expiresAt) {
      this.vault.delete(id);
      return null;
    }

    try {
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.masterKey,
        Buffer.from(entry.iv, 'hex')
      );

      decipher.setAuthTag(Buffer.from(entry.authTag, 'hex'));

      let plaintext = decipher.update(entry.encryptedData, 'hex', 'utf8');
      plaintext += decipher.final('utf8');

      return plaintext;
    } catch (error) {
      throw new Error(`Failed to decrypt vault entry ${id}: ${(error as Error).message}`);
    }
  }

  /**
   * Delete entry from vault
   */
  delete(id: string): boolean {
    return this.vault.delete(id);
  }

  /**
   * Check if entry exists and is not expired
   */
  exists(id: string): boolean {
    const entry = this.vault.get(id);
    if (!entry) return false;

    if (entry.expiresAt && new Date() > entry.expiresAt) {
      this.vault.delete(id);
      return false;
    }

    return true;
  }

  /**
   * Get vault entry metadata (without decryption)
   */
  getMetadata(id: string): VaultEntry | null {
    return this.vault.get(id) || null;
  }

  /**
   * Cleanup expired entries
   */
  cleanupExpired(): number {
    let cleaned = 0;
    const now = new Date();

    const entriesToDelete: string[] = [];
    this.vault.forEach((entry, id) => {
      if (entry.expiresAt && now > entry.expiresAt) {
        entriesToDelete.push(id);
        cleaned++;
      }
    });

    entriesToDelete.forEach((id) => this.vault.delete(id));
    return cleaned;
  }

  /**
   * Get all entry IDs (for auditing)
   */
  getAllIds(): string[] {
    return Array.from(this.vault.keys());
  }

  /**
   * Derive key from password using PBKDF2 (for user data encryption)
   */
  static deriveKeyFromPassword(password: string, salt: string, iterations: number = 100000): string {
    const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    return derivedKey.toString('hex');
  }

  /**
   * Generate deterministic key ID
   */
  static generateKeyId(identifier: string): string {
    return 'key_' + bytesToHex(sha256(Buffer.from(identifier))).substring(0, 24);
  }
}

export default EncryptedVault;
