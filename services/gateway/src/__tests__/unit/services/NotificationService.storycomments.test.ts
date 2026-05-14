/**
 * Unit tests for Phase 1D — story comment notification fan-out
 *
 * Covers:
 *  - getStoryNotificationRecipients: bucketing + deduplication + exclusions
 *  - createStoryCommentNotificationsBatch: correct types per bucket, no self-notification
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
    sanitizeUsername: jest.fn((input: string) => input?.replace(/[^a-zA-Z0-9_.-]/g, '').substring(0, 50) || ''),
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
      updateMany: jest.fn(),
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
    friendRequest: {
      findMany: jest.fn(),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  messaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('message-id') })),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn(), logAttempt: jest.fn(), logSuccess: jest.fn() },
}));

import { NotificationService } from '../../../services/notifications/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';

// -------------------------------------------------------
// Test helpers
// -------------------------------------------------------

const AUTHOR_ID = '507f1f77bcf86cd799439001';
const COMMENTER_ID = '507f1f77bcf86cd799439002';
const FRIEND_1 = '507f1f77bcf86cd799439003';
const FRIEND_2 = '507f1f77bcf86cd799439004';
const PREV_COMMENTER_1 = '507f1f77bcf86cd799439005';
const PREV_COMMENTER_2 = '507f1f77bcf86cd799439006';
const POST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const COMMENT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function makeNotif(type: string) {
  return { id: `notif-${type}-${Math.random()}`, type, isRead: false, createdAt: new Date() };
}

describe('NotificationService — Phase 1D: story comment fan-out', () => {
  let service: NotificationService;
  let prisma: any;
  let mockIO: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    prisma = new PrismaClient();
    service = new NotificationService(prisma);

    mockIO = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    service.setSocketIO(mockIO as any, new Map());

    // By default user preferences allow all notifications
    prisma.userPreferences.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ======================================================
  // getStoryNotificationRecipients
  // ======================================================

  describe('getStoryNotificationRecipients', () => {
    it('returns authorId bucket with the story author', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      const result = await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(result.authorId).toBe(AUTHOR_ID);
    });

    it('returns previousCommenterIds excluding the current commenter', async () => {
      prisma.postComment.findMany.mockResolvedValue([
        { authorId: PREV_COMMENTER_1 },
        { authorId: PREV_COMMENTER_2 },
      ]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      const result = await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(result.previousCommenterIds).toContain(PREV_COMMENTER_1);
      expect(result.previousCommenterIds).toContain(PREV_COMMENTER_2);
      expect(result.previousCommenterIds).not.toContain(COMMENTER_ID);
    });

    it('excludes story author from previousCommenterIds', async () => {
      // Story author also posted a prior comment
      prisma.postComment.findMany.mockResolvedValue([
        { authorId: AUTHOR_ID },
        { authorId: PREV_COMMENTER_1 },
      ]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      const result = await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(result.previousCommenterIds).not.toContain(AUTHOR_ID);
      expect(result.previousCommenterIds).toContain(PREV_COMMENTER_1);
    });

    it('returns friendIds excluding commenter and author', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: FRIEND_1 },
        { senderId: AUTHOR_ID, receiverId: FRIEND_2 },
      ]);

      const result = await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(result.friendIds).toContain(FRIEND_1);
      expect(result.friendIds).toContain(FRIEND_2);
      expect(result.friendIds).not.toContain(AUTHOR_ID);
      expect(result.friendIds).not.toContain(COMMENTER_ID);
    });

    it('user who is BOTH friend AND prior commenter appears ONLY in previousCommenterIds (priority: thread > friend)', async () => {
      // FRIEND_1 has previously commented AND is a friend of the author
      prisma.postComment.findMany.mockResolvedValue([{ authorId: FRIEND_1 }]);
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: FRIEND_1 },
      ]);

      const result = await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(result.previousCommenterIds).toContain(FRIEND_1);
      expect(result.friendIds).not.toContain(FRIEND_1);
    });

    it('queries postComment excluding current commenter and friendRequest for author', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(prisma.postComment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            postId: POST_ID,
            isDeleted: false,
            NOT: { authorId: COMMENTER_ID },
          }),
        })
      );

      expect(prisma.friendRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'accepted',
            OR: [{ senderId: AUTHOR_ID }, { receiverId: AUTHOR_ID }],
          }),
        })
      );
    });

    it('caps postComment query at 500 rows to bound fan-out on viral posts', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(prisma.postComment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 500 })
      );
    });

    it('caps friendRequest query at 500 rows to bound fan-out on popular authors', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(prisma.friendRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 500 })
      );
    });
  });

  // ======================================================
  // createStoryCommentNotificationsBatch
  // ======================================================

  describe('createStoryCommentNotificationsBatch', () => {
    const baseParams = {
      postId: POST_ID,
      commentId: COMMENT_ID,
      storyAuthorId: AUTHOR_ID,
      commenterId: COMMENTER_ID,
      commentExcerpt: 'Great story!',
    };

    beforeEach(() => {
      // Actor lookup for the commenter
      prisma.user.findUnique.mockResolvedValue({
        username: 'commenter_user',
        displayName: 'Commenter',
        avatar: null,
      });
    });

    it('creates STORY_NEW_COMMENT for the story author', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.notification.create.mockResolvedValue(makeNotif('story_new_comment'));

      await service.createStoryCommentNotificationsBatch(baseParams);

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      const authorCall = calls.find((c) => c[0].data.userId === AUTHOR_ID);
      expect(authorCall).toBeDefined();
      expect(authorCall![0].data.type).toBe('story_new_comment');
    });

    it('creates STORY_THREAD_REPLY for previous commenters', async () => {
      prisma.postComment.findMany.mockResolvedValue([{ authorId: PREV_COMMENTER_1 }]);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.notification.create.mockResolvedValue(makeNotif('story_thread_reply'));

      await service.createStoryCommentNotificationsBatch(baseParams);

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      const threadCall = calls.find((c) => c[0].data.userId === PREV_COMMENTER_1);
      expect(threadCall).toBeDefined();
      expect(threadCall![0].data.type).toBe('story_thread_reply');
    });

    it('creates FRIEND_STORY_COMMENT for friends of the author', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: FRIEND_1 },
      ]);
      prisma.notification.create.mockResolvedValue(makeNotif('friend_story_comment'));

      await service.createStoryCommentNotificationsBatch(baseParams);

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      const friendCall = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(friendCall).toBeDefined();
      expect(friendCall![0].data.type).toBe('friend_story_comment');
    });

    it('does NOT notify the commenter themselves', async () => {
      // Commenter is in friends list
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: COMMENTER_ID },
      ]);
      prisma.notification.create.mockResolvedValue(makeNotif('friend_story_comment'));

      await service.createStoryCommentNotificationsBatch(baseParams);

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string } }]>;
      const selfCall = calls.find((c) => c[0].data.userId === COMMENTER_ID);
      expect(selfCall).toBeUndefined();
    });

    it('user who is BOTH friend AND prior commenter gets ONLY STORY_THREAD_REPLY, not both', async () => {
      prisma.postComment.findMany.mockResolvedValue([{ authorId: FRIEND_1 }]);
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: FRIEND_1 },
      ]);
      prisma.notification.create.mockResolvedValue(makeNotif('story_thread_reply'));

      await service.createStoryCommentNotificationsBatch(baseParams);

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      const friend1Calls = calls.filter((c) => c[0].data.userId === FRIEND_1);
      expect(friend1Calls).toHaveLength(1);
      expect(friend1Calls[0][0].data.type).toBe('story_thread_reply');
    });

    it('author who is also a prior commenter still only gets STORY_NEW_COMMENT', async () => {
      // The findMany query excludes the commenter (NOT authorId: commenterId),
      // so if author = prior commenter, author appears in previousComments but
      // getStoryNotificationRecipients filters them from previousCommenterIds.
      prisma.postComment.findMany.mockResolvedValue([{ authorId: AUTHOR_ID }]);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.notification.create.mockResolvedValue(makeNotif('story_new_comment'));

      await service.createStoryCommentNotificationsBatch(baseParams);

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      const authorCalls = calls.filter((c) => c[0].data.userId === AUTHOR_ID);
      expect(authorCalls).toHaveLength(1);
      expect(authorCalls[0][0].data.type).toBe('story_new_comment');
    });

    it('creates no notifications when commenter == author', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      await service.createStoryCommentNotificationsBatch({
        ...baseParams,
        commenterId: AUTHOR_ID, // commenter is the author
      });

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('returns early without creating notifications when actor user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.createStoryCommentNotificationsBatch(baseParams);

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('STORY_NEW_COMMENT has priority normal, STORY_THREAD_REPLY has priority low, FRIEND_STORY_COMMENT has priority low', async () => {
      prisma.postComment.findMany.mockResolvedValue([{ authorId: PREV_COMMENTER_1 }]);
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: FRIEND_1 },
      ]);
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      await service.createStoryCommentNotificationsBatch(baseParams);

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string; priority: string } }]>;

      const authorCall = calls.find((c) => c[0].data.userId === AUTHOR_ID);
      const threadCall = calls.find((c) => c[0].data.userId === PREV_COMMENTER_1);
      const friendCall = calls.find((c) => c[0].data.userId === FRIEND_1);

      expect(authorCall![0].data.priority).toBe('normal');
      expect(threadCall![0].data.priority).toBe('low');
      expect(friendCall![0].data.priority).toBe('low');
    });

    // ------------------------------------------------------------------
    // Phase 2B: excludeUserIds dedup
    // ------------------------------------------------------------------

    it('excludes mentioned previous-commenter from STORY_THREAD_REPLY (user_mentioned takes priority)', async () => {
      // PREV_COMMENTER_1 was mentioned → should only get user_mentioned, not thread reply
      prisma.postComment.findMany.mockResolvedValue([{ authorId: PREV_COMMENTER_1 }]);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      await service.createStoryCommentNotificationsBatch({
        ...baseParams,
        excludeUserIds: [PREV_COMMENTER_1],
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      const threadCall = calls.find((c) => c[0].data.userId === PREV_COMMENTER_1);
      expect(threadCall).toBeUndefined();
    });

    it('excludes mentioned friend from FRIEND_STORY_COMMENT (user_mentioned takes priority)', async () => {
      // FRIEND_1 was mentioned → should only get user_mentioned, not friend story comment
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: FRIEND_1 },
      ]);
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      await service.createStoryCommentNotificationsBatch({
        ...baseParams,
        excludeUserIds: [FRIEND_1],
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      const friendCall = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(friendCall).toBeUndefined();
    });

    it('still sends STORY_NEW_COMMENT to author even when author is in excludeUserIds', async () => {
      // Author priority is always maintained regardless of excludeUserIds
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.notification.create.mockResolvedValue(makeNotif('story_new_comment'));

      await service.createStoryCommentNotificationsBatch({
        ...baseParams,
        excludeUserIds: [AUTHOR_ID],
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      const authorCall = calls.find((c) => c[0].data.userId === AUTHOR_ID);
      expect(authorCall).toBeDefined();
      expect(authorCall![0].data.type).toBe('story_new_comment');
    });

    it('works correctly with no excludeUserIds (backward compatibility)', async () => {
      prisma.postComment.findMany.mockResolvedValue([{ authorId: PREV_COMMENTER_1 }]);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.notification.create.mockResolvedValue(makeNotif('story_thread_reply'));

      await service.createStoryCommentNotificationsBatch(baseParams); // no excludeUserIds

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      const threadCall = calls.find((c) => c[0].data.userId === PREV_COMMENTER_1);
      expect(threadCall).toBeDefined();
    });
  });

  // ======================================================
  // createCommentMentionNotificationsBatch (Phase 2B)
  // ======================================================

  describe('createCommentMentionNotificationsBatch', () => {
    const ALICE_ID = '507f1f77bcf86cd799439010';
    const BOB_ID = '507f1f77bcf86cd799439011';
    const POST_ID_2 = 'cccccccccccccccccccccccc';
    const COMMENT_ID_2 = 'dddddddddddddddddddddddd';

    const baseCommentMentionParams = {
      commentId: COMMENT_ID_2,
      postId: POST_ID_2,
      commenterId: COMMENTER_ID,
      mentionedUserIds: [ALICE_ID, BOB_ID],
      commentExcerpt: 'Hey @alice and @bob check this out!',
    };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        username: 'commenter_user',
        displayName: 'Commenter',
        avatar: null,
      });
    });

    it('both @alice and @bob receive user_mentioned notification', async () => {
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      await service.createCommentMentionNotificationsBatch(baseCommentMentionParams);

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      const aliceCall = calls.find((c) => c[0].data.userId === ALICE_ID);
      const bobCall = calls.find((c) => c[0].data.userId === BOB_ID);

      expect(aliceCall).toBeDefined();
      expect(aliceCall![0].data.type).toBe('user_mentioned');
      expect(bobCall).toBeDefined();
      expect(bobCall![0].data.type).toBe('user_mentioned');
    });

    it('self-mention is skipped (commenter does not get user_mentioned)', async () => {
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      await service.createCommentMentionNotificationsBatch({
        ...baseCommentMentionParams,
        mentionedUserIds: [COMMENTER_ID, ALICE_ID],
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string } }]>;
      const selfCall = calls.find((c) => c[0].data.userId === COMMENTER_ID);
      expect(selfCall).toBeUndefined();

      const aliceCall = calls.find((c) => c[0].data.userId === ALICE_ID);
      expect(aliceCall).toBeDefined();
    });

    it('user_mentioned notifications have priority high', async () => {
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      await service.createCommentMentionNotificationsBatch({
        ...baseCommentMentionParams,
        mentionedUserIds: [ALICE_ID],
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; priority: string } }]>;
      const aliceCall = calls.find((c) => c[0].data.userId === ALICE_ID);
      expect(aliceCall![0].data.priority).toBe('high');
    });

    it('returns early without creating notifications when commenter user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.createCommentMentionNotificationsBatch(baseCommentMentionParams);

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('does nothing when mentionedUserIds is empty', async () => {
      await service.createCommentMentionNotificationsBatch({
        ...baseCommentMentionParams,
        mentionedUserIds: [],
      });

      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('notification context includes postId and commentId for iOS routing', async () => {
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      await service.createCommentMentionNotificationsBatch({
        ...baseCommentMentionParams,
        mentionedUserIds: [ALICE_ID],
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { context: any } }]>;
      const aliceCall = calls.find(
        (c) => (c[0].data as any).userId === ALICE_ID
      );
      expect(aliceCall![0].data.context).toMatchObject({
        postId: POST_ID_2,
        commentId: COMMENT_ID_2,
      });
    });

    it('blocks further mentions when rate limit exceeded for a sender:recipient pair', async () => {
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      // Exhaust the rate limit (MAX_MENTIONS_PER_MINUTE = 5)
      for (let i = 0; i < 5; i++) {
        await service.createCommentMentionNotificationsBatch({
          ...baseCommentMentionParams,
          mentionedUserIds: [ALICE_ID],
        });
      }

      const callsBefore = prisma.notification.create.mock.calls.length;

      // 6th attempt — should be blocked
      await service.createCommentMentionNotificationsBatch({
        ...baseCommentMentionParams,
        mentionedUserIds: [ALICE_ID],
      });

      expect(prisma.notification.create.mock.calls.length).toBe(callsBefore);
    });

    // Fix 5: Promise.allSettled — one failure does not block other recipients
    it('test_createCommentMentionNotificationsBatch_oneRecipientThrows_otherRecipientStillNotified', async () => {
      prisma.notification.create
        .mockRejectedValueOnce(new Error('DB error for Alice'))
        .mockResolvedValueOnce(makeNotif('user_mentioned'));

      // Should not throw even when one recipient fails
      await expect(
        service.createCommentMentionNotificationsBatch({
          ...baseCommentMentionParams,
          mentionedUserIds: [ALICE_ID, BOB_ID],
        })
      ).resolves.not.toThrow();

      // Bob's notification was still attempted
      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string } }]>;
      const bobCall = calls.find((c) => c[0].data.userId === BOB_ID);
      expect(bobCall).toBeDefined();
    });
  });

  // ======================================================
  // Fix 5: Promise.allSettled in createStoryCommentNotificationsBatch
  // ======================================================

  describe('createStoryCommentNotificationsBatch — allSettled resilience', () => {
    it('test_createStoryCommentNotificationsBatch_oneRecipientThrows_otherRecipientsStillNotified', async () => {
      prisma.user.findUnique.mockResolvedValue({
        username: 'commenter_user',
        displayName: 'Commenter',
        avatar: null,
      });
      prisma.postComment.findMany.mockResolvedValue([{ authorId: PREV_COMMENTER_1 }]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      // Author notification throws, but prev commenter should still be attempted
      prisma.notification.create
        .mockRejectedValueOnce(new Error('Push failed for author'))
        .mockResolvedValueOnce(makeNotif('story_thread_reply'));

      await expect(
        service.createStoryCommentNotificationsBatch({
          postId: POST_ID,
          commentId: COMMENT_ID,
          storyAuthorId: AUTHOR_ID,
          commenterId: COMMENTER_ID,
        })
      ).resolves.not.toThrow();

      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    });
  });

  // ======================================================
  // Fix 6: orderBy on truncated queries
  // ======================================================

  describe('getStoryNotificationRecipients — orderBy determinism', () => {
    it('test_getStoryNotificationRecipients_postCommentQuery_includesOrderByCreatedAtDesc', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(prisma.postComment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } })
      );
    });

    it('test_getStoryNotificationRecipients_friendRequestQuery_includesOrderByUpdatedAtDesc', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(prisma.friendRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { updatedAt: 'desc' } })
      );
    });
  });
});
