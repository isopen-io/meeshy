/**
 * Unit tests for Gateway EncryptionService
 *
 * Tests:
 * - AES-256-GCM encryption/decryption
 * - Key generation and management
 * - Pre-key bundle generation
 * - Error handling
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EncryptionService, getEncryptionService } from '../../../services/EncryptionService';

// In-memory key storage for tests
const keyStorage = new Map<string, {
  id: string;
  encryptedKey: string;
  iv: string;
  authTag: string;
  algorithm: string;
  purpose: string;
  conversationId: string | null;
  createdAt: Date;
  lastAccessedAt: Date | null;
}>();

// Mock PrismaClient with serverEncryptionKey support
const mockPrisma = {
  conversation: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  signalPreKeyBundle: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  serverEncryptionKey: {
    create: jest.fn((args: any) => {
      const data = args.data;
      keyStorage.set(data.id, {
        ...data,
        lastAccessedAt: null,
      });
      return Promise.resolve(data);
    }),
    findUnique: jest.fn((args: any) => {
      const key = keyStorage.get(args.where.id);
      return Promise.resolve(key || null);
    }),
    findMany: jest.fn((args: any) => {
      const results: any[] = [];
      keyStorage.forEach((value) => {
        if (!args?.where?.purpose || args.where.purpose === value.purpose) {
          results.push(value);
        }
      });
      return Promise.resolve(results);
    }),
    update: jest.fn((args: any) => {
      const key = keyStorage.get(args.where.id);
      if (key) {
        Object.assign(key, args.data);
        keyStorage.set(args.where.id, key);
      }
      return Promise.resolve(key);
    }),
  },
} as any;

describe('EncryptionService', () => {
  let encryptionService: EncryptionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    keyStorage.clear();

    // Set test environment variable for master key (exactly 32 bytes)
    process.env.ENCRYPTION_MASTER_KEY = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');

    encryptionService = new EncryptionService(mockPrisma);
    await encryptionService.initialize();
  });

  describe('getOrCreateConversationKey', () => {
    it('should generate a unique key ID', async () => {
      const keyId1 = await encryptionService.getOrCreateConversationKey();
      const keyId2 = await encryptionService.getOrCreateConversationKey();

      expect(keyId1).toBeTruthy();
      expect(keyId2).toBeTruthy();
      expect(keyId1).not.toBe(keyId2);
      // UUID format validation
      expect(keyId1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('encryptMessage', () => {
    it('should encrypt a message in server mode', async () => {
      const plaintext = 'Hello, this is a secret message!';
      const conversationId = 'conv-123';

      const result = await encryptionService.encryptMessage(plaintext, 'server', conversationId);

      expect(result).toBeDefined();
      expect(result.ciphertext).toBeTruthy();
      expect(result.ciphertext).not.toBe(plaintext);
      expect(result.metadata.mode).toBe('server');
      expect(result.metadata.protocol).toBe('aes-256-gcm');
      expect(result.metadata.keyId).toBeTruthy();
      expect(result.metadata.iv).toBeTruthy();
      expect(result.metadata.authTag).toBeTruthy();
    });

    it('should throw error for E2EE mode', async () => {
      const plaintext = 'Hello, E2EE message';

      await expect(
        encryptionService.encryptMessage(plaintext, 'e2ee')
      ).rejects.toThrow('E2EE messages must be encrypted client-side');
    });

    it('should encrypt with consistent key for same conversation', async () => {
      const conversationId = 'conv-same-key';
      const message1 = 'First message';
      const message2 = 'Second message';

      const result1 = await encryptionService.encryptMessage(message1, 'server', conversationId);
      const result2 = await encryptionService.encryptMessage(message2, 'server', conversationId);

      // Same key should be used for same conversation
      expect(result1.metadata.keyId).toBe(result2.metadata.keyId);
      // But different IVs
      expect(result1.metadata.iv).not.toBe(result2.metadata.iv);
    });

    it('should encrypt Unicode content correctly', async () => {
      const plaintext = '🔐 Encrypted message with émojis and accénts! 中文字符';

      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt empty string', async () => {
      const plaintext = '';

      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt long message', async () => {
      const plaintext = 'A'.repeat(10000);

      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);

      expect(decrypted).toBe(plaintext);
      expect(decrypted.length).toBe(10000);
    });
  });

  describe('decryptMessage', () => {
    it('should decrypt a previously encrypted message', async () => {
      const plaintext = 'Secret message for decryption test';

      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const decrypted = await encryptionService.decryptMessage(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw error for E2EE messages', async () => {
      const payload = {
        ciphertext: 'some-ciphertext',
        metadata: {
          mode: 'e2ee' as const,
          protocol: 'signal_v3',
          keyId: 'key-123',
          iv: 'iv-123',
          authTag: 'tag-123',
        },
      };

      await expect(
        encryptionService.decryptMessage(payload)
      ).rejects.toThrow('Cannot decrypt E2EE messages on server');
    });

    it('should throw error for unknown key', async () => {
      const payload = {
        ciphertext: 'some-ciphertext',
        metadata: {
          mode: 'server' as const,
          protocol: 'aes-256-gcm',
          keyId: 'unknown-key-id',
          iv: Buffer.from('test-iv-12ch').toString('base64'),
          authTag: Buffer.from('test-auth-tag-16b').toString('base64'),
        },
      };

      await expect(
        encryptionService.decryptMessage(payload)
      ).rejects.toThrow('Decryption key not found');
    });

    it('should fail with tampered ciphertext', async () => {
      const plaintext = 'Original message';
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');

      // Tamper with ciphertext
      const tamperedPayload = {
        ...encrypted,
        ciphertext: 'tampered' + encrypted.ciphertext.slice(8),
      };

      await expect(
        encryptionService.decryptMessage(tamperedPayload)
      ).rejects.toThrow();
    });

    it('should fail with tampered auth tag', async () => {
      const plaintext = 'Original message';
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');

      // Tamper with auth tag
      const tamperedPayload = {
        ...encrypted,
        metadata: {
          ...encrypted.metadata,
          authTag: Buffer.from('wrong-auth-tag!!').toString('base64'),
        },
      };

      await expect(
        encryptionService.decryptMessage(tamperedPayload)
      ).rejects.toThrow();
    });
  });

  describe('translateAndReEncrypt', () => {
    it('should re-encrypt translated content with same key', async () => {
      const originalText = 'Hello world';
      const translatedText = 'Bonjour le monde';

      const encrypted = await encryptionService.encryptMessage(originalText, 'server');
      const reEncrypted = await encryptionService.translateAndReEncrypt(encrypted, translatedText);

      // Same key ID
      expect(reEncrypted.metadata.keyId).toBe(encrypted.metadata.keyId);
      // Different IV (security requirement)
      expect(reEncrypted.metadata.iv).not.toBe(encrypted.metadata.iv);
      // Can decrypt to get translated text
      const decrypted = await encryptionService.decryptMessage(reEncrypted);
      expect(decrypted).toBe(translatedText);
    });

    it('should throw error for E2EE messages', async () => {
      const payload = {
        ciphertext: 'some-ciphertext',
        metadata: {
          mode: 'e2ee' as const,
          protocol: 'signal_v3',
          keyId: 'key-123',
          iv: 'iv-123',
          authTag: 'tag-123',
        },
      };

      await expect(
        encryptionService.translateAndReEncrypt(payload, 'translated')
      ).rejects.toThrow('Cannot translate E2EE messages');
    });
  });

  describe('generatePreKeyBundle', () => {
    it('should generate a valid pre-key bundle', async () => {
      const bundle = await encryptionService.generatePreKeyBundle();

      expect(bundle).toBeDefined();
      expect(bundle.identityKey).toBeInstanceOf(Uint8Array);
      expect(bundle.identityKey.length).toBe(32);
      expect(bundle.registrationId).toBeGreaterThanOrEqual(1);
      expect(bundle.registrationId).toBeLessThanOrEqual(16380);
      expect(bundle.deviceId).toBe(1);
      expect(bundle.preKeyId).toBeGreaterThanOrEqual(1);
      expect(bundle.preKeyPublic).toBeInstanceOf(Uint8Array);
      expect(bundle.signedPreKeyId).toBeGreaterThanOrEqual(1);
      expect(bundle.signedPreKeyPublic).toBeInstanceOf(Uint8Array);
      expect(bundle.signedPreKeyPublic.length).toBe(32);
      expect(bundle.signedPreKeySignature).toBeInstanceOf(Uint8Array);
      expect(bundle.signedPreKeySignature.length).toBe(64);
      // Kyber keys are null (future-proofing)
      expect(bundle.kyberPreKeyId).toBeNull();
      expect(bundle.kyberPreKeyPublic).toBeNull();
      expect(bundle.kyberPreKeySignature).toBeNull();
    });

    it('should generate unique bundles', async () => {
      const bundle1 = await encryptionService.generatePreKeyBundle();
      const bundle2 = await encryptionService.generatePreKeyBundle();

      // Different registration IDs (probabilistically)
      expect(bundle1.registrationId).not.toBe(bundle2.registrationId);
      // Different identity keys
      expect(Buffer.from(bundle1.identityKey).toString('hex'))
        .not.toBe(Buffer.from(bundle2.identityKey).toString('hex'));
    });
  });

  describe('prepareForStorage', () => {
    it('should prepare payload for database storage', async () => {
      const plaintext = 'Message to store';
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');

      const storage = encryptionService.prepareForStorage(encrypted);

      expect(storage.encryptedContent).toBe(encrypted.ciphertext);
      expect(storage.encryptionMetadata).toEqual(encrypted.metadata);
      expect(storage.encryptionMode).toBe('server');
      expect(storage.isEncrypted).toBe(true);
    });
  });

  describe('reconstructPayload', () => {
    it('should reconstruct payload from storage', async () => {
      const plaintext = 'Stored message';
      const encrypted = await encryptionService.encryptMessage(plaintext, 'server');
      const storage = encryptionService.prepareForStorage(encrypted);

      const reconstructed = encryptionService.reconstructPayload(
        storage.encryptedContent,
        storage.encryptionMetadata
      );

      expect(reconstructed.ciphertext).toBe(encrypted.ciphertext);
      expect(reconstructed.metadata).toEqual(encrypted.metadata);

      // Should be decryptable
      const decrypted = await encryptionService.decryptMessage(reconstructed);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('getSignalService', () => {
    it('should return null when Signal Protocol is not initialized', () => {
      const signalService = encryptionService.getSignalService();
      expect(signalService).toBeNull();
    });
  });

  describe('isSignalProtocolAvailable', () => {
    it('should return a boolean indicating Signal Protocol library availability', () => {
      const available = encryptionService.isSignalProtocolAvailable();
      expect(typeof available).toBe('boolean');
      // Note: The actual value depends on whether @signalapp/libsignal-client is installed
      // In CI/production environments with the library installed, this will be true
    });
  });

  describe('getEncryptionService singleton', () => {
    it('should return same instance for same prisma client', async () => {
      const service1 = await getEncryptionService(mockPrisma);
      const service2 = await getEncryptionService(mockPrisma);

      expect(service1).toBe(service2);
    });
  });
});

describe('EncryptionService - Edge Cases', () => {
  let encryptionService: EncryptionService;

  beforeEach(() => {
    encryptionService = new EncryptionService(mockPrisma);
  });

  it('should handle special characters in message', async () => {
    const specialChars = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~\n\t\r';

    const encrypted = await encryptionService.encryptMessage(specialChars, 'server');
    const decrypted = await encryptionService.decryptMessage(encrypted);

    expect(decrypted).toBe(specialChars);
  });

  it('should handle newlines and formatting', async () => {
    const formatted = 'Line 1\nLine 2\n\tIndented\r\nWindows line';

    const encrypted = await encryptionService.encryptMessage(formatted, 'server');
    const decrypted = await encryptionService.decryptMessage(encrypted);

    expect(decrypted).toBe(formatted);
  });

  it('should handle JSON content', async () => {
    const jsonContent = JSON.stringify({
      type: 'message',
      content: 'Hello',
      metadata: { encrypted: true, timestamp: Date.now() },
    });

    const encrypted = await encryptionService.encryptMessage(jsonContent, 'server');
    const decrypted = await encryptionService.decryptMessage(encrypted);

    expect(decrypted).toBe(jsonContent);
    expect(JSON.parse(decrypted)).toEqual(JSON.parse(jsonContent));
  });

  it('should handle binary-like base64 content', async () => {
    const base64Content = Buffer.from('Binary data 🔐').toString('base64');

    const encrypted = await encryptionService.encryptMessage(base64Content, 'server');
    const decrypted = await encryptionService.decryptMessage(encrypted);

    expect(decrypted).toBe(base64Content);
  });
});
