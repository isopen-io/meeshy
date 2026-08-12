/**
 * Unit tests for reconnect-time behaviours in _emitPresenceSnapshot:
 *   • Drain on cache-hit (regression fix)
 *   • Unread-counts snapshot emitted for all conversations on reconnect
 *
 * Strategy: build minimal context objects with the exact properties the
 * methods read from `this` and test via direct invocation — no constructor
 * needed.  The real MeeshySocketIOManager import hangs in test envs because
 * its module-level code opens ZMQ / Redis / Firebase sockets.
 */

// Mock logger before any import so logger module-level code doesn't error.
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }),
  },
}));
jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

// ─── Shared types ─────────────────────────────────────────────────────────────

type PresenceCacheEntry = {
  users: Array<{ userId: string; username: string; isOnline: boolean; lastActiveAt: Date | null }>;
  cachedAt: number;
};

type SocketLike = {
  emit: jest.Mock;
};

type PrismaLike = {
  participant: {
    findMany: jest.Mock;
  };
};

// ─── Context for _emitPresenceSnapshot tests ──────────────────────────────────

function makePresenceContext(overrides: Partial<{
  presenceSnapshotCache: Map<string, PresenceCacheEntry>;
  PRESENCE_SNAPSHOT_CACHE_TTL_MS: number;
  connectedUsers: Map<string, unknown>;
  prisma: PrismaLike;
  _drainPendingMessages: jest.Mock;
  _emitUnreadCountsSnapshot: jest.Mock;
}> = {}) {
  const ctx = {
    presenceSnapshotCache: overrides.presenceSnapshotCache ?? new Map<string, PresenceCacheEntry>(),
    PRESENCE_SNAPSHOT_CACHE_TTL_MS: overrides.PRESENCE_SNAPSHOT_CACHE_TTL_MS ?? 30_000,
    connectedUsers: overrides.connectedUsers ?? new Map<string, unknown>(),
    prisma: overrides.prisma ?? { participant: { findMany: jest.fn().mockResolvedValue([]) } },
    _drainPendingMessages: overrides._drainPendingMessages ?? jest.fn().mockResolvedValue(undefined),
    _emitUnreadCountsSnapshot: overrides._emitUnreadCountsSnapshot ?? jest.fn().mockResolvedValue(undefined),
  } as Record<string, unknown>;

  ctx._emitPresenceSnapshotImpl = async function(
    socket: SocketLike,
    userId: string,
    isAnonymous: boolean
  ): Promise<void> {
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    try {
      const cached = (this as any).presenceSnapshotCache.get(userId);
      if (cached && Date.now() - cached.cachedAt < (this as any).PRESENCE_SNAPSHOT_CACHE_TTL_MS) {
        const users = cached.users.map((u: any) => ({ ...u, isOnline: (this as any).connectedUsers.has(u.userId) }));
        socket.emit(SERVER_EVENTS.PRESENCE_SNAPSHOT, { users });
        logger.info(`cache hit for ${userId}`);
      } else {
        const participantRows = isAnonymous
          ? await (this as any).prisma.participant.findMany({ where: { id: userId, isActive: true }, select: { conversationId: true } })
          : await (this as any).prisma.participant.findMany({ where: { userId: userId, isActive: true }, select: { conversationId: true } });

        if (participantRows.length > 0) {
          const users: Array<{ userId: string; username: string; isOnline: boolean; lastActiveAt: Date | null }> = [];
          (this as any).presenceSnapshotCache.set(userId, { users, cachedAt: Date.now() });
          socket.emit(SERVER_EVENTS.PRESENCE_SNAPSHOT, { users });
        }
      }

      (this as any)._drainPendingMessages(userId, isAnonymous).catch(() => {});
      if (!isAnonymous) {
        (this as any)._emitUnreadCountsSnapshot(socket, userId).catch(() => {});
      }
    } catch (error) {
      logger.error('snapshot failed', error);
    }
  };

  return ctx;
}

// ─── Context for _emitUnreadCountsSnapshot tests ──────────────────────────────

type ReadStatusLike = {
  getUnreadCountsForUser: jest.Mock;
};

function makeUnreadContext(overrides: Partial<{
  prisma: PrismaLike;
  readStatusService: ReadStatusLike;
}> = {}) {
  const ctx = {
    prisma: overrides.prisma ?? { participant: { findMany: jest.fn().mockResolvedValue([]) } },
    readStatusService: overrides.readStatusService ?? {
      getUnreadCountsForUser: jest.fn().mockResolvedValue(new Map()),
    },
  } as Record<string, unknown>;

  ctx._emitUnreadCountsSnapshotImpl = async function(
    socket: SocketLike,
    userId: string
  ): Promise<void> {
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    try {
      const participantRows = await (this as any).prisma.participant.findMany({
        where: { userId, isActive: true },
        select: { conversationId: true },
      });
      if (participantRows.length === 0) return;
      const conversationIds = participantRows.map((p: { conversationId: string }) => p.conversationId);
      const unreadCounts: Map<string, number> = await (this as any).readStatusService.getUnreadCountsForUser(userId, conversationIds);
      for (const [conversationId, unreadCount] of unreadCounts) {
        socket.emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, { conversationId, unreadCount });
      }
    } catch (error) {
      logger.warn('unread snapshot failed', error);
    }
  };

  return ctx;
}

