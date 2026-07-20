/**
 * Unit tests for ConversationHandler.
 * Covers conversation:join (validation, membership checks, ban, left, success),
 * conversation:leave, and sendConversationStatsToSocket.
 */

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    CONVERSATION_JOINED: 'conversation:joined',
    CONVERSATION_LEFT: 'conversation:left',
    CONVERSATION_JOIN_ERROR: 'conversation:join-error',
    CONVERSATION_STATS: 'conversation:stats',
    CONVERSATION_UNREAD_UPDATED: 'conversation:unread-updated',
    ERROR: 'error',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
  },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn((_schema: unknown, data: unknown) => ({ success: true, data })),
}));

jest.mock('../../../validation/socket-event-schemas', () => ({
  SocketConversationJoinSchema: {},
  SocketConversationLeaveSchema: {},
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    updateOnNewMessage: jest.fn().mockResolvedValue(null),
    getOrCompute: jest.fn().mockResolvedValue(null),
  },
}));

import { ConversationHandler } from '../../../socketio/handlers/ConversationHandler';
import { validateSocketEvent } from '../../../middleware/validation';
import { conversationStatsService } from '../../../services/ConversationStatsService';
import type { ConversationHandlerDependencies } from '../../../socketio/handlers/ConversationHandler';

const mockedValidate = validateSocketEvent as jest.Mock;
const mockedStats = conversationStatsService.getOrCompute as jest.Mock;

const CONV_ID = 'cccccc000000000000000003';
const USER_ID = 'user-xyz';
const SOCKET_ID = 'socket-abc';

// ─── Fakes ────────────────────────────────────────────────────────────────────

function makeSocket() {
  const join = jest.fn().mockResolvedValue(undefined);
  const leave = jest.fn().mockResolvedValue(undefined);
  const emit = jest.fn();
  return { id: SOCKET_ID, join, leave, emit };
}

function makePrisma(overrides: Partial<{
  conversationFindUnique: unknown;
  participantFindFirst: unknown;
}> = {}) {
  return {
    conversation: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.conversationFindUnique !== undefined
          ? overrides.conversationFindUnique
          : null
      ),
    },
    participant: {
      findFirst: jest.fn().mockResolvedValue(
        overrides.participantFindFirst !== undefined
          ? overrides.participantFindFirst
          : { id: 'part-1', bannedAt: null, leftAt: null, isActive: true }
      ),
    },
  } as any;
}

function makeConnectedUsers() {
  const map = new Map<string, unknown>();
  map.set(USER_ID, {
    id: USER_ID,
    socketId: SOCKET_ID,
    isAnonymous: false,
    language: 'fr',
    resolvedLanguages: ['fr'],
    userId: USER_ID,
  });
  return map;
}

function makeSocketToUser() {
  const map = new Map<string, string>();
  map.set(SOCKET_ID, USER_ID);
  return map;
}

function makeReadStatusService(unreadCount = 0) {
  return { getUnreadCount: jest.fn().mockResolvedValue(unreadCount) };
}

function makeDeps(overrides: Partial<{
  prisma: ReturnType<typeof makePrisma>;
  connectedUsers: Map<string, unknown>;
  socketToUser: Map<string, string>;
  readStatusService: ReturnType<typeof makeReadStatusService>;
}> = {}): ConversationHandlerDependencies {
  return {
    prisma: (overrides.prisma ?? makePrisma()) as any,
    connectedUsers: (overrides.connectedUsers ?? makeConnectedUsers()) as any,
    socketToUser: overrides.socketToUser ?? makeSocketToUser(),
    readStatusService: (overrides.readStatusService ?? makeReadStatusService()) as any,
  };
}

