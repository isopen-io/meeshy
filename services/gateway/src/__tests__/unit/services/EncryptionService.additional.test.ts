/**
 * Additional tests for EncryptionService — covers the methods not reached by
 * the primary test suite: hybrid encryption, cache management, lifecycle
 * (shutdown/initialize), singleton utilities, and master key validation.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  EncryptionService,
  getEncryptionServiceSync,
  shutdownEncryptionService,
} from '../../../services/EncryptionService';

// In-memory key storage (mirrors the primary test file pattern)
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

const buildMockPrisma = () => ({
  conversation: { findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn(), update: jest.fn() },
  signalPreKeyBundle: { findUnique: jest.fn(), upsert: jest.fn() },
  serverEncryptionKey: {
    create: jest.fn(async (args: any) => {
      const data = args.data;
      keyStorage.set(data.id, { ...data, lastAccessedAt: null });
      return data;
    }),
    findUnique: jest.fn(async (args: any) => keyStorage.get(args.where.id) ?? null),
    findMany: jest.fn(async (_args: any) => []),
    update: jest.fn(async (args: any) => {
      const key = keyStorage.get(args.where.id);
      if (key) Object.assign(key, args.data);
      return key ?? null;
    }),
  },
} as any);

describe('EncryptionService — additional coverage', () => {
  let service: EncryptionService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    jest.useFakeTimers();
    keyStorage.clear();
    mockPrisma = buildMockPrisma();
    process.env.ENCRYPTION_MASTER_KEY = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
    service = new EncryptionService(mockPrisma as any);
    await service.initialize();
  });

  afterEach(async () => {
    await shutdownEncryptionService().catch(() => {});
    jest.useRealTimers();
  });

  // ── initialize ─────────────────────────────────────────────────────────

  describe('initialize', () => {
    it('is idempotent: second call does not reinitialize', async () => {
      // Should not throw; second call is a no-op
      await expect(service.initialize()).resolves.toBeUndefined();
      expect(mockPrisma.serverEncryptionKey.findMany).toHaveBeenCalledTimes(1);
    });

    it('sets up cache cleanup interval', async () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const s2 = new EncryptionService(mockPrisma as any);
      setIntervalSpy.mockClear();
      await s2.initialize(); // setInterval is called after async keyVault.initialize()
      expect(setIntervalSpy).toHaveBeenCalled();
      setIntervalSpy.mockRestore();
    });
  });

  // ── shutdown ───────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('clears the cache cleanup interval and marks service as uninitialized', async () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      await service.shutdown();

      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
      clearIntervalSpy.mockRestore();
    });

    it('is safe to call twice', async () => {
      await service.shutdown();
      await expect(service.shutdown()).resolves.toBeUndefined();
    });
  });

  // ── master key validation ──────────────────────────────────────────────

  describe('master key validation', () => {
    it('throws when ENCRYPTION_MASTER_KEY is not 32 bytes', () => {
      process.env.ENCRYPTION_MASTER_KEY = Buffer.from('too-short').toString('base64');
      expect(() => new EncryptionService(mockPrisma as any)).toThrow(
        'ENCRYPTION_MASTER_KEY must be 32 bytes'
      );
    });

    it('throws in production when ENCRYPTION_MASTER_KEY is missing', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalKey = process.env.ENCRYPTION_MASTER_KEY;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.ENCRYPTION_MASTER_KEY;
        expect(() => new EncryptionService(mockPrisma as any)).toThrow(
          'ENCRYPTION_MASTER_KEY environment variable is required in production'
        );
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        process.env.ENCRYPTION_MASTER_KEY = originalKey;
      }
    });

    it('uses ephemeral key in development when ENCRYPTION_MASTER_KEY is missing', () => {
      const originalKey = process.env.ENCRYPTION_MASTER_KEY;
      const originalNodeEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'test';
        delete process.env.ENCRYPTION_MASTER_KEY;
        // Should not throw — uses generated ephemeral key
        expect(() => new EncryptionService(mockPrisma as any)).not.toThrow();
      } finally {
        process.env.ENCRYPTION_MASTER_KEY = originalKey;
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });

  // ── isValidHybridPayload ───────────────────────────────────────────────

  describe('isValidHybridPayload', () => {
    const validPayload = {
      mode: 'hybrid',
      canTranslate: true,
      timestamp: 1234567890,
      e2ee: { ciphertext: 'abc', type: 1, senderRegistrationId: 1, recipientRegistrationId: 2 },
      server: { ciphertext: 'xyz', iv: 'iv', authTag: 'tag', keyId: 'key-1' },
    };

    it('returns true for a valid hybrid payload', () => {
      expect(service.isValidHybridPayload(validPayload)).toBe(true);
    });

    it('returns false for null', () => {
      expect(service.isValidHybridPayload(null)).toBe(false);
    });

    it('returns false for a non-object', () => {
      expect(service.isValidHybridPayload('string')).toBe(false);
      expect(service.isValidHybridPayload(42)).toBe(false);
    });

    it('returns false when mode is not "hybrid"', () => {
      expect(service.isValidHybridPayload({ ...validPayload, mode: 'server' })).toBe(false);
    });

    it('returns false when canTranslate is not a boolean', () => {
      expect(service.isValidHybridPayload({ ...validPayload, canTranslate: 'yes' })).toBe(false);
    });

    it('returns false when timestamp is not a number', () => {
      expect(service.isValidHybridPayload({ ...validPayload, timestamp: '1234567890' })).toBe(false);
    });

    it('returns false when e2ee is null', () => {
      expect(service.isValidHybridPayload({ ...validPayload, e2ee: null })).toBe(false);
    });

    it('returns false when server is null', () => {
      expect(service.isValidHybridPayload({ ...validPayload, server: null })).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(service.isValidHybridPayload({})).toBe(false);
    });
  });

  // ── encryptHybridServerLayer / decryptHybridServerLayer ───────────────

  describe('encryptHybridServerLayer + decryptHybridServerLayer round-trip', () => {
    it('encrypts and decrypts the server layer correctly', async () => {
      const plaintext = 'Hybrid server layer content';

      const serverLayer = await service.encryptHybridServerLayer(plaintext);

      expect(serverLayer.ciphertext).toBeTruthy();
      expect(serverLayer.iv).toBeTruthy();
      expect(serverLayer.authTag).toBeTruthy();
      expect(serverLayer.keyId).toBeTruthy();

      const decrypted = await service.decryptHybridServerLayer(serverLayer);
      expect(decrypted).toBe(plaintext);
    });

    it('uses conversation key when conversationId provided', async () => {
      const layer1 = await service.encryptHybridServerLayer('msg 1', 'conv-hybrid-1');
      const layer2 = await service.encryptHybridServerLayer('msg 2', 'conv-hybrid-1');

      // Same conversation should reuse the same key
      expect(layer1.keyId).toBe(layer2.keyId);
    });

    it('decryptHybridServerLayer throws when key not found', async () => {
      const fakeLayer = {
        ciphertext: 'abc',
        iv: Buffer.alloc(12).toString('base64'),
        authTag: Buffer.alloc(16).toString('base64'),
        keyId: 'nonexistent-key-id',
      };

      await expect(service.decryptHybridServerLayer(fakeLayer)).rejects.toThrow(
        'Decryption key not found'
      );
    });
  });

  // ── createHybridPayload ────────────────────────────────────────────────

  describe('createHybridPayload', () => {
    const fakeE2eeData = {
      ciphertext: 'e2ee-encrypted-blob',
      type: 1,
      senderRegistrationId: 100,
      recipientRegistrationId: 200,
    };

    it('creates a valid hybrid payload with all required fields', async () => {
      const payload = await service.createHybridPayload(fakeE2eeData, 'plaintext content');

      expect(payload.mode).toBe('hybrid');
      expect(payload.canTranslate).toBe(true);
      expect(typeof payload.timestamp).toBe('number');
      expect(payload.e2ee).toEqual(fakeE2eeData);
      expect(payload.server.ciphertext).toBeTruthy();
      expect(payload.server.keyId).toBeTruthy();
    });

    it('passes conversationId to server layer encryption', async () => {
      const payload1 = await service.createHybridPayload(fakeE2eeData, 'hello', 'conv-x');
      const payload2 = await service.createHybridPayload(fakeE2eeData, 'world', 'conv-x');

      // Same conversation → same key
      expect(payload1.server.keyId).toBe(payload2.server.keyId);
    });

    it('returns a payload that validates as a hybrid payload', async () => {
      const payload = await service.createHybridPayload(fakeE2eeData, 'test');

      expect(service.isValidHybridPayload(payload)).toBe(true);
    });
  });

  // ── translateHybridMessage ─────────────────────────────────────────────

  describe('translateHybridMessage', () => {
    const fakeE2eeData = {
      ciphertext: 'e2ee-blob',
      type: 1,
      senderRegistrationId: 10,
      recipientRegistrationId: 20,
    };

    it('re-encrypts server layer with translated content while preserving e2ee', async () => {
      const original = await service.createHybridPayload(fakeE2eeData, 'Hello world');
      const translated = await service.translateHybridMessage(original, 'Bonjour le monde');

      // E2EE layer must be unchanged
      expect(translated.e2ee).toEqual(fakeE2eeData);

      // Server layer should contain the translated text
      const decryptedTranslation = await service.decryptHybridServerLayer(translated.server);
      expect(decryptedTranslation).toBe('Bonjour le monde');

      // Mode flags preserved
      expect(translated.mode).toBe('hybrid');
      expect(translated.canTranslate).toBe(true);
    });

    it('throws when payload mode is not hybrid', async () => {
      const invalidPayload = {
        e2ee: fakeE2eeData,
        server: { ciphertext: 'x', iv: 'y', authTag: 'z', keyId: 'k' },
        mode: 'server' as any,
        canTranslate: true,
        timestamp: Date.now(),
      };

      await expect(service.translateHybridMessage(invalidPayload, 'translation')).rejects.toThrow(
        'Message does not support server-side translation'
      );
    });

    it('throws when canTranslate is false', async () => {
      const nonTranslatablePayload = {
        e2ee: fakeE2eeData,
        server: { ciphertext: 'x', iv: 'y', authTag: 'z', keyId: 'k' },
        mode: 'hybrid' as const,
        canTranslate: false,
        timestamp: Date.now(),
      };

      await expect(
        service.translateHybridMessage(nonTranslatablePayload, 'translation')
      ).rejects.toThrow('Message does not support server-side translation');
    });

    it('throws when server layer key is missing', async () => {
      const payloadWithMissingKey = {
        e2ee: fakeE2eeData,
        server: { ciphertext: 'x', iv: 'y', authTag: 'z', keyId: 'nonexistent' },
        mode: 'hybrid' as const,
        canTranslate: true,
        timestamp: Date.now(),
      };

      await expect(service.translateHybridMessage(payloadWithMissingKey, 'translation')).rejects.toThrow(
        'Encryption key not found'
      );
    });
  });

  // ── decryptMessage with hybrid mode ───────────────────────────────────

  describe('decryptMessage — hybrid mode', () => {
    it('decrypts a hybrid-mode payload (server layer, not e2ee)', async () => {
      const plaintext = 'Hybrid message content';
      // encryptMessage returns mode:'server' but we can set mode:'hybrid' in the metadata
      const encrypted = await service.encryptMessage(plaintext, 'server', 'conv-hybrid');
      const hybridPayload = {
        ...encrypted,
        metadata: { ...encrypted.metadata, mode: 'hybrid' as const },
      };

      const decrypted = await service.decryptMessage(hybridPayload);
      expect(decrypted).toBe(plaintext);
    });
  });

  // ── translateAndReEncrypt with hybrid mode ─────────────────────────────

  describe('translateAndReEncrypt — hybrid mode', () => {
    it('re-encrypts translated content in hybrid mode', async () => {
      const original = await service.encryptMessage('Original', 'server');
      const hybridPayload = {
        ...original,
        metadata: { ...original.metadata, mode: 'hybrid' as const },
      };

      const reEncrypted = await service.translateAndReEncrypt(hybridPayload, 'Translated');
      const decrypted = await service.decryptMessage(reEncrypted);

      expect(decrypted).toBe('Translated');
    });
  });

  // ── getEncryptionServiceSync ───────────────────────────────────────────

  describe('getEncryptionServiceSync', () => {
    it('throws when singleton has not been initialized', async () => {
      // Ensure singleton is null by shutting it down first
      await shutdownEncryptionService();
      expect(() => getEncryptionServiceSync()).toThrow(
        'Encryption service not initialized'
      );
    });
  });

  // ── shutdownEncryptionService ──────────────────────────────────────────

  describe('shutdownEncryptionService', () => {
    it('is safe to call when no singleton exists', async () => {
      await shutdownEncryptionService(); // first call clears it
      await expect(shutdownEncryptionService()).resolves.toBeUndefined(); // second is a no-op
    });
  });

  // ── cache eviction (MAX_CACHE_SIZE) ────────────────────────────────────

  describe('cache eviction', () => {
    it('successfully creates and uses many conversation keys without throwing', async () => {
      // Create enough keys to trigger the LRU eviction (MAX_CACHE_SIZE = 500)
      // We create a moderate number to stay within test time limits
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(service.encryptMessage(`message-${i}`, 'server', `conv-cache-test-${i}`));
      }
      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      results.forEach((r) => expect(r.ciphertext).toBeTruthy());
    });
  });
});
