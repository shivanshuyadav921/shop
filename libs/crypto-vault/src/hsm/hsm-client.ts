import { KMSClient, CreateKeyCommand, SignCommand, VerifyCommand } from '@aws-sdk/client-kms';
import { SecretsManagerClient, CreateSecretCommand, GetSecretValueCommand, RotateSecretCommand } from '@aws-sdk/client-secrets-manager';
import crypto from 'crypto';

/**
 * Production-grade HSM client for AWS KMS
 * Supports key rotation, signing, verification, and secrets management
 */
export class HSMClient {
  private kmsClient: KMSClient;
  private secretsClient: SecretsManagerClient;
  private keyArn: string;
  private readonly region: string;

  constructor(region: string = 'us-east-1', keyArn?: string) {
    this.region = region;
    this.kmsClient = new KMSClient({ region });
    this.secretsClient = new SecretsManagerClient({ region });
    this.keyArn = keyArn || '';
  }

  /**
   * Initialize HSM key in AWS KMS
   */
  async initializeKey(keyAlias: string): Promise<string> {
    try {
      const response = await this.kmsClient.send(
        new CreateKeyCommand({
          Description: `Payment platform ${keyAlias}`,
          KeyUsage: 'SIGN_VERIFY',
          Origin: 'AWS_KMS',
          MultiRegion: true,
        })
      );

      this.keyArn = response.KeyMetadata?.Arn || '';
      return this.keyArn;
    } catch (error) {
      if ((error as any).name === 'AlreadyExistsException') {
        // Key already exists
        return this.keyArn;
      }
      throw error;
    }
  }

  /**
   * Sign data with HSM key (non-exportable)
   */
  async sign(data: Buffer): Promise<Buffer> {
    const response = await this.kmsClient.send(
      new SignCommand({
        KeyId: this.keyArn,
        Message: data,
        SigningAlgorithm: 'ECDSA_SHA_256',
      })
    );

    return response.Signature ? Buffer.from(response.Signature) : Buffer.alloc(0);
  }

  /**
   * Verify signature with HSM key
   */
  async verify(data: Buffer, signature: Buffer): Promise<boolean> {
    const response = await this.kmsClient.send(
      new VerifyCommand({
        KeyId: this.keyArn,
        Message: data,
        Signature: signature,
        SigningAlgorithm: 'ECDSA_SHA_256',
      })
    );

    return response.SignatureValid === true;
  }

  /**
   * Store secret in AWS Secrets Manager with encryption
   */
  async storeSecret(secretName: string, secretValue: string, rotationDays: number = 30): Promise<void> {
    try {
      await this.secretsClient.send(
        new CreateSecretCommand({
          Name: secretName,
          SecretString: secretValue,
          KmsKeyId: this.keyArn,
          Tags: [
            { Key: 'Environment', Value: 'Production' },
            { Key: 'ManagedBy', Value: 'PaymentPlatform' },
          ],
        })
      );

      // Enable rotation
      if (rotationDays > 0) {
        await this.secretsClient.send(
          new RotateSecretCommand({
            SecretId: secretName,
            RotationRules: {
              AutomaticallyAfterDays: rotationDays,
            },
          })
        );
      }
    } catch (error) {
      if ((error as any).name === 'ResourceExistsException') {
        // Already exists, skip
        return;
      }
      throw error;
    }
  }

  /**
   * Retrieve secret from AWS Secrets Manager
   */
  async getSecret(secretName: string): Promise<string> {
    const response = await this.secretsClient.send(
      new GetSecretValueCommand({
        SecretId: secretName,
      })
    );

    return response.SecretString || '';
  }

  /**
   * Generate cryptographically secure random bytes
   */
  generateRandomBytes(length: number): Buffer {
    return crypto.randomBytes(length);
  }

  /**
   * Generate secure challenge for zero-trust authentication
   */
  generateChallenge(): { challenge: string; timestamp: number; nonce: string } {
    return {
      challenge: crypto.randomBytes(32).toString('hex'),
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex'),
    };
  }
}

export default HSMClient;
