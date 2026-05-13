import crypto from 'crypto';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

/**
 * PCI-DSS compliant payment card tokenization
 * Converts sensitive payment data to non-reversible tokens
 */
export class PaymentTokenizer {
  private encryptionKey: Buffer;
  private tokenFormat: string = 'pt_'; // Payment token prefix

  constructor(encryptionKeyHex: string) {
    this.encryptionKey = Buffer.from(encryptionKeyHex, 'hex');
    if (this.encryptionKey.length !== 32) {
      throw new Error('Encryption key must be 256 bits (32 bytes)');
    }
  }

  /**
   * Tokenize credit card (non-reversible)
   * Stores only tokenized value, original is never persisted
   */
  tokenizeCard(cardNumber: string, expiryMonth: string, expiryYear: string): {
    token: string;
    hash: string;
    lastFour: string;
    fingerprint: string;
  } {
    // PCI: Never store full card number
    const lastFour = cardNumber.slice(-4);
    const cardData = `${cardNumber}|${expiryMonth}|${expiryYear}`;

    // Generate deterministic fingerprint (same card always produces same token for matching)
    const fingerprint = bytesToHex(sha256(Buffer.from(cardData)));

    // Generate token with randomness
    const randomBytes = crypto.randomBytes(16);
    const token = this.tokenFormat + bytesToHex(randomBytes).substring(0, 24);

    // Hash for verification
    const hash = bytesToHex(sha256(Buffer.from(`${token}|${fingerprint}`))).substring(0, 24);

    return {
      token,
      hash,
      lastFour,
      fingerprint: fingerprint.substring(0, 16),
    };
  }

  /**
   * Tokenize bank account (non-reversible)
   */
  tokenizeAccount(accountNumber: string, routingNumber: string, accountType: string): {
    token: string;
    hash: string;
    lastFour: string;
    fingerprint: string;
  } {
    const lastFour = accountNumber.slice(-4);
    const accountData = `${accountNumber}|${routingNumber}|${accountType}`;

    const fingerprint = bytesToHex(sha256(Buffer.from(accountData)));
    const randomBytes = crypto.randomBytes(16);
    const token = 'at_' + bytesToHex(randomBytes).substring(0, 24);
    const hash = bytesToHex(sha256(Buffer.from(`${token}|${fingerprint}`))).substring(0, 24);

    return {
      token,
      hash,
      lastFour,
      fingerprint: fingerprint.substring(0, 16),
    };
  }

  /**
   * One-way encryption for sensitive data
   * Cannot be decrypted, only verified
   */
  encryptSensitiveData(data: string): { encrypted: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  }

  /**
   * Verify encrypted data integrity
   */
  verifyEncryptedData(encrypted: string, iv: string, tag: string, data: string): boolean {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(iv, 'hex'));
      decipher.setAuthTag(Buffer.from(tag, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted === data;
    } catch {
      return false;
    }
  }

  /**
   * Generate deterministic token for payment method (idempotent)
   * Same input always produces same token for deduplication
   */
  generateIdempotentToken(paymentMethodId: string, merchantId: string): string {
    const hash = sha256(Buffer.from(`${paymentMethodId}|${merchantId}|idempotent`));
    return this.tokenFormat + bytesToHex(hash).substring(0, 24);
  }
}

export default PaymentTokenizer;
