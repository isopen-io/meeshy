/**
 * #10404 — une réaction posée par SOCKET crédite la vue du lecteur, comme celle
 * posée par REST (`PostService.likePost`) : les deux transports de
 * `PostReactionService.addReaction` appellent le même `creditEngagedReaderView`.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../../../services/PostReactionService', () => ({ PostReactionService: jest.fn() }));
jest.mock('../../../services/notifications/NotificationService', () => ({ NotificationService: jest.fn() }));
jest.mock('../../../validation/socket-event-schemas', () => ({
  SocketPostReactionAddSchema: { safeParse: jest.fn() },
  SocketPostReactionRemoveSchema: { safeParse: jest.fn() },
  SocketPostRoomActionSchema: { safeParse: jest.fn() },
  SocketPostReactionRequestSyncSchema: { safeParse: jest.fn() },
}));
jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn(),
  isValidationFailure: jest.fn((r: { success: boolean }) => !r.success),
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn().mockReturnValue({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({ checkLimit: jest.fn<any>().mockResolvedValue(true), destroy: jest.fn() })),
  SOCKET_RATE_LIMITS: { MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' } },
}));

import { PostReactionHandler } from '../../../socketio/handlers/PostReactionHandler';
import { validateSocketEvent } from '../../../middleware/validation';

const READER = '507f1f77bcf86cd799439033';
const AUTHOR = '507f1f77bcf86cd799439044';
const POST_ID = '507f1f77bcf86cd799439077';
const SOCKET_ID = 'socket-reader-view';

const post = {
  id: POST_ID, authorId: AUTHOR, visibility: 'PUBLIC', visibilityUserIds: [], type: 'POST',
  isQuote: false, repostOfId: null, originalRepostOfId: null, deletedAt: null,
};

function build(viewer: string, unchanged = false) {
  const postView = {
    findUnique: jest.fn<any>().mockResolvedValue(null),
    create: jest.fn<any>().mockResolvedValue({ id: 'pv-1' }),
  };
  const prisma = {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue(post),
      findUnique: jest.fn<any>().mockResolvedValue(post),
    },
    postView,
    $runCommandRaw: jest.fn<any>().mockResolvedValue({ ok: 1 }),
    friendRequest: { findFirst: jest.fn() },
    communityMember: { findMany: jest.fn(), findFirst: jest.fn() },
    participant: { findMany: jest.fn(), findFirst: jest.fn() },
  };
  const handler = new PostReactionHandler({
    io: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) } as never,
    prisma: prisma as never,
    notificationService: { createPostLikeNotification: jest.fn<any>().mockResolvedValue(null) } as never,
    postReactionService: {
      addReaction: jest.fn<any>().mockResolvedValue({ id: 'reaction-1', postId: POST_ID, userId: viewer, emoji: '👍', unchanged }),
      createUpdateEvent: jest.fn<any>().mockResolvedValue({ postId: POST_ID }),
    } as never,
    connectedUsers: new Map([[viewer, { id: viewer, socketId: SOCKET_ID, isAnonymous: false, language: 'fr', userId: viewer }]]) as never,
    socketToUser: new Map([[SOCKET_ID, viewer]]),
    socialEvents: { broadcastPostLiked: jest.fn(() => Promise.resolve()) } as never,
  });
  const socket = { id: SOCKET_ID, emit: jest.fn(), join: jest.fn(), leave: jest.fn() };
  return { handler, socket, postView };
}

beforeEach(() => {
  (validateSocketEvent as jest.Mock).mockImplementation((_schema: unknown, data: unknown) => ({ success: true, data }));
});

describe('post:reaction-add — la vue du lecteur', () => {
  it('une réaction d\'un lecteur crée son PostView', async () => {
    const { handler, socket, postView } = build(READER);

    await handler.handleAddReaction(socket as never, { postId: POST_ID, emoji: '👍' }, jest.fn());

    expect(postView.create).toHaveBeenCalledWith({ data: { postId: POST_ID, userId: READER, duration: undefined } });
  });

  it('la réaction de l\'auteur sur son propre post ne crée aucune vue', async () => {
    const { handler, socket, postView } = build(AUTHOR);

    await handler.handleAddReaction(socket as never, { postId: POST_ID, emoji: '👍' }, jest.fn());

    expect(postView.create).not.toHaveBeenCalled();
  });
});
