/**
 * Unit tests for ReactionHandler
 * Covers: handleReactionAdd, handleReactionRemove, handleReactionSync —
 * auth guard, schema validation, participant resolution, service delegation,
 * callback responses, and broadcast side-effects.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ReactionHandler } from '../ReactionHandler';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Le contrat RÉEL, dont on ne remplace que les deux entrées que ces témoins
// épinglent. La fabrique recopiait auparavant une table PARTIELLE : toute
// constante partagée que le handler se met à lire vaut alors `undefined` ici, et
// l'échec ne nomme pas sa cause (`RATE_LIMIT_REFUSAL_MESSAGE` l'a fait). Un mock
// qui part du module réel ne peut plus diverger de lui.
jest.mock('@meeshy/shared/types/socketio-events', () => ({
  ...(jest.requireActual('@meeshy/shared/types/socketio-events') as object),
  SERVER_EVENTS: {
    REACTION_ADDED: 'reaction:added',
    REACTION_REMOVED: 'reaction:removed',
    ERROR: 'error',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
  },
}));

jest.mock('../../../utils/logger-enhanced', () => {
  const sharedLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { enhancedLogger: { child: () => sharedLogger } };
});

// `child()` returns the same stable instance the handler binds at import time,
// so tests can assert on the exact logger the ReactionHandler writes to.
const mockLogger = require('../../../utils/logger-enhanced').enhancedLogger.child();

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn((schema: any, data: any) => ({ success: true, data })),
}));

jest.mock('../../../services/notifications/reactionNotify', () => ({
  notifyReactionAdded: jest.fn().mockResolvedValue(undefined),
  notifyReactionRemoved: jest.fn().mockResolvedValue(undefined),
}));

const mockCheckLimit = jest.fn<any>().mockResolvedValue(true);
const mockGetRateLimitInfo = jest.fn<any>().mockReturnValue({ resetIn: 30000 });
jest.mock('../../../utils/socket-rate-limiter', () => ({
  getSocketRateLimiter: () => ({
    checkLimit: (...args: unknown[]) => mockCheckLimit(...args),
    getRateLimitInfo: (...args: unknown[]) => mockGetRateLimitInfo(...args),
  }),
  SOCKET_RATE_LIMITS: {
    REACTION_ADD: { maxRequests: 30, windowMs: 60000, keyPrefix: 'socket:reaction:add' },
    REACTION_REMOVE: { maxRequests: 30, windowMs: 60000, keyPrefix: 'socket:reaction:remove' },
    REACTION_SYNC: { maxRequests: 120, windowMs: 60000, keyPrefix: 'socket:reaction:sync' },
  },
}));

const { validateSocketEvent } = require('../../../middleware/validation');

// ─── Factories ───────────────────────────────────────────────────────────────

const SOCKET_ID = 'socket-abc';
const USER_ID = 'user-123';
const MESSAGE_ID = '507f191e810c19729de860ea';
const CONV_ID = '507f191e810c19729de860eb';
const PARTICIPANT_ID = '507f191e810c19729de860ec';

function makeSocket(id = SOCKET_ID): Socket {
  return {
    id,
    emit: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
  } as unknown as Socket;
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, identifier: CONV_ID }),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

function makeReactionService(overrides: Record<string, any> = {}) {
  return {
    addReaction: jest.fn<any>().mockResolvedValue({ reaction: { id: 'reaction-1', emoji: '👍' } }),
    removeReaction: jest.fn<any>().mockResolvedValue(true),
    getMessageReactions: jest.fn<any>().mockResolvedValue([]),
    createUpdateEvent: jest.fn<any>().mockResolvedValue({ messageId: MESSAGE_ID }),
    ...overrides,
  };
}

function makeIo() {
  const emit = jest.fn<any>();
  return {
    to: jest.fn<any>().mockReturnValue({ emit }),
    _emit: emit,
  };
}

function makeConnectedUsers() {
  const users = new Map<string, any>();
  users.set(USER_ID, { id: USER_ID, socketId: SOCKET_ID, isAnonymous: false, language: 'en' });
  return users;
}

function makeSocketToUser() {
  const m = new Map<string, string>();
  m.set(SOCKET_ID, USER_ID);
  return m;
}

function buildHandler(overrides: Record<string, any> = {}) {
  const notificationService = { sendNotification: jest.fn<any>() } as any;
  const reactionService = makeReactionService(overrides.reactionService);
  const prisma = makePrisma(overrides.prisma);
  const io = overrides.io ?? makeIo();
  const connectedUsers = overrides.connectedUsers ?? makeConnectedUsers();
  const socketToUser = overrides.socketToUser ?? makeSocketToUser();

  const deliveryQueue = overrides.deliveryQueue;
  const handler = new ReactionHandler({
    io: io as any,
    prisma,
    notificationService,
    reactionService,
    connectedUsers,
    socketToUser,
    deliveryQueue,
  });
  return { handler, prisma, reactionService, io, connectedUsers, socketToUser, deliveryQueue };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ReactionHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
    mockGetRateLimitInfo.mockReturnValue({ resetIn: 30000 });
    (validateSocketEvent as jest.Mock<any>).mockImplementation((_schema: any, data: any) => ({
      success: true,
      data,
    }));
  });

  // ── handleReactionAdd ────────────────────────────────────────────────────

  describe('handleReactionAdd', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns error when schema validation fails', async () => {
      (validateSocketEvent as jest.Mock<any>).mockReturnValueOnce({ success: false, error: 'Bad emoji' });
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Bad emoji' }));
    });

    it('returns error when participant cannot be resolved (optimistic messageId)', async () => {
      const { handler } = buildHandler({
        prisma: { message: { findUnique: jest.fn<any>().mockResolvedValue(null) }, participant: { findFirst: jest.fn<any>().mockResolvedValue(null) } },
      });
      const callback = jest.fn<any>();

      // optimistic id prefix
      await handler.handleReactionAdd(makeSocket(), { messageId: 'cid_not-a-mongo-id', emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns error when addReaction returns null', async () => {
      const { handler } = buildHandler({
        reactionService: { addReaction: jest.fn<any>().mockResolvedValue(null), createUpdateEvent: jest.fn<any>().mockResolvedValue({}) },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to add reaction' }));
    });

    it('calls callback with success and broadcasts on happy path', async () => {
      const { handler, io } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(io.to).toHaveBeenCalled();
    });

    it('replies success (not failure) when the post-write aggregation read throws — reaction already persisted', async () => {
      // addReaction committed the reaction to the DB; createUpdateEvent (an
      // aggregation READ, ReactionService.getEmojiAggregation) then throws on
      // transient load. The ACK must reflect the PERSISTED state — otherwise the
      // client rolls back an optimistic 👍 that is actually in the DB, and no peer
      // hears about it until the next reaction:sync. Mirrors the fire-and-forget
      // contract the file already applies to broadcast/notification failures.
      const { handler } = buildHandler({
        reactionService: {
          addReaction: jest.fn<any>().mockResolvedValue({ reaction: { id: 'reaction-1', emoji: '👍' } }),
          createUpdateEvent: jest.fn<any>().mockRejectedValue(new Error('aggregation read timeout')),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);
      await new Promise(resolve => setImmediate(resolve));

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { id: 'reaction-1', emoji: '👍' } }));
    });

    it('calls reactionService.addReaction with resolved participantId', async () => {
      const { handler, reactionService } = buildHandler();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '❤️' }, jest.fn());

      expect(reactionService.addReaction).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: MESSAGE_ID, emoji: '❤️', participantId: PARTICIPANT_ID })
      );
    });



    it('replies idempotent success without broadcasting or notifying when addReaction reports unchanged (no-op re-react)', async () => {
      // A duplicate reaction:add for an emoji the participant already has
      // (optimistic double-fire, socket retry after a lost ACK, second device
      // echo) is a DB no-op. The handler must reply success but skip both the
      // REACTION_ADDED broadcast and the author notification — otherwise every
      // participant gets a redundant fan-out and the author is re-notified for
      // a reaction that never changed. Mirrors the already-absent remove guard.
      const { notifyReactionAdded } = require('../../../services/notifications/reactionNotify');
      const { handler, io } = buildHandler({
        reactionService: {
          addReaction: jest.fn<any>().mockResolvedValue({
            reaction: { id: 'reaction-1', emoji: '👍' },
            unchanged: true,
          }),
          createUpdateEvent: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);
      await new Promise(resolve => setImmediate(resolve));

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { id: 'reaction-1', emoji: '👍' } }));
      // Nothing changed — no broadcast to the conversation room, no notification.
      expect(io.to).not.toHaveBeenCalled();
      expect(notifyReactionAdded).not.toHaveBeenCalled();
    });

    /**
     * Un SWAP d'emoji est aussi un RETRAIT, et c'est le cas que rien d'autre ne
     * couvre : `addReaction` détruit l'emoji précédent du même acteur (règle
     * « une réaction par personne ») sans qu'aucun `reaction:remove` ne soit
     * jamais émis. La notification « X a réagi 👍 » resterait donc en base pour
     * un 👍 qui n'existe plus, et aucun autre chemin ne passerait la retirer.
     */

    it('returns error on service exception without crashing', async () => {
      const { handler } = buildHandler({
        reactionService: { addReaction: jest.fn<any>().mockRejectedValue(new Error('db down')), createUpdateEvent: jest.fn<any>() },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'db down' }));
    });

    it('returns generic error message when thrown value is not an Error instance', async () => {
      const { handler } = buildHandler({
        reactionService: { addReaction: jest.fn<any>().mockRejectedValue('string error'), createUpdateEvent: jest.fn<any>() },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to add reaction' }));
    });

    it('does not throw when no callback provided on happy path', async () => {
      const { handler } = buildHandler();

      await expect(handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' })).resolves.toBeUndefined();
    });
  });

  // ── handleReactionRemove ─────────────────────────────────────────────────

  describe('handleReactionRemove', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns schema error when validation fails', async () => {
      (validateSocketEvent as jest.Mock<any>).mockReturnValueOnce({ success: false, error: 'emoji required' });
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'emoji required' });
    });

    it('returns error when participant cannot be resolved (optimistic messageId)', async () => {
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeSocket(), { messageId: 'cid_optimistic', emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Could not resolve participant' }));
    });

    it('replies idempotent success when removeReaction returns false (reaction already absent)', async () => {
      // Contract 6b5ca4448: an un-react whose reaction is already gone has
      // reached the caller's desired end-state — replying an error made the
      // client roll back its optimistic removal and re-show a dead reaction.
      const { handler, io } = buildHandler({
        reactionService: { removeReaction: jest.fn<any>().mockResolvedValue(false), createUpdateEvent: jest.fn<any>() },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      // L'accusé est un REÇU : `success` seul, sans `data`. Il portait
      // `{ message: 'Reaction already absent' }`, une phrase anglaise non
      // localisée qu'aucun des trois clients ne lit — et que le décodeur iOS
      // des accusés de réaction rejette là où il en décode un.
      expect(callback).toHaveBeenCalledWith({ success: true });
      // Nothing changed — no broadcast to the conversation room.
      expect(io.to).not.toHaveBeenCalled();
    });

    it('broadcasts removal and calls callback with success on happy path', async () => {
      const { handler, io } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(io.to).toHaveBeenCalled();
    });

    /**
     * Le symétrique du `notifyReactionAdded` du chemin d'ajout : la réaction
     * défaite emporte la notification qu'elle avait produite. Sans lui,
     * « X a réagi 👍 à votre message » survit indéfiniment au 👍 — la ligne
     * garde une copie dénormalisée que rien ne relit.
     */
    it('retire la notification que la réaction avait produite', async () => {
      const { notifyReactionRemoved } = require('../../../services/notifications/reactionNotify');
      const { handler } = buildHandler();

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, jest.fn<any>());
      await new Promise(resolve => setImmediate(resolve));

      expect(notifyReactionRemoved).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ messageId: MESSAGE_ID, emoji: '👍', isAnonymous: false })
      );
    });

    /**
     * Une réaction déjà absente n'a rien produit à retirer : le handler sort
     * sur sa garde d'idempotence AVANT le retrait. Sans cette borne, un
     * double-fire de dé-réaction relancerait une lecture Mongo par appel sur un
     * ensemble vide.
     */
    it('ne retire rien quand la réaction était déjà absente', async () => {
      const { notifyReactionRemoved } = require('../../../services/notifications/reactionNotify');
      const { handler } = buildHandler({
        reactionService: { removeReaction: jest.fn<any>().mockResolvedValue(false), createUpdateEvent: jest.fn<any>() },
      });

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, jest.fn<any>());
      await new Promise(resolve => setImmediate(resolve));

      expect(notifyReactionRemoved).not.toHaveBeenCalled();
    });

    it('replies success (not failure) when the post-write aggregation read throws — reaction already removed', async () => {
      // removeReaction committed the removal; createUpdateEvent then throws on a
      // transient aggregation-read failure. The ACK must reflect the persisted
      // state — replying failure makes the client roll its optimistic un-react
      // back and re-show a reaction that is already gone from the DB.
      const { handler } = buildHandler({
        reactionService: {
          removeReaction: jest.fn<any>().mockResolvedValue(true),
          createUpdateEvent: jest.fn<any>().mockRejectedValue(new Error('aggregation read timeout')),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);
      await new Promise(resolve => setImmediate(resolve));

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns error on service exception (Error instance)', async () => {
      const { handler } = buildHandler({
        reactionService: { removeReaction: jest.fn<any>().mockRejectedValue(new Error('remove failed')), createUpdateEvent: jest.fn<any>() },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'remove failed' }));
    });

    it('returns generic error message when thrown value is not an Error instance', async () => {
      const { handler } = buildHandler({
        reactionService: { removeReaction: jest.fn<any>().mockRejectedValue('plain string error'), createUpdateEvent: jest.fn<any>() },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to remove reaction' }));
    });

    it('does not throw when no callback provided on error', async () => {
      const { handler } = buildHandler({
        reactionService: { removeReaction: jest.fn<any>().mockRejectedValue(new Error('boom')), createUpdateEvent: jest.fn<any>() },
      });

      await expect(handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' })).resolves.toBeUndefined();
    });
  });

  // ── handleReactionSync ───────────────────────────────────────────────────

  describe('handleReactionSync', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleReactionSync(makeSocket(), MESSAGE_ID, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns error when participant cannot be resolved (optimistic messageId)', async () => {
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleReactionSync(makeSocket(), 'cid_optimistic', callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Could not resolve participant' }));
    });

    it('returns success with reaction list on happy path', async () => {
      const reactions = [{ emoji: '👍', count: 3 }];
      const { handler } = buildHandler({
        reactionService: { getMessageReactions: jest.fn<any>().mockResolvedValue(reactions), addReaction: jest.fn(), removeReaction: jest.fn(), createUpdateEvent: jest.fn() },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionSync(makeSocket(), MESSAGE_ID, callback);

      expect(callback).toHaveBeenCalledWith({ success: true, data: reactions });
    });

    it('returns error on service exception', async () => {
      const { handler } = buildHandler({
        reactionService: { getMessageReactions: jest.fn<any>().mockRejectedValue(new Error('timeout')), addReaction: jest.fn(), removeReaction: jest.fn(), createUpdateEvent: jest.fn() },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionSync(makeSocket(), MESSAGE_ID, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'timeout' }));
    });

    it('returns generic error message when thrown value is not an Error instance', async () => {
      const { handler } = buildHandler({
        reactionService: { getMessageReactions: jest.fn<any>().mockRejectedValue('plain string'), addReaction: jest.fn(), removeReaction: jest.fn(), createUpdateEvent: jest.fn() },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionSync(makeSocket(), MESSAGE_ID, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to sync reactions' }));
    });

    it('does not throw when no callback provided on error', async () => {
      const { handler } = buildHandler({
        reactionService: { getMessageReactions: jest.fn<any>().mockRejectedValue(new Error('boom')), addReaction: jest.fn(), removeReaction: jest.fn(), createUpdateEvent: jest.fn() },
      });

      await expect(handler.handleReactionSync(makeSocket(), MESSAGE_ID)).resolves.toBeUndefined();
    });
  });

  // ── _createReactionNotification error swallow ────────────────────────────

  describe('notification error handling', () => {
    it('swallows notifyReactionAdded rejection without propagating to caller', async () => {
      const { notifyReactionAdded } = require('../../../services/notifications/reactionNotify');
      (notifyReactionAdded as jest.Mock<any>).mockRejectedValueOnce(new Error('push service down'));

      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await expect(handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback)).resolves.toBeUndefined();
      // Callback still reported success — notification failure is fire-and-forget
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('notifies with the resolved Participant.id, not the User.id', async () => {
      // reactorParticipantId must be a Participant.id — notifyReactionAdded looks
      // it up via `prisma.participant.findUnique({ where: { id: reactorParticipantId } })`.
      // Passing the User.id here means that lookup always misses and the message
      // author never receives a reaction notification over the socket path.
      const { notifyReactionAdded } = require('../../../services/notifications/reactionNotify');
      const { handler } = buildHandler();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, jest.fn());

      expect(notifyReactionAdded).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reactorParticipantId: PARTICIPANT_ID })
      );
      expect(notifyReactionAdded).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reactorParticipantId: USER_ID })
      );
    });
  });

  // ── Rate limiting ────────────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('rejects handleReactionAdd when rate limit exceeded', async () => {
      mockCheckLimit.mockResolvedValueOnce(false);
      mockGetRateLimitInfo.mockReturnValueOnce({ resetIn: 15000 });

      const { handler } = buildHandler();
      const socket = makeSocket();
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(socket, { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Rate limit exceeded' }));
      expect((socket.emit as jest.Mock<any>)).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: expect.stringContaining('15') })
      );
    });

    it('rejects handleReactionRemove when rate limit exceeded', async () => {
      mockCheckLimit.mockResolvedValueOnce(false);
      mockGetRateLimitInfo.mockReturnValueOnce({ resetIn: 20000 });

      const { handler } = buildHandler();
      const socket = makeSocket();
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(socket, { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Rate limit exceeded' }));
      expect((socket.emit as jest.Mock<any>)).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: expect.stringContaining('20') })
      );
    });

    it('allows handleReactionAdd when rate limit not exceeded', async () => {
      mockCheckLimit.mockResolvedValue(true);

      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('does not call reactionService.addReaction when rate limited', async () => {
      mockCheckLimit.mockResolvedValueOnce(false);
      mockGetRateLimitInfo.mockReturnValueOnce({ resetIn: 5000 });

      const { handler, reactionService } = buildHandler();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' });

      expect(reactionService.addReaction).not.toHaveBeenCalled();
    });

    it('does not call reactionService.removeReaction when rate limited', async () => {
      mockCheckLimit.mockResolvedValueOnce(false);
      mockGetRateLimitInfo.mockReturnValueOnce({ resetIn: 5000 });

      const { handler, reactionService } = buildHandler();

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' });

      expect(reactionService.removeReaction).not.toHaveBeenCalled();
    });

    it('rejects handleReactionSync when its own rate bucket is exhausted', async () => {
      mockCheckLimit.mockResolvedValueOnce(false);

      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleReactionSync(makeSocket(), MESSAGE_ID, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Rate limit exceeded' }));
    });

    it('handleReactionSync rate limit is independent from handleReactionAdd', async () => {
      // First call exhausts REACTION_ADD
      mockCheckLimit
        .mockResolvedValueOnce(false)   // REACTION_ADD is exhausted
        .mockResolvedValueOnce(true);   // REACTION_SYNC is still open

      const { handler } = buildHandler();

      // Add is blocked
      const addCallback = jest.fn<any>();
      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, addCallback);
      expect(addCallback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));

      // Sync succeeds on its own bucket
      const syncCallback = jest.fn<any>();
      await handler.handleReactionSync(makeSocket(), MESSAGE_ID, syncCallback);
      expect(syncCallback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('does not call reactionService.getMessageReactions when sync rate limited', async () => {
      mockCheckLimit.mockResolvedValueOnce(false);

      const { handler, reactionService } = buildHandler();

      await handler.handleReactionSync(makeSocket(), MESSAGE_ID);

      expect(reactionService.getMessageReactions).not.toHaveBeenCalled();
    });
  });

  // ── Anonymous user reactions ─────────────────────────────────────────────

  describe('anonymous user reactions', () => {
    const ANON_SESSION_TOKEN = 'anon-session-xyz';
    const ANON_PARTICIPANT_ID = 'anon-participant-abc';
    const ANON_SOCKET_ID = 'socket-anon-999';

    function buildAnonHandler(reactionOverrides: Record<string, any> = {}) {
      const anonUsers = new Map<string, any>();
      anonUsers.set(ANON_SESSION_TOKEN, {
        id: ANON_SESSION_TOKEN,
        socketId: ANON_SOCKET_ID,
        isAnonymous: true,
        participantId: ANON_PARTICIPANT_ID,
        language: 'fr',
      });

      const anonSocketToUser = new Map<string, string>();
      anonSocketToUser.set(ANON_SOCKET_ID, ANON_SESSION_TOKEN);

      return buildHandler({
        connectedUsers: anonUsers,
        socketToUser: anonSocketToUser,
        reactionService: makeReactionService(reactionOverrides),
      });
    }

    function makeAnonSocket() {
      return makeSocket(ANON_SOCKET_ID);
    }

    it('anonymous user can add a reaction using their participantId directly', async () => {
      const { handler, reactionService } = buildAnonHandler();
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeAnonSocket(), { messageId: MESSAGE_ID, emoji: '🔥' }, callback);

      expect(reactionService.addReaction).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: ANON_PARTICIPANT_ID })
      );
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('anonymous user can remove a reaction using their participantId directly', async () => {
      const { handler, reactionService } = buildAnonHandler();
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeAnonSocket(), { messageId: MESSAGE_ID, emoji: '🔥' }, callback);

      expect(reactionService.removeReaction).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: ANON_PARTICIPANT_ID })
      );
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('anonymous user can sync reactions using their participantId directly', async () => {
      const reactions = [{ emoji: '👋', count: 1 }];
      const { handler, reactionService } = buildAnonHandler({
        getMessageReactions: jest.fn<any>().mockResolvedValue(reactions),
      });
      const callback = jest.fn<any>();

      await handler.handleReactionSync(makeAnonSocket(), MESSAGE_ID, callback);

      expect(reactionService.getMessageReactions).toHaveBeenCalledWith(
        expect.objectContaining({ currentParticipantId: ANON_PARTICIPANT_ID })
      );
      expect(callback).toHaveBeenCalledWith({ success: true, data: reactions });
    });

    // ── Cross-conversation membership gating (IDOR) ────────────────────────
    //
    // An anonymous Participant is bound to exactly ONE conversation. The
    // resolver must verify the target message belongs to that conversation
    // before trusting the in-memory participantId — otherwise an anon that
    // joined conversation A can pass a foreign messageId (conversation B) and
    // read B's reactor list (display names, avatars) via reaction:request-sync,
    // or mutate reactions it should never reach. `participant.findFirst`
    // returning null models "this anon is not an active member of the message's
    // conversation".
    function buildAnonHandlerForForeignMessage(reactionOverrides: Record<string, any> = {}) {
      const anonUsers = new Map<string, any>();
      anonUsers.set(ANON_SESSION_TOKEN, {
        id: ANON_SESSION_TOKEN,
        socketId: ANON_SOCKET_ID,
        isAnonymous: true,
        participantId: ANON_PARTICIPANT_ID,
        language: 'fr',
      });
      const anonSocketToUser = new Map<string, string>();
      anonSocketToUser.set(ANON_SOCKET_ID, ANON_SESSION_TOKEN);

      const FOREIGN_CONV_ID = '507f191e810c19729de860ff';
      return buildHandler({
        connectedUsers: anonUsers,
        socketToUser: anonSocketToUser,
        reactionService: makeReactionService(reactionOverrides),
        prisma: {
          message: { findUnique: jest.fn<any>().mockResolvedValue({ conversationId: FOREIGN_CONV_ID }) },
          // Anon is NOT an active participant of the message's conversation.
          participant: { findFirst: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
        },
      });
    }

    it('anonymous user cannot sync reactions for a message outside their conversation', async () => {
      const { handler, reactionService } = buildAnonHandlerForForeignMessage({
        getMessageReactions: jest.fn<any>().mockResolvedValue([{ emoji: '👋', count: 1 }]),
      });
      const callback = jest.fn<any>();

      await handler.handleReactionSync(makeAnonSocket(), MESSAGE_ID, callback);

      expect(reactionService.getMessageReactions).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Could not resolve participant' })
      );
    });

    it('anonymous user cannot add a reaction to a message outside their conversation', async () => {
      const { handler, reactionService } = buildAnonHandlerForForeignMessage();
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeAnonSocket(), { messageId: MESSAGE_ID, emoji: '🔥' }, callback);

      expect(reactionService.addReaction).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Could not resolve participant' })
      );
    });

    it('anonymous sync verifies the anon participant is active in the message conversation', async () => {
      const { handler, prisma } = buildAnonHandlerForForeignMessage();

      await handler.handleReactionSync(makeAnonSocket(), MESSAGE_ID, jest.fn());

      expect((prisma.message.findUnique as jest.Mock)).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: MESSAGE_ID } })
      );
      expect((prisma.participant.findFirst as jest.Mock)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: ANON_PARTICIPANT_ID, isActive: true }),
        })
      );
    });

    it('anonymous user without participantId cannot add reaction', async () => {
      const anonUsers = new Map<string, any>();
      anonUsers.set(ANON_SESSION_TOKEN, {
        id: ANON_SESSION_TOKEN,
        socketId: ANON_SOCKET_ID,
        isAnonymous: true,
        participantId: undefined, // no participant assigned
        language: 'fr',
      });

      const anonSocketToUser = new Map<string, string>();
      anonSocketToUser.set(ANON_SOCKET_ID, ANON_SESSION_TOKEN);

      const { handler } = buildHandler({ connectedUsers: anonUsers, socketToUser: anonSocketToUser });
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeAnonSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Could not resolve participant' })
      );
    });
  });

  // ── Offline reaction delivery queue ──────────────────────────────────────
  //
  // Symmetry with MessageHandler edit/delete enqueue (Leçon 77/78): a reaction
  // added or removed while a participant is offline is broadcast only to the
  // live conversation room, so the offline peer never learns of it until an
  // unrelated full refetch. Reactions must be enqueued for offline peers and
  // replayed on reconnect via `_drainedEventName` → REACTION_ADDED/REMOVED.

  describe('offline reaction delivery queue', () => {
    const OFFLINE_USER = 'user-offline';
    const OFFLINE_PARTICIPANT = '607f191e810c19729de860f1';
    const ONLINE_PEER_USER = 'user-online-peer';
    const ONLINE_PEER_PARTICIPANT = '607f191e810c19729de860f2';

    function makeDeliveryQueue() {
      return { enqueue: jest.fn<any>().mockResolvedValue(undefined) } as any;
    }

    function makeConnectedUsersWith(peerOnline: boolean) {
      const users = new Map<string, any>();
      users.set(USER_ID, { id: USER_ID, socketId: SOCKET_ID, isAnonymous: false, language: 'en' });
      if (peerOnline) {
        users.set(ONLINE_PEER_USER, { id: ONLINE_PEER_USER, socketId: 'socket-peer', isAnonymous: false, language: 'en' });
      }
      return users;
    }

    function makePrismaWithParticipants() {
      return {
        message: { findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }) },
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([
            { id: PARTICIPANT_ID, userId: USER_ID },
            { id: OFFLINE_PARTICIPANT, userId: OFFLINE_USER },
            { id: ONLINE_PEER_PARTICIPANT, userId: ONLINE_PEER_USER },
          ]),
        },
        conversation: { findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, identifier: CONV_ID }) },
      } as unknown as PrismaClient;
    }

    const flush = () => new Promise(resolve => setImmediate(resolve));

    it('enqueues a reaction-added event for offline participants only', async () => {
      const deliveryQueue = makeDeliveryQueue();
      const { handler } = buildHandler({
        prisma: makePrismaWithParticipants(),
        connectedUsers: makeConnectedUsersWith(true),
        deliveryQueue,
      });

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, jest.fn());
      await flush();

      // Exactly one enqueue: the offline peer. Actor (online + self) and the
      // online peer are both skipped.
      expect(deliveryQueue.enqueue).toHaveBeenCalledTimes(1);
      expect(deliveryQueue.enqueue).toHaveBeenCalledWith(
        OFFLINE_USER,
        expect.objectContaining({
          messageId: MESSAGE_ID,
          conversationId: CONV_ID,
          eventType: 'reaction-added',
        })
      );
    });

    it('scopes the delivery-queue dedup key to the reactor and emoji, not just the message', async () => {
      // RedisDeliveryQueue's default dedup is (messageId, eventType) — without a
      // per-reactor dedupKey, two different participants adding a reaction to
      // the same message would collapse into a single queued entry for an
      // offline peer, silently dropping every reactor after the first.
      const deliveryQueue = makeDeliveryQueue();
      const { handler } = buildHandler({
        prisma: makePrismaWithParticipants(),
        connectedUsers: makeConnectedUsersWith(true),
        deliveryQueue,
      });

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, jest.fn());
      await flush();

      expect(deliveryQueue.enqueue).toHaveBeenCalledWith(
        OFFLINE_USER,
        expect.objectContaining({
          dedupKey: `${MESSAGE_ID}:${PARTICIPANT_ID}:👍`,
        })
      );
    });

    it('does not enqueue for the reacting actor even if they were offline', async () => {
      const deliveryQueue = makeDeliveryQueue();
      // Actor's user id is NOT in connectedUsers → the only guard keeping them
      // out of the queue is the explicit actor-participant exclusion.
      const usersWithoutActor = new Map<string, any>();
      usersWithoutActor.set(USER_ID, { id: USER_ID, socketId: SOCKET_ID, isAnonymous: false, language: 'en' });
      const { handler } = buildHandler({
        prisma: {
          message: { findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }) },
          participant: {
            findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
            findMany: jest.fn<any>().mockResolvedValue([{ id: PARTICIPANT_ID, userId: USER_ID }]),
          },
          conversation: { findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, identifier: CONV_ID }) },
        },
        connectedUsers: usersWithoutActor,
        deliveryQueue,
      });

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, jest.fn());
      await flush();

      expect(deliveryQueue.enqueue).not.toHaveBeenCalled();
    });

    it('enqueues a reaction-removed event for offline participants on un-react', async () => {
      const deliveryQueue = makeDeliveryQueue();
      const { handler } = buildHandler({
        prisma: makePrismaWithParticipants(),
        connectedUsers: makeConnectedUsersWith(true),
        deliveryQueue,
      });

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, jest.fn());
      await flush();

      expect(deliveryQueue.enqueue).toHaveBeenCalledTimes(1);
      expect(deliveryQueue.enqueue).toHaveBeenCalledWith(
        OFFLINE_USER,
        expect.objectContaining({ eventType: 'reaction-removed', messageId: MESSAGE_ID })
      );
    });



    it('is a no-op when no delivery queue is wired (does not throw)', async () => {
      const { handler } = buildHandler({
        prisma: makePrismaWithParticipants(),
        connectedUsers: makeConnectedUsersWith(true),
        // deliveryQueue omitted
      });

      await expect(
        handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, jest.fn())
      ).resolves.toBeUndefined();
      await flush();
    });

    it('does not enqueue on an idempotent no-op re-react', async () => {
      const deliveryQueue = makeDeliveryQueue();
      const { handler } = buildHandler({
        prisma: makePrismaWithParticipants(),
        connectedUsers: makeConnectedUsersWith(true),
        deliveryQueue,
        reactionService: {
          addReaction: jest.fn<any>().mockResolvedValue({ reaction: { id: 'r1', emoji: '👍' }, unchanged: true }),
          createUpdateEvent: jest.fn<any>(),
        },
      });

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, jest.fn());
      await flush();

      expect(deliveryQueue.enqueue).not.toHaveBeenCalled();
    });
  });
});
