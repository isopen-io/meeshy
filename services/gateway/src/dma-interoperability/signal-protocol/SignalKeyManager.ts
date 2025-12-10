/**
 * Signal Protocol Key Manager for DMA Interoperability
 *
 * Phase 2, Week 1-2: Key Management Implementation
 * Status: IN PROGRESS
 *
 * Responsibilities:
 * - Identity key generation and storage (EC-P256)
 * - Pre-key generation and batching (50 keys per batch)
 * - Signed pre-key management with weekly rotation
 * - Encrypted key storage in database
 * - Key material protection
 */

import * as crypto from 'crypto';
import { PrismaClient } from '../../../shared/prisma/client';

/**
 * Pre-key entry in the pre-key table
 */
export interface PreKey {
  id: number;
  publicKey: Buffer;
  privateKey: Buffer; // Encrypted in storage
  isUsed: boolean;
  createdAt: Date;
}

/**
 * Signed pre-key entry for X3DH
 */
export interface SignedPreKey {
  id: number;
  publicKey: Buffer;
  privateKey: Buffer; // Encrypted in storage
  signature: Buffer;
  timestamp: number;
  rotationSchedule: 'weekly' | 'monthly';
  nextRotationDate: Date;
  isActive: boolean;
}

/**
 * Key pair structure
 */
export interface KeyPair {
  publicKey: Buffer;
  privateKey: Buffer;
}

/**
 * Signal Key Manager - Manages all cryptographic keys for Signal Protocol
 */
export class SignalKeyManager {
  private prisma: PrismaClient;
  private identityKeyPair?: KeyPair;
  private masterEncryptionKey: Buffer;
  private preKeyCounter = 0;
  private stats = {
    identityKeysGenerated: 0,
    preKeysGenerated: 0,
    preKeysUsed: 0,
    signedPreKeysRotated: 0,
    encryptionOperations: 0
  };

  constructor(prisma: PrismaClient, masterEncryptionKey?: Buffer) {
    this.prisma = prisma;
    // Use provided master key or generate one (in production, load from secure storage/HSM)
    this.masterEncryptionKey = masterEncryptionKey || this.generateMasterKey();
  }

  /**
   * Initialize key manager
   *
   * Steps:
   * 1. Load or generate identity key pair
   * 2. Load or generate pre-keys (initial batch of 50)
   * 3. Load or generate signed pre-key with current timestamp
   * 4. Setup key rotation scheduler
   */
  async initialize(): Promise<void> {
    console.log('🔑 Initializing Signal Key Manager');

    try {
      // Step 1: Load or generate identity key pair
      const existingIdentity = await this.loadIdentityKey();
      if (existingIdentity) {
        this.identityKeyPair = existingIdentity;
        console.log('✅ Loaded existing identity key pair');
      } else {
        this.identityKeyPair = this.generateIdentityKeyPair();
        await this.storeIdentityKey(this.identityKeyPair);
        this.stats.identityKeysGenerated++;
        console.log('✅ Generated and stored new identity key pair');
      }

      // Step 2: Load or generate pre-keys
      const preKeyCount = await this.getPreKeyCount();
      if (preKeyCount < 25) {
        // Replenish if below threshold
        const keysToGenerate = 50 - preKeyCount;
        await this.generateAndStorePreKeys(keysToGenerate);
        console.log(`✅ Generated ${keysToGenerate} new pre-keys`);
      } else {
        console.log(`✅ Pre-key pool healthy: ${preKeyCount} keys available`);
      }

      // Step 3: Load or generate signed pre-key
      const existingSignedPreKey = await this.loadActiveSignedPreKey();
      if (!existingSignedPreKey || this.shouldRotateSignedPreKey(existingSignedPreKey)) {
        const newSignedPreKey = await this.generateAndStoreSignedPreKey();
        console.log('✅ Generated new signed pre-key');
      } else {
        console.log('✅ Loaded active signed pre-key');
      }

      console.log('🎯 Signal Key Manager initialization complete');
    } catch (error) {
      console.error('❌ Failed to initialize Signal Key Manager:', error);
      throw error;
    }
  }

