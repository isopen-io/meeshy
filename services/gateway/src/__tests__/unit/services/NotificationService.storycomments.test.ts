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
    // By default no reactors (override in individual tests)
    prisma.postReaction.findMany.mockResolvedValue([]);
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
            deletedAt: null,
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

    // ------------------------------------------------------------------
    // Fix 1: reactor engagement (P0)
    // ------------------------------------------------------------------

    it('test_getStoryNotificationRecipients_reactorOnly_appearsInPreviousCommenterIds', async () => {
      // FRIEND_1 reacted to the story but never commented
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([{ userId: FRIEND_1 }]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      const result = await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      // Reactor is merged into the thread-engagement bucket
      expect(result.previousCommenterIds).toContain(FRIEND_1);
    });

    it('test_getStoryNotificationRecipients_reactorAndCommenter_appearsOnce', async () => {
      // PREV_COMMENTER_1 both reacted and commented — should appear only once
      prisma.postComment.findMany.mockResolvedValue([{ authorId: PREV_COMMENTER_1 }]);
      prisma.postReaction.findMany.mockResolvedValue([{ userId: PREV_COMMENTER_1 }]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      const result = await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      const appearances = result.previousCommenterIds.filter((id) => id === PREV_COMMENTER_1);
      expect(appearances).toHaveLength(1);
    });

    it('test_getStoryNotificationRecipients_reactorWhoIsFriend_appearsInThreadNotFriendBucket', async () => {
      // FRIEND_1 reacted but did not comment; is also a friend of author
      // Thread bucket has priority over friend bucket
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([{ userId: FRIEND_1 }]);
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: FRIEND_1 },
      ]);

      const result = await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(result.previousCommenterIds).toContain(FRIEND_1);
      expect(result.friendIds).not.toContain(FRIEND_1);
    });

    it('test_getStoryNotificationRecipients_reactorIsCommenter_excluded', async () => {
      // The current commenter also reacted — should be excluded
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([{ userId: COMMENTER_ID }]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      const result = await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(result.previousCommenterIds).not.toContain(COMMENTER_ID);
    });

    it('test_getStoryNotificationRecipients_postReactionQuery_excludesCommenterAndCapsAt500', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(prisma.postReaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            postId: POST_ID,
            NOT: { userId: COMMENTER_ID },
          }),
          take: 500,
        })
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

    it('test_storyComment_persistsPostExpiryInContext_forExpiredStoryAwareness', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.notification.create.mockResolvedValue(makeNotif('story_new_comment'));
      const createdAt = new Date('2026-06-20T08:00:00.000Z');
      const expiresAt = new Date('2026-06-21T08:00:00.000Z');

      await service.createStoryCommentNotificationsBatch({
        ...baseParams,
        postCreatedAt: createdAt,
        postExpiresAt: expiresAt,
      });

      const calls = prisma.notification.create.mock.calls as Array<
        [{ data: { userId: string; context: { postCreatedAt?: string; postExpiresAt?: string } } }]
      >;
      const authorCall = calls.find((c) => c[0].data.userId === AUTHOR_ID);
      expect(authorCall![0].data.context.postCreatedAt).toBe(createdAt.toISOString());
      expect(authorCall![0].data.context.postExpiresAt).toBe(expiresAt.toISOString());
    });

    it('test_storyComment_persistsPostTypeInMetadata', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.notification.create.mockResolvedValue(makeNotif('story_new_comment'));

      await service.createStoryCommentNotificationsBatch(baseParams);

      const calls = prisma.notification.create.mock.calls as Array<
        [{ data: { userId: string; metadata: { postType?: string } } }]
      >;
      const authorCall = calls.find((c) => c[0].data.userId === AUTHOR_ID);
      expect(authorCall![0].data.metadata.postType).toBe('STORY');
    });

    it('test_storyComment_REEL_authorBucketSkipped_handledByPostCommentRoute', async () => {
      // REEL author is notified via post_comment (route), so the author bucket
      // (story_new_comment) must be skipped to avoid a double notification.
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.notification.create.mockResolvedValue(makeNotif('story_thread_reply'));

      await service.createStoryCommentNotificationsBatch({ ...baseParams, postType: 'REEL' });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      const authorCall = calls.find((c) => c[0].data.userId === AUTHOR_ID);
      expect(authorCall).toBeUndefined();
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

    // ------------------------------------------------------------------
    // Visibility gating — a restricted post must NOT fan a comment excerpt
    // out to friends/thread-participants outside the post's audience.
    // Mirrors SocialEventsHandler.getVisibilityFilteredRecipients.
    // ------------------------------------------------------------------

    it('ONLY: notifies a friend on the allow-list, NOT a friend off it', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: FRIEND_1 },
        { senderId: AUTHOR_ID, receiverId: FRIEND_2 },
      ]);
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type)),
      );

      await service.createStoryCommentNotificationsBatch({
        ...baseParams,
        postType: 'POST',
        visibility: 'ONLY',
        visibilityUserIds: [FRIEND_1],
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string } }]>;
      expect(calls.find((c) => c[0].data.userId === FRIEND_1)).toBeDefined();
      expect(calls.find((c) => c[0].data.userId === FRIEND_2)).toBeUndefined();
    });

    it('EXCEPT: does NOT notify a friend on the exclude-list', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: FRIEND_1 },
        { senderId: AUTHOR_ID, receiverId: FRIEND_2 },
      ]);
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type)),
      );

      await service.createStoryCommentNotificationsBatch({
        ...baseParams,
        postType: 'POST',
        visibility: 'EXCEPT',
        visibilityUserIds: [FRIEND_2],
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string } }]>;
      expect(calls.find((c) => c[0].data.userId === FRIEND_1)).toBeDefined();
      expect(calls.find((c) => c[0].data.userId === FRIEND_2)).toBeUndefined();
    });

    it('PRIVATE: fans out to nobody but the story author', async () => {
      prisma.postComment.findMany.mockResolvedValue([{ authorId: PREV_COMMENTER_1 }]);
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: FRIEND_1 },
      ]);
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type)),
      );

      await service.createStoryCommentNotificationsBatch({
        ...baseParams,
        visibility: 'PRIVATE',
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      expect(calls.find((c) => c[0].data.userId === FRIEND_1)).toBeUndefined();
      expect(calls.find((c) => c[0].data.userId === PREV_COMMENTER_1)).toBeUndefined();
      // The story author (bucket 1) is exempt — they own the post.
      expect(calls.find((c) => c[0].data.userId === AUTHOR_ID)?.[0].data.type).toBe('story_new_comment');
    });

    it('ONLY: also gates the thread bucket (prior commenter off the allow-list is dropped)', async () => {
      prisma.postComment.findMany.mockResolvedValue([{ authorId: PREV_COMMENTER_1 }]);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type)),
      );

      await service.createStoryCommentNotificationsBatch({
        ...baseParams,
        postType: 'POST',
        visibility: 'ONLY',
        visibilityUserIds: [FRIEND_1], // PREV_COMMENTER_1 not allowed
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string } }]>;
      expect(calls.find((c) => c[0].data.userId === PREV_COMMENTER_1)).toBeUndefined();
    });

    it('COMMUNITY: fans out to community co-members, not the author-friend graph', async () => {
      const CO_MEMBER = '507f1f77bcf86cd799439009';
      // getCommunityCoMemberIds resolves memberships then co-members.
      prisma.communityMember.findMany
        .mockResolvedValueOnce([{ communityId: 'comm-1' }]) // author's memberships
        .mockResolvedValueOnce([{ userId: CO_MEMBER }]);    // co-members of comm-1
      prisma.postComment.findMany.mockResolvedValue([]);
      // FRIEND_1 is a friend but NOT a community co-member → must be dropped.
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: FRIEND_1 },
      ]);
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type)),
      );

      await service.createStoryCommentNotificationsBatch({
        ...baseParams,
        postType: 'POST',
        visibility: 'COMMUNITY',
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      expect(calls.find((c) => c[0].data.userId === CO_MEMBER)?.[0].data.type).toBe('friend_story_comment');
      expect(calls.find((c) => c[0].data.userId === FRIEND_1)).toBeUndefined();
    });

    it('default/omitted visibility keeps the full friend fan-out (backward compatibility)', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: FRIEND_1 },
        { senderId: AUTHOR_ID, receiverId: FRIEND_2 },
      ]);
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type)),
      );

      await service.createStoryCommentNotificationsBatch(baseParams); // no visibility

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string } }]>;
      expect(calls.find((c) => c[0].data.userId === FRIEND_1)).toBeDefined();
      expect(calls.find((c) => c[0].data.userId === FRIEND_2)).toBeDefined();
    });

    it('uses the comment excerpt as content when present', async () => {
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.notification.create.mockResolvedValue(makeNotif('story_new_comment'));

      await service.createStoryCommentNotificationsBatch(baseParams);

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; content: string } }]>;
      const authorCall = calls.find((c) => c[0].data.userId === AUTHOR_ID);
      expect(authorCall![0].data.content).toBe('Great story!');
    });

    it('falls back to a per-bucket phrase when the comment has no text excerpt', async () => {
      prisma.postComment.findMany.mockResolvedValue([{ authorId: PREV_COMMENTER_1 }]);
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: FRIEND_1 },
      ]);
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type)),
      );

      await service.createStoryCommentNotificationsBatch({
        ...baseParams,
        commentExcerpt: undefined,
      });

      const calls = prisma.notification.create.mock.calls as Array<
        [{ data: { userId: string; content: string } }]
      >;
      const authorCall = calls.find((c) => c[0].data.userId === AUTHOR_ID);
      const threadCall = calls.find((c) => c[0].data.userId === PREV_COMMENTER_1);
      const friendCall = calls.find((c) => c[0].data.userId === FRIEND_1);
      expect(authorCall![0].data.content).toBe('a commenté votre story');
      expect(threadCall![0].data.content).toBe('a répondu dans une story');
      expect(friendCall![0].data.content).toBe('a commenté une story');
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

    it('a failing recipient does not abort the batch and the failure is logged with the right userId', async () => {
      const { notificationLogger } = jest.requireMock('../../../utils/logger-enhanced') as {
        notificationLogger: { error: jest.Mock };
      };
      prisma.notification.create
        .mockRejectedValueOnce(new Error('db down'))
        .mockImplementation(({ data }: { data: { type: string } }) =>
          Promise.resolve(makeNotif(data.type))
        );

      await service.createCommentMentionNotificationsBatch({
        ...baseCommentMentionParams,
        mentionedUserIds: [COMMENTER_ID, ALICE_ID, BOB_ID],
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string } }]>;
      expect(calls.find((c) => c[0].data.userId === BOB_ID)).toBeDefined();
      expect(notificationLogger.error).toHaveBeenCalledWith(
        'Failed to create notification',
        expect.objectContaining({ userId: ALICE_ID, type: 'user_mentioned' })
      );
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

  // ======================================================
  // Fix 1 (P0): reactor in createStoryCommentNotificationsBatch
  // ======================================================

  describe('createStoryCommentNotificationsBatch — reactor engagement (Fix 1)', () => {
    const REACTOR_ID = '507f1f77bcf86cd799439020';

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        username: 'commenter_user',
        displayName: 'Commenter',
        avatar: null,
      });
    });

    it('test_createStoryCommentBatch_reactorOnly_receivesSTORY_THREAD_REPLY', async () => {
      // REACTOR_ID reacted to the story but never commented
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([{ userId: REACTOR_ID }]);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      await service.createStoryCommentNotificationsBatch({
        postId: POST_ID,
        commentId: COMMENT_ID,
        storyAuthorId: AUTHOR_ID,
        commenterId: COMMENTER_ID,
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      const reactorCall = calls.find((c) => c[0].data.userId === REACTOR_ID);
      expect(reactorCall).toBeDefined();
      expect(reactorCall![0].data.type).toBe('story_thread_reply');
    });

    it('test_createStoryCommentBatch_reactorAndCommenter_receivesOneNotification', async () => {
      // PREV_COMMENTER_1 both reacted and commented — should get exactly one notification
      prisma.postComment.findMany.mockResolvedValue([{ authorId: PREV_COMMENTER_1 }]);
      prisma.postReaction.findMany.mockResolvedValue([{ userId: PREV_COMMENTER_1 }]);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      await service.createStoryCommentNotificationsBatch({
        postId: POST_ID,
        commentId: COMMENT_ID,
        storyAuthorId: AUTHOR_ID,
        commenterId: COMMENTER_ID,
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      const userCalls = calls.filter((c) => c[0].data.userId === PREV_COMMENTER_1);
      expect(userCalls).toHaveLength(1);
      expect(userCalls[0][0].data.type).toBe('story_thread_reply');
    });

    it('test_createStoryCommentBatch_authorPrecedenceUnaffected_authorGetsSTORY_NEW_COMMENT', async () => {
      // Author is still notified with STORY_NEW_COMMENT even when reactors exist
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([{ userId: REACTOR_ID }]);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      await service.createStoryCommentNotificationsBatch({
        postId: POST_ID,
        commentId: COMMENT_ID,
        storyAuthorId: AUTHOR_ID,
        commenterId: COMMENTER_ID,
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      const authorCall = calls.find((c) => c[0].data.userId === AUTHOR_ID);
      expect(authorCall).toBeDefined();
      expect(authorCall![0].data.type).toBe('story_new_comment');
    });
  });

  // ======================================================
  // Fix 2 (P0): createPostMentionNotificationsBatch
  // ======================================================

  describe('createPostMentionNotificationsBatch (Fix 2)', () => {
    const ALICE_ID = '507f1f77bcf86cd799439010';
    const BOB_ID = '507f1f77bcf86cd799439011';
    const POSTER_ID = '507f1f77bcf86cd799439002';
    const P2_POST_ID = 'eeeeeeeeeeeeeeeeeeeeeeee';

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        username: 'poster_user',
        displayName: 'Poster',
        avatar: null,
      });
    });

    it('test_createPostMentionNotificationsBatch_aliceAndBob_bothReceiveUserMentioned', async () => {
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      await service.createPostMentionNotificationsBatch({
        postId: P2_POST_ID,
        posterId: POSTER_ID,
        mentionedUserIds: [ALICE_ID, BOB_ID],
        postExcerpt: 'Check this out @alice @bob',
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; type: string } }]>;
      const aliceCall = calls.find((c) => c[0].data.userId === ALICE_ID);
      const bobCall = calls.find((c) => c[0].data.userId === BOB_ID);
      expect(aliceCall).toBeDefined();
      expect(aliceCall![0].data.type).toBe('user_mentioned');
      expect(bobCall).toBeDefined();
      expect(bobCall![0].data.type).toBe('user_mentioned');
    });

    it('test_createPostMentionNotificationsBatch_failingRecipient_batchContinues_failureLoggedWithRightUserId', async () => {
      const { notificationLogger } = jest.requireMock('../../../utils/logger-enhanced') as {
        notificationLogger: { error: jest.Mock };
      };
      prisma.notification.create
        .mockRejectedValueOnce(new Error('db down'))
        .mockImplementation(({ data }: { data: { type: string } }) =>
          Promise.resolve(makeNotif(data.type))
        );

      await service.createPostMentionNotificationsBatch({
        postId: P2_POST_ID,
        posterId: POSTER_ID,
        mentionedUserIds: [POSTER_ID, ALICE_ID, BOB_ID],
        postExcerpt: 'Check this out @alice @bob',
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string } }]>;
      expect(calls.find((c) => c[0].data.userId === BOB_ID)).toBeDefined();
      expect(notificationLogger.error).toHaveBeenCalledWith(
        'Failed to create notification',
        expect.objectContaining({ userId: ALICE_ID, type: 'user_mentioned' })
      );
    });

    it('test_createPostMentionNotificationsBatch_withExcerpt_usesExcerptAsContent', async () => {
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      await service.createPostMentionNotificationsBatch({
        postId: P2_POST_ID,
        posterId: POSTER_ID,
        mentionedUserIds: [ALICE_ID],
        postExcerpt: 'Check this out @alice',
      });

      const calls = prisma.notification.create.mock.calls as Array<
        [{ data: { userId: string; content: string } }]
      >;
      const aliceCall = calls.find((c) => c[0].data.userId === ALICE_ID);
      expect(aliceCall![0].data.content).toBe('Check this out @alice');
    });

    it('test_createPostMentionNotificationsBatch_noExcerpt_usesFallbackPhrase', async () => {
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      await service.createPostMentionNotificationsBatch({
        postId: P2_POST_ID,
        posterId: POSTER_ID,
        mentionedUserIds: [ALICE_ID],
      });

      const calls = prisma.notification.create.mock.calls as Array<
        [{ data: { userId: string; content: string } }]
      >;
      const aliceCall = calls.find((c) => c[0].data.userId === ALICE_ID);
      expect(aliceCall![0].data.content).toBe('vous a mentionné');
    });

    it('test_createPostMentionNotificationsBatch_selfMention_skipped', async () => {
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      await service.createPostMentionNotificationsBatch({
        postId: P2_POST_ID,
        posterId: POSTER_ID,
        mentionedUserIds: [POSTER_ID, ALICE_ID],
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string } }]>;
      const selfCall = calls.find((c) => c[0].data.userId === POSTER_ID);
      expect(selfCall).toBeUndefined();
      const aliceCall = calls.find((c) => c[0].data.userId === ALICE_ID);
      expect(aliceCall).toBeDefined();
    });

    it('test_createPostMentionNotificationsBatch_priority_isHigh', async () => {
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      await service.createPostMentionNotificationsBatch({
        postId: P2_POST_ID,
        posterId: POSTER_ID,
        mentionedUserIds: [ALICE_ID],
      });

      const calls = prisma.notification.create.mock.calls as Array<[{ data: { userId: string; priority: string } }]>;
      const aliceCall = calls.find((c) => c[0].data.userId === ALICE_ID);
      expect(aliceCall![0].data.priority).toBe('high');
    });

    it('test_createPostMentionNotificationsBatch_emptyList_noNotificationsCreated', async () => {
      await service.createPostMentionNotificationsBatch({
        postId: P2_POST_ID,
        posterId: POSTER_ID,
        mentionedUserIds: [],
      });

      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('test_createPostMentionNotificationsBatch_posterNotFound_earlyReturn', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.createPostMentionNotificationsBatch({
        postId: P2_POST_ID,
        posterId: POSTER_ID,
        mentionedUserIds: [ALICE_ID],
      });

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('test_createPostMentionNotificationsBatch_rateLimitExceeded_notificationBlocked', async () => {
      prisma.notification.create.mockImplementation(({ data }: { data: { type: string } }) =>
        Promise.resolve(makeNotif(data.type))
      );

      // Exhaust the rate limit (MAX_MENTIONS_PER_MINUTE = 5)
      for (let i = 0; i < 5; i++) {
        await service.createPostMentionNotificationsBatch({
          postId: P2_POST_ID,
          posterId: POSTER_ID,
          mentionedUserIds: [ALICE_ID],
        });
      }

      const callsBefore = prisma.notification.create.mock.calls.length;

      // 6th attempt — should be blocked
      await service.createPostMentionNotificationsBatch({
        postId: P2_POST_ID,
        posterId: POSTER_ID,
        mentionedUserIds: [ALICE_ID],
      });

      expect(prisma.notification.create.mock.calls.length).toBe(callsBefore);
    });
  });

  // ======================================================
  // Fix 3 (P0): notification:counts emit
  // ======================================================

  describe('notification:counts emit (Fix 3)', () => {
    // Flush pending microtasks (Promises) so fire-and-forget calls resolve
    async function flushMicrotasks() {
      // Three iterations cover multi-hop promise chains
      for (let i = 0; i < 3; i++) {
        await Promise.resolve();
      }
    }

    it('test_createNotification_emitsCountsUpdateToUserRoom', async () => {
      prisma.user.findUnique.mockResolvedValue({
        username: 'actor',
        displayName: 'Actor',
        avatar: null,
      });
      prisma.notification.create.mockResolvedValue(makeNotif('story_new_comment'));
      prisma.notification.count
        .mockResolvedValueOnce(3) // unread
        .mockResolvedValueOnce(10); // total

      // Trigger a notification creation via the batch method (calls createNotification internally)
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      await service.createStoryCommentNotificationsBatch({
        postId: POST_ID,
        commentId: COMMENT_ID,
        storyAuthorId: AUTHOR_ID,
        commenterId: COMMENTER_ID,
      });

      // Flush fire-and-forget emitCountsUpdate microtasks
      await flushMicrotasks();

      expect(mockIO.to).toHaveBeenCalledWith(`user:${AUTHOR_ID}`);
      expect(mockIO.emit).toHaveBeenCalledWith('notification:counts', expect.objectContaining({
        unread: expect.any(Number),
        total: expect.any(Number),
      }));
    });

    it('test_markAsRead_emitsCountsUpdateToUserRoom', async () => {
      const userId = AUTHOR_ID;
      prisma.notification.update.mockResolvedValue({
        id: 'notif-1',
        userId,
        type: 'story_new_comment',
        isRead: true,
        readAt: new Date(),
        createdAt: new Date(),
        content: '',
        priority: 'normal',
        actor: null,
        context: {},
        metadata: {},
        delivery: { emailSent: false, pushSent: false },
      });
      prisma.notification.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(5);

      await service.markAsRead('notif-1');
      await flushMicrotasks();

      expect(mockIO.to).toHaveBeenCalledWith(`user:${userId}`);
      expect(mockIO.emit).toHaveBeenCalledWith('notification:counts', { unread: 0, total: 5 });
    });

    it('test_markAllAsRead_emitsCountsUpdateToUserRoom', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 3 });
      prisma.notification.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(10);

      await service.markAllAsRead(AUTHOR_ID);
      await flushMicrotasks();

      expect(mockIO.to).toHaveBeenCalledWith(`user:${AUTHOR_ID}`);
      expect(mockIO.emit).toHaveBeenCalledWith('notification:counts', { unread: 0, total: 10 });
    });

    it('test_deleteNotification_emitsCountsUpdateToUserRoom', async () => {
      prisma.notification.findUnique.mockResolvedValue({ userId: AUTHOR_ID });
      prisma.notification.delete.mockResolvedValue({ id: 'notif-1' });
      prisma.notification.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(8);

      await service.deleteNotification('notif-1');
      await flushMicrotasks();

      expect(mockIO.to).toHaveBeenCalledWith(`user:${AUTHOR_ID}`);
      expect(mockIO.emit).toHaveBeenCalledWith('notification:counts', { unread: 2, total: 8 });
    });

    it('test_emitCountsUpdate_noSocketIO_doesNotThrow', async () => {
      // Service without IO configured
      const serviceNoIO = new NotificationService(prisma);

      prisma.notification.update.mockResolvedValue({
        id: 'notif-1',
        userId: AUTHOR_ID,
        type: 'story_new_comment',
        isRead: true,
        readAt: new Date(),
        createdAt: new Date(),
        content: '',
        priority: 'normal',
        actor: null,
        context: {},
        metadata: {},
        delivery: { emailSent: false, pushSent: false },
      });

      await expect(serviceNoIO.markAsRead('notif-1')).resolves.not.toThrow();
    });
  });
});
