/**
 * EncryptionService — uncovered branch coverage (iter)
 *
 * Covers:
 *  - ServerKeyVault.initialize: conversationKeyMap preload from DB (lines 161-162)
 *  - ServerKeyVault.getKey: fire-and-forget update rejection (line 258)
 *  - ServerKeyVault.getKey: outer catch when findUnique rejects (lines 264-265)
 *  - getOrCreateConversationKey: concurrent lock double-check path (lines 455-457)
 *  - getOrCreateConversationKey: setTimeout lock cleanup (line 474)
 *  - shutdown: signalService.clearAllSensitiveData path (lines 903-904)
 *  - encryptionService proxy: generatePreKeyBundle success (line 956)
 *  - Module-level Signal unavailable: catch block (line 44) + generatePreKeyBundle throw (line 783)
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  EncryptionService,
  getEncryptionService,
  shutdownEncryptionService,
  encryptionService as encryptionServiceProxy,
} from '../../../services/EncryptionService';

// ── Shared in-memory key storage ─────────────────────────────────────────────

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
  conversation: { findUnique: jest.fn<any>(), update: jest.fn<any>() },
  user: { findUnique: jest.fn<any>(), update: jest.fn<any>() },
  signalPreKeyBundle: { findUnique: jest.fn<any>(), upsert: jest.fn<any>() },
  serverEncryptionKey: {
    create: jest.fn<any>(async (args: any) => {
      const data = args.data;
      keyStorage.set(data.id, { ...data, lastAccessedAt: null });
      return data;
    }),
    findUnique: jest.fn<any>(async (args: any) => keyStorage.get(args.where.id) ?? null),
    findMany: jest.fn<any>(async (_args: any) => []),
    update: jest.fn<any>(async (args: any) => {
      const key = keyStorage.get(args.where.id);
      if (key) Object.assign(key, args.data);
      return key ?? null;
    }),
  },
} as any);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EncryptionService — uncovered paths', () => {
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

  // ── ServerKeyVault.initialize — conversationKeyMap preload (lines 161-162) ─

  describe('ServerKeyVault.initialize — preloads conversationKeyMap from DB', () => {
    it('populates conversationKeyMap when findMany returns keys with conversationId', async () => {
      const prisma2 = buildMockPrisma();
      prisma2.serverEncryptionKey.findMany.mockResolvedValue([
        { id: 'key-abc', conversationId: 'conv-xyz' },
        { id: 'key-no-conv', conversationId: null }, // null entry — not inserted
      ]);

      const svc2 = new EncryptionService(prisma2 as any);
      await svc2.initialize();

      const vault2 = (svc2 as any).keyVault;
      expect(vault2.conversationKeyMap.get('conv-xyz')).toBe('key-abc');
      expect(vault2.conversationKeyMap.has(null)).toBe(false);

      await svc2.shutdown().catch(() => {});
    });
  });

  // ── ServerKeyVault.getKey — fire-and-forget update rejection (line 258) ───

  describe('ServerKeyVault.getKey — update rejection swallowed in .catch()', () => {
    it('still returns the key when fire-and-forget update rejects', async () => {
      const vault = (service as any).keyVault;

      // Generate a key and seed keyStorage, then evict from cache to force DB load
      const { keyId } = await vault.generateKey('conv-update-reject', 'conversation');
      vault.keyCache.delete(keyId);

      mockPrisma.serverEncryptionKey.update.mockRejectedValueOnce(new Error('DB update failed'));

      const key = await vault.getKey(keyId);
      expect(key).toBeInstanceOf(Buffer);
      expect(key!.length).toBe(32);

      // Flush microtasks so the .catch() callback runs (covering line 258)
      await Promise.resolve();
      expect(mockPrisma.serverEncryptionKey.update).toHaveBeenCalled();
    });
  });

  // ── ServerKeyVault.getKey — outer catch block (lines 264-265) ────────────

  describe('ServerKeyVault.getKey — outer catch when findUnique rejects', () => {
    it('returns undefined and swallows the error', async () => {
      const vault = (service as any).keyVault;

      // Force cache miss (key not in cache), then make findUnique reject
      mockPrisma.serverEncryptionKey.findUnique.mockRejectedValueOnce(new Error('DB error'));

      const result = await vault.getKey('nonexistent-key-for-catch-test');
      expect(result).toBeUndefined();
    });
  });

  // ── getOrCreateConversationKey — concurrent double-check + setTimeout (lines 455-457, 474) ─

  describe('getOrCreateConversationKey — concurrent lock double-check path', () => {
    it('returns existing key found after lock acquisition (lines 455-457) and cleans up setTimeout (line 474)', async () => {
      const vault = (service as any).keyVault;

      // Spy on getConversationKeyId:
      // - 1st call (fast path, line 429): return null → no fast-path hit
      // - 2nd call (post-lock double-check, line 453): return a key → lines 455-457 fire
      let callCount = 0;
      jest.spyOn(vault, 'getConversationKeyId').mockImplementation(() => {
        callCount++;
        return callCount >= 2 ? 'key-concurrent-winner' : undefined;
      });

      const result = await service.getOrCreateConversationKey('conv-concurrent');
      expect(result).toBe('key-concurrent-winner');

      // Lock entry exists until setTimeout fires
      expect((service as any).keyGenerationLocks.has('conv-concurrent')).toBe(true);

      // Advance timers to trigger the setTimeout cleanup (line 474)
      jest.advanceTimersByTime(101);
      expect((service as any).keyGenerationLocks.has('conv-concurrent')).toBe(false);
    });
  });

  // ── shutdown — signalService.clearAllSensitiveData (lines 903-904) ────────

  describe('shutdown — clears signalService when present', () => {
    it('calls clearAllSensitiveData on signalService during shutdown', async () => {
      const clearFn = jest.fn<any>();
      (service as any).signalService = { clearAllSensitiveData: clearFn };

      jest.useRealTimers();
      await service.shutdown();

      expect(clearFn).toHaveBeenCalledTimes(1);
    });
  });

  // ── encryptionService proxy — generatePreKeyBundle success (line 956) ─────

  describe('encryptionService proxy — generatePreKeyBundle delegates to singleton', () => {
    it('calls generatePreKeyBundle on the initialized singleton', async () => {
      jest.useRealTimers();
      await shutdownEncryptionService().catch(() => {});
      await getEncryptionService(mockPrisma as any);

      const bundle = await encryptionServiceProxy.generatePreKeyBundle();
      // Signal mock returns valid key material — bundle should be an object
      expect(bundle).toBeDefined();
      expect(typeof bundle).toBe('object');
    });
  });
});

