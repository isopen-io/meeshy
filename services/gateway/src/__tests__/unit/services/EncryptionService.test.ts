/**
 * Unit tests for Gateway EncryptionService
 *
 * Tests:
 * - AES-256-GCM encryption/decryption
 * - Key generation and management
 * - Pre-key bundle generation
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  EncryptionService,
  getEncryptionService,
  getEncryptionServiceSync,
  shutdownEncryptionService,
  encryptionService as encryptionServiceProxy,
} from '../../../services/EncryptionService';

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

describe('EncryptionService - Extended Coverage', () => {
  const masterKey = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');

  beforeEach(async () => {
    jest.clearAllMocks();
    keyStorage.clear();
    process.env.ENCRYPTION_MASTER_KEY = masterKey;
    await shutdownEncryptionService();
  });

  afterEach(async () => {
    await shutdownEncryptionService();
  });

  describe('ServerKeyVault constructor - master key validation', () => {
    it('should throw in production when ENCRYPTION_MASTER_KEY is missing', () => {
      const savedEnv = process.env.NODE_ENV;
      delete process.env.ENCRYPTION_MASTER_KEY;
      process.env.NODE_ENV = 'production';
      try {
        expect(() => new EncryptionService(mockPrisma)).toThrow('ENCRYPTION_MASTER_KEY environment variable is required in production');
      } finally {
        process.env.NODE_ENV = savedEnv;
        process.env.ENCRYPTION_MASTER_KEY = masterKey;
      }
    });

    it('should use ephemeral key in development when ENCRYPTION_MASTER_KEY is missing', () => {
      const savedEnv = process.env.NODE_ENV;
      delete process.env.ENCRYPTION_MASTER_KEY;
      process.env.NODE_ENV = 'development';
      try {
        expect(() => new EncryptionService(mockPrisma)).not.toThrow();
      } finally {
        process.env.NODE_ENV = savedEnv;
        process.env.ENCRYPTION_MASTER_KEY = masterKey;
      }
    });

    it('should throw when ENCRYPTION_MASTER_KEY is not exactly 32 bytes', () => {
      process.env.ENCRYPTION_MASTER_KEY = Buffer.from('tooshort').toString('base64');
      try {
        expect(() => new EncryptionService(mockPrisma)).toThrow('ENCRYPTION_MASTER_KEY must be 32 bytes');
      } finally {
        process.env.ENCRYPTION_MASTER_KEY = masterKey;
      }
    });
  });

  describe('initialize', () => {
    it('should be idempotent when called twice', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();
      await service.initialize();
      await service.shutdown();
    });

    it('should load existing conversation key mappings from DB', async () => {
      const keyId = 'preloaded-key-id';
      const convId = 'conv-preloaded';
      keyStorage.set(keyId, {
        id: keyId,
        encryptedKey: 'enc',
        iv: 'iv',
        authTag: 'tag',
        algorithm: 'aes-256-gcm',
        purpose: 'conversation',
        conversationId: convId,
        createdAt: new Date(),
        lastAccessedAt: null,
      });

      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const vault = (service as any).keyVault;
      expect(vault.conversationKeyMap.has(convId)).toBe(true);
      expect(vault.conversationKeyMap.get(convId)).toBe(keyId);
      await service.shutdown();
    });

    it('should throw when keyVault initialize fails', async () => {
      const failPrisma = {
        ...mockPrisma,
        serverEncryptionKey: {
          ...mockPrisma.serverEncryptionKey,
          findMany: jest.fn().mockRejectedValue(new Error('DB connection error')),
        },
      } as any;

      const service = new EncryptionService(failPrisma);
      await expect(service.initialize()).rejects.toThrow('DB connection error');
    });
  });

  describe('getKey - database load path', () => {
    it('should load key from database when not in cache', async () => {
      const service1 = new EncryptionService(mockPrisma);
      await service1.initialize();

      const plaintext = 'DB load test message';
      const encrypted = await service1.encryptMessage(plaintext, 'server', 'conv-db-key');
      await service1.shutdown();

      const service2 = new EncryptionService(mockPrisma);
      await service2.initialize();

      const decrypted = await service2.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
      await service2.shutdown();
    });

    it('should return undefined when key is not in DB', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const vault = (service as any).keyVault;
      const result = await vault.getKey('nonexistent-key-id');
      expect(result).toBeUndefined();
      await service.shutdown();
    });

    it('should return undefined when DB throws during getKey', async () => {
      const failPrisma = {
        ...mockPrisma,
        serverEncryptionKey: {
          ...mockPrisma.serverEncryptionKey,
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn().mockRejectedValue(new Error('DB read error')),
        },
      } as any;

      const service = new EncryptionService(failPrisma);
      await service.initialize();

      const vault = (service as any).keyVault;
      const result = await vault.getKey('any-key');
      expect(result).toBeUndefined();
      await service.shutdown();
    });
  });

  describe('generateKey - error path', () => {
    it('should throw when database create fails', async () => {
      const failPrisma = {
        ...mockPrisma,
        serverEncryptionKey: {
          ...mockPrisma.serverEncryptionKey,
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockRejectedValue(new Error('DB create failed')),
        },
      } as any;

      const service = new EncryptionService(failPrisma);
      await service.initialize();

      const vault = (service as any).keyVault;
      await expect(vault.generateKey('conv-fail')).rejects.toThrow('DB create failed');
    });
  });

  describe('setConversationKey - error path', () => {
    it('should silently log when database update fails', async () => {
      const failPrisma = {
        ...mockPrisma,
        serverEncryptionKey: {
          ...mockPrisma.serverEncryptionKey,
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation((args: any) => {
            keyStorage.set(args.data.id, { ...args.data, lastAccessedAt: null });
            return Promise.resolve(args.data);
          }),
          update: jest.fn().mockRejectedValue(new Error('Update failed')),
        },
      } as any;

      const service = new EncryptionService(failPrisma);
      await service.initialize();

      const vault = (service as any).keyVault;
      await expect(vault.setConversationKey('conv-1', 'key-1')).resolves.toBeUndefined();
      expect(vault.conversationKeyMap.get('conv-1')).toBe('key-1');
      await service.shutdown();
    });
  });

  describe('cache management', () => {
    it('should evict oldest entries when cache is full', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const vault = (service as any).keyVault;
      const cache: Map<string, any> = vault.keyCache;
      const now = Date.now();

      for (let i = 0; i < 500; i++) {
        cache.set(`fill-key-${i}`, { key: Buffer.from('x'), lastAccessed: now - (500 - i) });
      }
      expect(cache.size).toBe(500);

      await service.getOrCreateConversationKey('conv-evict');

      expect(cache.size).toBeLessThan(460);
      await service.shutdown();
    });

    it('should cleanup expired cache entries', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const vault = (service as any).keyVault;
      const cache: Map<string, any> = vault.keyCache;
      const now = Date.now();
      const TTL = 30 * 60 * 1000;

      cache.set('stale', { key: Buffer.from('x'), lastAccessed: now - TTL - 1000 });
      cache.set('fresh', { key: Buffer.from('y'), lastAccessed: now });

      vault.cleanupCache();

      expect(cache.has('stale')).toBe(false);
      expect(cache.has('fresh')).toBe(true);
      await service.shutdown();
    });

    it('should zeroize and clear all keys on clearAllKeys', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      await service.encryptMessage('test', 'server', 'conv-clear');

      const vault = (service as any).keyVault;
      vault.clearAllKeys();

      expect((vault.keyCache as Map<any, any>).size).toBe(0);
      expect((vault.conversationKeyMap as Map<any, any>).size).toBe(0);
      await service.shutdown();
    });
  });

  describe('getOrCreateConversationKey - concurrency and error paths', () => {
    it('should deduplicate concurrent requests for same conversation', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const [id1, id2] = await Promise.all([
        service.getOrCreateConversationKey('conv-concurrent'),
        service.getOrCreateConversationKey('conv-concurrent'),
      ]);

      expect(id1).toBe(id2);
      await service.shutdown();
    });

    it('should return the key found by double-check after lock acquisition', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const convId = 'conv-double-check';
      const firstId = await service.getOrCreateConversationKey(convId);

      const vault = (service as any).keyVault;
      const locks = (service as any).keyGenerationLocks as Map<string, any>;
      const existingId = vault.getConversationKeyId(convId);

      let capturedResolve: (v: string) => void;
      const lockPromise = new Promise<string>((resolve) => { capturedResolve = resolve; });
      locks.set(convId, { promise: lockPromise, resolve: capturedResolve! });

      capturedResolve!(existingId);
      const result = await lockPromise;
      expect(result).toBe(firstId);
      await service.shutdown();
    });

    it('should throw and remove lock when key generation fails', async () => {
      const failPrisma = {
        ...mockPrisma,
        serverEncryptionKey: {
          ...mockPrisma.serverEncryptionKey,
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockRejectedValue(new Error('Key gen failure')),
        },
      } as any;

      const service = new EncryptionService(failPrisma);
      await service.initialize();

      await expect(service.getOrCreateConversationKey('conv-fail')).rejects.toThrow('Key gen failure');

      const locks = (service as any).keyGenerationLocks as Map<string, any>;
      expect(locks.has('conv-fail')).toBe(false);
    });
  });

  describe('encryptMessage - key not found edge case', () => {
    it('should throw when key is unavailable after creation', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const vault = (service as any).keyVault;
      jest.spyOn(vault, 'getKey').mockResolvedValueOnce(undefined);

      await expect(service.encryptMessage('test', 'server')).rejects.toThrow('Encryption key not found');
      await service.shutdown();
    });
  });

  describe('translateAndReEncrypt - key not found', () => {
    it('should throw when key not available for re-encryption', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const vault = (service as any).keyVault;
      jest.spyOn(vault, 'getKey').mockResolvedValueOnce(undefined);

      const payload = {
        ciphertext: 'test',
        metadata: {
          mode: 'server' as const,
          protocol: 'aes-256-gcm',
          keyId: 'missing-key',
          iv: Buffer.from('123456789012').toString('base64'),
          authTag: Buffer.from('1234567890123456').toString('base64'),
        },
      };

      await expect(service.translateAndReEncrypt(payload, 'translated'))
        .rejects.toThrow('Encryption key not found');
      await service.shutdown();
    });
  });

  describe('hybrid encryption', () => {
    it('should encrypt and decrypt a hybrid server layer', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const plaintext = 'Hybrid message content';
      const serverLayer = await service.encryptHybridServerLayer(plaintext, 'conv-hybrid');

      expect(serverLayer.ciphertext).toBeTruthy();
      expect(serverLayer.iv).toBeTruthy();
      expect(serverLayer.authTag).toBeTruthy();
      expect(serverLayer.keyId).toBeTruthy();

      const decrypted = await service.decryptHybridServerLayer(serverLayer);
      expect(decrypted).toBe(plaintext);
      await service.shutdown();
    });

    it('should throw when decryptHybridServerLayer key not found', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const serverLayer = { ciphertext: 'test', iv: 'iv', authTag: 'tag', keyId: 'missing-key' };
      await expect(service.decryptHybridServerLayer(serverLayer)).rejects.toThrow('Decryption key not found');
      await service.shutdown();
    });

    it('should create a complete hybrid payload', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const e2eeData = {
        ciphertext: 'e2ee-cipher',
        type: 1,
        senderRegistrationId: 100,
        recipientRegistrationId: 200,
      };

      const payload = await service.createHybridPayload(e2eeData, 'Hello world', 'conv-hybrid-2');

      expect(payload.mode).toBe('hybrid');
      expect(payload.canTranslate).toBe(true);
      expect(payload.e2ee).toEqual(e2eeData);
      expect(payload.server.ciphertext).toBeTruthy();
      expect(typeof payload.timestamp).toBe('number');
      await service.shutdown();
    });

    it('should translate a hybrid message successfully', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const e2eeData = { ciphertext: 'e2ee', type: 1, senderRegistrationId: 1, recipientRegistrationId: 2 };
      const original = await service.createHybridPayload(e2eeData, 'Hello world', 'conv-translate');
      const translated = await service.translateHybridMessage(original, 'Bonjour le monde');

      expect(translated.mode).toBe('hybrid');
      expect(translated.e2ee).toEqual(e2eeData);
      expect(translated.canTranslate).toBe(true);

      const decrypted = await service.decryptHybridServerLayer(translated.server);
      expect(decrypted).toBe('Bonjour le monde');
      await service.shutdown();
    });

    it('should throw when translateHybridMessage payload is not translatable', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const payload = {
        e2ee: { ciphertext: 'test', type: 1, senderRegistrationId: 1, recipientRegistrationId: 2 },
        server: { ciphertext: 'test', iv: 'iv', authTag: 'tag', keyId: 'key' },
        mode: 'hybrid' as const,
        canTranslate: false,
        timestamp: Date.now(),
      };

      await expect(service.translateHybridMessage(payload, 'translation'))
        .rejects.toThrow('Message does not support server-side translation');
      await service.shutdown();
    });

    it('should throw when translateHybridMessage key not found', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const vault = (service as any).keyVault;
      jest.spyOn(vault, 'getKey').mockResolvedValueOnce(undefined);

      const payload = {
        e2ee: { ciphertext: 'test', type: 1, senderRegistrationId: 1, recipientRegistrationId: 2 },
        server: { ciphertext: 'test', iv: 'iv', authTag: 'tag', keyId: 'missing' },
        mode: 'hybrid' as const,
        canTranslate: true,
        timestamp: Date.now(),
      };

      await expect(service.translateHybridMessage(payload, 'translation'))
        .rejects.toThrow('Encryption key not found');
      await service.shutdown();
    });

    it('should validate hybrid payload structure', () => {
      const service = new EncryptionService(mockPrisma);

      expect(service.isValidHybridPayload(null)).toBe(false);
      expect(service.isValidHybridPayload(undefined)).toBe(false);
      expect(service.isValidHybridPayload('string')).toBe(false);
      expect(service.isValidHybridPayload(42)).toBe(false);
      expect(service.isValidHybridPayload({})).toBe(false);
      expect(service.isValidHybridPayload({ mode: 'server' })).toBe(false);
      expect(service.isValidHybridPayload({ mode: 'hybrid' })).toBe(false);
      expect(service.isValidHybridPayload({ mode: 'hybrid', canTranslate: true })).toBe(false);

      const valid = {
        mode: 'hybrid',
        canTranslate: true,
        timestamp: Date.now(),
        e2ee: { ciphertext: 'test', type: 1, senderRegistrationId: 1, recipientRegistrationId: 2 },
        server: { ciphertext: 'test', iv: 'iv', authTag: 'tag', keyId: 'key' },
      };
      expect(service.isValidHybridPayload(valid)).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('should shutdown cleanly after initialize', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();
      await expect(service.shutdown()).resolves.toBeUndefined();
      expect((service as any).initialized).toBe(false);
    });

    it('should be safe to shutdown without initializing', async () => {
      const service = new EncryptionService(mockPrisma);
      await expect(service.shutdown()).resolves.toBeUndefined();
    });

    it('should call clearAllSensitiveData on signalService during shutdown', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const mockSignalSvc = { clearAllSensitiveData: jest.fn() };
      (service as any).signalService = mockSignalSvc;

      await service.shutdown();

      expect(mockSignalSvc.clearAllSensitiveData).toHaveBeenCalledTimes(1);
    });
  });

  describe('getEncryptionServiceSync', () => {
    it('should throw when singleton is not initialized', () => {
      expect(() => getEncryptionServiceSync()).toThrow('Encryption service not initialized. Call getEncryptionService(prisma) first.');
    });

    it('should return the instance after initialization', async () => {
      const instance = await getEncryptionService(mockPrisma);
      expect(getEncryptionServiceSync()).toBe(instance);
    });
  });

  describe('encryptionService singleton proxy', () => {
    it('getOrCreateConversationKey should throw when singleton not initialized', async () => {
      await expect(encryptionServiceProxy.getOrCreateConversationKey())
        .rejects.toThrow('Encryption service not initialized');
    });

    it('generatePreKeyBundle should throw when singleton not initialized', async () => {
      await expect(encryptionServiceProxy.generatePreKeyBundle())
        .rejects.toThrow('Encryption service not initialized');
    });

    it('getSignalService should return null when singleton not initialized', () => {
      expect(encryptionServiceProxy.getSignalService()).toBeNull();
    });

    it('getSignalService should return value when singleton is initialized', async () => {
      await getEncryptionService(mockPrisma);
      const result = encryptionServiceProxy.getSignalService();
      expect(result).toBeNull();
    });
  });

  describe('shutdownEncryptionService', () => {
    it('should be safe to call when no singleton exists', async () => {
      await expect(shutdownEncryptionService()).resolves.toBeUndefined();
    });

    it('should shutdown and nullify the singleton', async () => {
      await getEncryptionService(mockPrisma);
      await shutdownEncryptionService();
      expect(() => getEncryptionServiceSync()).toThrow('Encryption service not initialized');
    });
  });

  describe('getKey - fire-and-forget update failure', () => {
    it('should log warning when lastAccessedAt update fails after DB load', async () => {
      const failUpdatePrisma = {
        ...mockPrisma,
        serverEncryptionKey: {
          ...mockPrisma.serverEncryptionKey,
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation((args: any) => {
            keyStorage.set(args.data.id, { ...args.data, lastAccessedAt: null });
            return Promise.resolve(args.data);
          }),
          findUnique: jest.fn().mockImplementation((args: any) => {
            return Promise.resolve(keyStorage.get(args.where.id) || null);
          }),
          update: jest.fn().mockRejectedValue(new Error('Update lastAccessed failed')),
        },
      } as any;

      const service1 = new EncryptionService(mockPrisma);
      await service1.initialize();
      const encrypted = await service1.encryptMessage('test', 'server', 'conv-fa');
      await service1.shutdown();

      const service2 = new EncryptionService(failUpdatePrisma);
      await service2.initialize();

      const decrypted = await service2.decryptMessage(encrypted);
      expect(decrypted).toBe('test');

      await new Promise((r) => setTimeout(r, 20));
      await service2.shutdown();
    });
  });

  describe('getOrCreateConversationKey - double-check after lock', () => {
    it('should return early in double-check when key already in conversationKeyMap', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const vault = (service as any).keyVault;
      const convId = 'conv-double-check-real';

      let callCount = 0;
      jest.spyOn(vault, 'getConversationKeyId').mockImplementation(() => {
        callCount++;
        if (callCount === 1) return undefined;
        return 'existing-key-after-lock';
      });

      const result = await service.getOrCreateConversationKey(convId);
      expect(result).toBe('existing-key-after-lock');
      await service.shutdown();
    });
  });

  describe('encryptHybridServerLayer - key not found', () => {
    it('should throw when key is unavailable after creation', async () => {
      const service = new EncryptionService(mockPrisma);
      await service.initialize();

      const vault = (service as any).keyVault;
      jest.spyOn(vault, 'getKey').mockResolvedValueOnce(undefined);

      await expect(service.encryptHybridServerLayer('plaintext')).rejects.toThrow('Encryption key not found');
      await service.shutdown();
    });
  });

  describe('encryptionService singleton proxy - when initialized', () => {
    it('getOrCreateConversationKey should delegate to singleton', async () => {
      await getEncryptionService(mockPrisma);
      const keyId = await encryptionServiceProxy.getOrCreateConversationKey();
      expect(keyId).toBeTruthy();
      expect(keyId).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('generatePreKeyBundle should delegate to singleton', async () => {
      await getEncryptionService(mockPrisma);
      const bundle = await encryptionServiceProxy.generatePreKeyBundle();
      expect(bundle).toBeDefined();
      expect(bundle.identityKey).toBeInstanceOf(Uint8Array);
    });
  });
});
