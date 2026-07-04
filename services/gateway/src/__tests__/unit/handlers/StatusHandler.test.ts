/**
 * Unit tests for StatusHandler.
 * Covers typing:start / typing:stop, throttle, identity cache, privacy guard,
 * anonymous vs registered user paths, and cache invalidation.
 */

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    TYPING_START: 'typing:start',
    TYPING_STOP: 'typing:stop',
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
  SocketTypingSchema: {},
}));

import { StatusHandler } from '../../../socketio/handlers/StatusHandler';
import { validateSocketEvent } from '../../../middleware/validation';
import type { StatusHandlerDependencies } from '../../../socketio/handlers/StatusHandler';

const mockedValidate = validateSocketEvent as jest.Mock;

const VALID_CONV_ID = 'cccccc000000000000000003';
const USER_ID = 'user-xyz';
const SOCKET_ID = 'socket-abc';

// ─── Fakes ────────────────────────────────────────────────────────────────────

function makeSocket() {
  const to = jest.fn(() => ({ emit: jest.fn() }));
  return { id: SOCKET_ID, to };
}

function makePrisma(overrides: Partial<{
  conversationFindUnique: unknown;
  userFindUnique: unknown;
  participantFindUnique: unknown;
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
    user: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.userFindUnique !== undefined
          ? overrides.userFindUnique
          : {
              id: USER_ID,
              username: 'alice',
              firstName: 'Alice',
              lastName: 'Smith',
              displayName: 'Alice Smith',
            }
      ),
    },
    participant: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.participantFindUnique !== undefined
          ? overrides.participantFindUnique
          : { id: USER_ID, displayName: 'Guest', nickname: null }
      ),
      // Backs `resolveParticipant`'s conversation-membership lookup for registered
      // users (typing:start/typing:stop authorization guard). Defaults to an active
      // participant so pre-existing tests that don't care about this guard keep
      // passing; override to `null` to simulate a caller who isn't a member.
      findFirst: jest.fn().mockResolvedValue(
        overrides.participantFindFirst !== undefined
          ? overrides.participantFindFirst
          : { id: 'participant-1', displayName: 'Alice Smith', nickname: null }
      ),
    },
  } as any;
}

function makeStatusService() {
  return {
    updateLastSeen: jest.fn(),
  } as any;
}

function makePrivacyService(shouldShow = true) {
  return {
    shouldShowTypingIndicator: jest.fn().mockResolvedValue(shouldShow),
  } as any;
}

function makeConnectedUsers(isAnonymous = false) {
  const map = new Map<string, unknown>();
  map.set(USER_ID, {
    id: USER_ID,
    isAnonymous,
    language: 'fr',
  });
  return map;
}

function makeSocketToUser() {
  const map = new Map<string, string>();
  map.set(SOCKET_ID, USER_ID);
  return map;
}

function makeDeps(overrides: Partial<{
  prisma: ReturnType<typeof makePrisma>;
  statusService: ReturnType<typeof makeStatusService>;
  privacyService: ReturnType<typeof makePrivacyService>;
  connectedUsers: Map<string, unknown>;
  socketToUser: Map<string, string>;
}> = {}): StatusHandlerDependencies {
  return {
    prisma: (overrides.prisma ?? makePrisma()) as any,
    statusService: overrides.statusService ?? makeStatusService(),
    privacyPreferencesService: overrides.privacyService ?? makePrivacyService(),
    connectedUsers: (overrides.connectedUsers ?? makeConnectedUsers()) as any,
    socketToUser: overrides.socketToUser ?? makeSocketToUser(),
  };
}

