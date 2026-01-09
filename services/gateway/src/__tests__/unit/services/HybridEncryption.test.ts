/**
 * Unit tests for Hybrid Encryption Mode
 *
 * Tests the double encryption system that allows:
 * - E2EE layer: Only sender/recipient can decrypt (Signal Protocol)
 * - Server layer: Server can decrypt for translation (AES-256-GCM)
 *
 * This enables server-side translation while maintaining E2EE security.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EncryptionService } from '../../../services/EncryptionService';

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
      keyStorage.forEach((value, key) => {
        if (args?.where?.purpose === value.purpose) {
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

describe('Hybrid Encryption', () => {
  let encryptionService: EncryptionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    keyStorage.clear();

    // Set test environment variable for master key (exactly 32 bytes)
    process.env.ENCRYPTION_MASTER_KEY = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');

    encryptionService = new EncryptionService(mockPrisma);
    await encryptionService.initialize();
  });

  describe('encryptHybridServerLayer', () => {
    it('should encrypt plaintext for server layer', async () => {
      const plaintext = 'Hello, this is a hybrid encrypted message!';

      const serverLayer = await encryptionService.encryptHybridServerLayer(plaintext);

      expect(serverLayer).toBeDefined();
      expect(serverLayer.ciphertext).toBeTruthy();
      expect(serverLayer.ciphertext).not.toBe(plaintext);
      expect(serverLayer.iv).toBeTruthy();
      expect(serverLayer.authTag).toBeTruthy();
      expect(serverLayer.keyId).toBeTruthy();
      // UUID format validation
      expect(serverLayer.keyId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should use same key for same conversation', async () => {
      const conversationId = 'conv-hybrid-test';
      const message1 = 'First message';
      const message2 = 'Second message';

      const layer1 = await encryptionService.encryptHybridServerLayer(message1, conversationId);
      const layer2 = await encryptionService.encryptHybridServerLayer(message2, conversationId);

      expect(layer1.keyId).toBe(layer2.keyId);
      // IVs should be different for each message
      expect(layer1.iv).not.toBe(layer2.iv);
      // Ciphertexts should be different
      expect(layer1.ciphertext).not.toBe(layer2.ciphertext);
    });

    it('should use different keys for different conversations', async () => {
      const plaintext = 'Same message in different conversations';

      const layer1 = await encryptionService.encryptHybridServerLayer(plaintext, 'conv-1');
      const layer2 = await encryptionService.encryptHybridServerLayer(plaintext, 'conv-2');

      expect(layer1.keyId).not.toBe(layer2.keyId);
    });

    it('should handle Unicode content correctly', async () => {
      const plaintext = '🔐 Hybrid encrypted message avec émojis! 中文字符';

      const serverLayer = await encryptionService.encryptHybridServerLayer(plaintext);
      const decrypted = await encryptionService.decryptHybridServerLayer(serverLayer);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty string', async () => {
      const plaintext = '';

      const serverLayer = await encryptionService.encryptHybridServerLayer(plaintext);
      const decrypted = await encryptionService.decryptHybridServerLayer(serverLayer);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle very long messages', async () => {
      const plaintext = 'A'.repeat(10000);

      const serverLayer = await encryptionService.encryptHybridServerLayer(plaintext);
      const decrypted = await encryptionService.decryptHybridServerLayer(serverLayer);

      expect(decrypted).toBe(plaintext);
      expect(decrypted.length).toBe(10000);
    });
  });

  describe('decryptHybridServerLayer', () => {
    it('should decrypt server layer correctly', async () => {
      const plaintext = 'Secret message for decryption test';

      const serverLayer = await encryptionService.encryptHybridServerLayer(plaintext);
      const decrypted = await encryptionService.decryptHybridServerLayer(serverLayer);

      expect(decrypted).toBe(plaintext);
    });

    it('should fail with tampered ciphertext', async () => {
      const plaintext = 'Original message';
      const serverLayer = await encryptionService.encryptHybridServerLayer(plaintext);

      // Tamper with ciphertext
      const tamperedLayer = {
        ...serverLayer,
        ciphertext: 'tampered' + serverLayer.ciphertext.slice(8),
      };

      await expect(
        encryptionService.decryptHybridServerLayer(tamperedLayer)
      ).rejects.toThrow();
    });

    it('should fail with tampered auth tag', async () => {
      const plaintext = 'Original message';
      const serverLayer = await encryptionService.encryptHybridServerLayer(plaintext);

      // Tamper with auth tag
      const tamperedLayer = {
        ...serverLayer,
        authTag: Buffer.from('wrong-auth-tag!!').toString('base64'),
      };

      await expect(
        encryptionService.decryptHybridServerLayer(tamperedLayer)
      ).rejects.toThrow();
    });

    it('should fail with unknown key', async () => {
      const serverLayer = {
        ciphertext: Buffer.from('test').toString('base64'),
        iv: Buffer.from('test-iv-12ch').toString('base64'),
        authTag: Buffer.from('test-auth-tag-16').toString('base64'),
        keyId: 'unknown-key-id',
      };

      await expect(
        encryptionService.decryptHybridServerLayer(serverLayer)
      ).rejects.toThrow('Decryption key not found');
    });
  });

  describe('createHybridPayload', () => {
    it('should create complete hybrid payload', async () => {
      const e2eeData = {
        ciphertext: 'e2ee-encrypted-content',
        type: 2, // Whisper message type
        senderRegistrationId: 12345,
        recipientRegistrationId: 67890,
      };
      const plaintext = 'Message content for server';

      const payload = await encryptionService.createHybridPayload(e2eeData, plaintext);

      expect(payload).toBeDefined();
      expect(payload.mode).toBe('hybrid');
      expect(payload.canTranslate).toBe(true);
      expect(payload.timestamp).toBeGreaterThan(0);

      // E2EE layer should be preserved exactly
      expect(payload.e2ee).toEqual(e2eeData);

      // Server layer should be properly encrypted
      expect(payload.server.ciphertext).toBeTruthy();
      expect(payload.server.iv).toBeTruthy();
      expect(payload.server.authTag).toBeTruthy();
      expect(payload.server.keyId).toBeTruthy();

      // Server layer should be decryptable
      const decrypted = await encryptionService.decryptHybridServerLayer(payload.server);
      expect(decrypted).toBe(plaintext);
    });

    it('should use conversation key when provided', async () => {
      const conversationId = 'conv-hybrid-payload';
      const e2eeData = {
        ciphertext: 'e2ee-content',
        type: 1,
        senderRegistrationId: 100,
        recipientRegistrationId: 200,
      };

      const payload1 = await encryptionService.createHybridPayload(e2eeData, 'First', conversationId);
      const payload2 = await encryptionService.createHybridPayload(e2eeData, 'Second', conversationId);

      // Same key for same conversation
      expect(payload1.server.keyId).toBe(payload2.server.keyId);
    });
  });

  describe('translateHybridMessage', () => {
    it('should translate hybrid message', async () => {
      const originalText = 'Hello world';
      const translatedText = 'Bonjour le monde';

      const e2eeData = {
        ciphertext: 'e2ee-encrypted',
        type: 2,
        senderRegistrationId: 111,
        recipientRegistrationId: 222,
      };

      const originalPayload = await encryptionService.createHybridPayload(e2eeData, originalText);
      const translatedPayload = await encryptionService.translateHybridMessage(originalPayload, translatedText);

      // Mode should remain hybrid
      expect(translatedPayload.mode).toBe('hybrid');
      expect(translatedPayload.canTranslate).toBe(true);

      // E2EE layer should be unchanged (exact same reference)
      expect(translatedPayload.e2ee).toEqual(originalPayload.e2ee);

      // Server layer should be re-encrypted with translated content
      expect(translatedPayload.server.keyId).toBe(originalPayload.server.keyId);
      expect(translatedPayload.server.iv).not.toBe(originalPayload.server.iv); // New IV
      expect(translatedPayload.server.ciphertext).not.toBe(originalPayload.server.ciphertext);

      // Decrypted content should be translated
      const decrypted = await encryptionService.decryptHybridServerLayer(translatedPayload.server);
      expect(decrypted).toBe(translatedText);
    });

    it('should preserve E2EE layer during translation', async () => {
      const e2eeData = {
        ciphertext: 'critical-e2ee-data-must-not-change',
        type: 3, // SenderKey type
        senderRegistrationId: 333,
        recipientRegistrationId: 444,
      };

      const originalPayload = await encryptionService.createHybridPayload(e2eeData, 'Original');
      const translatedPayload = await encryptionService.translateHybridMessage(originalPayload, 'Translated');

      // E2EE layer must be exactly preserved
      expect(translatedPayload.e2ee.ciphertext).toBe(e2eeData.ciphertext);
      expect(translatedPayload.e2ee.type).toBe(e2eeData.type);
      expect(translatedPayload.e2ee.senderRegistrationId).toBe(e2eeData.senderRegistrationId);
      expect(translatedPayload.e2ee.recipientRegistrationId).toBe(e2eeData.recipientRegistrationId);
    });

    it('should handle multiple translations', async () => {
      const originalText = 'Hello';
      const translations = ['Hola', 'Bonjour', 'Ciao', 'Hallo'];

      let currentPayload = await encryptionService.createHybridPayload(
        { ciphertext: 'e2ee', type: 2, senderRegistrationId: 1, recipientRegistrationId: 2 },
        originalText
      );

      for (const translation of translations) {
        currentPayload = await encryptionService.translateHybridMessage(currentPayload, translation);

        const decrypted = await encryptionService.decryptHybridServerLayer(currentPayload.server);
        expect(decrypted).toBe(translation);
      }
    });

    it('should reject non-hybrid payloads', async () => {
      const nonHybridPayload = {
        e2ee: { ciphertext: 'test', type: 2, senderRegistrationId: 1, recipientRegistrationId: 2 },
        server: { ciphertext: 'test', iv: 'test', authTag: 'test', keyId: 'test' },
        mode: 'e2ee' as any, // Wrong mode
        canTranslate: false,
        timestamp: Date.now(),
      };

      await expect(
        encryptionService.translateHybridMessage(nonHybridPayload, 'translated')
      ).rejects.toThrow('Message does not support server-side translation');
    });

    it('should reject payloads where canTranslate is false', async () => {
      const noTranslatePayload = {
        e2ee: { ciphertext: 'test', type: 2, senderRegistrationId: 1, recipientRegistrationId: 2 },
        server: { ciphertext: 'test', iv: 'test', authTag: 'test', keyId: 'test' },
        mode: 'hybrid' as const,
        canTranslate: false, // Translation disabled
        timestamp: Date.now(),
      };

      await expect(
        encryptionService.translateHybridMessage(noTranslatePayload, 'translated')
      ).rejects.toThrow('Message does not support server-side translation');
    });
  });

  describe('isValidHybridPayload', () => {
    it('should validate correct hybrid payload', async () => {
      const e2eeData = {
        ciphertext: 'test',
        type: 2,
        senderRegistrationId: 1,
        recipientRegistrationId: 2,
      };
      const payload = await encryptionService.createHybridPayload(e2eeData, 'test');

      expect(encryptionService.isValidHybridPayload(payload)).toBe(true);
    });

    it('should reject null', () => {
      expect(encryptionService.isValidHybridPayload(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(encryptionService.isValidHybridPayload(undefined)).toBe(false);
    });

    it('should reject non-object', () => {
      expect(encryptionService.isValidHybridPayload('string')).toBe(false);
      expect(encryptionService.isValidHybridPayload(123)).toBe(false);
      expect(encryptionService.isValidHybridPayload(true)).toBe(false);
    });

    it('should reject payload with wrong mode', () => {
      const payload = {
        e2ee: {},
        server: {},
        mode: 'server',
        canTranslate: true,
        timestamp: Date.now(),
      };
      expect(encryptionService.isValidHybridPayload(payload)).toBe(false);
    });

    it('should reject payload missing required fields', () => {
      const payloads = [
        { mode: 'hybrid', canTranslate: true, timestamp: Date.now() }, // Missing e2ee and server
        { e2ee: {}, mode: 'hybrid', canTranslate: true, timestamp: Date.now() }, // Missing server
        { server: {}, mode: 'hybrid', canTranslate: true, timestamp: Date.now() }, // Missing e2ee
        { e2ee: {}, server: {}, mode: 'hybrid', timestamp: Date.now() }, // Missing canTranslate
        { e2ee: {}, server: {}, mode: 'hybrid', canTranslate: true }, // Missing timestamp
      ];

      for (const payload of payloads) {
        expect(encryptionService.isValidHybridPayload(payload)).toBe(false);
      }
    });
  });

  describe('Hybrid Encryption Flow - Full Integration', () => {
    it('should support complete encryption-translate-decryption flow', async () => {
      // 1. Client encrypts with Signal Protocol (simulated E2EE data)
      const e2eeData = {
        ciphertext: Buffer.from('signal-protocol-encrypted-data').toString('base64'),
        type: 2, // Whisper
        senderRegistrationId: 12345,
        recipientRegistrationId: 67890,
      };

      // 2. Client also sends plaintext for server layer
      const originalMessage = 'Hello, how are you?';
      const conversationId = 'conv-integration-test';

      // 3. Server creates hybrid payload
      const hybridPayload = await encryptionService.createHybridPayload(
        e2eeData,
        originalMessage,
        conversationId
      );

      expect(hybridPayload.mode).toBe('hybrid');
      expect(hybridPayload.canTranslate).toBe(true);

      // 4. Server decrypts for translation
      const decryptedForTranslation = await encryptionService.decryptHybridServerLayer(
        hybridPayload.server
      );
      expect(decryptedForTranslation).toBe(originalMessage);

      // 5. Server translates and re-encrypts
      const translatedMessage = 'Bonjour, comment allez-vous?';
      const translatedPayload = await encryptionService.translateHybridMessage(
        hybridPayload,
        translatedMessage
      );

      // 6. Verify E2EE layer is unchanged (client can still decrypt original)
      expect(translatedPayload.e2ee.ciphertext).toBe(e2eeData.ciphertext);

      // 7. Verify server layer has translated content
      const decryptedTranslation = await encryptionService.decryptHybridServerLayer(
        translatedPayload.server
      );
      expect(decryptedTranslation).toBe(translatedMessage);
    });

    it('should handle JSON content in messages', async () => {
      const jsonContent = JSON.stringify({
        type: 'message',
        content: 'Hello with metadata',
        metadata: { translated: false, language: 'en' },
      });

      const payload = await encryptionService.createHybridPayload(
        { ciphertext: 'e2ee', type: 2, senderRegistrationId: 1, recipientRegistrationId: 2 },
        jsonContent
      );

      const decrypted = await encryptionService.decryptHybridServerLayer(payload.server);
      expect(decrypted).toBe(jsonContent);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(jsonContent));
    });

    it('should handle special characters in translated content', async () => {
      const originalPayload = await encryptionService.createHybridPayload(
        { ciphertext: 'e2ee', type: 2, senderRegistrationId: 1, recipientRegistrationId: 2 },
        'Original'
      );

      const specialChars = '!@#$%^&*()_+-=[]{}|;:\'",./<>?\\`~\n\t\r 🎉 中文 émojis';
      const translated = await encryptionService.translateHybridMessage(originalPayload, specialChars);

      const decrypted = await encryptionService.decryptHybridServerLayer(translated.server);
      expect(decrypted).toBe(specialChars);
    });
  });
});
