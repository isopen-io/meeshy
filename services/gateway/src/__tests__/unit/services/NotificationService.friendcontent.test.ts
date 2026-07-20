/**
 * Unit tests for Phase 4F — friend content notification fan-out
 *
 * Covers:
 *  - createFriendContentNotificationsBatch: type mapping per contentType
 *  - Fan-out to all accepted friends, capped at 500
 *  - Self-author skip (paranoid check)
 *  - excludeUserIds dedup (user_mentioned takes priority over friend_new_*)
 *  - Duplicate friend dedup (seenIds)
 *  - authorId not found → early return
 *  - Promise.allSettled resilience: one failure does not block other recipients
 *
 * Rate-limiting decision (v1): no aggregation, no per-author burst limit.
 * Each post/story/mood triggers a notification to all friends unconditionally.
 * This is intentional and documented — aggregation deferred to v2.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') || '',
  },
}));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((input: string) => input?.replace(/<[^>]*>/g, '') || ''),
    sanitizeUsername: jest.fn((input: string) =>
      input?.replace(/[^a-zA-Z0-9_.-]/g, '').substring(0, 50) || ''
    ),
    sanitizeURL: jest.fn((input: string) => {
      if (!input) return null;
      try {
        const url = new URL(input);
        if (['http:', 'https:'].includes(url.protocol)) return input;
        return null;
      } catch {
        return null;
      }
    }),
    sanitizeJSON: jest.fn((input: unknown) => input),
    isValidNotificationType: jest.fn(() => true),
    isValidPriority: jest.fn(() => true),
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      createMany: jest.fn(),
    },
    notificationPreference: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    conversation: {
      findUnique: jest.fn(),
    },
    userPreferences: {
      findUnique: jest.fn(),
    },
    postComment: {
      findMany: jest.fn(),
    },
    postReaction: {
      findMany: jest.fn(),
    },
    friendRequest: {
      findMany: jest.fn(),
    },
    communityMember: {
      findMany: jest.fn(),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
  cert: jest.fn(),
}));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('message-id') })),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  securityLogger: {
    logViolation: jest.fn(),
    logAttempt: jest.fn(),
    logSuccess: jest.fn(),
  },
}));

import { NotificationService } from '../../../services/notifications/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';

// -------------------------------------------------------
// Test helpers & fixtures
// -------------------------------------------------------

const AUTHOR_ID = '507f1f77bcf86cd799439011';
const FRIEND_1 = '507f1f77bcf86cd799439012';
const FRIEND_2 = '507f1f77bcf86cd799439013';
const FRIEND_3 = '507f1f77bcf86cd799439014';
const POST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function makeNotif(type: string) {
  return {
    id: `notif-${type}-${Math.random()}`,
    type,
    isRead: false,
    createdAt: new Date(),
    content: '',
    priority: 'normal',
    actor: null,
    context: {},
    metadata: {},
    delivery: { emailSent: false, pushSent: false },
  };
}

function makeFriendRequest(senderId: string, receiverId: string) {
  return { senderId, receiverId };
}

// -------------------------------------------------------
// Tests
// -------------------------------------------------------

describe('NotificationService — Phase 4F: friend content fan-out', () => {
  let service: NotificationService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let mockIO: { to: jest.Mock; emit: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    prisma = new PrismaClient();
    service = new NotificationService(prisma as any);

    mockIO = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    service.setSocketIO(mockIO as any, new Map());

    // Default: allow all notifications (no prefs override)
    (prisma.userPreferences.findUnique as jest.Mock).mockResolvedValue(null);

    // Author found by default
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      username: 'author_user',
      displayName: 'Author',
      avatar: null,
    });

    // Default: notification create succeeds
    (prisma.notification.create as jest.Mock).mockImplementation(
      ({ data }: { data: { type: string } }) => Promise.resolve(makeNotif(data.type))
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // =====================================================
  // Type mapping per contentType
  // =====================================================

  describe('contentType → notification type mapping', () => {
    it('test_createFriendContentNotificationsBatch_STORY_createsFriendNewStory', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STORY',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { type: string; userId: string } }]
      >;
      const call = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(call).toBeDefined();
      expect(call![0].data.type).toBe('friend_new_story');
    });

    it('test_createFriendContentNotificationsBatch_POST_createsFriendNewPost', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { type: string; userId: string } }]
      >;
      const call = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(call).toBeDefined();
      expect(call![0].data.type).toBe('friend_new_post');
    });

    it('test_createFriendContentNotificationsBatch_MOOD_createsFriendNewMood', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'MOOD',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { type: string; userId: string } }]
      >;
      const call = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(call).toBeDefined();
      expect(call![0].data.type).toBe('friend_new_mood');
    });

    it('test_createFriendContentNotificationsBatch_STATUS_mapsTofriendNewMood', async () => {
      // STATUS and MOOD share friend_new_mood to avoid type proliferation
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STATUS',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { type: string; userId: string } }]
      >;
      const call = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(call).toBeDefined();
      expect(call![0].data.type).toBe('friend_new_mood');
    });
  });

  // =====================================================
  // Push body content — must never be empty
  // =====================================================

  describe('notification content (push body)', () => {
    it('test_createFriendContentNotificationsBatch_noExcerpt_STORY_usesFallbackPhrase', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STORY',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { content: string; userId: string } }]
      >;
      const call = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(call![0].data.content).toBe('a publié une nouvelle story');
    });

    it('test_createFriendContentNotificationsBatch_noExcerpt_POST_usesFallbackPhrase', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { content: string; userId: string } }]
      >;
      const call = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(call![0].data.content).toBe('a publié un nouveau post');
    });

    it('test_createFriendContentNotificationsBatch_noExcerpt_STATUS_usesMoodFallbackPhrase', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STATUS',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { content: string; userId: string } }]
      >;
      const call = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(call![0].data.content).toBe('a publié une nouvelle humeur');
    });

    it('test_createFriendContentNotificationsBatch_withExcerpt_usesExcerptAsContent', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
        excerpt: 'Look at this sunset',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { content: string; userId: string } }]
      >;
      const call = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(call![0].data.content).toBe('Look at this sunset');
    });
  });

  // =====================================================
  // Fan-out to multiple friends
  // =====================================================

  describe('friend fan-out', () => {
    it('test_createFriendContentNotificationsBatch_multipleFriends_allReceiveNotification', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
        makeFriendRequest(FRIEND_2, AUTHOR_ID), // bidirectional
        makeFriendRequest(AUTHOR_ID, FRIEND_3),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { userId: string } }]
      >;
      const recipientIds = calls.map((c) => c[0].data.userId);
      expect(recipientIds).toContain(FRIEND_1);
      expect(recipientIds).toContain(FRIEND_2);
      expect(recipientIds).toContain(FRIEND_3);
    });

    it('test_createFriendContentNotificationsBatch_noFriends_noNotificationsCreated', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
      });

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('test_createFriendContentNotificationsBatch_friendQueryUsesAcceptedStatusAndOr', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STORY',
      });

      expect(prisma.friendRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'accepted',
            OR: [{ senderId: AUTHOR_ID }, { receiverId: AUTHOR_ID }],
          }),
        })
      );
    });

    it('test_createFriendContentNotificationsBatch_friendQueryCappedAt500', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
      });

      expect(prisma.friendRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 500 })
      );
    });

    it('test_createFriendContentNotificationsBatch_friendQueryOrderedByUpdatedAtDesc', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
      });

      expect(prisma.friendRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { updatedAt: 'desc' } })
      );
    });
  });

  // =====================================================
  // Self-author paranoid skip
  // =====================================================

  describe('self-author skip', () => {
    it('test_createFriendContentNotificationsBatch_authorInFriendList_notSentToSelf', async () => {
      // Paranoid check: author somehow appears as their own friend
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, AUTHOR_ID),
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { userId: string } }]
      >;
      const selfCall = calls.find((c) => c[0].data.userId === AUTHOR_ID);
      expect(selfCall).toBeUndefined();

      const friendCall = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(friendCall).toBeDefined();
    });
  });

  // =====================================================
  // excludeUserIds dedup (user_mentioned takes priority)
  // =====================================================

  describe('excludeUserIds dedup', () => {
    it('test_createFriendContentNotificationsBatch_mentionedFriend_excludedFromFanOut', async () => {
      // FRIEND_1 was @mentioned in the post → should only get user_mentioned, not friend_new_post
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
        makeFriendRequest(AUTHOR_ID, FRIEND_2),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
        excludeUserIds: [FRIEND_1],
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { userId: string } }]
      >;
      const friend1Call = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(friend1Call).toBeUndefined();

      const friend2Call = calls.find((c) => c[0].data.userId === FRIEND_2);
      expect(friend2Call).toBeDefined();
    });

    it('test_createFriendContentNotificationsBatch_noExcludeUserIds_allFriendsNotified', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
        makeFriendRequest(AUTHOR_ID, FRIEND_2),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
        // no excludeUserIds
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { userId: string } }]
      >;
      expect(calls.find((c) => c[0].data.userId === FRIEND_1)).toBeDefined();
      expect(calls.find((c) => c[0].data.userId === FRIEND_2)).toBeDefined();
    });

    it('test_createFriendContentNotificationsBatch_multipleExcluded_allSkipped', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
        makeFriendRequest(AUTHOR_ID, FRIEND_2),
        makeFriendRequest(AUTHOR_ID, FRIEND_3),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STORY',
        excludeUserIds: [FRIEND_1, FRIEND_2],
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { userId: string } }]
      >;
      expect(calls.find((c) => c[0].data.userId === FRIEND_1)).toBeUndefined();
      expect(calls.find((c) => c[0].data.userId === FRIEND_2)).toBeUndefined();
      expect(calls.find((c) => c[0].data.userId === FRIEND_3)).toBeDefined();
    });
  });

  // =====================================================
  // Duplicate friend dedup (seenIds)
  // =====================================================

  describe('duplicate dedup (seenIds)', () => {
    it('test_createFriendContentNotificationsBatch_duplicateFriendRow_onlyOneNotificationCreated', async () => {
      // Two friend rows resolving to the same friendId (data anomaly guard)
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
        makeFriendRequest(FRIEND_1, AUTHOR_ID), // duplicate from other direction
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { userId: string } }]
      >;
      const friend1Calls = calls.filter((c) => c[0].data.userId === FRIEND_1);
      expect(friend1Calls).toHaveLength(1);
    });
  });

  // =====================================================
  // Author not found → early return
  // =====================================================

  describe('early return when author not found', () => {
    it('test_createFriendContentNotificationsBatch_authorNotFound_earlyReturn', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
      });

      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(prisma.friendRequest.findMany).not.toHaveBeenCalled();
    });
  });

  // =====================================================
  // Promise.allSettled resilience
  // =====================================================

  describe('Promise.allSettled resilience', () => {
    it('test_createFriendContentNotificationsBatch_oneRecipientThrows_othersStillNotified', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
        makeFriendRequest(AUTHOR_ID, FRIEND_2),
      ]);

      (prisma.notification.create as jest.Mock)
        .mockRejectedValueOnce(new Error('DB error for FRIEND_1'))
        .mockResolvedValueOnce(makeNotif('friend_new_post'));

      await expect(
        service.createFriendContentNotificationsBatch({
          postId: POST_ID,
          authorId: AUTHOR_ID,
          contentType: 'POST',
        })
      ).resolves.not.toThrow();

      // Both friends were attempted
      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    });

    it('test_createFriendContentNotificationsBatch_allFail_doesNotThrow', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
        makeFriendRequest(AUTHOR_ID, FRIEND_2),
      ]);

      (prisma.notification.create as jest.Mock).mockRejectedValue(new Error('DB down'));

      await expect(
        service.createFriendContentNotificationsBatch({
          postId: POST_ID,
          authorId: AUTHOR_ID,
          contentType: 'STORY',
        })
      ).resolves.not.toThrow();
    });
  });

  // =====================================================
  // Context: postId included in notification
  // =====================================================

  describe('notification context', () => {
    it('test_createFriendContentNotificationsBatch_notificationContextIncludesPostId', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STORY',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { context: { postId?: string }; userId: string } }]
      >;
      const call = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(call![0].data.context).toMatchObject({ postId: POST_ID });
    });

    it('test_createFriendContentNotificationsBatch_priority_isNormal', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { priority: string; userId: string } }]
      >;
      const call = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(call![0].data.priority).toBe('normal');
    });
  });

  // =====================================================
  // REEL distinction (réel vs post/story/mood)
  // =====================================================

  describe('REEL content type', () => {
    it('test_createFriendContentNotificationsBatch_REEL_mapsToFriendNewPostType', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'REEL',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { type: string; userId: string } }]
      >;
      const call = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(call![0].data.type).toBe('friend_new_post');
    });

    it('test_createFriendContentNotificationsBatch_REEL_preservesContentTypeInMetadata', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'REEL',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { metadata: { contentType?: string }; userId: string } }]
      >;
      const call = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(call![0].data.metadata.contentType).toBe('REEL');
    });
  });

  // =====================================================
  // Post publication / expiry context (story expirée)
  // =====================================================

  describe('post timestamps in context', () => {
    it('test_createFriendContentNotificationsBatch_storyExpiry_persistedInContext', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);
      const createdAt = new Date('2026-06-20T10:00:00.000Z');
      const expiresAt = new Date('2026-06-21T10:00:00.000Z');

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STORY',
        postCreatedAt: createdAt,
        postExpiresAt: expiresAt,
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { context: { postCreatedAt?: string; postExpiresAt?: string }; userId: string } }]
      >;
      const call = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(call![0].data.context.postCreatedAt).toBe(createdAt.toISOString());
      expect(call![0].data.context.postExpiresAt).toBe(expiresAt.toISOString());
    });

    it('test_createFriendContentNotificationsBatch_noTimestamps_contextOmitsThem', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { context: Record<string, unknown>; userId: string } }]
      >;
      const call = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(call![0].data.context).not.toHaveProperty('postExpiresAt');
      expect(call![0].data.context).not.toHaveProperty('postCreatedAt');
    });

    it('test_createFriendContentNotificationsBatch_mediaType_persistedInMetadata', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STORY',
        mediaType: 'image',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { metadata: { mediaType?: string }; userId: string } }]
      >;
      const call = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(call![0].data.metadata.mediaType).toBe('image');
    });
  });

  // =====================================================
  // Visibility filtering
  // =====================================================

  describe('visibility filtering', () => {
    it('test_createFriendContentNotificationsBatch_PRIVATE_noNotificationsSent', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
        makeFriendRequest(AUTHOR_ID, FRIEND_2),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STORY',
        visibility: 'PRIVATE',
      });

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('test_createFriendContentNotificationsBatch_ONLY_notifiesOnlyVisibilityUserIds', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
        makeFriendRequest(AUTHOR_ID, FRIEND_2),
        makeFriendRequest(AUTHOR_ID, FRIEND_3),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STORY',
        visibility: 'ONLY',
        visibilityUserIds: [FRIEND_2],
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { userId: string } }]
      >;
      const recipientIds = calls.map((c) => c[0].data.userId);
      expect(recipientIds).not.toContain(FRIEND_1);
      expect(recipientIds).toContain(FRIEND_2);
      expect(recipientIds).not.toContain(FRIEND_3);
    });

    it('test_createFriendContentNotificationsBatch_EXCEPT_notifiesFriendsExcludingListedIds', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
        makeFriendRequest(AUTHOR_ID, FRIEND_2),
        makeFriendRequest(AUTHOR_ID, FRIEND_3),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STORY',
        visibility: 'EXCEPT',
        visibilityUserIds: [FRIEND_2],
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { userId: string } }]
      >;
      const recipientIds = calls.map((c) => c[0].data.userId);
      expect(recipientIds).toContain(FRIEND_1);
      expect(recipientIds).not.toContain(FRIEND_2);
      expect(recipientIds).toContain(FRIEND_3);
    });

    it('test_createFriendContentNotificationsBatch_PUBLIC_notifiesAllFriends', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
        makeFriendRequest(AUTHOR_ID, FRIEND_2),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STORY',
        visibility: 'PUBLIC',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { userId: string } }]
      >;
      const recipientIds = calls.map((c) => c[0].data.userId);
      expect(recipientIds).toContain(FRIEND_1);
      expect(recipientIds).toContain(FRIEND_2);
    });

    it('test_createFriendContentNotificationsBatch_FRIENDS_notifiesAllFriends', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
        makeFriendRequest(AUTHOR_ID, FRIEND_2),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STORY',
        visibility: 'FRIENDS',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { userId: string } }]
      >;
      const recipientIds = calls.map((c) => c[0].data.userId);
      expect(recipientIds).toContain(FRIEND_1);
      expect(recipientIds).toContain(FRIEND_2);
    });

    it('test_createFriendContentNotificationsBatch_noVisibility_defaultsToAllFriends', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STORY',
        // no visibility field → backward-compatible default (PUBLIC)
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { userId: string } }]
      >;
      expect(calls.find((c) => c[0].data.userId === FRIEND_1)).toBeDefined();
    });

    it('test_createFriendContentNotificationsBatch_ONLY_excludesExcludeUserIds', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1),
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STORY',
        visibility: 'ONLY',
        visibilityUserIds: [FRIEND_2, FRIEND_3],
        excludeUserIds: [FRIEND_2],
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { userId: string } }]
      >;
      const recipientIds = calls.map((c) => c[0].data.userId);
      expect(recipientIds).not.toContain(FRIEND_2);
      expect(recipientIds).toContain(FRIEND_3);
    });

    it('test_createFriendContentNotificationsBatch_COMMUNITY_notifiesCoMembersNotFriends', async () => {
      // R1: une action dans une communauté est OBLIGATOIREMENT notifiée à TOUS
      // les membres de la communauté — pas aux contacts (friends) de l'auteur.
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        makeFriendRequest(AUTHOR_ID, FRIEND_1), // contact, NOT a community member
      ]);
      // getCommunityCoMemberIds: 1er findMany → appartenances de l'auteur,
      // 2e findMany → co-membres actifs de ces communautés.
      (prisma.communityMember.findMany as jest.Mock)
        .mockResolvedValueOnce([{ communityId: 'community-1' }])
        .mockResolvedValueOnce([{ userId: FRIEND_2 }, { userId: FRIEND_3 }]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
        visibility: 'COMMUNITY',
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { userId: string } }]
      >;
      const recipientIds = calls.map((c) => c[0].data.userId);
      expect(recipientIds).toContain(FRIEND_2);
      expect(recipientIds).toContain(FRIEND_3);
      expect(recipientIds).not.toContain(FRIEND_1);
    });

    it('test_createFriendContentNotificationsBatch_COMMUNITY_excludesAuthorAndExcludeUserIds', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.communityMember.findMany as jest.Mock)
        .mockResolvedValueOnce([{ communityId: 'community-1' }])
        .mockResolvedValueOnce([{ userId: AUTHOR_ID }, { userId: FRIEND_2 }, { userId: FRIEND_3 }]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
        visibility: 'COMMUNITY',
        excludeUserIds: [FRIEND_2],
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { userId: string } }]
      >;
      const recipientIds = calls.map((c) => c[0].data.userId);
      expect(recipientIds).not.toContain(AUTHOR_ID);
      expect(recipientIds).not.toContain(FRIEND_2);
      expect(recipientIds).toContain(FRIEND_3);
    });

    it('test_createFriendContentNotificationsBatch_ONLY_doesNotSendToAuthor', async () => {
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'STORY',
        visibility: 'ONLY',
        visibilityUserIds: [AUTHOR_ID, FRIEND_1],
      });

      const calls = (prisma.notification.create as jest.Mock).mock.calls as Array<
        [{ data: { userId: string } }]
      >;
      const recipientIds = calls.map((c) => c[0].data.userId);
      expect(recipientIds).not.toContain(AUTHOR_ID);
      expect(recipientIds).toContain(FRIEND_1);
    });
  });
});
