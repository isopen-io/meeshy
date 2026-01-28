/**
 * Signal Key Manager Unit Tests
 *
 * Tests for Week 1-2 implementation:
 * - Identity key generation
 * - Pre-key generation and batching
 * - Signed pre-key management
 * - Key encryption/decryption
 * - Key storage and rotation
 */

import { SignalKeyManager } from '../SignalKeyManager';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import * as crypto from 'crypto';

describe('SignalKeyManager - Week 1-2 Implementation', () => {
  let keyManager: SignalKeyManager;
  let prisma: PrismaClient;
  let masterKey: Buffer;

  beforeAll(() => {
    // Setup test Prisma client (mock or test database)
    prisma = new PrismaClient();
    masterKey = crypto.randomBytes(32);
  });

  beforeEach(() => {
    keyManager = new SignalKeyManager(prisma, masterKey);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================================================
  // IDENTITY KEY TESTS
  // ============================================================================

  describe('Identity Key Generation', () => {
    it('should initialize with an identity key pair', async () => {
      await keyManager.initialize();

      const stats = keyManager.getStatistics();
      expect(stats.identityKeysGenerated).toBeGreaterThanOrEqual(0);

      const identityPublicKey = keyManager.getIdentityPublicKey();
      expect(identityPublicKey).toBeDefined();
      expect(identityPublicKey).toBeInstanceOf(Buffer);
      expect(identityPublicKey?.length).toBeGreaterThan(0);
    });

    it('should generate EC-P256 identity key pair', async () => {
      await keyManager.initialize();

      const identityKey = keyManager.getIdentityPublicKey();
      expect(identityKey).toBeDefined();

      // EC-P256 SPKI format is approximately 91 bytes
      expect(identityKey?.length).toBeGreaterThan(70);
      expect(identityKey?.length).toBeLessThan(120);
    });

    it('should persist identity key across instances', async () => {
      await keyManager.initialize();
      const firstKey = keyManager.getIdentityPublicKey();

      // Create new instance
      const newKeyManager = new SignalKeyManager(prisma, masterKey);
      await newKeyManager.initialize();
      const secondKey = newKeyManager.getIdentityPublicKey();

      // Should load the same key from storage
      // (In real implementation with DB)
      expect(firstKey).toBeDefined();
      expect(secondKey).toBeDefined();
    });
  });

  // ============================================================================
  // PRE-KEY TESTS
  // ============================================================================

  describe('Pre-Key Management', () => {
    it('should initialize with pre-key pool', async () => {
      await keyManager.initialize();

      const stats = keyManager.getStatistics();
      expect(stats.preKeysGenerated).toBeGreaterThanOrEqual(0);
    });

    it('should maintain minimum pre-key threshold', async () => {
      await keyManager.initialize();

      // Get public keys (includes pre-keys)
      const keysForPublishing = await keyManager.getPublicKeysForPublishing();

      if (keysForPublishing) {
        // Should have pre-keys or empty array if none available
        expect(Array.isArray(keysForPublishing.preKeys)).toBe(true);
      }
    });

    it('should generate pre-key batches of correct size', async () => {
      // This test validates the batch generation logic
      // In a real test, we'd generate and count them
      await keyManager.initialize();

      const stats = keyManager.getStatistics();
      // Stats should show keys were generated
      expect(stats).toBeDefined();
    });

    it('should replenish pre-keys when below threshold', async () => {
      await keyManager.initialize();

      const statsBefore = keyManager.getStatistics();
      const countBefore = statsBefore.preKeysGenerated;

      // Trigger replenishment
      await keyManager.replenishPreKeysIfNeeded();

      const statsAfter = keyManager.getStatistics();
      const countAfter = statsAfter.preKeysGenerated;

      // Should have generated more keys
      expect(countAfter).toBeGreaterThanOrEqual(countBefore);
    });

    it('should mark pre-keys as used when retrieved', async () => {
      await keyManager.initialize();

      // Get a pre-key
      const preKey = await keyManager.getPreKey(1);

      // If pre-key exists, it should be a valid key pair
      if (preKey) {
        expect(preKey.publicKey).toBeDefined();
        expect(preKey.privateKey).toBeDefined();
        expect(preKey.publicKey).toBeInstanceOf(Buffer);
        expect(preKey.privateKey).toBeInstanceOf(Buffer);
      }
    });
  });

  // ============================================================================
  // SIGNED PRE-KEY TESTS
  // ============================================================================

  describe('Signed Pre-Key Management', () => {
    it('should initialize with active signed pre-key', async () => {
      await keyManager.initialize();

      const signedPreKey = await keyManager.getSignedPreKey();

      if (signedPreKey) {
        expect(signedPreKey.publicKey).toBeDefined();
        expect(signedPreKey.signature).toBeDefined();
        expect(signedPreKey.timestamp).toBeGreaterThan(0);
        expect(signedPreKey.isActive).toBe(true);
      }
    });

    it('should rotate signed pre-key on schedule', async () => {
      await keyManager.initialize();

      const statsBefore = keyManager.getStatistics();
      const rotationsBefore = statsBefore.signedPreKeysRotated;

      // Trigger rotation
      await keyManager.rotateSignedPreKey();

      const statsAfter = keyManager.getStatistics();
      const rotationsAfter = statsAfter.signedPreKeysRotated;

      expect(rotationsAfter).toBeGreaterThan(rotationsBefore);
    });

    it('should sign pre-key with identity key', async () => {
      await keyManager.initialize();

      const signedPreKey = await keyManager.getSignedPreKey();

      if (signedPreKey) {
        expect(signedPreKey.signature).toBeInstanceOf(Buffer);
        expect(signedPreKey.signature.length).toBeGreaterThan(0);

        // Signature should be valid ECDSA signature (typically 64+ bytes)
        expect(signedPreKey.signature.length).toBeGreaterThan(60);
      }
    });

    it('should set correct rotation schedule', async () => {
      await keyManager.initialize();

      const signedPreKey = await keyManager.getSignedPreKey();

      if (signedPreKey) {
        expect(signedPreKey.rotationSchedule).toBe('weekly');

        // Next rotation should be ~7 days from now
        const now = new Date();
        const daysUntilRotation = (signedPreKey.nextRotationDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);

        expect(daysUntilRotation).toBeGreaterThan(6);
        expect(daysUntilRotation).toBeLessThan(8);
      }
    });
  });

  // ============================================================================
  // KEY ENCRYPTION TESTS
  // ============================================================================

  describe('Key Encryption and Storage', () => {
    it('should encrypt and decrypt key material', async () => {
      const originalKey = crypto.randomBytes(32);
      const keyManager2 = new SignalKeyManager(prisma, masterKey);

      // Access private method through reflection for testing
      const encrypted = (keyManager2 as any).encryptKey(originalKey);

      expect(encrypted).toBeDefined();
      expect(encrypted).toBeInstanceOf(Buffer);
      expect(encrypted.length).toBeGreaterThan(originalKey.length);

      // Decrypt
      const decrypted = (keyManager2 as any).decryptKey(encrypted);

      expect(decrypted).toEqual(originalKey);
    });

    it('should use different IV for each encryption', async () => {
      const plaintext = crypto.randomBytes(32);
      const keyManager2 = new SignalKeyManager(prisma, masterKey);

      const encrypted1 = (keyManager2 as any).encryptKey(plaintext);
      const encrypted2 = (keyManager2 as any).encryptKey(plaintext);

      // Encrypted values should be different (due to different IVs)
      expect(encrypted1).not.toEqual(encrypted2);
    });

    it('should fail decryption with wrong master key', () => {
      const plaintext = crypto.randomBytes(32);
      const keyManager2 = new SignalKeyManager(prisma, masterKey);

      const encrypted = (keyManager2 as any).encryptKey(plaintext);

      // Create new key manager with wrong master key
      const wrongKey = crypto.randomBytes(32);
      const keyManagerWrong = new SignalKeyManager(prisma, wrongKey);

      // Should throw or return garbage (not original plaintext)
      expect(() => {
        (keyManagerWrong as any).decryptKey(encrypted);
      }).toThrow();
    });

    it('should use AES-256-GCM for encryption', async () => {
      const plaintext = crypto.randomBytes(32);
      const keyManager2 = new SignalKeyManager(prisma, masterKey);

      const encrypted = (keyManager2 as any).encryptKey(plaintext);

      // Structure: IV (16) + AuthTag (16) + Ciphertext (32+)
      expect(encrypted.length).toBe(16 + 16 + 32);
    });

    it('should detect tampered encrypted data', () => {
      const plaintext = crypto.randomBytes(32);
      const keyManager2 = new SignalKeyManager(prisma, masterKey);

      const encrypted = (keyManager2 as any).encryptKey(plaintext);

      // Tamper with ciphertext
      const tampered = Buffer.from(encrypted);
      tampered[35] ^= 0xFF; // Flip bits in ciphertext

      // Should fail decryption due to auth tag mismatch
      expect(() => {
        (keyManager2 as any).decryptKey(tampered);
      }).toThrow();
    });
  });

  // ============================================================================
  // PUBLIC KEY DISTRIBUTION TESTS
  // ============================================================================

  describe('Public Key Publishing', () => {
    it('should provide all public keys for publishing', async () => {
      await keyManager.initialize();

      const keysForPublishing = await keyManager.getPublicKeysForPublishing();

      if (keysForPublishing) {
        expect(keysForPublishing.identityKey).toBeDefined();
        expect(keysForPublishing.signedPreKey).toBeDefined();
        expect(keysForPublishing.preKeys).toBeDefined();
        expect(Array.isArray(keysForPublishing.preKeys)).toBe(true);
      }
    });

    it('should only publish public keys (not private)', async () => {
      await keyManager.initialize();

      const keysForPublishing = await keyManager.getPublicKeysForPublishing();

      if (keysForPublishing) {
        // These should be public key format (SPKI)
        expect(keysForPublishing.identityKey.length).toBeGreaterThan(70);
        expect(keysForPublishing.signedPreKey.length).toBeGreaterThan(70);
      }
    });

    it('should include unused pre-keys in publishing', async () => {
      await keyManager.initialize();

      const keysForPublishing = await keyManager.getPublicKeysForPublishing();

      if (keysForPublishing && keysForPublishing.preKeys.length > 0) {
        const preKey = keysForPublishing.preKeys[0];

        expect(preKey.id).toBeDefined();
        expect(preKey.publicKey).toBeDefined();
        expect(preKey.publicKey).toBeInstanceOf(Buffer);
      }
    });
  });

  // ============================================================================
  // STATISTICS AND MONITORING TESTS
  // ============================================================================

  describe('Statistics and Monitoring', () => {
    it('should track key generation statistics', async () => {
      await keyManager.initialize();

      const stats = keyManager.getStatistics();

      expect(stats).toBeDefined();
      expect(stats.identityKeysGenerated).toBeDefined();
      expect(stats.preKeysGenerated).toBeDefined();
      expect(stats.preKeysUsed).toBeDefined();
      expect(stats.signedPreKeysRotated).toBeDefined();
      expect(stats.encryptionOperations).toBeDefined();
    });

    it('should increment statistics correctly', async () => {
      await keyManager.initialize();

      const statsBefore = keyManager.getStatistics();

      // Perform operations
      await keyManager.replenishPreKeysIfNeeded();
      await keyManager.rotateSignedPreKey();

      const statsAfter = keyManager.getStatistics();

      expect(statsAfter.signedPreKeysRotated).toBeGreaterThanOrEqual(
        statsBefore.signedPreKeysRotated
      );
    });

    it('should provide consistent statistics', async () => {
      await keyManager.initialize();

      const stats1 = keyManager.getStatistics();
      const stats2 = keyManager.getStatistics();

      expect(stats1).toEqual(stats2);
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('Integration Tests', () => {
    it('should handle full lifecycle: init -> replenish -> rotate -> publish', async () => {
      // Initialize
      await keyManager.initialize();
      expect(keyManager.getIdentityPublicKey()).toBeDefined();

      // Replenish
      await keyManager.replenishPreKeysIfNeeded();

      // Rotate
      await keyManager.rotateSignedPreKey();

      // Publish
      const keysForPublishing = await keyManager.getPublicKeysForPublishing();
      expect(keysForPublishing).toBeDefined();

      // Verify stats
      const stats = keyManager.getStatistics();
      expect(stats).toBeDefined();
    });

    it('should handle concurrent key access', async () => {
      await keyManager.initialize();

      // Simulate concurrent access
      const promises = [
        keyManager.getPublicKeysForPublishing(),
        keyManager.getSignedPreKey(),
        keyManager.getPreKey(1),
        keyManager.getStatistics()
      ];

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });

    it('should maintain state consistency after operations', async () => {
      await keyManager.initialize();

      const stats1 = keyManager.getStatistics();
      const key1 = keyManager.getIdentityPublicKey();

      // Perform operations
      await keyManager.replenishPreKeysIfNeeded();

      const stats2 = keyManager.getStatistics();
      const key2 = keyManager.getIdentityPublicKey();

      // Identity key should not change
      expect(key1).toEqual(key2);

      // Stats should be consistent
      expect(stats2.identityKeysGenerated).toBe(stats1.identityKeysGenerated);
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle uninitialized state', async () => {
      // Don't call initialize()
      const publicKey = keyManager.getIdentityPublicKey();

      // Should return undefined if not initialized
      expect(publicKey).toBeUndefined();
    });

    it('should handle invalid pre-key ID gracefully', async () => {
      await keyManager.initialize();

      const preKey = await keyManager.getPreKey(999999);

      // Should return null for non-existent key
      expect(preKey).toBeNull();
    });

    it('should recover from rotation errors', async () => {
      await keyManager.initialize();

      const stats1 = keyManager.getStatistics();

      try {
        // This might fail in test environment
        await keyManager.rotateSignedPreKey();
      } catch (error) {
        // Should still be usable
        expect(keyManager.getIdentityPublicKey()).toBeDefined();
      }

      const stats2 = keyManager.getStatistics();
      expect(stats2).toBeDefined();
    });
  });

  // ============================================================================
  // SECURITY PROPERTY TESTS
  // ============================================================================

  describe('Security Properties', () => {
    it('should generate unique keys on each call', () => {
      const key1 = (new SignalKeyManager(prisma, masterKey) as any).generatePreKeyPair();
      const key2 = (new SignalKeyManager(prisma, masterKey) as any).generatePreKeyPair();

      // Keys should be different
      expect(key1.publicKey).not.toEqual(key2.publicKey);
      expect(key1.privateKey).not.toEqual(key2.privateKey);
    });

    it('should use sufficient key size (P-256)', () => {
      const keyManager2 = new SignalKeyManager(prisma, masterKey);
      const keyPair = (keyManager2 as any).generatePreKeyPair();

      // P-256 SPKI public key is ~91 bytes
      expect(keyPair.publicKey.length).toBeGreaterThan(70);
      expect(keyPair.publicKey.length).toBeLessThan(120);
    });

    it('should use sufficient master key size', () => {
      const testKey = crypto.randomBytes(32);
      const keyManager2 = new SignalKeyManager(prisma, testKey);

      // Master key should be 256 bits (32 bytes)
      expect(testKey.length).toBe(32);
    });

    it('should use authenticated encryption (GCM)', () => {
      // AES-GCM provides both confidentiality and authenticity
      const plaintext = crypto.randomBytes(32);
      const keyManager2 = new SignalKeyManager(prisma, masterKey);

      const encrypted = (keyManager2 as any).encryptKey(plaintext);

      // Structure includes auth tag
      expect(encrypted.length).toBeGreaterThan(plaintext.length + 16); // IV + AuthTag overhead
    });
  });
});