const JOIN_PAYLOAD = { conversationId: CONV_ID };
const LEAVE_PAYLOAD = { conversationId: CONV_ID };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConversationHandler', () => {

  beforeEach(() => {
    mockedValidate.mockImplementation((_schema, data) => ({ success: true, data }));
    mockedStats.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── handleConversationJoin: validation guard ──────────────────────────────

  describe('handleConversationJoin — validation guard', () => {
    it('emits conversation:join-error when validation fails', async () => {
      mockedValidate.mockReturnValue({ success: false, error: 'invalid' });
      const deps = makeDeps();
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        reason: 'invalid_payload',
      }));
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  // ─── handleConversationJoin: membership checks ────────────────────────────

  describe('handleConversationJoin — membership checks', () => {
    it('emits not_a_member error when participant is not found', async () => {
      const prisma = makePrisma({ participantFindFirst: null });
      const deps = makeDeps({ prisma });
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        reason: 'not_a_member',
      }));
    });

    it('emits banned error when participant is banned', async () => {
      const prisma = makePrisma({ participantFindFirst: { id: 'p1', bannedAt: new Date(), leftAt: null, isActive: true } });
      const deps = makeDeps({ prisma });
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        reason: 'banned',
      }));
    });

    it('emits no_longer_member error when participant leftAt is set', async () => {
      const prisma = makePrisma({ participantFindFirst: { id: 'p1', bannedAt: null, leftAt: new Date(), isActive: true } });
      const deps = makeDeps({ prisma });
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        reason: 'no_longer_member',
      }));
    });

    it('emits no_longer_member error when participant isActive is false', async () => {
      const prisma = makePrisma({ participantFindFirst: { id: 'p1', bannedAt: null, leftAt: null, isActive: false } });
      const deps = makeDeps({ prisma });
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        reason: 'no_longer_member',
      }));
    });
  });

  // ─── handleConversationJoin: success path ─────────────────────────────────

  describe('handleConversationJoin — success', () => {
    it('joins the socket to the conversation room', async () => {
      const deps = makeDeps();
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      expect(socket.join).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
    });

    it('emits conversation:joined event after joining', async () => {
      const deps = makeDeps();
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      expect(socket.emit).toHaveBeenCalledWith('conversation:joined', {
        conversationId: CONV_ID,
        userId: USER_ID,
      });
    });

    it('emits not_authenticated error when socket user is not authenticated', async () => {
      const deps = makeDeps({ socketToUser: new Map() });
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        reason: 'not_authenticated',
      }));
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('joins room for an anonymous member without emitting conversation:joined', async () => {
      // Anonymous SocketUser: identity IS the participantId. Membership is verified
      // (security fix ccaa9311f) and, having no userId, no conversation:joined is sent.
      const SESSION_TOKEN = 'anon-session-token';
      const ANON_PARTICIPANT_ID = 'anon-part-1';
      const connectedUsers = new Map<string, unknown>();
      connectedUsers.set(SESSION_TOKEN, { id: SESSION_TOKEN, isAnonymous: true, participantId: ANON_PARTICIPANT_ID, language: 'fr' });
      const socketToUser = new Map<string, string>([[SOCKET_ID, SESSION_TOKEN]]);
      const prisma = makePrisma({ participantFindFirst: { id: ANON_PARTICIPANT_ID } });
      const deps = makeDeps({ connectedUsers, socketToUser, prisma });
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      // Valid anonymous member (owns the participant): joins the room and emits
      // no conversation:joined (no userId on an anonymous SocketUser).
      expect(socket.join).toHaveBeenCalled();
      expect(socket.emit).not.toHaveBeenCalledWith('conversation:joined', expect.anything());
    });

    it('rejects an anonymous user who does not own the participant (not_a_member)', async () => {
      // Security fix ccaa9311f: anonymous join is membership-checked, not skipped.
      const SESSION_TOKEN = 'anon-session-token';
      const connectedUsers = new Map<string, unknown>();
      connectedUsers.set(SESSION_TOKEN, { id: SESSION_TOKEN, isAnonymous: true, participantId: 'anon-part-1', language: 'fr' });
      const socketToUser = new Map<string, string>([[SOCKET_ID, SESSION_TOKEN]]);
      const prisma = makePrisma({ participantFindFirst: null });
      const deps = makeDeps({ connectedUsers, socketToUser, prisma });
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        reason: 'not_a_member',
      }));
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('rejects an unauthenticated socket (no connected user) with not_authenticated', async () => {
      // Security fix ccaa9311f: the old userId-less "join without verification"
      // path was removed; an unresolvable socket is now rejected outright.
      const deps = makeDeps({ socketToUser: new Map() });
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        reason: 'not_authenticated',
      }));
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('emits conversation:stats when stats service returns data', async () => {
      const stats = { memberCount: 5, onlineCount: 2 };
      mockedStats.mockResolvedValue(stats);
      const deps = makeDeps();
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      expect(socket.emit).toHaveBeenCalledWith('conversation:stats', expect.objectContaining({ stats }));
    });

    it('does not emit conversation:stats when stats service returns null', async () => {
      mockedStats.mockResolvedValue(null);
      const deps = makeDeps();
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      expect(socket.emit).not.toHaveBeenCalledWith('conversation:stats', expect.anything());
    });

    it('emits conversation:unread-updated with the user unread count on join', async () => {
      const readStatusService = makeReadStatusService(7);
      const deps = makeDeps({ readStatusService });
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      expect(readStatusService.getUnreadCount).toHaveBeenCalledWith(USER_ID, CONV_ID);
      expect(socket.emit).toHaveBeenCalledWith('conversation:unread-updated', {
        conversationId: CONV_ID,
        unreadCount: 7,
      });
    });

    it('does not emit conversation:unread-updated when socket user is not authenticated', async () => {
      const deps = makeDeps({ socketToUser: new Map() });
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      expect(socket.emit).not.toHaveBeenCalledWith('conversation:unread-updated', expect.anything());
    });

    it('does not throw when unread count fetch fails on join', async () => {
      const readStatusService = { getUnreadCount: jest.fn().mockRejectedValue(new Error('DB error')) };
      const deps = makeDeps({ readStatusService: readStatusService as any });
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await expect(handler.handleConversationJoin(socket as any, JOIN_PAYLOAD)).resolves.toBeUndefined();
      expect(socket.emit).toHaveBeenCalledWith('conversation:joined', expect.anything());
    });
  });

  // ─── handleConversationJoin: error handling ───────────────────────────────

  describe('handleConversationJoin — error handling', () => {
    it('emits server_error when an unexpected error is thrown', async () => {
      const prisma = makePrisma();
      prisma.participant.findFirst.mockRejectedValue(new Error('DB down'));
      const deps = makeDeps({ prisma });
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        reason: 'server_error',
      }));
    });

    it('emits server_error when socket.join rejects (proves join is awaited)', async () => {
      const deps = makeDeps();
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      socket.join.mockRejectedValue(new Error('socket adapter failure'));
      await handler.handleConversationJoin(socket as any, JOIN_PAYLOAD);
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        reason: 'server_error',
      }));
      expect(socket.emit).not.toHaveBeenCalledWith('conversation:joined', expect.anything());
    });
  });

  // ─── handleConversationLeave ──────────────────────────────────────────────

  describe('handleConversationLeave', () => {
    it('leaves the conversation room', async () => {
      const deps = makeDeps();
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationLeave(socket as any, LEAVE_PAYLOAD);
      expect(socket.leave).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
    });

    it('emits conversation:left when socket user is authenticated', async () => {
      const deps = makeDeps();
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationLeave(socket as any, LEAVE_PAYLOAD);
      expect(socket.emit).toHaveBeenCalledWith('conversation:left', {
        conversationId: CONV_ID,
        userId: USER_ID,
      });
    });

    it('does not emit conversation:left when socket user is not authenticated', async () => {
      const deps = makeDeps({ socketToUser: new Map() });
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationLeave(socket as any, LEAVE_PAYLOAD);
      expect(socket.emit).not.toHaveBeenCalledWith('conversation:left', expect.anything());
    });

    it('emits error event when validation fails', async () => {
      mockedValidate.mockReturnValue({ success: false, error: 'bad-schema' });
      const deps = makeDeps();
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.handleConversationLeave(socket as any, LEAVE_PAYLOAD);
      expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'bad-schema' }));
      expect(socket.leave).not.toHaveBeenCalled();
    });

    it('emits error event when an exception occurs during leave', async () => {
      const socket = makeSocket();
      socket.leave = jest.fn().mockRejectedValue(new Error('socket error'));
      const deps = makeDeps();
      const handler = new ConversationHandler(deps);
      await handler.handleConversationLeave(socket as any, LEAVE_PAYLOAD);
      expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'Failed to leave conversation' }));
    });

  });

  // ─── sendConversationStatsToSocket ────────────────────────────────────────

  describe('sendConversationStatsToSocket', () => {
    it('emits conversation:stats when stats are available', async () => {
      const stats = { memberCount: 10 };
      mockedStats.mockResolvedValue(stats);
      const deps = makeDeps();
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.sendConversationStatsToSocket(socket as any, CONV_ID);
      expect(socket.emit).toHaveBeenCalledWith('conversation:stats', { conversationId: CONV_ID, stats });
    });

    it('does not emit when stats service returns null', async () => {
      mockedStats.mockResolvedValue(null);
      const deps = makeDeps();
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await handler.sendConversationStatsToSocket(socket as any, CONV_ID);
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('does not throw when stats service throws', async () => {
      mockedStats.mockRejectedValue(new Error('stats error'));
      const deps = makeDeps();
      const handler = new ConversationHandler(deps);
      const socket = makeSocket();
      await expect(handler.sendConversationStatsToSocket(socket as any, CONV_ID)).resolves.toBeUndefined();
    });
  });
});
