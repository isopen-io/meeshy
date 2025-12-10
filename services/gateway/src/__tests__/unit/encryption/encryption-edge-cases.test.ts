/**
 * Edge Case Tests for Encryption Implementation
 *
 * Comprehensive tests for:
 * - Boundary conditions
 * - Error handling
 * - Security edge cases
 * - Concurrent operations
 * - Data integrity
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EncryptionService } from '../../../services/EncryptionService';
import * as crypto from 'crypto';

// Mock PrismaClient
const mockPrisma = {
  conversation: { findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn(), update: jest.fn() },
  signalPreKeyBundle: { findUnique: jest.fn(), upsert: jest.fn() },
} as any;

describe('Encryption Edge Cases', () => {
  let encryptionService: EncryptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    encryptionService = new EncryptionService(mockPrisma);
  });

  describe('Boundary Conditions', () => {
    it('should handle minimum message length (1 character)', async () => {
      const plaintext = 'A';
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle very large message (100KB)', async () => {
      const plaintext = 'X'.repeat(100 * 1024);
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
      expect(decrypted.length).toBe(100 * 1024);
    });

    it('should handle message at AES block boundary (16 bytes)', async () => {
      const plaintext = '1234567890123456'; // Exactly 16 bytes
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle message just over block boundary (17 bytes)', async () => {
      const plaintext = '12345678901234567'; // 17 bytes
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle message just under block boundary (15 bytes)', async () => {
      const plaintext = '123456789012345'; // 15 bytes
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Unicode and International Characters', () => {
    it('should handle Arabic text', async () => {
      const plaintext = 'مرحبا بالعالم'; // "Hello World" in Arabic
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle Chinese characters', async () => {
      const plaintext = '你好世界加密测试';
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle Japanese with mixed scripts', async () => {
      const plaintext = 'こんにちは世界 Hello 123';
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle emoji sequences', async () => {
      const plaintext = '👨‍👩‍👧‍👦 Family emoji 🏳️‍🌈 Flag emoji';
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle combining characters', async () => {
      const plaintext = 'e\u0301 vs é'; // e + combining acute vs precomposed é
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle zero-width characters', async () => {
      const plaintext = 'Hello\u200BWorld\u200CTest\u200D'; // Zero-width space, non-joiner, joiner
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle RTL text mixed with LTR', async () => {
      const plaintext = 'English مرحبا Hebrew עברית';
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Special Characters and Control Codes', () => {
    it('should handle null bytes in message', async () => {
      const plaintext = 'Hello\x00World\x00';
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle all ASCII control characters', async () => {
      let plaintext = '';
      for (let i = 0; i < 32; i++) {
        plaintext += String.fromCharCode(i);
      }
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle escape sequences', async () => {
      const plaintext = 'Line1\nLine2\tTabbed\rReturn\\Backslash';
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle quotes and special JSON characters', async () => {
      const plaintext = '{"key": "value with \\"quotes\\" and \\\\backslash"}';
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent encryptions', async () => {
      const messages = ['Message 1', 'Message 2', 'Message 3', 'Message 4', 'Message 5'];
      const conversationId = 'concurrent-test';

      const encryptedPromises = messages.map(msg =>
        encryptionService.encryptMessage(msg, 'server', conversationId)
      );

      const encrypted = await Promise.all(encryptedPromises);

      // All should use the same key
      const keyIds = encrypted.map(e => e.metadata.keyId);
      expect(new Set(keyIds).size).toBe(1);

      // All should have different IVs
      const ivs = encrypted.map(e => e.metadata.iv);
      expect(new Set(ivs).size).toBe(5);

      // All should decrypt correctly
      for (let i = 0; i < messages.length; i++) {
        const decrypted = await encryptionService.decryptMessage(encrypted[i]);
        expect(decrypted).toBe(messages[i]);
      }
    });

    it('should handle concurrent encryptions for different conversations', async () => {
      const conversationIds = ['conv-1', 'conv-2', 'conv-3'];
      const message = 'Same message for all';

      const encryptedPromises = conversationIds.map(convId =>
        encryptionService.encryptMessage(message, 'server', convId)
      );

      const encrypted = await Promise.all(encryptedPromises);

      // Each conversation should have a different key
      const keyIds = encrypted.map(e => e.metadata.keyId);
      expect(new Set(keyIds).size).toBe(3);

      // All should decrypt correctly
      for (const enc of encrypted) {
        const decrypted = await encryptionService.decryptMessage(enc);
        expect(decrypted).toBe(message);
      }
    });
  });

  describe('Key Management Edge Cases', () => {
    it('should generate unique keys each time', async () => {
      const keyIds: string[] = [];
      for (let i = 0; i < 100; i++) {
        const keyId = await encryptionService.getOrCreateConversationKey();
        keyIds.push(keyId);
      }

      // All keys should be unique
      expect(new Set(keyIds).size).toBe(100);

      // All should be valid UUIDs
      keyIds.forEach(id => {
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      });
    });

    it('should reuse key for same conversation', async () => {
      const conversationId = 'reuse-key-test';

      const encrypted1 = await encryptionService.encryptMessage('First', 'server', conversationId);
      const encrypted2 = await encryptionService.encryptMessage('Second', 'server', conversationId);
      const encrypted3 = await encryptionService.encryptMessage('Third', 'server', conversationId);

      expect(encrypted1.metadata.keyId).toBe(encrypted2.metadata.keyId);
      expect(encrypted2.metadata.keyId).toBe(encrypted3.metadata.keyId);
    });
  });

  describe('Pre-Key Bundle Validation', () => {
    it('should generate valid registration ID range', async () => {
      const bundles = await Promise.all(
        Array.from({ length: 100 }, () => encryptionService.generatePreKeyBundle())
      );

      bundles.forEach(bundle => {
        expect(bundle.registrationId).toBeGreaterThanOrEqual(1);
        expect(bundle.registrationId).toBeLessThanOrEqual(16380);
      });
    });

    it('should generate valid key lengths', async () => {
      const bundle = await encryptionService.generatePreKeyBundle();

      expect(bundle.identityKey.length).toBe(32);
      expect(bundle.preKeyPublic?.length).toBe(32);
      expect(bundle.signedPreKeyPublic.length).toBe(32);
      expect(bundle.signedPreKeySignature.length).toBe(64);
    });

    it('should have all required fields', async () => {
      const bundle = await encryptionService.generatePreKeyBundle();

      expect(bundle).toHaveProperty('identityKey');
      expect(bundle).toHaveProperty('registrationId');
      expect(bundle).toHaveProperty('deviceId');
      expect(bundle).toHaveProperty('preKeyId');
      expect(bundle).toHaveProperty('preKeyPublic');
      expect(bundle).toHaveProperty('signedPreKeyId');
      expect(bundle).toHaveProperty('signedPreKeyPublic');
      expect(bundle).toHaveProperty('signedPreKeySignature');
      expect(bundle).toHaveProperty('kyberPreKeyId');
      expect(bundle).toHaveProperty('kyberPreKeyPublic');
      expect(bundle).toHaveProperty('kyberPreKeySignature');
    });
  });

  describe('Security Edge Cases', () => {
    it('should produce different ciphertexts for same plaintext', async () => {
      const plaintext = 'Same message';
      const encrypted1 = await encryptionService.encryptMessage(plaintext, 'server');
      const encrypted2 = await encryptionService.encryptMessage(plaintext, 'server');

      // Same key, different IV
      expect(encrypted1.metadata.iv).not.toBe(encrypted2.metadata.iv);
      // Different ciphertext due to different IV
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });

    it('should fail decryption with wrong IV', async () => {
      const plaintext = 'Sensitive data';
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');

      // Tamper with IV
      const tamperedPayload = {
        ...encrypted,
        metadata: {
          ...encrypted.metadata,
          iv: crypto.randomBytes(12).toString('base64'),
        },
      };

      await expect(encryptionService.decryptMessage(tamperedPayload)).rejects.toThrow();
    });

    it('should fail decryption with modified ciphertext', async () => {
      const plaintext = 'Important message';
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');

      // Flip a bit in ciphertext
      const ciphertextBuffer = Buffer.from(encrypted.ciphertext, 'base64');
      ciphertextBuffer[0] ^= 0x01;

      const tamperedPayload = {
        ...encrypted,
        ciphertext: ciphertextBuffer.toString('base64'),
      };

      await expect(encryptionService.decryptMessage(tamperedPayload)).rejects.toThrow();
    });

    it('should fail decryption with truncated auth tag', async () => {
      const plaintext = 'Protected content';
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');

      // Truncate auth tag
      const tamperedPayload = {
        ...encrypted,
        metadata: {
          ...encrypted.metadata,
          authTag: encrypted.metadata.authTag.slice(0, 10),
        },
      };

      await expect(encryptionService.decryptMessage(tamperedPayload)).rejects.toThrow();
    });
  });

  describe('Storage and Reconstruction', () => {
    it('should round-trip through storage format', async () => {
      const plaintext = 'Message for storage';
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');

      const storage = encryptionService.prepareForStorage(encrypted);
      const reconstructed = encryptionService.reconstructPayload(
        storage.encryptedContent,
        storage.encryptionMetadata
      );

      const decrypted = await encryptionService.decryptMessage(reconstructed);
      expect(decrypted).toBe(plaintext);
    });

    it('should preserve all metadata in storage', async () => {
      const encrypted = await encryptionService.encryptMessage('Test', 'server', 'conv-123');
      const storage = encryptionService.prepareForStorage(encrypted);

      expect(storage.encryptionMetadata.mode).toBe('server');
      expect(storage.encryptionMetadata.protocol).toBe('aes-256-gcm');
      expect(storage.encryptionMetadata.keyId).toBeTruthy();
      expect(storage.encryptionMetadata.iv).toBeTruthy();
      expect(storage.encryptionMetadata.authTag).toBeTruthy();
      expect(storage.encryptionMode).toBe('server');
      expect(storage.isEncrypted).toBe(true);
    });
  });

  describe('Translation Re-encryption', () => {
    it('should re-encrypt translated content correctly', async () => {
      const original = 'Hello world';
      const translated = 'Bonjour le monde';

      const encrypted = await encryptionService.encryptMessage(original, 'server');
      const reEncrypted = await encryptionService.translateAndReEncrypt(encrypted, translated);

      // Same key
      expect(reEncrypted.metadata.keyId).toBe(encrypted.metadata.keyId);
      // Different IV (critical for security)
      expect(reEncrypted.metadata.iv).not.toBe(encrypted.metadata.iv);
      // Decrypts to translated content
      const decrypted = await encryptionService.decryptMessage(reEncrypted);
      expect(decrypted).toBe(translated);
    });

    it('should preserve metadata during re-encryption', async () => {
      const encrypted = await encryptionService.encryptMessage('Original', 'server');
      const reEncrypted = await encryptionService.translateAndReEncrypt(encrypted, 'Traduit');

      expect(reEncrypted.metadata.mode).toBe(encrypted.metadata.mode);
      expect(reEncrypted.metadata.protocol).toBe(encrypted.metadata.protocol);
      expect(reEncrypted.metadata.keyId).toBe(encrypted.metadata.keyId);
    });
  });
});

describe('Base64 Encoding Edge Cases', () => {
  it('should handle base64 padding correctly', () => {
    // Test cases with different padding requirements
    const testCases = [
      new Uint8Array([1]),       // 1 byte -> 2 padding chars
      new Uint8Array([1, 2]),    // 2 bytes -> 1 padding char
      new Uint8Array([1, 2, 3]), // 3 bytes -> no padding
    ];

    testCases.forEach(bytes => {
      const base64 = Buffer.from(bytes).toString('base64');
      const restored = Uint8Array.from(Buffer.from(base64, 'base64'));
      expect(restored).toEqual(bytes);
    });
  });

  it('should handle URL-safe base64 conversion', () => {
    // Test with bytes that produce + and / in standard base64
    const problematicBytes = new Uint8Array([251, 255, 254]);
    const standard = Buffer.from(problematicBytes).toString('base64');
    const urlSafe = standard.replace(/\+/g, '-').replace(/\//g, '_');

    // Should be convertible back
    const restored = urlSafe.replace(/-/g, '+').replace(/_/g, '/');
    expect(restored).toBe(standard);
  });
});
