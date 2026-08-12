/**
 * Unit tests for src/utils/conversation-id-cache.ts
 *
 * The module uses a module-level Map as cache.
 * We use jest.isolateModules to get a fresh module per test group to avoid
 * cross-test cache pollution.  Within a group we use unique identifiers.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrisma(findFirstImpl: jest.Mock = jest.fn()): PrismaClient {
  return {
    conversation: { findFirst: findFirstImpl },
  } as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveConversationId', () => {
  describe('when identifier is a valid 24-char hex ObjectId', () => {
    it('test_resolveConversationId_validObjectId_returnsImmediately', async () => {
      let resolveConversationId: (prisma: PrismaClient, identifier: string) => Promise<string | null>;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        ({ resolveConversationId } = require('../../../utils/conversation-id-cache'));
      });
      const mockFindFirst = jest.fn();
      const prisma = makePrisma(mockFindFirst);
      const objectId = '507f1f77bcf86cd799439011';

      const result = await resolveConversationId!(prisma, objectId);

      expect(result).toBe(objectId);
      expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it('test_resolveConversationId_upperCaseHexObjectId_returnsSameId', async () => {
      let resolveConversationId: (prisma: PrismaClient, identifier: string) => Promise<string | null>;
      jest.isolateModules(() => {
        ({ resolveConversationId } = require('../../../utils/conversation-id-cache'));
      });
      const prisma = makePrisma(jest.fn());
      const upperObjectId = 'AABBCCDDEEFF001122334455';

      const result = await resolveConversationId!(prisma, upperObjectId);

      expect(result).toBe(upperObjectId);
    });
  });

  describe('when identifier is a human-readable slug', () => {
    it('test_resolveConversationId_slugFoundInDb_returnsId', async () => {
      let resolveConversationId: (prisma: PrismaClient, identifier: string) => Promise<string | null>;
      jest.isolateModules(() => {
        ({ resolveConversationId } = require('../../../utils/conversation-id-cache'));
      });
      const mockFindFirst = jest.fn().mockResolvedValue({ id: '507f1f77bcf86cd799439099' });
      const prisma = makePrisma(mockFindFirst);

      const result = await resolveConversationId!(prisma, 'my-conversation');

      expect(result).toBe('507f1f77bcf86cd799439099');
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { identifier: 'my-conversation' },
        select: { id: true },
      });
    });

    it('test_resolveConversationId_slugNotInDb_returnsNull', async () => {
      let resolveConversationId: (prisma: PrismaClient, identifier: string) => Promise<string | null>;
      jest.isolateModules(() => {
        ({ resolveConversationId } = require('../../../utils/conversation-id-cache'));
      });
      const mockFindFirst = jest.fn().mockResolvedValue(null);
      const prisma = makePrisma(mockFindFirst);

      const result = await resolveConversationId!(prisma, 'unknown-slug');

      expect(result).toBeNull();
    });

    it('test_resolveConversationId_slugCacheHit_doesNotQueryDb', async () => {
      let resolveConversationId: (prisma: PrismaClient, identifier: string) => Promise<string | null>;
      jest.isolateModules(() => {
        ({ resolveConversationId } = require('../../../utils/conversation-id-cache'));
      });
      const mockFindFirst = jest.fn().mockResolvedValue({ id: '507f1f77bcf86cd799439001' });
      const prisma = makePrisma(mockFindFirst);
      const slug = 'cached-slug-unique-abc';

      // First call populates cache
      await resolveConversationId!(prisma, slug);
      mockFindFirst.mockClear();

      // Second call should use cache
      const result = await resolveConversationId!(prisma, slug);

      expect(result).toBe('507f1f77bcf86cd799439001');
      expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it('test_resolveConversationId_differentSlugsUseSeparateCacheEntries', async () => {
      let resolveConversationId: (prisma: PrismaClient, identifier: string) => Promise<string | null>;
      jest.isolateModules(() => {
        ({ resolveConversationId } = require('../../../utils/conversation-id-cache'));
      });

      const findFirst = jest.fn()
        .mockResolvedValueOnce({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa' })
        .mockResolvedValueOnce({ id: 'bbbbbbbbbbbbbbbbbbbbbbbb' });
      const prisma = makePrisma(findFirst);

      const result1 = await resolveConversationId!(prisma, 'slug-alpha');
      const result2 = await resolveConversationId!(prisma, 'slug-beta');

      expect(result1).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
      expect(result2).toBe('bbbbbbbbbbbbbbbbbbbbbbbb');
    });
  });

  describe('cache eviction (bounded FIFO)', () => {
    it('test_resolveConversationId_evictsOldestWhenOverCap_reQueriesEvictedSlug', async () => {
      let resolveConversationId: (prisma: PrismaClient, identifier: string) => Promise<string | null>;
      let CONVERSATION_ID_CACHE_MAX: number;
      jest.isolateModules(() => {
        ({ resolveConversationId, CONVERSATION_ID_CACHE_MAX } = require('../../../utils/conversation-id-cache'));
      });

      // Each distinct slug resolves to a stable 24-char id derived from its index.
      const idFor = (n: number) => n.toString(16).padStart(24, '0');
      const findFirst = jest.fn().mockImplementation(({ where }: { where: { identifier: string } }) =>
        Promise.resolve({ id: idFor(Number(where.identifier.replace('slug-', ''))) })
      );
      const prisma = makePrisma(findFirst);

      // Fill the cache to capacity — 'slug-0' is the oldest entry.
      for (let n = 0; n < CONVERSATION_ID_CACHE_MAX!; n++) {
        await resolveConversationId!(prisma, `slug-${n}`);
      }
      // One more distinct slug pushes the cache over the cap → evicts 'slug-0'.
      await resolveConversationId!(prisma, `slug-${CONVERSATION_ID_CACHE_MAX!}`);

      findFirst.mockClear();

      // slug-1 was NOT evicted → served from cache (no DB hit).
      await resolveConversationId!(prisma, 'slug-1');
      expect(findFirst).not.toHaveBeenCalled();

      // slug-0 WAS evicted → must re-query the DB.
      const result = await resolveConversationId!(prisma, 'slug-0');
      expect(findFirst).toHaveBeenCalledWith({ where: { identifier: 'slug-0' }, select: { id: true } });
      expect(result).toBe(idFor(0));
    });
  });

  describe('identifier pattern edge cases', () => {
    it('test_resolveConversationId_23charHex_treatedAsSlug', async () => {
      let resolveConversationId: (prisma: PrismaClient, identifier: string) => Promise<string | null>;
      jest.isolateModules(() => {
        ({ resolveConversationId } = require('../../../utils/conversation-id-cache'));
      });
      const mockFindFirst = jest.fn().mockResolvedValue(null);
      const prisma = makePrisma(mockFindFirst);
      // 23 chars — one short of a valid ObjectId
      const shortHex = 'aabbccddeeff00112233445';

      await resolveConversationId!(prisma, shortHex);

      // Should have queried DB because regex didn't match
      expect(mockFindFirst).toHaveBeenCalled();
    });

    it('test_resolveConversationId_25charHex_treatedAsSlug', async () => {
      let resolveConversationId: (prisma: PrismaClient, identifier: string) => Promise<string | null>;
      jest.isolateModules(() => {
        ({ resolveConversationId } = require('../../../utils/conversation-id-cache'));
      });
      const mockFindFirst = jest.fn().mockResolvedValue(null);
      const prisma = makePrisma(mockFindFirst);
      const longHex = 'aabbccddeeff0011223344556';

      await resolveConversationId!(prisma, longHex);

      expect(mockFindFirst).toHaveBeenCalled();
    });
  });
});
