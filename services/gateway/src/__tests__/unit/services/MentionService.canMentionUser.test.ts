/**
 * `canMentionUser` — qui peut être mentionné dans une conversation.
 *
 * Extrait de `MentionService.test.ts` par #19799 : ce fichier-là était DÉJÀ hors
 * budget (2 063 lignes au cliquet, plafond dur 1 200), et le dépôt interdit d'y
 * ajouter — « on extrait d'abord, on ajoute ensuite ». Les témoins de cette
 * méthode forment une responsabilité à eux : l'état du compte mentionnable.
 *
 * Ils portent la loi « compte vivant » (`USABLE_ACCOUNT_WHERE`), et leur double
 * ÉVALUE le `where` contre des lignes à la forme NOMINALE de production — ni
 * `deletedAt` ni `deactivatedAt`, qu'aucune création de compte n'écrit. Le
 * `mockResolvedValue({ id })` d'avant rendait la ligne quelle que soit la clause,
 * donc il acceptait une égalité nue qui, en base, n'apparie personne.
 *
 * NB : cette méthode n'a AUCUN appelant de production (mesuré le 2026-11-19) —
 * son sort est #19814. Ces témoins gardent donc une FORME, et le disent.
 */
/**
 * MentionService Comprehensive Unit Tests
 *
 * This test suite provides thorough coverage of the MentionService including:
 * - Mention extraction from message content
 * - Username validation (format, length)
 * - Username resolution via Prisma
 * - User suggestions for autocomplete (with caching)
 * - Mention permission validation per conversation type
 * - Mention creation in database
 * - Mention retrieval operations
 * - Cache operations (get, set, invalidate)
 * - Edge cases and error handling
 *
 * Coverage target: > 65%
 *
 * @jest-environment node
 */

// Mock CacheStore FIRST before imports
// NOTE: jest.mock factories are hoisted before any const/let definitions,
// so we keep the factory self-contained and wire up the shared instance in beforeEach.
jest.mock('../../../services/CacheStore', () => {
  const sharedMockCache = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    keys: jest.fn().mockResolvedValue([]),
    setnx: jest.fn().mockResolvedValue(true),
    expire: jest.fn().mockResolvedValue(true),
    publish: jest.fn().mockResolvedValue(0),
    info: jest.fn().mockResolvedValue(''),
    isAvailable: jest.fn().mockReturnValue(false),
    close: jest.fn().mockResolvedValue(undefined),
    getNativeClient: jest.fn().mockReturnValue(null),
  };
  return {
    getCacheStore: jest.fn().mockReturnValue(sharedMockCache),
    __sharedMockCache: sharedMockCache,
  };
});

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock Prisma
jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    userPreferences: { findMany: jest.fn(async () => []) }, userPreference: { findMany: jest.fn(async () => []) }, user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
    },
    participant: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    friendRequest: {
      findMany: jest.fn(),
    },
    userRelation: { findMany: jest.fn(async () => []) },
    userContact: { findMany: jest.fn(async () => []) },
    postReaction: { findMany: jest.fn(async () => []) },
    conversationMessageStats: {
      findUnique: jest.fn(),
    },
    mention: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    commentMention: {
      create: jest.fn(),
    },
    postMention: {
      create: jest.fn(),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

import { MentionService, MentionSuggestion, MentionValidationResult, resolveMentionedUsers, resolveUsernamesToIds } from '../../../services/MentionService';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { getCacheStore } from '../../../services/CacheStore';
import { findUniqueIn } from '../../helpers/mongo-where';

describe('MentionService.canMentionUser', () => {
  let service: MentionService;
  let prisma: any;
  let mockRedis: any;

  beforeEach(() => {
    // Retrieve the shared mock cache instance created inside the jest.mock factory
    const cacheStoreMod = jest.requireMock('../../../services/CacheStore') as any;
    mockRedis = cacheStoreMod.__sharedMockCache;

    jest.clearAllMocks();

    // Re-initialise mock fns after clearAllMocks() reset them
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue(undefined);
    mockRedis.del.mockResolvedValue(undefined);
    mockRedis.keys.mockResolvedValue([]);
    mockRedis.isAvailable.mockReturnValue(false);

    // Ensure getCacheStore returns the shared mock instance
    (getCacheStore as jest.Mock).mockReturnValue(mockRedis);

    prisma = new PrismaClient();
    prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-123', type: 'public' });
    prisma.participant.findFirst.mockResolvedValue({ id: 'membership-current' });

    service = new MentionService(prisma);
  });

  describe('canMentionUser', () => {
    const conversationId = 'conv-123';
    const userId = 'user-to-mention';

    it('should return false when conversation not found', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      const result = await service.canMentionUser(conversationId, userId);

      expect(result).toBe(false);
    });

    describe('Public/Global conversations', () => {
      /**
       * Le compte est LU sous la loi « compte vivant », et le double l'ÉVALUE :
       * la ligne est à la forme NOMINALE de production — ni `deletedAt` ni
       * `deactivatedAt`, qu'aucune création de compte n'écrit. Un
       * `mockResolvedValue({ id })` rend la ligne quelle que soit la clause, donc
       * il accepte une égalité nue qui, en base, n'apparie personne (#19799).
       */
      const annuaireAvec = (...comptes: Record<string, unknown>[]) => {
        prisma.user.findUnique.mockImplementation(findUniqueIn(comptes) as never);
      };
      const vivant = { id: userId, isActive: true };

      it('should return true for active user in public conversation', async () => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'public',
        });
        annuaireAvec(vivant);

        const result = await service.canMentionUser(conversationId, userId);

        expect(result).toBe(true);
      });

      it('should return true for active user in global conversation', async () => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'global',
        });
        annuaireAvec(vivant);

        const result = await service.canMentionUser(conversationId, userId);

        expect(result).toBe(true);
      });

      it('should return false for non-existent user in public conversation', async () => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'public',
        });
        annuaireAvec();

        const result = await service.canMentionUser(conversationId, userId);

        expect(result).toBe(false);
      });

      it.each([
        ['supprimé', { deletedAt: new Date('2026-10-01T00:00:00Z') }],
        ['désactivé', { deactivatedAt: new Date('2026-10-01T00:00:00Z') }],
        ['inactif', { isActive: false }],
      ])('should return false for a %s account', async (_etat, mort) => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'public',
        });
        annuaireAvec({ ...vivant, ...mort });

        const result = await service.canMentionUser(conversationId, userId);

        expect(result).toBe(false);
      });
    });

    describe('Private/Direct/Group conversations', () => {
      it('should return true when user is active member', async () => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'direct',
        });
        prisma.participant.findFirst.mockResolvedValue({
          userId,
          isActive: true,
        });

        const result = await service.canMentionUser(conversationId, userId);

        expect(result).toBe(true);
      });

      it('should return false when user is not a member', async () => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'group',
        });
        prisma.participant.findFirst.mockResolvedValue(null);

        const result = await service.canMentionUser(conversationId, userId);

        expect(result).toBe(false);
      });

      it('should check for active membership', async () => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'direct',
        });
        prisma.participant.findFirst.mockResolvedValue(null);

        await service.canMentionUser(conversationId, userId);

        expect(prisma.participant.findFirst).toHaveBeenCalledWith({
          where: {
            conversationId,
            userId,
            isActive: true,
          },
        });
      });
    });
  });
});