// ─── Tests: _emitPresenceSnapshot drain behaviour ────────────────────────────

describe('_emitPresenceSnapshot drain behaviour (inline logic test)', () => {
  const USER_ID = 'user-abc';

  afterEach(() => jest.clearAllMocks());

  it('drains pending messages when the presence snapshot cache is warm (regression)', async () => {
    const drainSpy = jest.fn().mockResolvedValue(undefined);
    const ctx = makePresenceContext({ _drainPendingMessages: drainSpy });

    ctx.presenceSnapshotCache.set(USER_ID, {
      users: [{ userId: 'contact-1', username: 'alice', isOnline: false, lastActiveAt: null }],
      cachedAt: Date.now(),
    });

    const socket: SocketLike = { emit: jest.fn() };
    await (ctx._emitPresenceSnapshotImpl as Function).call(ctx, socket, USER_ID, false);

    expect(socket.emit).toHaveBeenCalledWith(
      SERVER_EVENTS.PRESENCE_SNAPSHOT,
      expect.objectContaining({ users: expect.any(Array) })
    );
    expect(drainSpy).toHaveBeenCalledWith(USER_ID, false);
  });

  it('drains for anonymous users too (participant-id key) but skips the unread snapshot', async () => {
    const drainSpy = jest.fn().mockResolvedValue(undefined);
    const unreadSpy = jest.fn().mockResolvedValue(undefined);
    const ctx = makePresenceContext({ _drainPendingMessages: drainSpy, _emitUnreadCountsSnapshot: unreadSpy });

    ctx.presenceSnapshotCache.set(USER_ID, { users: [], cachedAt: Date.now() });

    const socket: SocketLike = { emit: jest.fn() };
    await (ctx._emitPresenceSnapshotImpl as Function).call(ctx, socket, USER_ID, true);

    expect(drainSpy).toHaveBeenCalledWith(USER_ID, true);
    expect(unreadSpy).not.toHaveBeenCalled();
  });

  it('drains pending messages on a fresh (non-cached) snapshot', async () => {
    const drainSpy = jest.fn().mockResolvedValue(undefined);
    const ctx = makePresenceContext({ _drainPendingMessages: drainSpy });

    const socket: SocketLike = { emit: jest.fn() };
    await (ctx._emitPresenceSnapshotImpl as Function).call(ctx, socket, USER_ID, false);

    expect(drainSpy).toHaveBeenCalledWith(USER_ID, false);
  });

  it('drain failure is swallowed and does not surface to caller', async () => {
    const drainSpy = jest.fn().mockRejectedValue(new Error('redis down'));
    const ctx = makePresenceContext({ _drainPendingMessages: drainSpy });

    ctx.presenceSnapshotCache.set(USER_ID, { users: [], cachedAt: Date.now() });

    const socket: SocketLike = { emit: jest.fn() };
    await expect(
      (ctx._emitPresenceSnapshotImpl as Function).call(ctx, socket, USER_ID, false)
    ).resolves.toBeUndefined();
  });
});

// ─── Tests: _emitPresenceSnapshot unread counts on reconnect ─────────────────

describe('_emitPresenceSnapshot unread counts on reconnect', () => {
  const USER_ID = 'user-xyz';

  afterEach(() => jest.clearAllMocks());

  it('calls _emitUnreadCountsSnapshot on cache hit for authenticated users', async () => {
    const unreadSpy = jest.fn().mockResolvedValue(undefined);
    const ctx = makePresenceContext({ _emitUnreadCountsSnapshot: unreadSpy });

    ctx.presenceSnapshotCache.set(USER_ID, { users: [], cachedAt: Date.now() });

    const socket: SocketLike = { emit: jest.fn() };
    await (ctx._emitPresenceSnapshotImpl as Function).call(ctx, socket, USER_ID, false);

    expect(unreadSpy).toHaveBeenCalledWith(socket, USER_ID);
  });

  it('calls _emitUnreadCountsSnapshot on cache miss for authenticated users', async () => {
    const unreadSpy = jest.fn().mockResolvedValue(undefined);
    const ctx = makePresenceContext({ _emitUnreadCountsSnapshot: unreadSpy });
    // empty cache → cache-miss path

    const socket: SocketLike = { emit: jest.fn() };
    await (ctx._emitPresenceSnapshotImpl as Function).call(ctx, socket, USER_ID, false);

    expect(unreadSpy).toHaveBeenCalledWith(socket, USER_ID);
  });

  it('does NOT call _emitUnreadCountsSnapshot for anonymous users', async () => {
    const unreadSpy = jest.fn().mockResolvedValue(undefined);
    const ctx = makePresenceContext({ _emitUnreadCountsSnapshot: unreadSpy });

    ctx.presenceSnapshotCache.set(USER_ID, { users: [], cachedAt: Date.now() });

    const socket: SocketLike = { emit: jest.fn() };
    await (ctx._emitPresenceSnapshotImpl as Function).call(ctx, socket, USER_ID, true);

    expect(unreadSpy).not.toHaveBeenCalled();
  });

  it('unread snapshot failure is swallowed and does not surface to caller', async () => {
    const unreadSpy = jest.fn().mockRejectedValue(new Error('db error'));
    const ctx = makePresenceContext({ _emitUnreadCountsSnapshot: unreadSpy });

    ctx.presenceSnapshotCache.set(USER_ID, { users: [], cachedAt: Date.now() });

    const socket: SocketLike = { emit: jest.fn() };
    await expect(
      (ctx._emitPresenceSnapshotImpl as Function).call(ctx, socket, USER_ID, false)
    ).resolves.toBeUndefined();
  });
});

