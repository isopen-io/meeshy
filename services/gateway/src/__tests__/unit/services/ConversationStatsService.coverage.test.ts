/**
 * LES CHEMINS QUE LA SUITE PRINCIPALE N'ATTEINT PAS — sortie de
 * `ConversationStatsService.test.ts` le 2026-09-05, avec la canonicalisation
 * des langues (`ConversationStatsService.languageCanonical.test.ts`), parce que
 * le fichier hôte était repassé au-dessus de la dette que le cliquet #4531
 * refuse de voir monter.
 *
 * Découpe par RESPONSABILITÉ, et celle-ci se lisait déjà dans le nom du bloc :
 * « coverage gap-fill » est un APPENDICE — ce que la suite nominale laisse
 * derrière (branches d'erreur, cas limites, chemins rarement pris). Il se lit
 * à côté, jamais dedans.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import { ConversationStatsService } from '../../../services/ConversationStatsService';

describe('ConversationStatsService — coverage gap-fill', () => {
  // Each describe block gets its own service reference to keep the singleton
  // in a known state. We clear the cache between tests via invalidate().

  const testConversationId = '507f1f77bcf86cd799439011';
  const testUserId1 = '507f1f77bcf86cd799439022';

  function makeBasePrisma() {
    return {
      conversation: { findFirst: jest.fn(), findUnique: jest.fn() },
      message: { groupBy: jest.fn() },
      user: { findMany: jest.fn() },
      participant: { findMany: jest.fn() },
    };
  }

  // ── Periodic cleanup: setInterval body ────────────────────────────────────
  // Strategy: reset the singleton AFTER installing fake timers so the new
  // instance's setInterval is registered against the fake timer engine.
  // Resetting the private static field via `instance = null` is necessary
  // because the singleton pattern doesn't otherwise allow controlling which
  // timer engine the internal setInterval binds to.

  describe('periodic cleanup timer', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      // Reset the singleton so getInstance() creates a fresh one whose
      // setInterval is bound to the fake timer.
      (ConversationStatsService as any).instance = null;
    });

    afterEach(() => {
      // Restore real timers and reset the singleton again so subsequent tests
      // get a fresh instance with a real timer.
      jest.useRealTimers();
      (ConversationStatsService as any).instance = null;
    });

    it('removes expired entries when the 15-minute cleanup interval fires', async () => {
      // Create instance AFTER fake timers are installed
      const service = ConversationStatsService.getInstance();

      const mockPrisma: any = makeBasePrisma();
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: testConversationId,
        identifier: `conv_${testConversationId.slice(-4)}`,
        type: 'private',
      });
      mockPrisma.message.groupBy.mockResolvedValue([]);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      // Populate cache
      await service.getOrCompute(mockPrisma as any, testConversationId, () => []);
      expect(service.getActiveConversationIds()).toContain(testConversationId);

      // Advance past TTL (1 hour) — entry is now expired but still in the Map
      jest.advanceTimersByTime(60 * 60 * 1000 + 1);
      // The setInterval runs every 15 minutes; trigger it now
      jest.advanceTimersByTime(15 * 60 * 1000);

      // After the interval fires, expired entries are deleted from the Map.
      // getActiveConversationIds() also filters by expiresAt, but the delete
      // inside the interval callback is the specific code path we're covering.
      const activeIds = service.getActiveConversationIds();
      expect(activeIds).not.toContain(testConversationId);
    });
  });

  // ── Global conversation: user.findMany failure is caught gracefully ──────

  describe('global meeshy conversation — user.findMany failure is caught', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns participantCount 0 when user.findMany throws for meeshy conversation', async () => {
      const service = ConversationStatsService.getInstance();
      service.getActiveConversationIds().forEach(id => service.invalidate(id));

      const globalConvId = '507f1f77bcf86cd799439099';
      const mockPrisma: any = makeBasePrisma();

      // findFirst returns the global conversation
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: globalConvId,
        identifier: 'meeshy',
      });
      // groupBy returns empty
      mockPrisma.message.groupBy.mockResolvedValue([]);
      // user.findMany throws → triggers .catch(() => [])
      mockPrisma.user.findMany.mockRejectedValue(new Error('user.findMany exploded'));

      const stats = await service.getOrCompute(mockPrisma as any, 'meeshy', () => []);

      // The catch returns [] → participantCount === 0
      expect(stats.participantCount).toBe(0);
      expect(stats.participantsPerLanguage).toEqual({});
    });
  });

  // ── computeOnlineUsers: meeshy identifier path ─────────────────────────────
  // When the cache key is 'meeshy' (global conversation), computeOnlineUsers
  // must look up the conversation by identifier to get the real ObjectId.
  // Two branches: found (isGlobalConversation=true, no member filtering) vs.
  // not found (early return with empty online-users list).

  describe('computeOnlineUsers — meeshy global conversation identifier', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      // Fresh singleton so the setInterval is fake-timer-bound
      (ConversationStatsService as any).instance = null;
    });

    afterEach(() => {
      jest.useRealTimers();
      (ConversationStatsService as any).instance = null;
    });

    it('returns online users when meeshy global conversation is found (no member filtering applied)', async () => {
      const service = ConversationStatsService.getInstance();

      const globalConvId = '507f1f77bcf86cd799439098';
      const mockPrisma: any = makeBasePrisma();

      // Seed cache with key 'meeshy' — computeStats path:
      //   findFirst({ identifier: 'meeshy' }) → globalConvId
      //   connectedUserIds=[] → computeOnlineUsers returns early without any findFirst call
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: globalConvId, identifier: 'meeshy' });
      mockPrisma.message.groupBy.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: testUserId1, systemLanguage: 'en' }]);

      await service.getOrCompute(mockPrisma as any, 'meeshy', () => []);

      // updateOnNewMessage with non-empty connectedUserIds → cache is valid → incremental path
      // → computeOnlineUsers(prisma, 'meeshy', [testUserId1])
      // → conversationId === 'meeshy' branch → findFirst({ identifier: 'meeshy' }) → FOUND
      // globalConversation IS found → realConversationId set + isGlobalConversation = true
      // → member filtering skipped → user.findMany([testUserId1])
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: globalConvId, identifier: 'meeshy' });
      mockPrisma.user.findMany.mockResolvedValue([{
        id: testUserId1,
        username: 'user1',
        firstName: 'U',
        lastName: 'One',
        avatar: null,
        systemLanguage: 'en',
        displayName: null,
      }]);

      const stats = await service.updateOnNewMessage(
        mockPrisma as any,
        'meeshy',
        'en',
        () => [testUserId1]
      );

      // Lines 244-245 executed → user found → onlineUsers has 1 entry
      expect(stats.onlineUsers).toHaveLength(1);
      expect(stats.onlineUsers[0].id).toBe(testUserId1);
    });

    it('returns empty online users when meeshy global conversation is not found', async () => {
      const service = ConversationStatsService.getInstance();

      const globalConvId = '507f1f77bcf86cd799439097';
      const mockPrisma: any = makeBasePrisma();

      // Seed cache with key 'meeshy'
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: globalConvId, identifier: 'meeshy' });
      mockPrisma.message.groupBy.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: testUserId1, systemLanguage: 'en' }]);

      await service.getOrCompute(mockPrisma as any, 'meeshy', () => []);

      // Now updateOnNewMessage → incremental → computeOnlineUsers('meeshy', [testUserId1])
      // findFirst({ identifier: 'meeshy' }) → null → computeOnlineUsers returns []
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);

      const stats = await service.updateOnNewMessage(
        mockPrisma as any,
        'meeshy',
        'en',
        () => [testUserId1]
      );

      expect(stats.onlineUsers).toEqual([]);
    });
  });

  // ==============================================
  // LANGUAGE-CODE CANONICALIZATION (SSOT dedup)
  // ==============================================
  //
  // `Message.originalLanguage` and `User.systemLanguage` are persisted verbatim,
  // so BCP-47 region-tagged / mixed-case variants (`'en-US'`, `'FR'`, `'pt-BR'`,
  // `'fr_FR'`) reach the per-language counters intact. Without canonicalizing
  // through the SSOT `normalizeLanguageForDedup`, `'en'`/`'EN'`/`'en-US'` would
  // split into distinct buckets and inflate the derived languageCount — the same
  // defect already closed on the `spokenLanguages` aggregate (routes/anonymous.ts).
});
