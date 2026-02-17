/**
 * Social Notification Methods - Unit Tests
 *
 * Tests the 5 social notification methods on NotificationService:
 * - createPostLikeNotification (post_like / story_reaction / status_reaction)
 * - createPostCommentNotification (post_comment)
 * - createPostRepostNotification (post_repost)
 * - createCommentReplyNotification (comment_reply)
 * - createCommentLikeNotification (comment_like)
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') || '' },
}));

jest.mock('../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((s: string) => s),
    sanitizeURL: jest.fn((s: string) => s),
    sanitizeJSON: jest.fn((obj: any) => obj),
    isValidNotificationType: jest.fn(() => true),
    isValidPriority: jest.fn(() => true),
  },
}));

jest.mock('../../utils/logger-enhanced', () => ({
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

import { NotificationService } from '../../services/notifications/NotificationService';

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------

const ACTOR_ID = 'actor-aaa';
const AUTHOR_ID = 'author-bbb';
const POST_ID = 'post-111';
const COMMENT_ID = 'comment-222';
const REPOST_ID = 'repost-333';

const mockActor = {
  username: 'janedoe',
  displayName: 'Jane Doe',
  avatar: 'https://cdn.example.com/jane.png',
};

function createMockPrisma() {
  return {
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
    user: { findUnique: jest.fn() },
    userPreferences: { findUnique: jest.fn() },
    conversation: { findUnique: jest.fn() },
    conversationMember: { count: jest.fn() },
  } as any;
}

function createMockIO() {
  const mockRoom = new Set(['socket-1']);
  return {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    sockets: {
      adapter: {
        rooms: { get: jest.fn().mockReturnValue(mockRoom), keys: jest.fn().mockReturnValue([].values()) },
      },
    },
  } as any;
}

/**
 * Configures mocks so that `createNotification` succeeds end-to-end:
 * - actor lookup returns mockActor
 * - userPreferences returns the given prefs (null = all defaults, no DND)
 * - notification.create returns a fake notification with the given overrides
 */