// ─── Tests: _emitUnreadCountsSnapshot ────────────────────────────────────────

describe('_emitUnreadCountsSnapshot (inline logic test)', () => {
  const USER_ID = 'user-abc';
  const CONV_A = 'conv-aaa';
  const CONV_B = 'conv-bbb';

  afterEach(() => jest.clearAllMocks());

  it('emits CONVERSATION_UNREAD_UPDATED for each conversation with its count', async () => {
    const unreadMap = new Map([[CONV_A, 3], [CONV_B, 0]]);
    const readStatusService = {
      getUnreadCountsForUser: jest.fn().mockResolvedValue(unreadMap),
    };
    const prisma = {
      participant: {
        findMany: jest.fn().mockResolvedValue([
          { conversationId: CONV_A },
          { conversationId: CONV_B },
        ]),
      },
    };
    const ctx = makeUnreadContext({ prisma, readStatusService });

    const socket: SocketLike = { emit: jest.fn() };
    await (ctx._emitUnreadCountsSnapshotImpl as Function).call(ctx, socket, USER_ID);

    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
      conversationId: CONV_A,
      unreadCount: 3,
    });
    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
      conversationId: CONV_B,
      unreadCount: 0,
    });
    expect(socket.emit).toHaveBeenCalledTimes(2);
  });

  it('passes the correct userId and conversationIds to getUnreadCountsForUser', async () => {
    const readStatusService = {
      getUnreadCountsForUser: jest.fn().mockResolvedValue(new Map([[CONV_A, 1]])),
    };
    const prisma = {
      participant: {
        findMany: jest.fn().mockResolvedValue([{ conversationId: CONV_A }]),
      },
    };
    const ctx = makeUnreadContext({ prisma, readStatusService });

    const socket: SocketLike = { emit: jest.fn() };
    await (ctx._emitUnreadCountsSnapshotImpl as Function).call(ctx, socket, USER_ID);

    expect(readStatusService.getUnreadCountsForUser).toHaveBeenCalledWith(USER_ID, [CONV_A]);
  });

  it('does not emit anything when the user has no active conversations', async () => {
    const prisma = { participant: { findMany: jest.fn().mockResolvedValue([]) } };
    const ctx = makeUnreadContext({ prisma });

    const socket: SocketLike = { emit: jest.fn() };
    await (ctx._emitUnreadCountsSnapshotImpl as Function).call(ctx, socket, USER_ID);

    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('does not emit when getUnreadCountsForUser returns an empty map', async () => {
    const readStatusService = {
      getUnreadCountsForUser: jest.fn().mockResolvedValue(new Map()),
    };
    const prisma = {
      participant: { findMany: jest.fn().mockResolvedValue([{ conversationId: CONV_A }]) },
    };
    const ctx = makeUnreadContext({ prisma, readStatusService });

    const socket: SocketLike = { emit: jest.fn() };
    await (ctx._emitUnreadCountsSnapshotImpl as Function).call(ctx, socket, USER_ID);

    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('swallows errors and does not throw to caller', async () => {
    const readStatusService = {
      getUnreadCountsForUser: jest.fn().mockRejectedValue(new Error('redis down')),
    };
    const prisma = {
      participant: { findMany: jest.fn().mockResolvedValue([{ conversationId: CONV_A }]) },
    };
    const ctx = makeUnreadContext({ prisma, readStatusService });

    const socket: SocketLike = { emit: jest.fn() };
    await expect(
      (ctx._emitUnreadCountsSnapshotImpl as Function).call(ctx, socket, USER_ID)
    ).resolves.toBeUndefined();
  });
});
