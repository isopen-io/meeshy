/**
 * #9584 — une réaction posée par socket depuis la carte d'une REPUBLICATION
 * SIMPLE atterrit sur l'original (`resolveInteractionTarget`, vrai module) et
 * fait descendre la republication traversée — son identifiant et son auteur —
 * pour qu'elle reçoive son PROPRE crédit. La résolution l'a déjà lue : aucune
 * seconde lecture.
 *
 * @jest-environment node
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
const REPOSTER = '507f1f77bcf86cd799439066';
const REPOST = '507f1f77bcf86cd799439022';
const ORIGINAL = '507f1f77bcf86cd799439077';
const SOCKET_ID = 'socket-through-repost';

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  authorId: AUTHOR,
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  type: 'POST',
  isQuote: false,
  repostOfId: null,
  originalRepostOfId: null,
  deletedAt: null,
  ...extra,
});

function build(posts: Record<string, ReturnType<typeof row>>) {
  const addReaction = jest.fn<any>().mockResolvedValue({ id: 'reaction-1', postId: ORIGINAL, userId: READER, emoji: '👍', unchanged: false });
  const prisma = {
    post: {
      findFirst: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(posts[where.id] ?? null)),
      findUnique: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(posts[where.id] ?? null)),
    },
    friendRequest: { findFirst: jest.fn() },
    communityMember: { findMany: jest.fn(), findFirst: jest.fn() },
    participant: { findMany: jest.fn(), findFirst: jest.fn() },
  };
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  const handler = new PostReactionHandler({
    io: io as never,
    prisma: prisma as never,
    notificationService: { createPostLikeNotification: jest.fn<any>().mockResolvedValue(null) } as never,
    postReactionService: { addReaction, createUpdateEvent: jest.fn<any>().mockResolvedValue({ postId: ORIGINAL }) } as never,
    connectedUsers: new Map([[READER, { id: READER, socketId: SOCKET_ID, isAnonymous: false, language: 'fr', userId: READER }]]) as never,
    socketToUser: new Map([[SOCKET_ID, READER]]),
    socialEvents: { broadcastPostLiked: jest.fn(() => Promise.resolve()) } as never,
  });
  const socket = { id: SOCKET_ID, emit: jest.fn(), join: jest.fn(), leave: jest.fn() };
  return { handler, addReaction, socket };
}

beforeEach(() => {
  (validateSocketEvent as jest.Mock).mockImplementation((_schema: unknown, data: unknown) => ({ success: true, data }));
});

describe('post:reaction-add depuis la carte d’une republication simple', () => {
  it('pose la réaction sur l’original et fait descendre la republication traversée, avec son auteur', async () => {
    const { handler, addReaction, socket } = build({
      [REPOST]: row(REPOST, { authorId: REPOSTER, repostOfId: ORIGINAL, originalRepostOfId: ORIGINAL }),
      [ORIGINAL]: row(ORIGINAL),
    });

    await handler.handleAddReaction(socket as never, { postId: REPOST, emoji: '👍' }, jest.fn());

    expect(addReaction).toHaveBeenCalledWith({ postId: ORIGINAL, userId: READER, emoji: '👍', through: { id: REPOST, authorId: REPOSTER } });
  });

  it('sur un post ordinaire, ne nomme aucune republication', async () => {
    const { handler, addReaction, socket } = build({ [ORIGINAL]: row(ORIGINAL) });

    await handler.handleAddReaction(socket as never, { postId: ORIGINAL, emoji: '👍' }, jest.fn());

    expect(addReaction).toHaveBeenCalledWith({ postId: ORIGINAL, userId: READER, emoji: '👍' });
  });

  it('sur une citation, qui garde sa propre vie sociale, ne nomme aucune republication', async () => {
    const { handler, addReaction, socket } = build({
      [REPOST]: row(REPOST, { isQuote: true, repostOfId: ORIGINAL, originalRepostOfId: ORIGINAL }),
      [ORIGINAL]: row(ORIGINAL),
    });

    await handler.handleAddReaction(socket as never, { postId: REPOST, emoji: '👍' }, jest.fn());

    expect(addReaction).toHaveBeenCalledWith({ postId: REPOST, userId: READER, emoji: '👍' });
  });
});