function setupSuccessMocks(
  mockPrisma: ReturnType<typeof createMockPrisma>,
  overrides: Record<string, unknown> = {},
  prefsOverride: Record<string, unknown> | null = null,
) {
  mockPrisma.user.findUnique.mockResolvedValue(mockActor);

  if (prefsOverride) {
    mockPrisma.userPreferences.findUnique.mockResolvedValue({
      notification: prefsOverride,
    });
  } else {
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
  }

  const now = new Date('2026-01-15T12:00:00Z');
  const fakeNotification = {
    id: 'notif-fake-id',
    userId: AUTHOR_ID,
    type: 'post_like',
    priority: 'normal',
    content: 'notification content',
    isRead: false,
    readAt: null,
    createdAt: now,
    expiresAt: null,
    actor: { id: ACTOR_ID, ...mockActor },
    context: {},
    metadata: {},
    delivery: { emailSent: false, pushSent: false },
    ...overrides,
  };

  mockPrisma.notification.create.mockResolvedValue(fakeNotification);
  return fakeNotification;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Social Notification Methods', () => {
  let service: NotificationService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockIO: ReturnType<typeof createMockIO>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-15T12:00:00Z'));

    mockPrisma = createMockPrisma();
    mockIO = createMockIO();
    service = new NotificationService(mockPrisma);
    service.setSocketIO(mockIO);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ========================================================================
  // createPostLikeNotification
  // ========================================================================

  describe('createPostLikeNotification', () => {
    it('should return null when actorId equals postAuthorId (self-like)', async () => {
      const result = await service.createPostLikeNotification({
        actorId: 'same-user',
        postId: POST_ID,
        postAuthorId: 'same-user',
        emoji: '👍',
      });

      expect(result).toBeNull();
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('should return null when actor is not found in the database', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createPostLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: AUTHOR_ID,
        emoji: '❤️',
      });

      expect(result).toBeNull();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('should create notification with type post_like for default postType (POST)', async () => {
      setupSuccessMocks(mockPrisma, { type: 'post_like' });

      const result = await service.createPostLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: AUTHOR_ID,
        emoji: '👍',
      });

      expect(result).not.toBeNull();
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.type).toBe('post_like');
      expect(createArg.data.userId).toBe(AUTHOR_ID);
      expect(createArg.data.priority).toBe('normal');
    });

    it('should create notification with type story_reaction for STORY postType', async () => {
      setupSuccessMocks(mockPrisma, { type: 'story_reaction' });

      const result = await service.createPostLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: AUTHOR_ID,
        emoji: '🔥',
        postType: 'STORY',
      });

      expect(result).not.toBeNull();
      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.type).toBe('story_reaction');
    });

    it('should create notification with type status_reaction for STATUS postType', async () => {
      setupSuccessMocks(mockPrisma, { type: 'status_reaction' });

      const result = await service.createPostLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: AUTHOR_ID,
        emoji: '😂',
        postType: 'STATUS',
      });

      expect(result).not.toBeNull();
      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.type).toBe('status_reaction');
    });

    it('should include emoji in the notification metadata', async () => {
      setupSuccessMocks(mockPrisma);

      await service.createPostLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: AUTHOR_ID,
        emoji: '🎉',
        postType: 'POST',
      });

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      const metadata = createArg.data.metadata;
      expect(metadata.emoji).toBe('🎉');
      expect(metadata.postId).toBe(POST_ID);
      expect(metadata.postType).toBe('POST');
      expect(metadata.action).toBe('view_message');
    });

    it('should include postId in notification context', async () => {
      setupSuccessMocks(mockPrisma);

      await service.createPostLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: AUTHOR_ID,
        emoji: '👍',
      });

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.context.postId).toBe(POST_ID);
    });

    it('should include actor information from the database lookup', async () => {
      setupSuccessMocks(mockPrisma);

      await service.createPostLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: AUTHOR_ID,
        emoji: '👍',
      });

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.actor.id).toBe(ACTOR_ID);
      expect(createArg.data.actor.username).toBe('janedoe');
    });

    it('should emit the notification via Socket.IO', async () => {
      setupSuccessMocks(mockPrisma);

      await service.createPostLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: AUTHOR_ID,
        emoji: '👍',
      });

      expect(mockIO.to).toHaveBeenCalledWith(AUTHOR_ID);
      expect(mockIO.emit).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // createPostCommentNotification
  // ========================================================================

  describe('createPostCommentNotification', () => {
    it('should return null when actorId equals postAuthorId', async () => {
      const result = await service.createPostCommentNotification({
        actorId: 'same-user',
        postId: POST_ID,
        postAuthorId: 'same-user',
        commentId: COMMENT_ID,
        commentPreview: 'Great post!',
      });

      expect(result).toBeNull();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('should return null when actor is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createPostCommentNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: AUTHOR_ID,
        commentId: COMMENT_ID,
        commentPreview: 'Nice!',
      });

      expect(result).toBeNull();
    });

    it('should create post_comment notification with commentPreview in content', async () => {
      setupSuccessMocks(mockPrisma, { type: 'post_comment' });

      const result = await service.createPostCommentNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: AUTHOR_ID,
        commentId: COMMENT_ID,
        commentPreview: 'This is really insightful!',
      });

      expect(result).not.toBeNull();

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.type).toBe('post_comment');
      expect(createArg.data.priority).toBe('normal');
      // Content should contain the comment preview (possibly truncated)
      expect(createArg.data.content).toContain('This is really insightful!');
    });

    it('should include commentId in metadata', async () => {
      setupSuccessMocks(mockPrisma, { type: 'post_comment' });

      await service.createPostCommentNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: AUTHOR_ID,
        commentId: COMMENT_ID,
        commentPreview: 'Awesome!',
      });

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.metadata.commentId).toBe(COMMENT_ID);
      expect(createArg.data.metadata.postId).toBe(POST_ID);
      expect(createArg.data.metadata.action).toBe('view_message');
    });

    it('should include commentPreview in metadata', async () => {
      setupSuccessMocks(mockPrisma, { type: 'post_comment' });

      await service.createPostCommentNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: AUTHOR_ID,
        commentId: COMMENT_ID,
        commentPreview: 'Short preview',
      });

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.metadata.commentPreview).toBeDefined();
    });

    it('should truncate long comment previews', async () => {
      setupSuccessMocks(mockPrisma, { type: 'post_comment' });

      // Build a comment with more than 25 words
      const longComment = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');

      await service.createPostCommentNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: AUTHOR_ID,
        commentId: COMMENT_ID,
        commentPreview: longComment,
      });

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      // The content is passed through truncateMessage (max 25 words)
      expect(createArg.data.content.endsWith('...')).toBe(true);
    });
  });

  // ========================================================================
  // createPostRepostNotification
  // ========================================================================

  describe('createPostRepostNotification', () => {
    it('should return null when actorId equals postAuthorId (self-repost)', async () => {
      const result = await service.createPostRepostNotification({
        actorId: 'same-user',
        originalPostId: POST_ID,
        postAuthorId: 'same-user',
        repostId: REPOST_ID,
      });

      expect(result).toBeNull();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('should return null when actor is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createPostRepostNotification({
        actorId: ACTOR_ID,
        originalPostId: POST_ID,
        postAuthorId: AUTHOR_ID,
        repostId: REPOST_ID,
      });

      expect(result).toBeNull();
    });

    it('should create post_repost notification', async () => {
      setupSuccessMocks(mockPrisma, { type: 'post_repost' });

      const result = await service.createPostRepostNotification({
        actorId: ACTOR_ID,
        originalPostId: POST_ID,
        postAuthorId: AUTHOR_ID,
        repostId: REPOST_ID,
      });

      expect(result).not.toBeNull();

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.type).toBe('post_repost');
      expect(createArg.data.priority).toBe('normal');
      expect(createArg.data.content).toContain('repost');
    });

    it('should include repostId and originalPostId in metadata', async () => {
      setupSuccessMocks(mockPrisma, { type: 'post_repost' });

      await service.createPostRepostNotification({
        actorId: ACTOR_ID,
        originalPostId: POST_ID,
        postAuthorId: AUTHOR_ID,
        repostId: REPOST_ID,
      });

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.metadata.repostId).toBe(REPOST_ID);
      expect(createArg.data.metadata.originalPostId).toBe(POST_ID);
      expect(createArg.data.metadata.action).toBe('view_message');
    });

    it('should include originalPostId in context as postId', async () => {
      setupSuccessMocks(mockPrisma, { type: 'post_repost' });

      await service.createPostRepostNotification({
        actorId: ACTOR_ID,
        originalPostId: POST_ID,
        postAuthorId: AUTHOR_ID,
        repostId: REPOST_ID,
      });

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.context.postId).toBe(POST_ID);
    });
  });

  // ========================================================================
  // createCommentReplyNotification
  // ========================================================================

  describe('createCommentReplyNotification', () => {
    it('should return null when actorId equals commentAuthorId', async () => {
      const result = await service.createCommentReplyNotification({
        actorId: 'same-user',
        postId: POST_ID,
        commentAuthorId: 'same-user',
        commentId: COMMENT_ID,
        replyPreview: 'I agree!',
      });

      expect(result).toBeNull();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('should return null when actor is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: AUTHOR_ID,
        commentId: COMMENT_ID,
        replyPreview: 'Thanks!',
      });

      expect(result).toBeNull();
    });

    it('should create comment_reply notification', async () => {
      setupSuccessMocks(mockPrisma, { type: 'comment_reply' });

      const result = await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: AUTHOR_ID,
        commentId: COMMENT_ID,
        replyPreview: 'Great point!',
      });

      expect(result).not.toBeNull();

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.type).toBe('comment_reply');
      expect(createArg.data.priority).toBe('normal');
      expect(createArg.data.userId).toBe(AUTHOR_ID);
    });

    it('should include commentId and replyPreview in metadata', async () => {
      setupSuccessMocks(mockPrisma, { type: 'comment_reply' });

      await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: AUTHOR_ID,
        commentId: COMMENT_ID,
        replyPreview: 'Exactly my thought',
      });

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.metadata.commentId).toBe(COMMENT_ID);
      expect(createArg.data.metadata.commentPreview).toBeDefined();
      expect(createArg.data.metadata.postId).toBe(POST_ID);
    });

    it('should include postId in context', async () => {
      setupSuccessMocks(mockPrisma, { type: 'comment_reply' });

      await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: AUTHOR_ID,
        commentId: COMMENT_ID,
        replyPreview: 'Indeed!',
      });

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.context.postId).toBe(POST_ID);
    });

    it('should use truncated replyPreview as content', async () => {
      setupSuccessMocks(mockPrisma, { type: 'comment_reply' });

      const longReply = Array.from({ length: 30 }, (_, i) => `reply${i}`).join(' ');

      await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: AUTHOR_ID,
        commentId: COMMENT_ID,
        replyPreview: longReply,
      });

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.content.endsWith('...')).toBe(true);
    });
  });

  // ========================================================================
  // createCommentLikeNotification
  // ========================================================================

  describe('createCommentLikeNotification', () => {
    it('should return null when actorId equals commentAuthorId (self-like)', async () => {
      const result = await service.createCommentLikeNotification({
        actorId: 'same-user',
        postId: POST_ID,
        commentId: COMMENT_ID,
        commentAuthorId: 'same-user',
        emoji: '👍',
      });

      expect(result).toBeNull();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('should return null when actor is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createCommentLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentId: COMMENT_ID,
        commentAuthorId: AUTHOR_ID,
        emoji: '❤️',
      });

      expect(result).toBeNull();
    });

    it('should create comment_like notification with low priority', async () => {
      const commentLikePrefs = { commentLikeEnabled: true };
      setupSuccessMocks(mockPrisma, { type: 'comment_like', priority: 'low' }, commentLikePrefs);

      const result = await service.createCommentLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentId: COMMENT_ID,
        commentAuthorId: AUTHOR_ID,
        emoji: '👍',
      });

      expect(result).not.toBeNull();

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.type).toBe('comment_like');
      expect(createArg.data.priority).toBe('low');
    });

    it('should return null when commentLikeEnabled preference is false (default)', async () => {
      // Default preferences have commentLikeEnabled: false
      setupSuccessMocks(mockPrisma, { type: 'comment_like', priority: 'low' });

      const result = await service.createCommentLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentId: COMMENT_ID,
        commentAuthorId: AUTHOR_ID,
        emoji: '👍',
      });

      expect(result).toBeNull();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('should include commentId and emoji in metadata', async () => {
      const commentLikePrefs = { commentLikeEnabled: true };
      setupSuccessMocks(mockPrisma, { type: 'comment_like', priority: 'low' }, commentLikePrefs);

      await service.createCommentLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentId: COMMENT_ID,
        commentAuthorId: AUTHOR_ID,
        emoji: '🔥',
      });

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.metadata.commentId).toBe(COMMENT_ID);
      expect(createArg.data.metadata.emoji).toBe('🔥');
      expect(createArg.data.metadata.postId).toBe(POST_ID);
      expect(createArg.data.metadata.action).toBe('view_message');
    });

    it('should set userId to commentAuthorId', async () => {
      const commentLikePrefs = { commentLikeEnabled: true };
      setupSuccessMocks(mockPrisma, { type: 'comment_like', priority: 'low' }, commentLikePrefs);

      await service.createCommentLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentId: COMMENT_ID,
        commentAuthorId: AUTHOR_ID,
        emoji: '👍',
      });

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.userId).toBe(AUTHOR_ID);
    });

    it('should include postId in context', async () => {
      const commentLikePrefs = { commentLikeEnabled: true };
      setupSuccessMocks(mockPrisma, { type: 'comment_like', priority: 'low' }, commentLikePrefs);

      await service.createCommentLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentId: COMMENT_ID,
        commentAuthorId: AUTHOR_ID,
        emoji: '👍',
      });

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.context.postId).toBe(POST_ID);
    });

    it('should include emoji in the notification content', async () => {
      const commentLikePrefs = { commentLikeEnabled: true };
      setupSuccessMocks(mockPrisma, { type: 'comment_like', priority: 'low' }, commentLikePrefs);

      await service.createCommentLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentId: COMMENT_ID,
        commentAuthorId: AUTHOR_ID,
        emoji: '🎉',
      });

      const createArg = mockPrisma.notification.create.mock.calls[0][0];
      expect(createArg.data.content).toContain('🎉');
    });
  });
});
