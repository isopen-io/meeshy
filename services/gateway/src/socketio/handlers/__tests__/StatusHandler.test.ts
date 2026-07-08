/**
 * Unit tests for StatusHandler
 * Covers: handleTypingStart, handleTypingStop, _resolveTypingIdentity,
 *         typing throttle, identity cache (TTL + invalidate), clearTypingThrottle
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ─── Mocks (must be defined before SUT import) ───────────────────────────────

const mockNormalizeConversationId = jest.fn() as jest.Mock<any>;
const mockGetConnectedUser = jest.fn() as jest.Mock<any>;
const mockValidateSocketEvent = jest.fn() as jest.Mock<any>;
const mockResolveParticipant = jest.fn() as jest.Mock<any>;

jest.mock('../../utils/socket-helpers', () => ({
  normalizeConversationId: (...args: unknown[]) => mockNormalizeConversationId(...args),
  getConnectedUser: (...args: unknown[]) => mockGetConnectedUser(...args),
}));

jest.mock('../../utils/participant-resolver', () => ({
  resolveParticipant: (...args: unknown[]) => mockResolveParticipant(...args),
}));

jest.mock('../../../middleware/validation.js', () => ({
  validateSocketEvent: (...args: unknown[]) => mockValidateSocketEvent(...args),
}));

jest.mock('../../../validation/socket-event-schemas.js', () => ({
  SocketTypingSchema: {},
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

import { StatusHandler } from '../StatusHandler';
import type { Socket } from 'socket.io';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

// ─── Factories ───────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';
const SOCKET_ID = 'socket-abc';

function makePrisma(overrides: Record<string, any> = {}): any {
  return {
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, identifier: 'test-conv' }),
      ...(overrides.conversation ?? {}),
    },
    participant: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      // Backs `_getBlockedSocketIdsInRoom`'s room-membership lookup — empty by
      // default (no other online participants → no blocking check needed).
      findMany: jest.fn<any>().mockResolvedValue([]),
      ...(overrides.participant ?? {}),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      ...(overrides.user ?? {}),
    },
  };
}

function makeSocket(overrides: Record<string, any> = {}): Socket {
  // `socket.to(room)` returns a chainable object exposing both a direct
  // `.emit` (no exclusions) and `.except(socketIds).emit` (blocked viewers
  // excluded) — mirrors the real Socket.IO BroadcastOperator API.
  return {
    id: SOCKET_ID,
    to: jest.fn<any>().mockReturnValue({
      emit: jest.fn(),
      except: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    }),
    emit: jest.fn(),
    ...overrides,
  } as unknown as Socket;
}

function makeStatusService() {
  return { updateLastSeen: jest.fn() };
}

function makePrivacyService(shouldShow = true) {
  return {
    shouldShowTypingIndicator: jest.fn<any>().mockResolvedValue(shouldShow),
  };
}

function makeConnectedUsers(userId = USER_ID, isAnonymous = false) {
  const users = new Map();
  users.set(userId, {
    id: userId,
    socketId: SOCKET_ID,
    isAnonymous,
    language: 'fr',
    resolvedLanguages: ['fr'],
  });
  return users;
}

const BLOCKED_VIEWER_ID = 'blocked-viewer-id';
const BLOCKED_SOCKET_ID = 'socket-blocked-viewer';

/**
 * A room where `BLOCKED_VIEWER_ID` is an online co-participant who has
 * blocked (or been blocked by) the typing user `USER_ID`. Mirrors the fixture
 * shape `getBlockedUserIdsAmong` expects: `prisma.user.findMany` simulates the
 * "candidate blocked me" direction (viewer → typer).
 */
function makeBlockedScenario() {
  const connectedUsers = makeConnectedUsers();
  connectedUsers.set(BLOCKED_VIEWER_ID, {
    id: BLOCKED_VIEWER_ID,
    socketId: BLOCKED_SOCKET_ID,
    isAnonymous: false,
    language: 'en',
    resolvedLanguages: ['en'],
  });
  const userSockets = new Map([[BLOCKED_VIEWER_ID, new Set([BLOCKED_SOCKET_ID])]]);
  const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
  const prisma = makePrisma({
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(dbUser),
      findMany: jest.fn<any>().mockResolvedValue([{ id: BLOCKED_VIEWER_ID }]),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([{ userId: BLOCKED_VIEWER_ID }]),
    },
  });
  return { connectedUsers, userSockets, prisma };
}

