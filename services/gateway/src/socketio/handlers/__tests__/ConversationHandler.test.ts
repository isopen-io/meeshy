/**
 * Unit tests for ConversationHandler
 * Covers: handleConversationJoin, handleConversationLeave, sendConversationStatsToSocket
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNormalizeConversationId = jest.fn() as jest.Mock<any>;
const mockValidateSocketEvent = jest.fn() as jest.Mock<any>;
const mockUpdateOnNewMessage = jest.fn() as jest.Mock<any>;
const mockGetOrCompute = jest.fn() as jest.Mock<any>;
const mockCheckLimit = jest.fn() as jest.Mock<any>;

jest.mock('../../utils/socket-helpers', () => ({
  normalizeConversationId: (...args: unknown[]) => mockNormalizeConversationId(...args),
}));

jest.mock('../../../utils/socket-rate-limiter.js', () => ({
  getSocketRateLimiter: () => ({ checkLimit: (...a: unknown[]) => mockCheckLimit(...a) }),
  SOCKET_RATE_LIMITS: {
    CONVERSATION_JOIN: { maxRequests: 5, windowMs: 60000, keyPrefix: 'socket:conv:join' },
  },
}));

jest.mock('../../../middleware/validation.js', () => ({
  validateSocketEvent: (...args: unknown[]) => mockValidateSocketEvent(...args),
}));

jest.mock('../../../validation/socket-event-schemas.js', () => ({
  SocketConversationJoinSchema: {},
  SocketConversationLeaveSchema: {},
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    updateOnNewMessage: (...args: unknown[]) => mockUpdateOnNewMessage(...args),
    getOrCompute: (...args: unknown[]) => mockGetOrCompute(...args),
  },
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import { ConversationHandler } from '../ConversationHandler';
import type { Socket } from 'socket.io';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

// ─── Factories ────────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';
const SOCKET_ID = 'socket-xyz';

function makeSocket(overrides: Record<string, any> = {}): Socket {
  return {
    id: SOCKET_ID,
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    ...overrides,
  } as unknown as Socket;
}

function makePrisma(participantResult: unknown = null): any {
  return {
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, identifier: 'test-conv' }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(participantResult),
    },
  };
}

function makeConnectedUsers() {
  const users = new Map();
  users.set(USER_ID, { id: USER_ID, socketId: SOCKET_ID, isAnonymous: false, language: 'fr', resolvedLanguages: [], userId: USER_ID });
  return users;
}

function makeReadStatusService() {
  return { getUnreadCount: jest.fn().mockResolvedValue(0) };
}

function makeHandler({
  prisma = makePrisma(),
  connectedUsers = makeConnectedUsers(),
  socketToUser = new Map([[SOCKET_ID, USER_ID]]),
  readStatusService = makeReadStatusService(),
  retractTyping = undefined as undefined | ((socket: any, conversationId: string) => Promise<void>),
} = {}) {
  return new ConversationHandler({ prisma, connectedUsers, socketToUser, readStatusService: readStatusService as any, retractTyping });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConversationHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue(CONV_ID);
    mockValidateSocketEvent.mockReturnValue({ success: true, data: { conversationId: CONV_ID } });
    mockUpdateOnNewMessage.mockResolvedValue(null);
    mockGetOrCompute.mockResolvedValue(null);
    mockCheckLimit.mockResolvedValue(true); // allow by default
  });

  // ── handleConversationJoin ──────────────────────────────────────────────────

  describe('handleConversationJoin', () => {
    it('joins room and emits CONVERSATION_JOINED for active member', async () => {
      const participant = { id: 'part-1', bannedAt: null, leftAt: null, isActive: true };
      const prisma = makePrisma(participant);
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleConversationJoin(socket, { conversationId: CONV_ID });

      const room = ROOMS.conversation(CONV_ID);
      expect(socket.join).toHaveBeenCalledWith(room);
      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_JOINED,
        { conversationId: CONV_ID, userId: USER_ID }
      );
    });

    it('emits join-error with invalid_payload when schema validation fails', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'Validation failed: bad data' });
      const socket = makeSocket();
      const handler = makeHandler();

      await handler.handleConversationJoin(socket, { conversationId: '' });

      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_JOIN_ERROR,
        expect.objectContaining({ reason: 'invalid_payload' })
      );
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('emits join-error with not_a_member when participant is not found', async () => {
      const prisma = makePrisma(null);
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleConversationJoin(socket, { conversationId: CONV_ID });

      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_JOIN_ERROR,
        expect.objectContaining({ reason: 'not_a_member' })
      );
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('emits join-error with banned reason when participant is banned', async () => {
      const participant = { id: 'part-1', bannedAt: new Date(), leftAt: null, isActive: true };
      const prisma = makePrisma(participant);
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleConversationJoin(socket, { conversationId: CONV_ID });

      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_JOIN_ERROR,
        expect.objectContaining({ reason: 'banned' })
      );
    });

    it('emits join-error with no_longer_member when participant has leftAt set', async () => {
      const participant = { id: 'part-1', bannedAt: null, leftAt: new Date(), isActive: true };
      const prisma = makePrisma(participant);
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleConversationJoin(socket, { conversationId: CONV_ID });

      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_JOIN_ERROR,
        expect.objectContaining({ reason: 'no_longer_member' })
      );
    });

    it('emits join-error with no_longer_member when participant is inactive', async () => {
      const participant = { id: 'part-1', bannedAt: null, leftAt: null, isActive: false };
      const prisma = makePrisma(participant);
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleConversationJoin(socket, { conversationId: CONV_ID });

      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_JOIN_ERROR,
        expect.objectContaining({ reason: 'no_longer_member' })
      );
    });

    it('allows an anonymous member (owns participant) to join without CONVERSATION_JOINED', async () => {
      // Anonymous SocketUser: identity IS the participantId. The handler now
      // verifies the anonymous user owns the participant for THIS conversation
      // (security fix ccaa9311f) instead of skipping verification entirely.
      const SESSION_TOKEN = 'anon-session-token';
      const ANON_PARTICIPANT_ID = 'anon-part-1';
      const socketToUser = new Map<string, string>([[SOCKET_ID, SESSION_TOKEN]]);
      const connectedUsers = new Map();
      connectedUsers.set(SESSION_TOKEN, {
        id: SESSION_TOKEN, isAnonymous: true, participantId: ANON_PARTICIPANT_ID, language: 'fr', resolvedLanguages: [],
      });
      const prisma = makePrisma({ id: ANON_PARTICIPANT_ID }); // membership check resolves a participant
      const socket = makeSocket();
      const handler = makeHandler({ prisma, connectedUsers, socketToUser });

      await handler.handleConversationJoin(socket, { conversationId: CONV_ID });

      // Valid anonymous member (owns the participant): the handler joins the
      // room and, having no userId, does NOT emit CONVERSATION_JOINED.
      expect(socket.join).toHaveBeenCalled();
      expect(socket.emit).not.toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_JOINED,
        expect.anything()
      );
    });

    it('rejects an anonymous user who does not own the participant (not_a_member)', async () => {
      // Security fix ccaa9311f: anonymous users are membership-checked, no longer
      // allowed to join an arbitrary conversation without verification.
      const SESSION_TOKEN = 'anon-session-token';
      const socketToUser = new Map<string, string>([[SOCKET_ID, SESSION_TOKEN]]);
      const connectedUsers = new Map();
      connectedUsers.set(SESSION_TOKEN, {
        id: SESSION_TOKEN, isAnonymous: true, participantId: 'anon-part-1', language: 'fr', resolvedLanguages: [],
      });
      const prisma = makePrisma(null); // no participant found for this conversation
      const socket = makeSocket();
      const handler = makeHandler({ prisma, connectedUsers, socketToUser });

      await handler.handleConversationJoin(socket, { conversationId: CONV_ID });

      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_JOIN_ERROR,
        expect.objectContaining({ reason: 'not_a_member' })
      );
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('rejects an unauthenticated socket (no connected user) with not_authenticated', async () => {
      // Security fix ccaa9311f: a socket with no resolvable connected user can no
      // longer join — the old userId-less "skip verification" path was removed.
      const socketToUser = new Map<string, string>(); // no entry for SOCKET_ID
      const socket = makeSocket();
      const handler = makeHandler({ socketToUser });

      await handler.handleConversationJoin(socket, { conversationId: CONV_ID });

      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_JOIN_ERROR,
        expect.objectContaining({ reason: 'not_authenticated' })
      );
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('emits join-error with rate_limited reason when rate limiter denies the request', async () => {
      mockCheckLimit.mockResolvedValue(false);
      const socket = makeSocket();
      const handler = makeHandler();

      await handler.handleConversationJoin(socket, { conversationId: CONV_ID });

      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_JOIN_ERROR,
        expect.objectContaining({ reason: 'rate_limited', conversationId: CONV_ID })
      );
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('calls sendConversationStatsToSocket after successful join', async () => {
      const participant = { id: 'part-1', bannedAt: null, leftAt: null, isActive: true };
      const prisma = makePrisma(participant);
      const socket = makeSocket();
      const handler = makeHandler({ prisma });
      const spy = jest.spyOn(handler, 'sendConversationStatsToSocket').mockResolvedValue(undefined);

      await handler.handleConversationJoin(socket, { conversationId: CONV_ID });

      expect(spy).toHaveBeenCalledWith(socket, CONV_ID);
    });

    it('passes the resolved ObjectId (not the raw identifier) to the stats call on an identifier join', async () => {
      // A join by conversation identifier/slug ("team-alpha") is resolved to its
      // ObjectId for the room, membership check, joined payload and unread emit —
      // the stats call must use the same resolved id. ConversationStatsService only
      // resolves the "meeshy" literal itself; handing it any OTHER raw identifier
      // makes findFirst({ id }) miss → empty stats cached under the identifier key.
      const participant = { id: 'part-1', bannedAt: null, leftAt: null, isActive: true };
      const prisma = makePrisma(participant);
      const socket = makeSocket();
      const handler = makeHandler({ prisma });
      mockValidateSocketEvent.mockReturnValue({ success: true, data: { conversationId: 'team-alpha' } });
      mockNormalizeConversationId.mockResolvedValue(CONV_ID);
      const spy = jest.spyOn(handler, 'sendConversationStatsToSocket').mockResolvedValue(undefined);

      await handler.handleConversationJoin(socket, { conversationId: 'team-alpha' });

      expect(spy).toHaveBeenCalledWith(socket, CONV_ID);
    });

    it('preserves the "meeshy" literal (not its ObjectId) for the global conversation stats', async () => {
      // Contract pin: ConversationStatsService re-derives the global flag from the
      // "meeshy" literal (the global conversation has no Participant rows), so the
      // stats call must keep "meeshy" verbatim even though it resolves to an ObjectId
      // everywhere else. Guards against a naive "always pass normalizedId" over-fix.
      const participant = { id: 'part-1', bannedAt: null, leftAt: null, isActive: true };
      const prisma = makePrisma(participant);
      const socket = makeSocket();
      const handler = makeHandler({ prisma });
      mockValidateSocketEvent.mockReturnValue({ success: true, data: { conversationId: 'meeshy' } });
      mockNormalizeConversationId.mockResolvedValue(CONV_ID);
      const spy = jest.spyOn(handler, 'sendConversationStatsToSocket').mockResolvedValue(undefined);

      await handler.handleConversationJoin(socket, { conversationId: 'meeshy' });

      expect(spy).toHaveBeenCalledWith(socket, 'meeshy');
    });

    it('emits CONVERSATION_UNREAD_UPDATED with unread count after successful join', async () => {
      const participant = { id: 'part-1', bannedAt: null, leftAt: null, isActive: true };
      const prisma = makePrisma(participant);
      const readStatusService = { getUnreadCount: jest.fn<any>().mockResolvedValue(7) };
      const socket = makeSocket();
      const handler = makeHandler({ prisma, readStatusService: readStatusService as any });
      jest.spyOn(handler, 'sendConversationStatsToSocket').mockResolvedValue(undefined);

      await handler.handleConversationJoin(socket, { conversationId: CONV_ID });

      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED,
        { conversationId: CONV_ID, unreadCount: 7 }
      );
    });

    it('does not crash when getUnreadCount rejects (non-blocking path)', async () => {
      const participant = { id: 'part-1', bannedAt: null, leftAt: null, isActive: true };
      const prisma = makePrisma(participant);
      const readStatusService = { getUnreadCount: jest.fn<any>().mockRejectedValue(new Error('Redis down')) };
      const socket = makeSocket();
      const handler = makeHandler({ prisma, readStatusService: readStatusService as any });
      jest.spyOn(handler, 'sendConversationStatsToSocket').mockResolvedValue(undefined);

      await expect(handler.handleConversationJoin(socket, { conversationId: CONV_ID })).resolves.toBeUndefined();
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.CONVERSATION_JOINED, expect.anything());
      expect(socket.emit).not.toHaveBeenCalledWith(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, expect.anything());
    });

    it('emits server_error join-error when an exception is thrown', async () => {
      mockNormalizeConversationId.mockRejectedValue(new Error('DB error'));
      const socket = makeSocket();
      const handler = makeHandler();

      await handler.handleConversationJoin(socket, { conversationId: CONV_ID });

      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_JOIN_ERROR,
        expect.objectContaining({ reason: 'server_error' })
      );
    });

    it('preserves requestedId in error response even for invalid payload', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad' });
      const socket = makeSocket();
      const handler = makeHandler();

      await handler.handleConversationJoin(socket, { conversationId: 'my-conv-identifier' });

      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_JOIN_ERROR,
        expect.objectContaining({ conversationId: 'my-conv-identifier' })
      );
    });

    it('handles missing data gracefully (requestedId defaults to empty string)', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad' });
      const socket = makeSocket();
      const handler = makeHandler();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await handler.handleConversationJoin(socket, null as any);

      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_JOIN_ERROR,
        expect.objectContaining({ conversationId: '' })
      );
    });
  });

  // ── handleConversationLeave ────────────────────────────────────────────────

  describe('handleConversationLeave', () => {
    it('leaves room and emits CONVERSATION_LEFT for authenticated user', async () => {
      const socket = makeSocket();
      const handler = makeHandler();

      await handler.handleConversationLeave(socket, { conversationId: CONV_ID });

      expect(socket.leave).toHaveBeenCalledWith(ROOMS.conversation(CONV_ID));
      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_LEFT,
        { conversationId: CONV_ID, userId: USER_ID }
      );
    });

    it('emits error when schema validation fails', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'Validation failed: x' });
      const socket = makeSocket();
      const handler = makeHandler();

      await handler.handleConversationLeave(socket, { conversationId: '' });

      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.objectContaining({ message: expect.any(String) }));
      expect(socket.leave).not.toHaveBeenCalled();
    });

    it('leaves room without emitting CONVERSATION_LEFT when no userId in map', async () => {
      const socketToUser = new Map<string, string>();
      const socket = makeSocket();
      const handler = makeHandler({ socketToUser });

      await handler.handleConversationLeave(socket, { conversationId: CONV_ID });

      expect(socket.leave).toHaveBeenCalledWith(ROOMS.conversation(CONV_ID));
      expect(socket.emit).not.toHaveBeenCalledWith(SERVER_EVENTS.CONVERSATION_LEFT, expect.anything());
    });

    it('catches and logs errors without propagating', async () => {
      mockNormalizeConversationId.mockRejectedValue(new Error('DB unreachable'));
      const socket = makeSocket();
      const handler = makeHandler();

      await expect(handler.handleConversationLeave(socket, { conversationId: CONV_ID })).resolves.toBeUndefined();
    });

    // Quitter une conversation en cours de frappe doit retracter l'indicateur.
    // Seul `disconnecting` le faisait, et changer de conversation ne déconnecte
    // pas le socket : les pairs gardaient un « X est en train d'écrire… »
    // fantôme jusqu'à leur filet de sécurité local.
    it('retracts this socket typing in the conversation being left', async () => {
      const retractTyping = jest.fn<(socket: unknown, conversationId: string) => Promise<void>>()
        .mockResolvedValue(undefined);
      const socket = makeSocket();
      const handler = makeHandler({ retractTyping });

      await handler.handleConversationLeave(socket, { conversationId: CONV_ID });

      expect(retractTyping).toHaveBeenCalledWith(socket, CONV_ID);
    });

    // La retraction reçoit l'id DÉJÀ normalisé : `handleConversationLeave` l'a
    // résolu, la refaire résoudre coûterait un second findUnique à chaque
    // changement de conversation.
    //
    // Le double de validation du fichier rend un `conversationId` CONSTANT :
    // tel quel, il ferait passer aussi bien la version juste que la version qui
    // relaie l'identifiant brut. Ce test le fait donc échoïser l'entrée, et
    // écarte l'id normalisé de l'identifiant reçu — sans quoi il ne
    // discriminerait rien (leçon 128).
    it('passes the normalized conversation id, not the raw one', async () => {
      const RAW_IDENTIFIER = 'mshy_some-identifier-20260812';
      mockValidateSocketEvent.mockImplementation((_schema: unknown, data: any) => ({
        success: true,
        data: { conversationId: data.conversationId },
      }));
      mockNormalizeConversationId.mockResolvedValue(CONV_ID);
      const retractTyping = jest.fn<(socket: unknown, conversationId: string) => Promise<void>>()
        .mockResolvedValue(undefined);
      const socket = makeSocket();
      const handler = makeHandler({ retractTyping });

      await handler.handleConversationLeave(socket, { conversationId: RAW_IDENTIFIER });

      expect(retractTyping).toHaveBeenCalledWith(socket, CONV_ID);
      expect(retractTyping).not.toHaveBeenCalledWith(socket, RAW_IDENTIFIER);
    });

    // Retracter AVANT de sortir de la room : l'énoncé reste « je retire ce que
    // j'ai diffusé, puis je sors ».
    it('retracts before leaving the room', async () => {
      const order: string[] = [];
      const retractTyping = jest.fn<(socket: unknown, conversationId: string) => Promise<void>>()
        .mockImplementation(async () => { order.push('retract'); });
      const socket = makeSocket();
      (socket.leave as jest.Mock).mockImplementation(() => { order.push('leave'); });
      const handler = makeHandler({ retractTyping });

      await handler.handleConversationLeave(socket, { conversationId: CONV_ID });

      expect(order).toEqual(['retract', 'leave']);
    });

    // Une retraction qui échoue ne doit pas empêcher la sortie de room : le
    // client a demandé à partir, il part.
    it('still leaves the room when the retraction throws', async () => {
      const retractTyping = jest.fn<(socket: unknown, conversationId: string) => Promise<void>>()
        .mockRejectedValue(new Error('typing state unavailable'));
      const socket = makeSocket();
      const handler = makeHandler({ retractTyping });

      await expect(handler.handleConversationLeave(socket, { conversationId: CONV_ID })).resolves.toBeUndefined();
      expect(socket.leave).toHaveBeenCalledWith(ROOMS.conversation(CONV_ID));
      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_LEFT,
        { conversationId: CONV_ID, userId: USER_ID }
      );
    });

    // Aucune dépendance câblée (tous les call sites existants) : le handler
    // reste fonctionnel, il ne retracte simplement rien.
    it('leaves normally when no retraction is wired', async () => {
      const socket = makeSocket();
      const handler = makeHandler();

      await expect(handler.handleConversationLeave(socket, { conversationId: CONV_ID })).resolves.toBeUndefined();
      expect(socket.leave).toHaveBeenCalledWith(ROOMS.conversation(CONV_ID));
    });
  });

  // ── sendConversationStatsToSocket ──────────────────────────────────────────

  describe('sendConversationStatsToSocket', () => {
    it('emits CONVERSATION_STATS when stats are returned', async () => {
      const stats = { participantCount: 5, messageCount: 100 };
      mockGetOrCompute.mockResolvedValue(stats);
      const socket = makeSocket();
      const handler = makeHandler();

      await handler.sendConversationStatsToSocket(socket, CONV_ID);

      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_STATS,
        { conversationId: CONV_ID, stats }
      );
    });

    it('does not emit when stats are null', async () => {
      mockGetOrCompute.mockResolvedValue(null);
      const socket = makeSocket();
      const handler = makeHandler();

      await handler.sendConversationStatsToSocket(socket, CONV_ID);

      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('passes the connectedUsers ids to the getOnlineUsers callback', async () => {
      mockGetOrCompute.mockResolvedValue(null);
      const connectedUsers = makeConnectedUsers();
      const socket = makeSocket();
      const handler = makeHandler({ connectedUsers });

      await handler.sendConversationStatsToSocket(socket, CONV_ID);

      const [, , getOnlineUsers] = mockGetOrCompute.mock.calls[0] as any[];
      const ids = getOnlineUsers();
      expect(ids).toContain(USER_ID);
    });

    it('refreshes stats through the read-only getOrCompute, never the mutating updateOnNewMessage', async () => {
      // Regression: a stats refresh on conversation:join must NOT run the
      // per-new-message increment path. `updateOnNewMessage` bumps
      // messagesPerLanguage on every warm-cache call, so using it as a
      // read-only "refresh" inflated a conversation's message counts by one on
      // every join and persisted the corruption in the shared singleton cache.
      const stats = { participantCount: 5, messagesPerLanguage: { en: 10 } };
      mockGetOrCompute.mockResolvedValue(stats);
      const socket = makeSocket();
      const handler = makeHandler();

      await handler.sendConversationStatsToSocket(socket, CONV_ID);

      expect(mockGetOrCompute).toHaveBeenCalledTimes(1);
      expect(mockGetOrCompute).toHaveBeenCalledWith(
        expect.anything(),
        CONV_ID,
        expect.any(Function)
      );
      expect(mockUpdateOnNewMessage).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_STATS,
        { conversationId: CONV_ID, stats }
      );
    });

    it('catches and logs errors without propagating', async () => {
      mockGetOrCompute.mockRejectedValue(new Error('stats fail'));
      const socket = makeSocket();
      const handler = makeHandler();

      await expect(handler.sendConversationStatsToSocket(socket, CONV_ID)).resolves.toBeUndefined();
    });
  });
});
