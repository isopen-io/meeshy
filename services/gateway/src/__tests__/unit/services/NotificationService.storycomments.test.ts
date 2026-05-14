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
  });
});
