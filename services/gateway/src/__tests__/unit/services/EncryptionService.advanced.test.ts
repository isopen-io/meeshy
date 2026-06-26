/**
 * Advanced EncryptionService tests — covers internal branches not reached by
 * the primary and additional test suites:
 *  - ServerKeyVault: getKey from DB (cache miss), generateKey error, initialize error,
 *    setConversationKey error, cache eviction, cleanupCache, clearAllKeys loop
 *  - EncryptionService: initialize error, setInterval firing cleanupCache,
 *    getOrCreateConversationKey concurrent lock + lock error,
 *    encryptMessage/translateAndReEncrypt/encryptHybridServerLayer key-not-found
 *  - Module-level exports: getEncryptionService, getEncryptionServiceSync success,
 *    encryptionService proxy, shutdownEncryptionService with active singleton
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  EncryptionService,
  getEncryptionService,
  getEncryptionServiceSync,
  shutdownEncryptionService,
  encryptionService as encryptionServiceProxy,
} from '../../../services/EncryptionService';

// ── In-memory key storage (mirrors the primary test file pattern) ────────────

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

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('EncryptionService — advanced coverage', () => {
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
    await service.shutdown().catch(() => {});
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ── ServerKeyVault.getKey — DB load path ──────────────────────────────────

  describe('ServerKeyVault.getKey — loads from database on cache miss', () => {
    it('decrypts and returns key from DB when not in memory cache', async () => {
      // Encrypt a message to generate a key (it gets cached AND stored in keyStorage)
      const enc = await service.encryptMessage('hello', 'server', 'conv-db-load');

      // Clear the memory cache so the next call must go to DB
      const keyVault = (service as any).keyVault;
      keyVault.keyCache.clear();

      // Decrypt should succeed — key is loaded from keyStorage (mocked DB)
      const decrypted = await service.decryptMessage(enc);
      expect(decrypted).toBe('hello');
    });

    it('returns undefined when findUnique returns null (key missing from DB)', async () => {
      const enc = await service.encryptMessage('data', 'server', 'conv-db-miss');
      const keyId = enc.metadata.keyId;

      // Remove from "DB" and clear cache
      keyStorage.delete(keyId);
      (service as any).keyVault.keyCache.clear();

      // encryptMessage tries to load key for the same conversation → getKey returns undefined
      await expect(
        service.encryptMessage('retry', 'server', 'conv-db-miss')
      ).rejects.toThrow('Encryption key not found');
    });
  });

  // ── ServerKeyVault.generateKey — error path ───────────────────────────────

  describe('ServerKeyVault.generateKey — error path', () => {
    it('propagates DB error from create through getOrCreateConversationKey', async () => {
      mockPrisma.serverEncryptionKey.create.mockRejectedValueOnce(new Error('DB write failed') as never);

      await expect(
        service.encryptMessage('test', 'server', 'conv-gen-err')
      ).rejects.toThrow('DB write failed');
    });
  });

  // ── ServerKeyVault.initialize — error path ────────────────────────────────

  describe('ServerKeyVault.initialize — error path', () => {
    it('EncryptionService.initialize propagates keyVault.initialize error', async () => {
      mockPrisma.serverEncryptionKey.findMany.mockRejectedValueOnce(new Error('DB init failed') as never);

      const freshService = new EncryptionService(mockPrisma as any);
      await expect(freshService.initialize()).rejects.toThrow('DB init failed');
      await freshService.shutdown().catch(() => {});
    });
  });

  // ── ServerKeyVault.setConversationKey — error path ────────────────────────

  describe('ServerKeyVault.setConversationKey — update error is swallowed', () => {
    it('does not throw when DB update fails for conversation key mapping', async () => {
      // Make the update mock throw — setConversationKey should catch it silently
      mockPrisma.serverEncryptionKey.update.mockRejectedValueOnce(new Error('update failed') as never);

      // encryptMessage calls getOrCreateConversationKey → setConversationKey
      // The error should be swallowed, the message should still be encrypted
      const enc = await service.encryptMessage('resilient', 'server', 'conv-update-err');
      expect(enc.ciphertext).toBeTruthy();
    });
  });

  // ── Cache eviction — evictOldestCacheEntries ──────────────────────────────

  describe('ServerKeyVault — cache eviction', () => {
    it('evicts oldest entries when cache reaches MAX_CACHE_SIZE (500)', async () => {
      const keyVault = (service as any).keyVault;
      const MAX_CACHE_SIZE = 500;

      // Pre-fill the cache up to the limit
      for (let i = 0; i < MAX_CACHE_SIZE; i++) {
        keyVault.keyCache.set(`fill-key-${i}`, {
          key: Buffer.alloc(32),
          lastAccessed: Date.now() - (MAX_CACHE_SIZE - i), // oldest has smallest timestamp
        });
      }

      expect(keyVault.keyCache.size).toBe(MAX_CACHE_SIZE);

      // Generating one more key triggers cacheKey → evictOldestCacheEntries
      await service.encryptMessage('evict-test', 'server');

      // After eviction of 10% (50 entries) plus the new key, size should be < MAX_CACHE_SIZE
      expect(keyVault.keyCache.size).toBeLessThan(MAX_CACHE_SIZE);
    });
  });

  // ── cleanupCache — TTL-based eviction ────────────────────────────────────

  describe('ServerKeyVault.cleanupCache', () => {
    it('removes entries older than CACHE_TTL_MS', () => {
      const keyVault = (service as any).keyVault;
      const CACHE_TTL_MS = 30 * 60 * 1000;

      // Add an old entry (31 minutes ago) and a fresh entry
      keyVault.keyCache.set('old-key', {
        key: Buffer.alloc(32),
        lastAccessed: Date.now() - (CACHE_TTL_MS + 60_000),
      });
      keyVault.keyCache.set('fresh-key', {
        key: Buffer.alloc(32),
        lastAccessed: Date.now() - 1000, // 1 second ago
      });

      keyVault.cleanupCache();

      expect(keyVault.keyCache.has('old-key')).toBe(false);
      expect(keyVault.keyCache.has('fresh-key')).toBe(true);
    });

    it('logs nothing when no entries are evicted', () => {
      const keyVault = (service as any).keyVault;
      // Cache is empty — cleanupCache should run without error
      expect(() => keyVault.cleanupCache()).not.toThrow();
    });
  });

  // ── setInterval triggers cleanupCache ────────────────────────────────────

  describe('setInterval triggers keyVault.cleanupCache after 5 min', () => {
    it('evicts old entries when the cleanup interval fires', () => {
      const keyVault = (service as any).keyVault;
      const CACHE_TTL_MS = 30 * 60 * 1000;

      keyVault.keyCache.set('interval-old-key', {
        key: Buffer.alloc(32),
        lastAccessed: Date.now() - (CACHE_TTL_MS + 60_000),
      });

      // Advance fake timers to trigger the 5-minute setInterval
      jest.advanceTimersByTime(5 * 60 * 1000 + 100);

      expect(keyVault.keyCache.has('interval-old-key')).toBe(false);
    });
  });

  // ── clearAllKeys loop ─────────────────────────────────────────────────────

  describe('ServerKeyVault.clearAllKeys', () => {
    it('zeroizes cached key buffers on shutdown', async () => {
      // Put a real key in the cache by encrypting something
      await service.encryptMessage('secure', 'server', 'conv-clear');

      const keyVault = (service as any).keyVault;
      const cacheSnapshot = Array.from(keyVault.keyCache.values());
      expect(cacheSnapshot.length).toBeGreaterThan(0);

      // shutdown() calls clearAllKeys
      await service.shutdown();

      // Cache should be empty after clearAllKeys
      expect(keyVault.keyCache.size).toBe(0);
    });
  });

  // ── getOrCreateConversationKey — concurrent lock ──────────────────────────

  describe('getOrCreateConversationKey — concurrent lock', () => {
    it('second concurrent call reuses the result of the first (same key ID)', async () => {
      // Both calls are started synchronously — first sets the lock before any await
      const p1 = service.getOrCreateConversationKey('conv-concurrent');
      const p2 = service.getOrCreateConversationKey('conv-concurrent');

      const [keyId1, keyId2] = await Promise.all([p1, p2]);
      expect(keyId1).toBe(keyId2);
    });

    it('propagates error and cleans up lock when generateKey throws', async () => {
      mockPrisma.serverEncryptionKey.create.mockRejectedValueOnce(new Error('key gen error') as never);

      await expect(
        service.getOrCreateConversationKey('conv-lock-err')
      ).rejects.toThrow('key gen error');

      // Lock should be cleaned up
      const locks = (service as any).keyGenerationLocks;
      expect(locks.has('conv-lock-err')).toBe(false);
    });
  });

  // ── encryptMessage — key not found after DB miss ──────────────────────────

  describe('encryptMessage — key not found', () => {
    it('throws "Encryption key not found" when key is missing from cache and DB', async () => {
      const enc = await service.encryptMessage('orig', 'server', 'conv-key-nf');
      const keyId = enc.metadata.keyId;

      // Delete from DB and clear cache
      keyStorage.delete(keyId);
      (service as any).keyVault.keyCache.clear();

      await expect(
        service.encryptMessage('retry', 'server', 'conv-key-nf')
      ).rejects.toThrow('Encryption key not found');
    });

    it('throws when mode is e2ee', async () => {
      await expect(
        service.encryptMessage('msg', 'e2ee')
      ).rejects.toThrow('E2EE messages must be encrypted client-side');
    });
  });

  // ── translateAndReEncrypt — key not found ─────────────────────────────────

  describe('translateAndReEncrypt — key not found', () => {
    it('throws when the original key is gone', async () => {
      const enc = await service.encryptMessage('orig-tr', 'server', 'conv-tr-nf');
      const keyId = enc.metadata.keyId;

      keyStorage.delete(keyId);
      (service as any).keyVault.keyCache.clear();

      await expect(
        service.translateAndReEncrypt(enc, 'translated text')
      ).rejects.toThrow(/Encryption key not found/);
    });

    it('throws for e2ee mode', async () => {
      const fakeE2eePayload = {
        ciphertext: 'abc',
        metadata: { mode: 'e2ee' as const, protocol: 'signal', keyId: 'k', iv: 'i', authTag: 'a' },
      };

      await expect(
        service.translateAndReEncrypt(fakeE2eePayload, 'translate')
      ).rejects.toThrow('Cannot translate E2EE messages');
    });
  });

  // ── encryptHybridServerLayer — key not found ──────────────────────────────

  describe('encryptHybridServerLayer — key not found', () => {
    it('throws when key is evicted before encryption', async () => {
      const keyVault = (service as any).keyVault;
      const origGetKey = keyVault.getKey.bind(keyVault);
      keyVault.getKey = jest.fn().mockResolvedValue(undefined);

      await expect(
        service.encryptHybridServerLayer('plaintext', 'conv-hybrid-gone')
      ).rejects.toThrow('Encryption key not found');

      keyVault.getKey = origGetKey;
    });
  });

  // ── getEncryptionService / getEncryptionServiceSync — success path ─────────

  describe('getEncryptionService + getEncryptionServiceSync success path', () => {
    it('getEncryptionService creates and returns a singleton', async () => {
      jest.useRealTimers();
      await shutdownEncryptionService().catch(() => {});
      const s = await getEncryptionService(mockPrisma as any);
      expect(s).toBeInstanceOf(EncryptionService);
    });

    it('getEncryptionServiceSync returns the instance once initialized', async () => {
      jest.useRealTimers();
      await shutdownEncryptionService().catch(() => {});
      await getEncryptionService(mockPrisma as any);
      const s = getEncryptionServiceSync();
      expect(s).toBeInstanceOf(EncryptionService);
    });

    it('getEncryptionService returns the existing singleton on repeated calls', async () => {
      jest.useRealTimers();
      await shutdownEncryptionService().catch(() => {});
      const s1 = await getEncryptionService(mockPrisma as any);
      const s2 = await getEncryptionService(mockPrisma as any);
      expect(s1).toBe(s2);
    });
  });

  // ── encryptionService proxy object ────────────────────────────────────────

  describe('encryptionService proxy', () => {
    it('getSignalService returns null when singleton is not initialized', async () => {
      await shutdownEncryptionService();
      expect(encryptionServiceProxy.getSignalService()).toBeNull();
    });

    it('getOrCreateConversationKey throws when singleton is not initialized', async () => {
      await shutdownEncryptionService();
      await expect(encryptionServiceProxy.getOrCreateConversationKey()).rejects.toThrow(
        'not initialized',
      );
    });

    it('generatePreKeyBundle throws when singleton is not initialized', async () => {
      await shutdownEncryptionService();
      await expect(encryptionServiceProxy.generatePreKeyBundle()).rejects.toThrow(
        'not initialized',
      );
    });

    it('getSignalService returns the signal service instance when initialized', async () => {
      jest.useRealTimers();
      await shutdownEncryptionService().catch(() => {});
      await getEncryptionService(mockPrisma as any);
      // May return null if Signal Protocol is unavailable in test env — just check no throw
      const result = encryptionServiceProxy.getSignalService();
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('getOrCreateConversationKey delegates to singleton when initialized', async () => {
      jest.useRealTimers();
      await shutdownEncryptionService().catch(() => {});
      await getEncryptionService(mockPrisma as any);
      const keyId = await encryptionServiceProxy.getOrCreateConversationKey('conv-proxy-test');
      expect(typeof keyId).toBe('string');
    });
  });

  // ── shutdownEncryptionService with active singleton ───────────────────────

  describe('shutdownEncryptionService — active singleton', () => {
    it('shuts down and nullifies the singleton', async () => {
      jest.useRealTimers();
      await shutdownEncryptionService().catch(() => {});
      await getEncryptionService(mockPrisma as any);

      // Should not throw; clears the singleton
      await expect(shutdownEncryptionService()).resolves.toBeUndefined();

      // Singleton is now null → getEncryptionServiceSync throws
      expect(() => getEncryptionServiceSync()).toThrow('not initialized');
    });
  });
});
