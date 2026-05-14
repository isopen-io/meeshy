/**
 * MentionService.getUserSuggestionsForPost — Unit Tests
 *
 * Tests for the new post-context suggestions method.
 * Priority order: post author > previous commenters > friends > others (capped at 10)
 *
 * @jest-environment node
 */

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

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
    },
    postComment: {
      findMany: jest.fn(),
    },
    participant: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    friendRequest: {
      findMany: jest.fn(),
    },
    mention: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

import { MentionService, MentionSuggestion } from '../../../services/MentionService';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { getCacheStore } from '../../../services/CacheStore';

const POST_ID = '507f1f77bcf86cd799439011';
const CURRENT_USER_ID = '507f1f77bcf86cd799439099';
const AUTHOR_ID = '507f1f77bcf86cd799439001';
const COMMENTER_ID = '507f1f77bcf86cd799439002';
const FRIEND_ID = '507f1f77bcf86cd799439003';

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: AUTHOR_ID,
    username: 'author_user',
    firstName: 'Author',
    lastName: 'User',
    displayName: 'Author User',
    avatar: null,
    lastActiveAt: new Date(),
    isActive: true,
    deletedAt: null,
    ...overrides,
  };
}

function buildPost(overrides: Record<string, unknown> = {}) {
  return {
    id: POST_ID,
    authorId: AUTHOR_ID,
    isDeleted: false,
    deletedAt: null,
    visibility: 'PUBLIC',
    author: buildUser(),
    ...overrides,
  };
}

function buildComment(authorId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `comment-${authorId}`,
    postId: POST_ID,
    authorId,
    isDeleted: false,
    author: buildUser({ id: authorId, username: `commenter_${authorId.slice(-4)}` }),
    ...overrides,
  };
}

function buildFriendship(friendId: string) {
  return {
    senderId: CURRENT_USER_ID,
    receiverId: friendId,
    status: 'accepted',
    sender: buildUser({ id: CURRENT_USER_ID, username: 'current_user' }),
    receiver: buildUser({ id: friendId, username: 'friend_user' }),
  };
}