const TYPING_PAYLOAD = { conversationId: VALID_CONV_ID };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StatusHandler', () => {

  beforeEach(() => {
    mockedValidate.mockImplementation((_schema, data) => ({ success: true, data }));
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ─── validation guard ────────────────────────────────────────────────────

  describe('validation guard', () => {
    it('returns early when schema validation fails (typing:start)', async () => {
      mockedValidate.mockReturnValue({ success: false });
      const deps = makeDeps();
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      expect(deps.statusService.updateLastSeen).not.toHaveBeenCalled();
    });

    it('returns early when schema validation fails (typing:stop)', async () => {
      mockedValidate.mockReturnValue({ success: false });
      const deps = makeDeps();
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStop(socket as any, TYPING_PAYLOAD);
      expect(deps.privacyPreferencesService.shouldShowTypingIndicator).not.toHaveBeenCalled();
    });
  });

  // ─── unauthenticated socket guard ────────────────────────────────────────

  describe('unauthenticated socket', () => {
    it('returns early when socket is not in socketToUser map (typing:start)', async () => {
      const deps = makeDeps({ socketToUser: new Map() });
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      expect(deps.statusService.updateLastSeen).not.toHaveBeenCalled();
    });

    it('returns early when socket is not in socketToUser map (typing:stop)', async () => {
      const deps = makeDeps({ socketToUser: new Map() });
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStop(socket as any, TYPING_PAYLOAD);
      expect(deps.privacyPreferencesService.shouldShowTypingIndicator).not.toHaveBeenCalled();
    });
  });

  // ─── user not connected guard ─────────────────────────────────────────────

  describe('user not in connectedUsers', () => {
    it('returns early when user not in connectedUsers (typing:start)', async () => {
      const deps = makeDeps({ connectedUsers: new Map() });
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      expect(deps.statusService.updateLastSeen).not.toHaveBeenCalled();
    });
  });

  // ─── privacy guard ────────────────────────────────────────────────────────

  describe('privacy guard', () => {
    it('does not emit when shouldShowTypingIndicator returns false (typing:start)', async () => {
      const deps = makeDeps({ privacyService: makePrivacyService(false) });
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('does not emit when shouldShowTypingIndicator returns false (typing:stop)', async () => {
      const deps = makeDeps({ privacyService: makePrivacyService(false) });
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStop(socket as any, TYPING_PAYLOAD);
      expect(socket.to).not.toHaveBeenCalled();
    });
  });

  // ─── registered user typing:start ─────────────────────────────────────────

  describe('handleTypingStart — registered user', () => {
    it('broadcasts typing:start to the conversation room', async () => {
      const deps = makeDeps();
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      expect(socket.to).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`);
      const emit = (socket.to as jest.Mock).mock.results[0].value.emit;
      expect(emit).toHaveBeenCalledWith('typing:start', expect.objectContaining({
        userId: USER_ID,
        username: 'alice',
        displayName: 'Alice Smith',
        conversationId: VALID_CONV_ID,
        isTyping: true,
      }));
    });

    it('updates last seen for the user', async () => {
      const deps = makeDeps();
      const handler = new StatusHandler(deps);
      await handler.handleTypingStart(makeSocket() as any, TYPING_PAYLOAD);
      expect(deps.statusService.updateLastSeen).toHaveBeenCalledWith(USER_ID, false);
    });

    it('does not broadcast when the caller is not a participant of the conversation', async () => {
      const prisma = makePrisma({ participantFindFirst: null });
      const deps = makeDeps({ prisma });
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      expect(socket.to).not.toHaveBeenCalled();
    });
  });

  // ─── anonymous user typing:start ──────────────────────────────────────────

  describe('handleTypingStart — anonymous user', () => {
    it('broadcasts using participant display name', async () => {
      const connectedUsers = new Map<string, unknown>([
        [USER_ID, { id: USER_ID, isAnonymous: true, language: 'fr' }],
      ]);
      const prisma = makePrisma({ participantFindUnique: { id: USER_ID, displayName: 'Guest', nickname: 'Ninja' } });
      const deps = makeDeps({ connectedUsers: connectedUsers as any, prisma });
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      const emit = (socket.to as jest.Mock).mock.results[0].value.emit;
      expect(emit).toHaveBeenCalledWith('typing:start', expect.objectContaining({
        displayName: 'Ninja',
        username: 'Ninja',
        isTyping: true,
      }));
    });

    it('falls back to displayName when nickname is null', async () => {
      const connectedUsers = new Map<string, unknown>([
        [USER_ID, { id: USER_ID, isAnonymous: true, language: 'fr' }],
      ]);
      const prisma = makePrisma({ participantFindUnique: { id: USER_ID, displayName: 'Guest', nickname: null } });
      const deps = makeDeps({ connectedUsers: connectedUsers as any, prisma });
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      const emit = (socket.to as jest.Mock).mock.results[0].value.emit;
      expect(emit).toHaveBeenCalledWith('typing:start', expect.objectContaining({ displayName: 'Guest' }));
    });

    it('returns early when anonymous participant is not found', async () => {
      const connectedUsers = new Map<string, unknown>([
        [USER_ID, { id: USER_ID, isAnonymous: true, language: 'fr' }],
      ]);
      const prisma = makePrisma({ participantFindUnique: null });
      const deps = makeDeps({ connectedUsers: connectedUsers as any, prisma });
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      expect(socket.to).not.toHaveBeenCalled();
    });
  });

  // ─── typing:stop ──────────────────────────────────────────────────────────

  describe('handleTypingStop', () => {
    it('broadcasts typing:stop with isTyping:false', async () => {
      const deps = makeDeps();
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStop(socket as any, TYPING_PAYLOAD);
      const emit = (socket.to as jest.Mock).mock.results[0].value.emit;
      expect(emit).toHaveBeenCalledWith('typing:stop', expect.objectContaining({ isTyping: false }));
    });

    it('returns early when registered user is not found in DB', async () => {
      const prisma = makePrisma({ userFindUnique: null });
      const deps = makeDeps({ prisma });
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStop(socket as any, TYPING_PAYLOAD);
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('does not broadcast when the caller is not a participant of the conversation', async () => {
      const prisma = makePrisma({ participantFindFirst: null });
      const deps = makeDeps({ prisma });
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStop(socket as any, TYPING_PAYLOAD);
      expect(socket.to).not.toHaveBeenCalled();
    });
  });

  // ─── throttle ─────────────────────────────────────────────────────────────

  describe('typing throttle', () => {
    it('does not re-emit within TYPING_THROTTLE_MS (2s)', async () => {
      const deps = makeDeps();
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      expect(socket.to).toHaveBeenCalledTimes(1);
    });

    it('re-emits after throttle window expires', async () => {
      const deps = makeDeps();
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      jest.advanceTimersByTime(2100);
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      expect(socket.to).toHaveBeenCalledTimes(2);
    });
  });

  // ─── identity cache ───────────────────────────────────────────────────────

  describe('identity cache', () => {
    it('caches identity and does not re-query DB on second call', async () => {
      const deps = makeDeps();
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      jest.advanceTimersByTime(2100); // reset throttle
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      expect(deps.prisma.user.findUnique).toHaveBeenCalledTimes(1);
    });

    it('invalidateIdentityCache removes cached identity', async () => {
      const deps = makeDeps();
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      handler.invalidateIdentityCache(USER_ID);
      jest.advanceTimersByTime(2100);
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      expect(deps.prisma.user.findUnique).toHaveBeenCalledTimes(2);
    });

    it('periodic sweep evicts expired identity entries from the cache map', async () => {
      const deps = makeDeps();
      const handler = new StatusHandler(deps);
      await handler.handleTypingStart(makeSocket() as any, TYPING_PAYLOAD);
      const cache = (handler as any).identityCache as Map<string, unknown>;
      expect(cache.size).toBe(1);
      // Past the 60s identity TTL AND at least one 30s cleanup-timer tick.
      jest.advanceTimersByTime(60_000 + 30_000);
      expect(cache.size).toBe(0);
      handler.destroy();
    });

    it('bounds the identity cache with FIFO eviction of the oldest entry at capacity', async () => {
      const deps = makeDeps();
      const handler = new StatusHandler(deps);
      const cache = (handler as any).identityCache as Map<string, { expiresAt: number }>;
      const notExpired = Date.now() + 60_000;
      for (let i = 0; i < 5_000; i++) {
        cache.set(`user:filler-${i}`, { username: 'x', displayName: 'x', expiresAt: notExpired } as any);
      }
      expect(cache.size).toBe(5_000);
      await handler.handleTypingStart(makeSocket() as any, TYPING_PAYLOAD);
      // Capacity held: oldest fresh entry evicted, new identity inserted.
      expect(cache.size).toBe(5_000);
      expect(cache.has('user:filler-0')).toBe(false);
      expect(cache.has(`user:${USER_ID}`)).toBe(true);
      handler.destroy();
    });
  });

  // ─── clearTypingThrottle ─────────────────────────────────────────────────

  describe('clearTypingThrottle', () => {
    it('clears throttle so next emit is not throttled', async () => {
      const deps = makeDeps();
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      handler.clearTypingThrottle(USER_ID);
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      expect(socket.to).toHaveBeenCalledTimes(2);
    });
  });

  // ─── displayName fallbacks ────────────────────────────────────────────────

  describe('displayName resolution fallbacks (registered user)', () => {
    it('uses firstName + lastName when displayName is absent', async () => {
      const prisma = makePrisma({
        userFindUnique: { id: USER_ID, username: 'bob', firstName: 'Bob', lastName: 'Jones', displayName: null },
      });
      const deps = makeDeps({ prisma });
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      const emit = (socket.to as jest.Mock).mock.results[0].value.emit;
      expect(emit).toHaveBeenCalledWith('typing:start', expect.objectContaining({ displayName: 'Bob Jones' }));
    });

    it('falls back to username when both displayName and names are absent', async () => {
      const prisma = makePrisma({
        userFindUnique: { id: USER_ID, username: 'charlie', firstName: null, lastName: null, displayName: null },
      });
      const deps = makeDeps({ prisma });
      const handler = new StatusHandler(deps);
      const socket = makeSocket();
      await handler.handleTypingStart(socket as any, TYPING_PAYLOAD);
      const emit = (socket.to as jest.Mock).mock.results[0].value.emit;
      expect(emit).toHaveBeenCalledWith('typing:start', expect.objectContaining({ displayName: 'charlie' }));
    });
  });
});