  /**
   * Generate identity key pair (EC-P256)
   *
   * Identity key is the long-term key that identifies this device/account.
   * Generated once and never changes for the lifetime of the account.
   */
  private generateIdentityKeyPair(): KeyPair {
    // Generate EC-P256 key pair for identity
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1', // P-256
      publicKeyEncoding: {
        type: 'spki',
        format: 'der'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'der'
      }
    });

    return {
      publicKey: publicKey as Buffer,
      privateKey: privateKey as Buffer
    };
  }

  /**
   * Generate a single pre-key pair (EC-P256)
   *
   * Pre-keys are one-time keys used for X3DH key agreement.
   * They allow asynchronous key exchange without online communication.
   */
  private generatePreKeyPair(): KeyPair {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: {
        type: 'spki',
        format: 'der'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'der'
      }
    });

    return {
      publicKey: publicKey as Buffer,
      privateKey: privateKey as Buffer
    };
  }

  /**
   * Generate multiple pre-key pairs in batch
   */
  private generatePreKeyBatch(count: number): KeyPair[] {
    const batch: KeyPair[] = [];
    for (let i = 0; i < count; i++) {
      batch.push(this.generatePreKeyPair());
    }
    return batch;
  }

  /**
   * Generate and store pre-keys in database
   *
   * Pre-keys are stored encrypted and marked with their ID.
   * When used, they're marked as consumed and shouldn't be reused.
   */
  private async generateAndStorePreKeys(count: number): Promise<void> {
    const batch = this.generatePreKeyBatch(count);

    for (let i = 0; i < batch.length; i++) {
      const keyPair = batch[i];
      const preKeyId = await this.getNextPreKeyId();

      // Encrypt private key before storage
      const encryptedPrivateKey = this.encryptKey(keyPair.privateKey);

      try {
        // Store in database (schema will vary - this is a placeholder)
        // In real implementation, you'd store in a SignalPreKey table
        console.log(`  📝 Storing pre-key ${preKeyId}`);
        this.preKeyCounter++;
        this.stats.preKeysGenerated++;
      } catch (error) {
        console.error(`  ❌ Failed to store pre-key ${preKeyId}:`, error);
        throw error;
      }
    }
  }

  /**
   * Generate signed pre-key
   *
   * Signed pre-key is a medium-term key (rotated weekly).
   * It's signed by the identity key to prevent tampering.
   * Provides some properties of PFS even if the identity key is compromised.
   */
  private async generateAndStoreSignedPreKey(): Promise<SignedPreKey> {
    const keyPair = this.generatePreKeyPair();
    const timestamp = Math.floor(Date.now() / 1000);

    // Sign the public key with identity key
    if (!this.identityKeyPair) {
      throw new Error('Identity key pair not initialized');
    }

    // Create signature of public key using identity private key
    const sign = crypto.createSign('SHA256');
    sign.update(keyPair.publicKey);
    const signature = sign.sign(this.identityKeyPair.privateKey);

    const signedPreKey: SignedPreKey = {
      id: await this.getNextSignedPreKeyId(),
      publicKey: keyPair.publicKey,
      privateKey: this.encryptKey(keyPair.privateKey),
      signature: signature,
      timestamp,
      rotationSchedule: 'weekly',
      nextRotationDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      isActive: true
    };

    // Store in database
    try {
      console.log(`  📝 Storing signed pre-key ${signedPreKey.id}`);
      this.stats.signedPreKeysRotated++;
    } catch (error) {
      console.error(`  ❌ Failed to store signed pre-key:`, error);
      throw error;
    }

    return signedPreKey;
  }

  /**
   * Check if signed pre-key should be rotated
   *
   * Returns true if:
   * - Next rotation date has passed
   * - Signed pre-key is older than rotation schedule
   */
  private shouldRotateSignedPreKey(signedPreKey: SignedPreKey): boolean {
    const now = new Date();
    return now > signedPreKey.nextRotationDate;
  }

  /**
   * Encrypt key material for storage
   *
   * Uses AES-256-GCM with master encryption key to protect private keys at rest.
   * In production, this should use:
   * - Hardware Security Module (HSM) for master key storage
   * - Different encryption keys per key type
   * - Key derivation function (PBKDF2) for key encryption
   */
  private encryptKey(keyMaterial: Buffer): Buffer {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      this.masterEncryptionKey,
      iv
    );

    let encrypted = cipher.update(keyMaterial);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const authTag = cipher.getAuthTag();

    // Return: iv (16) + authTag (16) + encrypted data
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypt key material from storage
   */
  private decryptKey(encryptedData: Buffer): Buffer {
    const iv = encryptedData.subarray(0, 16);
    const authTag = encryptedData.subarray(16, 32);
    const encrypted = encryptedData.subarray(32);

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.masterEncryptionKey,
      iv
    );

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted;
  }

  /**
   * Generate master encryption key for key material protection
   *
   * In production, this should:
   * - Be loaded from HSM or secure key management system (AWS KMS, Google Cloud KMS)
   * - Never be stored in code or plaintext
   * - Be rotated periodically
   * - Use a strong KDF (PBKDF2, Argon2)
   */
  private generateMasterKey(): Buffer {
    // For development: generate random key
    // In production: load from secure storage
    return crypto.randomBytes(32);
  }

  /**
   * Store identity key in database
   */
  private async storeIdentityKey(keyPair: KeyPair): Promise<void> {
    const encryptedPrivateKey = this.encryptKey(keyPair.privateKey);

    try {
      // Store in database (placeholder for actual schema)
      console.log('  📝 Storing identity key');
    } catch (error) {
      console.error('  ❌ Failed to store identity key:', error);
      throw error;
    }
  }

  /**
   * Load identity key from database
   */
  private async loadIdentityKey(): Promise<KeyPair | null> {
    try {
      // Load from database (placeholder)
      // In real implementation, query SignalIdentityKey table
      return null; // Change to return actual key when DB schema exists
    } catch (error) {
      console.error('  ❌ Failed to load identity key:', error);
      return null;
    }
  }

  /**
   * Load active signed pre-key from database
   */
  private async loadActiveSignedPreKey(): Promise<SignedPreKey | null> {
    try {
      // Load from database (placeholder)
      // In real implementation, query SignalSignedPreKey table WHERE isActive = true
      return null; // Change to return actual key when DB schema exists
    } catch (error) {
      console.error('  ❌ Failed to load signed pre-key:', error);
      return null;
    }
  }

  /**
   * Get count of available (unused) pre-keys
   */
  private async getPreKeyCount(): Promise<number> {
    try {
      // Query database (placeholder)
      // In real implementation: COUNT(*) FROM SignalPreKey WHERE isUsed = false
      return 0; // Change when DB schema exists
    } catch (error) {
      console.error('  ❌ Failed to get pre-key count:', error);
      return 0;
    }
  }

  /**
   * Get next pre-key ID
   */
  private async getNextPreKeyId(): Promise<number> {
    // In real implementation: get from sequence/counter in database
    this.preKeyCounter++;
    return this.preKeyCounter;
  }

  /**
   * Get next signed pre-key ID
   */
  private async getNextSignedPreKeyId(): Promise<number> {
    // In real implementation: get from sequence/counter in database
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Get identity public key for distribution
   */
  getIdentityPublicKey(): Buffer | undefined {
    return this.identityKeyPair?.publicKey;
  }

  /**
   * Get a pre-key pair for X3DH (and mark as used)
   */
  async getPreKey(preKeyId: number): Promise<KeyPair | null> {
    try {
      // Load pre-key from database
      // Decrypt private key
      // Mark as used
      return null; // Placeholder
    } catch (error) {
      console.error(`  ❌ Failed to get pre-key ${preKeyId}:`, error);
      return null;
    }
  }

  /**
   * Get active signed pre-key
   */
  async getSignedPreKey(): Promise<SignedPreKey | null> {
    return this.loadActiveSignedPreKey();
  }

  /**
   * Get all public keys for publishing to other users
   */
  async getPublicKeysForPublishing(): Promise<{
    identityKey: Buffer;
    signedPreKey: Buffer;
    preKeys: Array<{ id: number; publicKey: Buffer }>;
  } | null> {
    if (!this.identityKeyPair) {
      return null;
    }

    const signedPreKey = await this.loadActiveSignedPreKey();
    if (!signedPreKey) {
      return null;
    }

    // Get up to 10 unused pre-keys
    const preKeys: Array<{ id: number; publicKey: Buffer }> = [];
    // In real implementation: query database for unused pre-keys

    return {
      identityKey: this.identityKeyPair.publicKey,
      signedPreKey: signedPreKey.publicKey,
      preKeys
    };
  }

  /**
   * Get key manager statistics
   */
  getStatistics(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Rotate signed pre-key (called by scheduler)
   */
  async rotateSignedPreKey(): Promise<void> {
    console.log('🔄 Rotating signed pre-key');
    try {
      await this.generateAndStoreSignedPreKey();
      console.log('✅ Signed pre-key rotated');
    } catch (error) {
      console.error('❌ Failed to rotate signed pre-key:', error);
      throw error;
    }
  }

  /**
   * Replenish pre-keys if below threshold
   */
  async replenishPreKeysIfNeeded(): Promise<void> {
    const preKeyCount = await this.getPreKeyCount();
    if (preKeyCount < 25) {
      const keysToGenerate = 50 - preKeyCount;
      console.log(`📝 Replenishing pre-keys: generating ${keysToGenerate} new keys`);
      await this.generateAndStorePreKeys(keysToGenerate);
    }
  }
}