describe('MentionService.getUserSuggestionsForPost', () => {
  let service: MentionService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let mockCache: ReturnType<typeof getCacheStore>;

  beforeEach(() => {
    const cacheStoreMod = jest.requireMock('../../../services/CacheStore') as {
      __sharedMockCache: ReturnType<typeof getCacheStore>;
      getCacheStore: jest.Mock;
    };
    mockCache = cacheStoreMod.__sharedMockCache;

    jest.clearAllMocks();

    (mockCache.get as jest.Mock).mockResolvedValue(null);
    (mockCache.set as jest.Mock).mockResolvedValue(undefined);
    (mockCache.isAvailable as jest.Mock).mockReturnValue(false);

    (getCacheStore as jest.Mock).mockReturnValue(mockCache);

    prisma = new PrismaClient() as unknown as typeof prisma;
    service = new MentionService(prisma as unknown as import('@meeshy/shared/prisma/client').PrismaClient);
  });

  // =========================================================================
  // Post not found / access denied
  // =========================================================================

  describe('post access check', () => {
    it('should throw PermissionDeniedError when post does not exist', async () => {
      (prisma.post as { findUnique: jest.Mock }).findUnique.mockResolvedValue(null);

      await expect(
        service.getUserSuggestionsForPost(POST_ID, CURRENT_USER_ID, '')
      ).rejects.toThrow('Post non trouvé ou accès refusé');
    });

    it('should throw PermissionDeniedError when post is soft-deleted', async () => {
      (prisma.post as { findUnique: jest.Mock }).findUnique.mockResolvedValue(
        buildPost({ isDeleted: true, deletedAt: new Date() })
      );

      await expect(
        service.getUserSuggestionsForPost(POST_ID, CURRENT_USER_ID, '')
      ).rejects.toThrow('Post non trouvé ou accès refusé');
    });
  });

  // =========================================================================
  // Priority: post author first
  // =========================================================================

  describe('priority 1 — post author', () => {
    it('should include the post author as the first suggestion with badge "conversation"', async () => {
      (prisma.post as { findUnique: jest.Mock }).findUnique.mockResolvedValue(buildPost());
      (prisma.postComment as { findMany: jest.Mock }).findMany.mockResolvedValue([]);
      (prisma.friendRequest as { findMany: jest.Mock }).findMany.mockResolvedValue([]);

      const results = await service.getUserSuggestionsForPost(POST_ID, CURRENT_USER_ID, '');

      expect(results[0]).toMatchObject({
        id: AUTHOR_ID,
        username: 'author_user',
        badge: 'conversation',
        inConversation: true,
      });
    });

    it('should exclude the current user from suggestions', async () => {
      (prisma.post as { findUnique: jest.Mock }).findUnique.mockResolvedValue(
        buildPost({ authorId: CURRENT_USER_ID, author: buildUser({ id: CURRENT_USER_ID }) })
      );
      (prisma.postComment as { findMany: jest.Mock }).findMany.mockResolvedValue([]);
      (prisma.friendRequest as { findMany: jest.Mock }).findMany.mockResolvedValue([]);

      const results = await service.getUserSuggestionsForPost(POST_ID, CURRENT_USER_ID, '');

      expect(results.map(r => r.id)).not.toContain(CURRENT_USER_ID);
    });
  });

  // =========================================================================
  // Priority: previous commenters second
  // =========================================================================

  describe('priority 2 — previous commenters', () => {
    it('should include commenters after the author', async () => {
      (prisma.post as { findUnique: jest.Mock }).findUnique.mockResolvedValue(buildPost());
      (prisma.postComment as { findMany: jest.Mock }).findMany.mockResolvedValue([
        buildComment(COMMENTER_ID),
      ]);
      (prisma.friendRequest as { findMany: jest.Mock }).findMany.mockResolvedValue([]);

      const results = await service.getUserSuggestionsForPost(POST_ID, CURRENT_USER_ID, '');

      const ids = results.map(r => r.id);
      expect(ids.indexOf(AUTHOR_ID)).toBeLessThan(ids.indexOf(COMMENTER_ID));
    });

    it('should badge commenters as "conversation"', async () => {
      (prisma.post as { findUnique: jest.Mock }).findUnique.mockResolvedValue(buildPost());
      (prisma.postComment as { findMany: jest.Mock }).findMany.mockResolvedValue([
        buildComment(COMMENTER_ID),
      ]);
      (prisma.friendRequest as { findMany: jest.Mock }).findMany.mockResolvedValue([]);

      const results = await service.getUserSuggestionsForPost(POST_ID, CURRENT_USER_ID, '');
      const commenter = results.find(r => r.id === COMMENTER_ID);

      expect(commenter?.badge).toBe('conversation');
      expect(commenter?.inConversation).toBe(true);
    });

    it('should not duplicate user that is both author and commenter', async () => {
      (prisma.post as { findUnique: jest.Mock }).findUnique.mockResolvedValue(buildPost());
      (prisma.postComment as { findMany: jest.Mock }).findMany.mockResolvedValue([
        buildComment(AUTHOR_ID),
      ]);
      (prisma.friendRequest as { findMany: jest.Mock }).findMany.mockResolvedValue([]);

      const results = await service.getUserSuggestionsForPost(POST_ID, CURRENT_USER_ID, '');
      const authorEntries = results.filter(r => r.id === AUTHOR_ID);

      expect(authorEntries).toHaveLength(1);
    });
  });

  // =========================================================================
  // Priority: friends third
  // =========================================================================

  describe('priority 3 — friends', () => {
    it('should include friends who are not already in thread', async () => {
      (prisma.post as { findUnique: jest.Mock }).findUnique.mockResolvedValue(buildPost());
      (prisma.postComment as { findMany: jest.Mock }).findMany.mockResolvedValue([]);
      (prisma.friendRequest as { findMany: jest.Mock }).findMany.mockResolvedValue([
        buildFriendship(FRIEND_ID),
      ]);

      const results = await service.getUserSuggestionsForPost(POST_ID, CURRENT_USER_ID, '');
      const friend = results.find(r => r.id === FRIEND_ID);

      expect(friend).toBeDefined();
      expect(friend?.badge).toBe('friend');
      expect(friend?.isFriend).toBe(true);
    });

    it('should come after thread participants in the list', async () => {
      (prisma.post as { findUnique: jest.Mock }).findUnique.mockResolvedValue(buildPost());
      (prisma.postComment as { findMany: jest.Mock }).findMany.mockResolvedValue([
        buildComment(COMMENTER_ID),
      ]);
      (prisma.friendRequest as { findMany: jest.Mock }).findMany.mockResolvedValue([
        buildFriendship(FRIEND_ID),
      ]);

      const results = await service.getUserSuggestionsForPost(POST_ID, CURRENT_USER_ID, '');
      const ids = results.map(r => r.id);
      const commenterIdx = ids.indexOf(COMMENTER_ID);
      const friendIdx = ids.indexOf(FRIEND_ID);

      expect(commenterIdx).toBeLessThan(friendIdx);
    });
  });

  // =========================================================================
  // Query filtering
  // =========================================================================

  describe('query filtering', () => {
    it('should filter author by username query', async () => {
      (prisma.post as { findUnique: jest.Mock }).findUnique.mockResolvedValue(buildPost());
      (prisma.postComment as { findMany: jest.Mock }).findMany.mockResolvedValue([]);
      (prisma.friendRequest as { findMany: jest.Mock }).findMany.mockResolvedValue([]);

      const results = await service.getUserSuggestionsForPost(POST_ID, CURRENT_USER_ID, 'author');
      expect(results.some(r => r.id === AUTHOR_ID)).toBe(true);
    });

    it('should filter out author when query does not match', async () => {
      (prisma.post as { findUnique: jest.Mock }).findUnique.mockResolvedValue(buildPost());
      (prisma.postComment as { findMany: jest.Mock }).findMany.mockResolvedValue([]);
      (prisma.friendRequest as { findMany: jest.Mock }).findMany.mockResolvedValue([]);

      const results = await service.getUserSuggestionsForPost(POST_ID, CURRENT_USER_ID, 'alice');
      expect(results.some(r => r.id === AUTHOR_ID)).toBe(false);
    });

    it('should filter by displayName', async () => {
      (prisma.post as { findUnique: jest.Mock }).findUnique.mockResolvedValue(
        buildPost({ author: buildUser({ displayName: 'Alice Wonder' }) })
      );
      (prisma.postComment as { findMany: jest.Mock }).findMany.mockResolvedValue([]);
      (prisma.friendRequest as { findMany: jest.Mock }).findMany.mockResolvedValue([]);

      const results = await service.getUserSuggestionsForPost(POST_ID, CURRENT_USER_ID, 'alice');
      expect(results.some(r => r.id === AUTHOR_ID)).toBe(true);
    });
  });

  // =========================================================================
  // Result cap
  // =========================================================================

  describe('result cap', () => {
    it('should return at most 10 suggestions', async () => {
      const manyCommenters = Array.from({ length: 15 }, (_, i) => ({
        id: `60000000000000000000000${i}`,
        username: `commenter${i}`,
        firstName: `First${i}`,
        lastName: `Last${i}`,
        displayName: null,
        avatar: null,
        isActive: true,
        deletedAt: null,
      }));

      (prisma.post as { findUnique: jest.Mock }).findUnique.mockResolvedValue(buildPost());
      (prisma.postComment as { findMany: jest.Mock }).findMany.mockResolvedValue(
        manyCommenters.map(u => ({
          id: `comment-${u.id}`,
          postId: POST_ID,
          authorId: u.id,
          isDeleted: false,
          author: u,
        }))
      );
      (prisma.friendRequest as { findMany: jest.Mock }).findMany.mockResolvedValue([]);

      const results = await service.getUserSuggestionsForPost(POST_ID, CURRENT_USER_ID, '');

      expect(results.length).toBeLessThanOrEqual(10);
    });
  });

  // =========================================================================
  // Return shape matches MentionSuggestion
  // =========================================================================

  describe('return shape', () => {
    it('should return MentionSuggestion[] shape', async () => {
      (prisma.post as { findUnique: jest.Mock }).findUnique.mockResolvedValue(buildPost());
      (prisma.postComment as { findMany: jest.Mock }).findMany.mockResolvedValue([]);
      (prisma.friendRequest as { findMany: jest.Mock }).findMany.mockResolvedValue([]);

      const results = await service.getUserSuggestionsForPost(POST_ID, CURRENT_USER_ID, '');

      results.forEach((s: MentionSuggestion) => {
        expect(s).toHaveProperty('id');
        expect(s).toHaveProperty('username');
        expect(s).toHaveProperty('badge');
        expect(s).toHaveProperty('inConversation');
        expect(s).toHaveProperty('isFriend');
      });
    });
  });
});
