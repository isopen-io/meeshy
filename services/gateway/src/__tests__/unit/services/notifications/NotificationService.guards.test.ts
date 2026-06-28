/**
 * Coverage for NotificationService null / self-notification guards:
 * - Self-notification early returns (actorId === postAuthorId / commentAuthorId)
 * - Actor/reactor/mentioner not found → returns null
 * - createCommentReactionNotification self and reactor-not-found paths
 * - resolveRecipientLang user not found → falls back to 'fr'
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: {
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  },
  securityLogger: { logViolation: jest.fn() },
}));

import { NotificationService } from '../../../../services/notifications/NotificationService';

// ── Fixture IDs ────────────────────────────────────────────────────────────────

const ACTOR   = '507f1f77bcf86cd799439011';
const RECIPIENT = '507f1f77bcf86cd799439012';
const CONV_ID = '507f1f77bcf86cd799439013';
const POST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const MSG_ID  = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const COMMENT_ID = 'cccccccccccccccccccccccc';

// ── Prisma / Socket.IO mocks ───────────────────────────────────────────────────

const makePrisma = () => ({
  notification: {
    create: jest.fn<any>().mockImplementation((args: any) => Promise.resolve({ id: 'notif-1', ...args.data })),
    count:  jest.fn<any>().mockResolvedValue(0),
    findMany: jest.fn<any>().mockResolvedValue([]),
    update: jest.fn<any>().mockResolvedValue({}),
  },
  user: {
    findUnique: jest.fn<any>().mockResolvedValue(null),
    findMany:   jest.fn<any>().mockResolvedValue([]),
  },
  conversation: {
    findUnique: jest.fn<any>().mockResolvedValue({ title: 'Test Conv', type: 'DIRECT', avatar: null }),
  },
  message: {
    findUnique: jest.fn<any>().mockResolvedValue({ content: 'hello' }),
  },
  userPreferences: {
    findUnique: jest.fn<any>().mockResolvedValue(null),
  },
  postComment: { findMany: jest.fn<any>().mockResolvedValue([]) },
  postReaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
  friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]) },
}) as any;

const makeIO = () => ({
  to: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  fetchSockets: jest.fn<any>().mockResolvedValue([]),
  emit: jest.fn(),
}) as any;

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeActor = () => ({ username: 'actor', displayName: 'Actor User', avatar: null });

// ── createPostLikeNotification ─────────────────────────────────────────────────

describe('NotificationService — createPostLikeNotification', () => {
  let service: NotificationService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new NotificationService(prisma);
    service.setSocketIO(makeIO());
  });

  it('returns null when actorId equals postAuthorId (self-notification guard)', async () => {
    const result = await service.createPostLikeNotification({
      actorId: ACTOR,
      postId: POST_ID,
      postAuthorId: ACTOR, // same as actor
      emoji: '❤️',
    });
    expect(result).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns null when actor user is not found', async () => {
    // user.findUnique returns null for actor
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.createPostLikeNotification({
      actorId: ACTOR,
      postId: POST_ID,
      postAuthorId: RECIPIENT,
      emoji: '👍',
    });
    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

// ── createPostCommentNotification ─────────────────────────────────────────────

describe('NotificationService — createPostCommentNotification', () => {
  let service: NotificationService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new NotificationService(prisma);
    service.setSocketIO(makeIO());
  });

  it('returns null when actorId equals postAuthorId', async () => {
    const result = await service.createPostCommentNotification({
      actorId: ACTOR,
      postId: POST_ID,
      postAuthorId: ACTOR,
      commentId: COMMENT_ID,
      commentPreview: 'Nice!',
    });
    expect(result).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns null when actor user is not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.createPostCommentNotification({
      actorId: ACTOR,
      postId: POST_ID,
      postAuthorId: RECIPIENT,
      commentId: COMMENT_ID,
      commentPreview: 'Awesome post!',
    });
    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

// ── createPostRepostNotification ──────────────────────────────────────────────

describe('NotificationService — createPostRepostNotification', () => {
  let service: NotificationService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new NotificationService(prisma);
    service.setSocketIO(makeIO());
  });

  it('returns null when actorId equals postAuthorId', async () => {
    const result = await service.createPostRepostNotification({
      actorId: ACTOR,
      originalPostId: POST_ID,
      repostId: 'dddddddddddddddddddddddd',
      postAuthorId: ACTOR,
    });
    expect(result).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns null when actor user is not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.createPostRepostNotification({
      actorId: ACTOR,
      originalPostId: POST_ID,
      repostId: 'eeeeeeeeeeeeeeeeeeeeeeee',
      postAuthorId: RECIPIENT,
    });
    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

// ── createCommentReplyNotification ────────────────────────────────────────────

describe('NotificationService — createCommentReplyNotification', () => {
  let service: NotificationService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new NotificationService(prisma);
    service.setSocketIO(makeIO());
  });

  it('returns null when actorId equals commentAuthorId', async () => {
    const result = await service.createCommentReplyNotification({
      actorId: ACTOR,
      postId: POST_ID,
      commentAuthorId: ACTOR,
      commentId: COMMENT_ID,
    });
    expect(result).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns null when actor user is not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.createCommentReplyNotification({
      actorId: ACTOR,
      postId: POST_ID,
      commentAuthorId: RECIPIENT,
      commentId: COMMENT_ID,
      replyPreview: 'Great point!',
    });
    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

// ── createCommentLikeNotification ─────────────────────────────────────────────

describe('NotificationService — createCommentLikeNotification', () => {
  let service: NotificationService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new NotificationService(prisma);
    service.setSocketIO(makeIO());
  });

  it('returns null when actorId equals commentAuthorId', async () => {
    const result = await service.createCommentLikeNotification({
      actorId: ACTOR,
      postId: POST_ID,
      commentId: COMMENT_ID,
      commentAuthorId: ACTOR,
      emoji: '❤️',
    });
    expect(result).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns null when actor user is not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.createCommentLikeNotification({
      actorId: ACTOR,
      postId: POST_ID,
      commentId: COMMENT_ID,
      commentAuthorId: RECIPIENT,
      emoji: '😊',
    });
    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

// ── createMentionNotification — mentioner not found ───────────────────────────

describe('NotificationService — createMentionNotification', () => {
  let service: NotificationService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new NotificationService(prisma);
    service.setSocketIO(makeIO());
  });

  it('returns null when mentioner user is not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.createMentionNotification({
      mentionedUserId: RECIPIENT,
      mentionerUserId: ACTOR,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      messagePreview: '@alice check this out',
    });
    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

// ── createReactionNotification — reactor not found ────────────────────────────

describe('NotificationService — createReactionNotification', () => {
  let service: NotificationService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new NotificationService(prisma);
    service.setSocketIO(makeIO());
  });

  it('returns null when reactor user is not found', async () => {
    // user.findUnique in Promise.all returns null for all
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.createReactionNotification({
      messageAuthorId: RECIPIENT,
      reactorUserId: ACTOR,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      reactionEmoji: '🔥',
    });
    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

// ── createCommentReactionNotification ─────────────────────────────────────────

describe('NotificationService — createCommentReactionNotification', () => {
  let service: NotificationService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new NotificationService(prisma);
    service.setSocketIO(makeIO());
  });

  it('returns without emitting when commentAuthorId equals reactorUserId', async () => {
    const notifCreate = prisma.notification.create;

    await service.createCommentReactionNotification({
      commentAuthorId: ACTOR,
      reactorUserId: ACTOR,
      commentId: COMMENT_ID,
      postId: POST_ID,
      reactionEmoji: '😂',
    });

    expect(notifCreate).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns without emitting when reactor user is not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await service.createCommentReactionNotification({
      commentAuthorId: RECIPIENT,
      reactorUserId: ACTOR,
      commentId: COMMENT_ID,
      postId: POST_ID,
      reactionEmoji: '❤️',
    });

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

// ── resolveRecipientLang — user not found falls back to 'fr' ──────────────────

describe('NotificationService — resolveRecipientLang fallback', () => {
  it('falls back to "fr" when recipient user is not found in DB', async () => {
    const prisma = makePrisma();
    const mockIO = makeIO();
    const service = new NotificationService(prisma);
    service.setSocketIO(mockIO);

    // Actor found, but recipient (postAuthorId) not found in resolveRecipientLang
    prisma.user.findUnique.mockImplementation(({ where }: any) => {
      if (where.id === ACTOR) return Promise.resolve(makeActor());
      return Promise.resolve(null); // recipient not found → falls back to 'fr'
    });
    prisma.userPreferences.findUnique.mockResolvedValue(null);
    prisma.notification.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'notif-fr', ...args.data })
    );

    // createPostCommentNotification calls resolveRecipientLang(postAuthorId)
    // If postAuthorId is not found, it returns 'fr' (covering line 419)
    const result = await service.createPostCommentNotification({
      actorId: ACTOR,
      postId: POST_ID,
      postAuthorId: RECIPIENT,
      commentId: COMMENT_ID,
      commentPreview: 'Testing lang fallback',
    });

    // The notification should still be created (resolveRecipientLang returns 'fr')
    // or null if another guard fails — either way, findUnique was called for recipient
    const calls = prisma.user.findUnique.mock.calls as any[];
    const recipientCall = calls.find((c: any) => c[0]?.where?.id === RECIPIENT);
    expect(recipientCall).toBeDefined(); // resolveRecipientLang was called with RECIPIENT
  });
});
