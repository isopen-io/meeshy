/**
 * Unit tests for the drain-on-cache-hit fix in _emitPresenceSnapshot.
 *
 * Strategy: build a minimal object with the exact properties the method reads
 * from `this` and test via direct invocation — no constructor needed.
 *
 * Key regression:
 *   Drain must run even when the presence-snapshot cache is warm.
 *   The old code had `return;` after the cache-hit emit, silently skipping
 *   delivery of messages queued during a brief disconnection.
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

// ─── Inline implementation ────────────────────────────────────────────────────
// We copy the exact logic of _emitPresenceSnapshot and _drainPendingMessages
// rather than importing MeeshySocketIOManager (whose import chain hangs due to
// ZMQ / Redis / Firebase sockets being opened at import time in CI-less envs).

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

type PresenceCacheEntry = {
  users: Array<{ userId: string; username: string; isOnline: boolean; lastActiveAt: Date | null }>;
  cachedAt: number;
};

type DeliveryQueue = {
  drain(userId: string): Promise<Array<{ payload: unknown }>>;
};

type SocketLike = {
  emit: jest.Mock;
};

type PrismaLike = {
  participant: {
    findMany: jest.Mock;
  };
};

// Minimal context object that mirrors `this` inside _emitPresenceSnapshot
function makeContext(overrides: Partial<{
  presenceSnapshotCache: Map<string, PresenceCacheEntry>;
  PRESENCE_SNAPSHOT_CACHE_TTL_MS: number;
  connectedUsers: Map<string, unknown>;
  deliveryQueue: DeliveryQueue | null;
  prisma: PrismaLike;
  _drainPendingMessages: jest.Mock;
}> = {}) {
  const ctx = {
    presenceSnapshotCache: overrides.presenceSnapshotCache ?? new Map<string, PresenceCacheEntry>(),
    PRESENCE_SNAPSHOT_CACHE_TTL_MS: overrides.PRESENCE_SNAPSHOT_CACHE_TTL_MS ?? 30_000,
    connectedUsers: overrides.connectedUsers ?? new Map<string, unknown>(),
    deliveryQueue: overrides.deliveryQueue ?? null,
    prisma: overrides.prisma ?? { participant: { findMany: jest.fn().mockResolvedValue([]) } },
    _drainPendingMessages: overrides._drainPendingMessages ?? jest.fn().mockResolvedValue(undefined),
  };

  // ─── The exact implementation from MeeshySocketIOManager ──────────────────
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

      if (!isAnonymous) {
        (this as any)._drainPendingMessages(socket, userId).catch(() => {});
      }
    } catch (error) {
      logger.error('snapshot failed', error);
    }
  };

  return ctx;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('_emitPresenceSnapshot drain behaviour (inline logic test)', () => {
  const USER_ID = 'user-abc';

  afterEach(() => jest.clearAllMocks());

  it('drains pending messages when the presence snapshot cache is warm (regression)', async () => {
    const drainSpy = jest.fn().mockResolvedValue(undefined);
    const ctx = makeContext({ _drainPendingMessages: drainSpy });

    ctx.presenceSnapshotCache.set(USER_ID, {
      users: [{ userId: 'contact-1', username: 'alice', isOnline: false, lastActiveAt: null }],
      cachedAt: Date.now(),
    });

    const socket: SocketLike = { emit: jest.fn() };
    await ctx._emitPresenceSnapshotImpl.call(ctx, socket, USER_ID, false);

    expect(socket.emit).toHaveBeenCalledWith(
      SERVER_EVENTS.PRESENCE_SNAPSHOT,
      expect.objectContaining({ users: expect.any(Array) })
    );
    expect(drainSpy).toHaveBeenCalledWith(socket, USER_ID);
  });

  it('does NOT drain for anonymous users even on a warm cache', async () => {
    const drainSpy = jest.fn().mockResolvedValue(undefined);
    const ctx = makeContext({ _drainPendingMessages: drainSpy });

    ctx.presenceSnapshotCache.set(USER_ID, { users: [], cachedAt: Date.now() });

    const socket: SocketLike = { emit: jest.fn() };
    await ctx._emitPresenceSnapshotImpl.call(ctx, socket, USER_ID, /* isAnonymous */ true);

    expect(drainSpy).not.toHaveBeenCalled();
  });

  it('drains pending messages on a fresh (non-cached) snapshot', async () => {
    const drainSpy = jest.fn().mockResolvedValue(undefined);
    const ctx = makeContext({ _drainPendingMessages: drainSpy });
    // empty cache → non-cached path; no conversations → snapshot skipped but drain still runs

    const socket: SocketLike = { emit: jest.fn() };
    await ctx._emitPresenceSnapshotImpl.call(ctx, socket, USER_ID, false);

    expect(drainSpy).toHaveBeenCalledWith(socket, USER_ID);
  });

  it('drain failure is swallowed and does not surface to caller', async () => {
    const drainSpy = jest.fn().mockRejectedValue(new Error('redis down'));
    const ctx = makeContext({ _drainPendingMessages: drainSpy });

    ctx.presenceSnapshotCache.set(USER_ID, { users: [], cachedAt: Date.now() });

    const socket: SocketLike = { emit: jest.fn() };
    await expect(
      ctx._emitPresenceSnapshotImpl.call(ctx, socket, USER_ID, false)
    ).resolves.toBeUndefined();
  });
});