function makeHandler({
  prisma = makePrisma(),
  statusService = makeStatusService(),
  privacyPreferencesService = makePrivacyService(),
  connectedUsers = makeConnectedUsers(),
  socketToUser = new Map([[SOCKET_ID, USER_ID]]),
  userSockets = new Map<string, Set<string>>(),
} = {}) {
  return new StatusHandler({
    prisma,
    statusService: statusService as any,
    privacyPreferencesService: privacyPreferencesService as any,
    connectedUsers,
    socketToUser,
    userSockets,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StatusHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue(CONV_ID);
    mockValidateSocketEvent.mockReturnValue({ success: true, data: { conversationId: CONV_ID } });
    mockGetConnectedUser.mockReturnValue({
      user: { id: USER_ID, isAnonymous: false, socketId: SOCKET_ID, language: 'fr', resolvedLanguages: [] },
      realUserId: USER_ID,
    });
    mockResolveParticipant.mockResolvedValue({
      participantId: 'participant-1', userId: USER_ID, isAnonymous: false, displayName: 'Alice',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── handleTypingStart ───────────────────────────────────────────────────────

  describe('handleTypingStart', () => {
    it('emits typing:start to conversation room for registered user', async () => {
      const dbUser = {
        id: USER_ID, username: 'alice', firstName: 'Alice',
        lastName: 'Smith', displayName: 'Alice S',
      };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      const room = ROOMS.conversation(CONV_ID);
      expect(socket.to).toHaveBeenCalledWith(room);
      const emitFn = ((socket.to as jest.Mock).mock.results[0] as any).value.emit as jest.Mock;
      expect(emitFn).toHaveBeenCalledWith(
        SERVER_EVENTS.TYPING_START,
        expect.objectContaining({
          userId: USER_ID,
          username: 'alice',
          displayName: 'Alice S',
          conversationId: CONV_ID,
          isTyping: true,
        })
      );
    });

    it('returns early when schema validation fails', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad payload' });
      const socket = makeSocket();
      const handler = makeHandler();

      await handler.handleTypingStart(socket, { conversationId: '' });

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('returns early when socket is not in socketToUser map', async () => {
      const socket = makeSocket({ id: 'unknown-socket' });
      const handler = makeHandler();

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('returns early when user is not in connectedUsers map', async () => {
      mockGetConnectedUser.mockReturnValue(null);
      const socket = makeSocket();
      const handler = makeHandler();

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('returns early when privacy service disallows typing indicator', async () => {
      const privacy = makePrivacyService(false);
      const dbUser = { id: USER_ID, username: 'bob', firstName: null, lastName: null, displayName: null };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma, privacyPreferencesService: privacy });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('calls statusService.updateLastSeen with correct args', async () => {
      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const statusService = makeStatusService();
      const socket = makeSocket();
      const handler = makeHandler({ prisma, statusService });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      expect(statusService.updateLastSeen).toHaveBeenCalledWith(USER_ID, false);
    });

    it('resolves displayName from firstName+lastName when displayName is absent', async () => {
      const dbUser = { id: USER_ID, username: 'bob', firstName: 'Bob', lastName: 'Jones', displayName: null };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      const emitFn = ((socket.to as jest.Mock).mock.results[0] as any).value.emit as jest.Mock;
      expect(emitFn).toHaveBeenCalledWith(
        SERVER_EVENTS.TYPING_START,
        expect.objectContaining({ displayName: 'Bob Jones', username: 'bob' })
      );
    });

    it('falls back to username when displayName and name fields are absent', async () => {
      const dbUser = { id: USER_ID, username: 'carol', firstName: null, lastName: null, displayName: null };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      const emitFn = ((socket.to as jest.Mock).mock.results[0] as any).value.emit as jest.Mock;
      expect(emitFn).toHaveBeenCalledWith(
        SERVER_EVENTS.TYPING_START,
        expect.objectContaining({ displayName: 'carol', username: 'carol' })
      );
    });

    it('returns early without broadcasting when caller is not a participant of the conversation', async () => {
      mockResolveParticipant.mockResolvedValue(null);
      const dbUser = { id: USER_ID, username: 'eve', firstName: null, lastName: null, displayName: 'Eve' };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      expect(socket.to).not.toHaveBeenCalled();
      expect(mockResolveParticipant).toHaveBeenCalledWith(
        expect.objectContaining({ userIdOrToken: USER_ID, conversationId: CONV_ID })
      );
    });

    it('resolves identity from Participant table for anonymous user', async () => {
      const anonId = 'anon-participant-id';
      const connectedUsers = new Map();
      connectedUsers.set(anonId, {
        id: anonId, socketId: SOCKET_ID, isAnonymous: true,
        language: 'fr', resolvedLanguages: [],
      });
      mockGetConnectedUser.mockReturnValue({
        user: { id: anonId, isAnonymous: true, socketId: SOCKET_ID, language: 'fr', resolvedLanguages: [] },
        realUserId: anonId,
      });
      const participant = { id: anonId, displayName: 'Anon User', nickname: 'Nico' };
      const prisma = makePrisma({
        participant: { findUnique: jest.fn<any>().mockResolvedValue(participant) },
      });
      const socketToUser = new Map([[SOCKET_ID, anonId]]);
      const socket = makeSocket();
      const handler = makeHandler({ prisma, connectedUsers, socketToUser });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      const emitFn = ((socket.to as jest.Mock).mock.results[0] as any).value.emit as jest.Mock;
      expect(emitFn).toHaveBeenCalledWith(
        SERVER_EVENTS.TYPING_START,
        expect.objectContaining({ displayName: 'Nico', username: 'Nico' })
      );
    });

    it('falls back to displayName when anonymous participant has no nickname', async () => {
      const anonId = 'anon-participant-id';
      mockGetConnectedUser.mockReturnValue({
        user: { id: anonId, isAnonymous: true, socketId: SOCKET_ID, language: 'fr', resolvedLanguages: [] },
        realUserId: anonId,
      });
      const participant = { id: anonId, displayName: 'Anon Display', nickname: null };
      const prisma = makePrisma({
        participant: { findUnique: jest.fn<any>().mockResolvedValue(participant) },
      });
      const socketToUser = new Map([[SOCKET_ID, anonId]]);
      const socket = makeSocket();
      const handler = makeHandler({ prisma, socketToUser });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      const emitFn = ((socket.to as jest.Mock).mock.results[0] as any).value.emit as jest.Mock;
      expect(emitFn).toHaveBeenCalledWith(
        SERVER_EVENTS.TYPING_START,
        expect.objectContaining({ displayName: 'Anon Display', username: 'Anon Display' })
      );
    });

    it('returns early when anonymous participant is not found', async () => {
      const anonId = 'anon-missing';
      mockGetConnectedUser.mockReturnValue({
        user: { id: anonId, isAnonymous: true, socketId: SOCKET_ID, language: 'fr', resolvedLanguages: [] },
        realUserId: anonId,
      });
      const prisma = makePrisma({
        participant: { findUnique: jest.fn<any>().mockResolvedValue(null) },
      });
      const socketToUser = new Map([[SOCKET_ID, anonId]]);
      const socket = makeSocket();
      const handler = makeHandler({ prisma, socketToUser });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('returns early when registered user is not found in DB', async () => {
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(null) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('does not emit when throttle window has not expired', async () => {
      jest.useFakeTimers();
      const now = 1_000_000;
      jest.setSystemTime(now);

      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });
      const emitFn1 = ((socket.to as jest.Mock).mock.results[0] as any)?.value.emit as jest.Mock | undefined;
      expect(emitFn1).toHaveBeenCalledTimes(1);

      // Within throttle window — should NOT emit
      jest.setSystemTime(now + 1_000); // 1s < 2s threshold
      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      // same emit fn (same room call), still only called once from first call
      expect((socket.to as jest.Mock).mock.calls.length).toBe(1);
    });

    it('emits again after throttle window expires', async () => {
      jest.useFakeTimers();
      const now = 1_000_000;
      jest.setSystemTime(now);

      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });
      // Past throttle window
      jest.setSystemTime(now + 2_001);
      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      expect((socket.to as jest.Mock).mock.calls.length).toBe(2);
    });

    it('prunes stale throttle entries when map exceeds 10_000 keys', async () => {
      jest.useFakeTimers();
      const baseTime = 1_000_000;
      jest.setSystemTime(baseTime);

      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      // Force 10_001 entries via different throttle keys (userId+convId combos)
      // We achieve this by manipulating the private map directly
      const throttleMap = (handler as any).typingThrottleMap as Map<string, number>;
      for (let i = 0; i < 10_001; i++) {
        throttleMap.set(`stale-user-${i}:conv-1`, baseTime - 100_000); // stale
      }

      // Now trigger the cleanup by sending a typing event
      jest.setSystemTime(baseTime + 3_000);
      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      // All stale entries should have been pruned
      expect(throttleMap.size).toBeLessThan(10_001);
    });

    it('uses cached identity on second call within TTL', async () => {
      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const findUnique = jest.fn<any>().mockResolvedValue(dbUser);
      const prisma = makePrisma({ user: { findUnique } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });
      // Move past throttle but within cache TTL
      const throttleMap = (handler as any).typingThrottleMap as Map<string, number>;
      throttleMap.clear();
      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      // DB called only once (second call uses cache)
      expect(findUnique).toHaveBeenCalledTimes(1);
    });

    it('invalidateIdentityCache removes the prefixed cache entries for a userId', async () => {
      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const findUnique = jest.fn<any>().mockResolvedValue(dbUser);
      const prisma = makePrisma({ user: { findUnique } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      // Prime the cache with a `user:${USER_ID}` key
      await handler.handleTypingStart(socket, { conversationId: CONV_ID });
      expect(findUnique).toHaveBeenCalledTimes(1);

      // invalidateIdentityCache removes the prefixed entry
      handler.invalidateIdentityCache(USER_ID);

      const identityCache = (handler as any).identityCache as Map<string, unknown>;
      expect(identityCache.has(`user:${USER_ID}`)).toBe(false);
      expect(identityCache.has(`anon:${USER_ID}`)).toBe(false);
    });

    it('refreshes cache when TTL has expired', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(1_000_000);

      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const findUnique = jest.fn<any>().mockResolvedValue(dbUser);
      const prisma = makePrisma({ user: { findUnique } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });
      // Advance past TTL (60s)
      jest.setSystemTime(1_000_000 + 61_000);
      const throttleMap = (handler as any).typingThrottleMap as Map<string, number>;
      throttleMap.clear();
      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      expect(findUnique).toHaveBeenCalledTimes(2);
    });

    it('catches and logs errors without propagating', async () => {
      mockNormalizeConversationId.mockRejectedValue(new Error('DB down'));
      const socket = makeSocket();
      const handler = makeHandler();

      // Should not throw
      await expect(handler.handleTypingStart(socket, { conversationId: CONV_ID })).resolves.toBeUndefined();
    });
  });

  // ── handleTypingStop ────────────────────────────────────────────────────────

  describe('handleTypingStop', () => {
    it('emits typing:stop to conversation room', async () => {
      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleTypingStop(socket, { conversationId: CONV_ID });

      const emitFn = ((socket.to as jest.Mock).mock.results[0] as any).value.emit as jest.Mock;
      expect(emitFn).toHaveBeenCalledWith(
        SERVER_EVENTS.TYPING_STOP,
        expect.objectContaining({ isTyping: false, conversationId: CONV_ID })
      );
    });

    it('returns early when schema validation fails', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad payload' });
      const socket = makeSocket();
      const handler = makeHandler();

      await handler.handleTypingStop(socket, { conversationId: '' });

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('returns early when socket is not in socketToUser map', async () => {
      const socket = makeSocket({ id: 'unknown-socket' });
      const handler = makeHandler();

      await handler.handleTypingStop(socket, { conversationId: CONV_ID });

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('returns early when user is not in connectedUsers map', async () => {
      mockGetConnectedUser.mockReturnValue(null);
      const socket = makeSocket();
      const handler = makeHandler();

      await handler.handleTypingStop(socket, { conversationId: CONV_ID });

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('returns early when privacy service disallows typing indicator', async () => {
      const privacy = makePrivacyService(false);
      const dbUser = { id: USER_ID, username: 'bob', firstName: null, lastName: null, displayName: null };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma, privacyPreferencesService: privacy });

      await handler.handleTypingStop(socket, { conversationId: CONV_ID });

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('catches and logs errors without propagating', async () => {
      mockNormalizeConversationId.mockRejectedValue(new Error('Network error'));
      const socket = makeSocket();
      const handler = makeHandler();

      await expect(handler.handleTypingStop(socket, { conversationId: CONV_ID })).resolves.toBeUndefined();
    });

    it('returns early without broadcasting when caller is not a participant of the conversation', async () => {
      mockResolveParticipant.mockResolvedValue(null);
      const dbUser = { id: USER_ID, username: 'eve', firstName: null, lastName: null, displayName: 'Eve' };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleTypingStop(socket, { conversationId: CONV_ID });

      expect(socket.to).not.toHaveBeenCalled();
      expect(mockResolveParticipant).toHaveBeenCalledWith(
        expect.objectContaining({ userIdOrToken: USER_ID, conversationId: CONV_ID })
      );
    });

    it('does not call statusService.updateLastSeen on typing stop', async () => {
      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const statusService = makeStatusService();
      const socket = makeSocket();
      const handler = makeHandler({ prisma, statusService });

      await handler.handleTypingStop(socket, { conversationId: CONV_ID });

      expect(statusService.updateLastSeen).not.toHaveBeenCalled();
    });

    it('clears the throttle so a fresh typing:start after stop re-emits within the throttle window', async () => {
      jest.useFakeTimers();
      const now = 1_000_000;
      jest.setSystemTime(now);

      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      // 1. start → emits typing:start, arms the throttle
      await handler.handleTypingStart(socket, { conversationId: CONV_ID });
      // 2. stop 0.5s later → emits typing:stop, MUST clear the throttle entry
      jest.setSystemTime(now + 500);
      await handler.handleTypingStop(socket, { conversationId: CONV_ID });
      // 3. start again 1s after the first start (< 2s throttle window) → the
      //    explicit stop ended the burst, so this new burst MUST re-emit.
      jest.setSystemTime(now + 1_000);
      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      // start + stop + start = 3 room broadcasts. Without the throttle clear the
      // second start is swallowed and only 2 broadcasts occur.
      expect((socket.to as jest.Mock).mock.calls.length).toBe(3);
    });
  });

  // ── blocking privacy ─────────────────────────────────────────────────────────
  // Typing is a moment-to-moment presence signal, more sensitive than the
  // `_broadcastUserStatus` snapshot already gated on blocking — it must not
  // leak to a co-participant in a bidirectional block relationship either.

  describe('blocking privacy', () => {
    it('handleTypingStart excludes a blocked co-participant socket from the broadcast', async () => {
      const { connectedUsers, userSockets, prisma } = makeBlockedScenario();
      const socket = makeSocket();
      const handler = makeHandler({ prisma, connectedUsers, userSockets });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      const toResult = ((socket.to as jest.Mock).mock.results[0] as any).value;
      expect(toResult.except).toHaveBeenCalledWith([BLOCKED_SOCKET_ID]);
      expect(toResult.emit).not.toHaveBeenCalled();
      const exceptEmit = ((toResult.except as jest.Mock).mock.results[0] as any).value.emit as jest.Mock;
      expect(exceptEmit).toHaveBeenCalledWith(
        SERVER_EVENTS.TYPING_START,
        expect.objectContaining({ userId: USER_ID, conversationId: CONV_ID })
      );
    });

    it('handleTypingStop excludes a blocked co-participant socket from the broadcast', async () => {
      const { connectedUsers, userSockets, prisma } = makeBlockedScenario();
      const socket = makeSocket();
      const handler = makeHandler({ prisma, connectedUsers, userSockets });

      await handler.handleTypingStop(socket, { conversationId: CONV_ID });

      const toResult = ((socket.to as jest.Mock).mock.results[0] as any).value;
      expect(toResult.except).toHaveBeenCalledWith([BLOCKED_SOCKET_ID]);
      const exceptEmit = ((toResult.except as jest.Mock).mock.results[0] as any).value.emit as jest.Mock;
      expect(exceptEmit).toHaveBeenCalledWith(
        SERVER_EVENTS.TYPING_STOP,
        expect.objectContaining({ userId: USER_ID, conversationId: CONV_ID })
      );
    });

    it('does not call except() when no online co-participant is blocked', async () => {
      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      const toResult = ((socket.to as jest.Mock).mock.results[0] as any).value;
      expect(toResult.except).not.toHaveBeenCalled();
      expect(toResult.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.TYPING_START,
        expect.objectContaining({ userId: USER_ID })
      );
    });

    it('only queries blocking for registered (non-anonymous) co-participants', async () => {
      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const participantFindMany = jest.fn<any>().mockResolvedValue([]);
      const prisma = makePrisma({
        user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) },
        participant: { findMany: participantFindMany },
      });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      expect(participantFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ conversationId: CONV_ID, isActive: true, userId: { not: null } }),
        })
      );
    });
  });

  // ── handleSocketDisconnecting ───────────────────────────────────────────────

  describe('handleSocketDisconnecting', () => {
    it('broadcasts typing:stop for each active typing conversation on disconnect', async () => {
      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      const CONV_ID_2 = '507f1f77bcf86cd799439099';
      mockNormalizeConversationId
        .mockResolvedValueOnce(CONV_ID)
        .mockResolvedValueOnce(CONV_ID_2);

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });
      mockValidateSocketEvent.mockReturnValue({ success: true, data: { conversationId: CONV_ID_2 } });
      const throttleMap = (handler as any).typingThrottleMap as Map<string, number>;
      throttleMap.clear();
      await handler.handleTypingStart(socket, { conversationId: CONV_ID_2 });

      const broadcastFn = jest.fn();
      await handler.handleSocketDisconnecting(SOCKET_ID, broadcastFn);

      expect(broadcastFn).toHaveBeenCalledTimes(2);
      expect(broadcastFn).toHaveBeenCalledWith(
        ROOMS.conversation(CONV_ID),
        SERVER_EVENTS.TYPING_STOP,
        expect.objectContaining({ userId: USER_ID, isTyping: false, conversationId: CONV_ID }),
        undefined
      );
      expect(broadcastFn).toHaveBeenCalledWith(
        ROOMS.conversation(CONV_ID_2),
        SERVER_EVENTS.TYPING_STOP,
        expect.objectContaining({ userId: USER_ID, isTyping: false, conversationId: CONV_ID_2 }),
        undefined
      );
    });

    it('clears activeTypers entries for the socket after disconnect', async () => {
      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      const activeTypers = (handler as any).activeTypers as Map<string, unknown[]>;
      expect(activeTypers.has(SOCKET_ID)).toBe(true);

      await handler.handleSocketDisconnecting(SOCKET_ID, jest.fn());

      expect(activeTypers.has(SOCKET_ID)).toBe(false);
    });

    it('is a no-op when socket has no active typing', async () => {
      const handler = makeHandler();
      const broadcastFn = jest.fn();

      await expect(handler.handleSocketDisconnecting(SOCKET_ID, broadcastFn)).resolves.not.toThrow();
      expect(broadcastFn).not.toHaveBeenCalled();
    });

    it('resolves without throwing and still clears typing state when the blocked-lookup DB query rejects', async () => {
      // The disconnect handler is fired fire-and-forget (`void ...` with no
      // .catch at the call site). A transient Mongo failure in the blocked-viewer
      // lookup must NOT escape as an unhandled rejection, and typing state MUST
      // still be cleaned up — otherwise the socket leaks an activeTypers entry
      // and peers keep a phantom "typing…" indicator for a user who has left.
      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const participantFindMany = jest.fn<any>()
        .mockResolvedValueOnce([]) // handleTypingStart setup succeeds
        .mockRejectedValue(new Error('transient Mongo error')); // disconnect lookup fails
      const prisma = makePrisma({
        user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) },
        participant: { findMany: participantFindMany },
      });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      await handler.handleTypingStart(socket, { conversationId: CONV_ID });
      const activeTypers = (handler as any).activeTypers as Map<string, unknown[]>;
      const throttleMap = (handler as any).typingThrottleMap as Map<string, number>;
      expect(activeTypers.has(SOCKET_ID)).toBe(true);

      const broadcastFn = jest.fn();
      await expect(
        handler.handleSocketDisconnecting(SOCKET_ID, broadcastFn)
      ).resolves.not.toThrow();

      expect(activeTypers.has(SOCKET_ID)).toBe(false);
      expect([...throttleMap.keys()].some(k => k.startsWith(`${USER_ID}:`))).toBe(false);
    });

    it('still broadcasts typing:stop for healthy conversations when one conversation lookup rejects', async () => {
      // A per-conversation lookup failure must not abort the whole loop —
      // remaining conversations the socket was typing in must still receive
      // their typing:stop broadcast.
      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const CONV_ID_2 = '507f1f77bcf86cd799439099';
      const participantFindMany = jest.fn<any>()
        .mockResolvedValueOnce([]) // typing:start CONV_ID
        .mockResolvedValueOnce([]) // typing:start CONV_ID_2
        .mockRejectedValueOnce(new Error('transient Mongo error')) // disconnect: first conv lookup fails
        .mockResolvedValueOnce([]); // disconnect: second conv lookup succeeds
      const prisma = makePrisma({
        user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) },
        participant: { findMany: participantFindMany },
      });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      mockNormalizeConversationId
        .mockResolvedValueOnce(CONV_ID)
        .mockResolvedValueOnce(CONV_ID_2);
      await handler.handleTypingStart(socket, { conversationId: CONV_ID });
      mockValidateSocketEvent.mockReturnValue({ success: true, data: { conversationId: CONV_ID_2 } });
      ((handler as any).typingThrottleMap as Map<string, number>).clear();
      await handler.handleTypingStart(socket, { conversationId: CONV_ID_2 });

      const broadcastFn = jest.fn();
      await expect(
        handler.handleSocketDisconnecting(SOCKET_ID, broadcastFn)
      ).resolves.not.toThrow();

      // One conversation failed, the other must still be broadcast.
      expect(broadcastFn).toHaveBeenCalledWith(
        ROOMS.conversation(CONV_ID_2),
        SERVER_EVENTS.TYPING_STOP,
        expect.objectContaining({ userId: USER_ID, isTyping: false, conversationId: CONV_ID_2 }),
        undefined
      );
      expect(((handler as any).activeTypers as Map<string, unknown[]>).has(SOCKET_ID)).toBe(false);
    });

    it('suppresses typing:stop when another socket for same user is typing in the same conversation', async () => {
      const SOCKET_1 = 'socket-device-1';
      const SOCKET_2 = 'socket-device-2';
      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket1 = makeSocket({ id: SOCKET_1 });
      const socket2 = makeSocket({ id: SOCKET_2 });
      const socketToUser = new Map([[SOCKET_1, USER_ID], [SOCKET_2, USER_ID]]);
      const handler = makeHandler({ prisma, socketToUser });

      mockNormalizeConversationId.mockResolvedValue(CONV_ID);

      // Both sockets are typing in the same conversation
      await handler.handleTypingStart(socket1, { conversationId: CONV_ID });
      const throttleMap = (handler as any).typingThrottleMap as Map<string, number>;
      throttleMap.clear();
      await handler.handleTypingStart(socket2, { conversationId: CONV_ID });

      // socket1 disconnects — socket2 is still typing in that conversation
      const broadcastFn = jest.fn();
      await handler.handleSocketDisconnecting(SOCKET_1, broadcastFn, new Set([SOCKET_2]));

      // typing:stop must NOT be broadcast because socket2 is still typing
      expect(broadcastFn).not.toHaveBeenCalled();
    });

    it('broadcasts typing:stop when another socket exists but is NOT typing in the same conversation', async () => {
      const SOCKET_1 = 'socket-device-1';
      const SOCKET_2 = 'socket-device-2';
      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket1 = makeSocket({ id: SOCKET_1 });
      const socketToUser = new Map([[SOCKET_1, USER_ID], [SOCKET_2, USER_ID]]);
      const handler = makeHandler({ prisma, socketToUser });

      mockNormalizeConversationId.mockResolvedValue(CONV_ID);
      await handler.handleTypingStart(socket1, { conversationId: CONV_ID });

      // socket2 exists but is not tracked in activeTypers (not typing)
      const broadcastFn = jest.fn();
      await handler.handleSocketDisconnecting(SOCKET_1, broadcastFn, new Set([SOCKET_2]));

      // typing:stop MUST be broadcast because socket2 is not typing in this conversation
      expect(broadcastFn).toHaveBeenCalledWith(
        ROOMS.conversation(CONV_ID),
        SERVER_EVENTS.TYPING_STOP,
        expect.objectContaining({ userId: USER_ID, isTyping: false }),
        undefined
      );
    });

    it('broadcasts typing:stop when otherSocketIds is undefined (single device)', async () => {
      const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
      const prisma = makePrisma({ user: { findUnique: jest.fn<any>().mockResolvedValue(dbUser) } });
      const socket = makeSocket();
      const handler = makeHandler({ prisma });

      mockNormalizeConversationId.mockResolvedValue(CONV_ID);
      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      const broadcastFn = jest.fn();
      await handler.handleSocketDisconnecting(SOCKET_ID, broadcastFn, undefined);

      expect(broadcastFn).toHaveBeenCalledTimes(1);
      expect(broadcastFn).toHaveBeenCalledWith(
        ROOMS.conversation(CONV_ID),
        SERVER_EVENTS.TYPING_STOP,
        expect.objectContaining({ userId: USER_ID, isTyping: false }),
        undefined
      );
    });

    it('passes blocked co-participant socket ids to broadcastFn on disconnect', async () => {
      const { connectedUsers, userSockets, prisma } = makeBlockedScenario();
      const socket = makeSocket();
      const handler = makeHandler({ prisma, connectedUsers, userSockets });

      mockNormalizeConversationId.mockResolvedValue(CONV_ID);
      await handler.handleTypingStart(socket, { conversationId: CONV_ID });

      const broadcastFn = jest.fn();
      await handler.handleSocketDisconnecting(SOCKET_ID, broadcastFn);

      expect(broadcastFn).toHaveBeenCalledWith(
        ROOMS.conversation(CONV_ID),
        SERVER_EVENTS.TYPING_STOP,
        expect.objectContaining({ userId: USER_ID, isTyping: false }),
        [BLOCKED_SOCKET_ID]
      );
    });
  });

  // ── clearTypingThrottle ─────────────────────────────────────────────────────

  describe('clearTypingThrottle', () => {
    it('clears all throttle entries for the given userId', async () => {
      const handler = makeHandler();
      const throttleMap = (handler as any).typingThrottleMap as Map<string, number>;
      throttleMap.set(`${USER_ID}:conv-1`, Date.now());
      throttleMap.set(`${USER_ID}:conv-2`, Date.now());
      throttleMap.set('other-user:conv-1', Date.now());

      handler.clearTypingThrottle(USER_ID);

      expect(throttleMap.has(`${USER_ID}:conv-1`)).toBe(false);
      expect(throttleMap.has(`${USER_ID}:conv-2`)).toBe(false);
      expect(throttleMap.has('other-user:conv-1')).toBe(true);
    });

    it('is a no-op when userId has no throttle entries', () => {
      const handler = makeHandler();
      const throttleMap = (handler as any).typingThrottleMap as Map<string, number>;
      throttleMap.set('other:conv', Date.now());

      expect(() => handler.clearTypingThrottle('unknown-user')).not.toThrow();
      expect(throttleMap.size).toBe(1);
    });
  });

  // ── destroy / periodic eviction ──────────────────────────────────────────────

  describe('destroy', () => {
    it('clears the periodic cleanup timer without throwing', () => {
      const handler = makeHandler();
      expect(() => handler.destroy()).not.toThrow();
      expect(() => handler.destroy()).not.toThrow(); // idempotent
    });
  });

  describe('_evictStaleThrottleEntries (via size-triggered cleanup)', () => {
    it('removes entries older than TTL when map exceeds cleanup threshold', async () => {
      jest.useFakeTimers();
      const CLEANUP_SIZE = (StatusHandler as any).TYPING_THROTTLE_CLEANUP_SIZE as number;
      const TTL_MS = (StatusHandler as any).TYPING_THROTTLE_TTL_MS as number;

      const handler = makeHandler();
      const throttleMap = (handler as any).typingThrottleMap as Map<string, number>;

      const now = Date.now();
      const staleTs = now - TTL_MS - 1_000;

      // Fill past the cleanup threshold with stale entries
      for (let i = 0; i < CLEANUP_SIZE + 1; i++) {
        throttleMap.set(`user-${i}:conv`, staleTs);
      }

      // Trigger the cleanup by calling handleTypingStart which sets a fresh entry
      // and then invokes _evictStaleThrottleEntries if size > threshold.
      // Call it directly to avoid full async chain:
      (handler as any)._evictStaleThrottleEntries();

      // All stale entries should be gone
      expect(throttleMap.size).toBe(0);
    });
  });
});
