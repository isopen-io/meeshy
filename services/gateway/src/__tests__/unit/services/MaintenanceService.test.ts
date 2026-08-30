/**
 * Unit tests for MaintenanceService.
 * Covers: startMaintenanceTasks (stale presence reset, with/without isCurrentlyConnected
 * predicate, interval setup), stopMaintenanceTasks (safe double-stop),
 * updateUserOnlineStatus (isOnline:true sets lastActiveAt, isOnline:false does not,
 * broadcast), updateUserLastActive (user vs anonymous, error swallowed),
 * updateAnonymousOnlineStatus (sets status, lastActiveAt when online, broadcast),
 * cleanupExpiredData (deletes expired anonymous sessions and share links),
 * getMaintenanceStats (shape, DB error → null).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import { MaintenanceService } from '../../../services/MaintenanceService';
import { logger } from '../../../utils/logger';

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(overrides: {
  onlineUsers?: { id: string }[];
  onlineAnon?: { id: string }[];
} = {}) {
  const { onlineUsers = [], onlineAnon = [] } = overrides;

  return {
    user: {
      findMany: jest.fn<any>().mockResolvedValue(onlineUsers),
      updateMany: jest.fn<any>().mockResolvedValue({ count: onlineUsers.length }),
      update: jest.fn<any>().mockResolvedValue({}),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue(onlineAnon),
      updateMany: jest.fn<any>().mockResolvedValue({ count: onlineAnon.length }),
      update: jest.fn<any>().mockResolvedValue({}),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    conversationShareLink: {
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    messageAttachment: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    message: {
      findRaw: jest.fn<any>().mockResolvedValue([]),
    },
    messageAttachmentForEmptyMessage: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    accountDeletionRequest: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    $transaction: jest.fn<any>().mockResolvedValue([]),
    $runCommandRaw: jest.fn<any>().mockResolvedValue({}),
  };
}

const attachmentService = { deleteAttachment: jest.fn<any>().mockResolvedValue(undefined) };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── startMaintenanceTasks ────────────────────────────────────────────────────

describe('startMaintenanceTasks', () => {
  it('resets all online users to isOnline:false when no isCurrentlyConnected predicate is set', async () => {
    const prisma = makePrisma({ onlineUsers: [{ id: 'u1' }, { id: 'u2' }] });
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    await sut.startMaintenanceTasks();

    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isOnline: true }, data: { isOnline: false } })
    );
  });

  it('resets all online anonymous participants to isOnline:false on startup', async () => {
    const prisma = makePrisma({ onlineAnon: [{ id: 'p1' }] });
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    await sut.startMaintenanceTasks();

    expect(prisma.participant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isOnline: true, type: 'anonymous' }),
        data: { isOnline: false },
      })
    );
  });

  it('excludes users that are still connected via isCurrentlyConnected predicate', async () => {
    const prisma = makePrisma({ onlineUsers: [{ id: 'u-alive' }, { id: 'u-stale' }] });
    const sut = new MaintenanceService(prisma as any, attachmentService as any);
    sut.setIsCurrentlyConnected((userId) => userId === 'u-alive');

    await sut.startMaintenanceTasks();

    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['u-stale'] } },
        data: { isOnline: false },
      })
    );
  });

  it('makes getMaintenanceStats report maintenanceActive:true after start', async () => {
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    await sut.startMaintenanceTasks();
    const stats = await sut.getMaintenanceStats();

    expect(stats).not.toBeNull();
    expect(stats.maintenanceActive).toBe(true);
  });
});

// ─── les tâches périodiques ne laissent jamais un rejet sans écouteur ─────────

/**
 * Recense les rejets de promesse laissés SANS écouteur pendant `body`.
 *
 * Jumeau des helpers de `NotificationService.socketEmitIsolation.test.ts` et
 * `MeeshySocketIOManager.test.ts` : une promesse détachée ne se prouve pas par
 * le retour de son appelant — seul le verdict du runtime distingue « gardée »
 * de « abandonnée ». D'où l'écoute de `unhandledRejection` et le passage par la
 * phase « check » (`setImmediate`), où Node tranche.
 */
async function captureUnhandledRejections(body: () => Promise<void>): Promise<unknown[]> {
  const captured: unknown[] = [];
  const onUnhandled = (reason: unknown) => { captured.push(reason); };
  process.on('unhandledRejection', onUnhandled);
  try {
    await body();
    await new Promise<void>(resolve => setImmediate(resolve));
    await new Promise<void>(resolve => setImmediate(resolve));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  return captured;
}

/**
 * Capture les callbacks passés à `setInterval` au lieu de les laisser courir
 * sur l'horloge de 15 s / 1 h — on les déclenche à la main. Rend un `unref`
 * factice pour que `this.maintenanceInterval.unref?.()` ne casse pas.
 */
function captureIntervalCallbacks(): { readonly callbacks: Array<() => void>; restore: () => void } {
  const callbacks: Array<() => void> = [];
  const spy = jest
    .spyOn(global, 'setInterval')
    .mockImplementation(((cb: () => void) => {
      callbacks.push(cb);
      return { unref: () => {} } as unknown as NodeJS.Timeout;
    }) as never);
  return { callbacks, restore: () => spy.mockRestore() };
}

describe('periodic tasks never leave an unhandled rejection', () => {
  it('catches a maintenance-interval failure instead of crashing the process', async () => {
    jest.useRealTimers();
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);
    // Rejette HORS du try/catch interne de la vraie méthode — exactement ce qui
    // arriverait dès qu'une instruction non gardée précède son propre catch.
    (sut as any).updateOfflineUsers = jest.fn<any>().mockRejectedValue(new Error('boom-maintenance'));

    const timers = captureIntervalCallbacks();
    const captured = await captureUnhandledRejections(async () => {
      await sut.startMaintenanceTasks();
      timers.callbacks[0]?.(); // la tâche de maintenance (15 s)
    });
    timers.restore();

    expect(captured).toHaveLength(0);
    expect(logger.error).toHaveBeenCalled();
  });

  it('catches a daily-cleanup-interval failure instead of crashing the process', async () => {
    jest.useRealTimers();
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);
    // Résout à l'appel immédiat du démarrage, rejette quand l'intervalle le rappelle.
    (sut as any).runDailyCleanup = jest
      .fn<any>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error('boom-daily'));

    const timers = captureIntervalCallbacks();
    const captured = await captureUnhandledRejections(async () => {
      await sut.startMaintenanceTasks();
      timers.callbacks[1]?.(); // le nettoyage journalier (1 h)
    });
    timers.restore();

    expect(captured).toHaveLength(0);
    expect(logger.error).toHaveBeenCalled();
  });
});

// ─── stopMaintenanceTasks ─────────────────────────────────────────────────────

describe('stopMaintenanceTasks', () => {
  it('is safe to call without starting first', () => {
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    expect(() => sut.stopMaintenanceTasks()).not.toThrow();
  });

  it('sets maintenanceActive to false after stop', async () => {
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);
    await sut.startMaintenanceTasks();

    sut.stopMaintenanceTasks();
    const stats = await sut.getMaintenanceStats();

    expect(stats.maintenanceActive).toBe(false);
  });

  it('is idempotent (safe to call twice)', async () => {
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);
    await sut.startMaintenanceTasks();

    sut.stopMaintenanceTasks();
    expect(() => sut.stopMaintenanceTasks()).not.toThrow();
  });
});

// ─── updateUserOnlineStatus ───────────────────────────────────────────────────

describe('updateUserOnlineStatus', () => {
  it('updates isOnline:true and sets lastActiveAt when going online', async () => {
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    await sut.updateUserOnlineStatus('user-1', true);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ isOnline: true, lastActiveAt: expect.any(Date) }),
      })
    );
  });

  it('updates isOnline:false without setting lastActiveAt when going offline', async () => {
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    await sut.updateUserOnlineStatus('user-2', false);

    const call = (prisma.user.update as jest.Mock<any>).mock.calls[0][0];
    expect(call.data.isOnline).toBe(false);
    expect(call.data.lastActiveAt).toBeUndefined();
  });

  it('invokes the statusBroadcastCallback when broadcast is true', async () => {
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);
    const callback = jest.fn<any>();
    sut.setStatusBroadcastCallback(callback);

    await sut.updateUserOnlineStatus('user-3', true, true);

    expect(callback).toHaveBeenCalledWith('user-3', true, false);
  });

  it('does not invoke the statusBroadcastCallback when broadcast is false', async () => {
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);
    const callback = jest.fn<any>();
    sut.setStatusBroadcastCallback(callback);

    await sut.updateUserOnlineStatus('user-4', true, false);

    expect(callback).not.toHaveBeenCalled();
  });
});

// ─── updateUserLastActive ─────────────────────────────────────────────────────

describe('updateUserLastActive', () => {
  it('updates user.lastActiveAt when isAnonymous is false', async () => {
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    await sut.updateUserLastActive('user-5', false);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-5' },
        data: { lastActiveAt: expect.any(Date) },
      })
    );
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });

  it('updates participant.lastActiveAt when isAnonymous is true', async () => {
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    await sut.updateUserLastActive('part-1', true);

    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'part-1' },
        data: { lastActiveAt: expect.any(Date) },
      })
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('silently swallows DB errors', async () => {
    const prisma = makePrisma();
    (prisma.user.update as jest.Mock<any>).mockRejectedValue(new Error('DB crash'));
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    await expect(sut.updateUserLastActive('user-6', false)).resolves.toBeUndefined();
  });
});

// ─── updateAnonymousOnlineStatus ──────────────────────────────────────────────

describe('updateAnonymousOnlineStatus', () => {
  it('updates isOnline:true and sets lastActiveAt when going online', async () => {
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    await sut.updateAnonymousOnlineStatus('part-2', true);

    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'part-2' },
        data: expect.objectContaining({ isOnline: true, lastActiveAt: expect.any(Date) }),
      })
    );
  });

  it('updates isOnline:false without lastActiveAt when going offline', async () => {
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    await sut.updateAnonymousOnlineStatus('part-3', false);

    const call = (prisma.participant.update as jest.Mock<any>).mock.calls[0][0];
    expect(call.data.isOnline).toBe(false);
    expect(call.data.lastActiveAt).toBeUndefined();
  });

  it('calls statusBroadcastCallback with isAnonymous:true when broadcast:true', async () => {
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);
    const callback = jest.fn<any>();
    sut.setStatusBroadcastCallback(callback);

    await sut.updateAnonymousOnlineStatus('part-4', false, true);

    expect(callback).toHaveBeenCalledWith('part-4', false, true);
  });
});

// ─── cleanupExpiredData ───────────────────────────────────────────────────────

describe('cleanupExpiredData', () => {
  it('deletes anonymous participants inactive for more than 24 hours', async () => {
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    await sut.cleanupExpiredData();

    expect(prisma.participant.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'anonymous' }),
      })
    );
  });

  it('deletes expired conversation share links', async () => {
    const prisma = makePrisma();
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    await sut.cleanupExpiredData();

    expect(prisma.conversationShareLink.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ expiresAt: expect.objectContaining({ lt: expect.any(Date) }) }),
      })
    );
  });

  it('does not throw on DB error during cleanup', async () => {
    const prisma = makePrisma();
    (prisma.participant.deleteMany as jest.Mock<any>).mockRejectedValue(new Error('DB error'));
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    await expect(sut.cleanupExpiredData()).resolves.toBeUndefined();
  });
});

// ─── getMaintenanceStats ──────────────────────────────────────────────────────

describe('getMaintenanceStats', () => {
  it('returns stats with the correct shape and values from DB', async () => {
    const prisma = makePrisma();
    (prisma.user.count as jest.Mock<any>).mockResolvedValue(42);
    (prisma.participant.count as jest.Mock<any>).mockResolvedValue(7);
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    const stats = await sut.getMaintenanceStats();

    expect(stats).toMatchObject({
      onlineUsers: 42,
      totalUsers: 42,
      anonymousSessions: 7,
      onlineAnonymous: 7,
      offlineThresholdMinutes: 30,
      maintenanceActive: false,
    });
  });

  it('returns null when DB throws an error', async () => {
    const prisma = makePrisma();
    (prisma.user.count as jest.Mock<any>).mockRejectedValue(new Error('DB down'));
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    const stats = await sut.getMaintenanceStats();

    expect(stats).toBeNull();
  });
});

// ─── processAccountDeletionRequests — fin de période de grâce (F9 bis) ────────
// Le balayage journalier met hors service, EN LOT, chaque compte dont la
// période de grâce est échue (`isActive: false` + `deletedAt`). Le révocateur
// est injecté comme les deux autres capacités côté socket (`setStatusBroadcastCallback`,
// `setIsCurrentlyConnected`) : le service ne touche jamais le manager.

type DeletionSweep = { processAccountDeletionRequests(): Promise<void> };
const sweepDeletions = (sut: MaintenanceService) =>
  (sut as unknown as DeletionSweep).processAccountDeletionRequests();

function expiredRequest(id: string, userId: string) {
  return { id, userId, status: 'CONFIRMED', gracePeriodEndsAt: new Date(Date.now() - 1000) };
}

function makeRevoker(order: string[], failFor?: string) {
  return jest.fn<(userId: string) => Promise<number>>(async (userId) => {
    if (userId === failFor) throw new Error('adapter down');
    order.push(`revoked:${userId}`);
    return 1;
  });
}

describe('processAccountDeletionRequests — la fin de période de grâce coupe les sockets du compte', () => {
  it("révoque chaque compte expiré avec son id, APRÈS que sa transaction a abouti", async () => {
    const order: string[] = [];
    const prisma = makePrisma();
    prisma.accountDeletionRequest.findMany.mockResolvedValueOnce([expiredRequest('req-a', 'user-a'), expiredRequest('req-b', 'user-b')]);
    prisma.$transaction = jest.fn<() => Promise<unknown[]>>(async () => { order.push('written'); return []; });
    const revokeSessions = makeRevoker(order);
    const sut = new MaintenanceService(prisma as any, attachmentService as any);
    sut.setSessionRevoker(revokeSessions);

    await sweepDeletions(sut);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(revokeSessions).toHaveBeenNthCalledWith(1, 'user-a');
    expect(revokeSessions).toHaveBeenNthCalledWith(2, 'user-b');
    expect(order).toEqual(['written', 'revoked:user-a', 'written', 'revoked:user-b']);
  });

  it("une transaction qui échoue ne révoque PAS ce compte — il n'est pas hors service — et n'arrête pas le lot", async () => {
    const order: string[] = [];
    const prisma = makePrisma();
    prisma.accountDeletionRequest.findMany.mockResolvedValueOnce([expiredRequest('req-a', 'user-a'), expiredRequest('req-b', 'user-b')]);
    prisma.$transaction = jest.fn<() => Promise<unknown[]>>()
      .mockRejectedValueOnce(new Error('write conflict'))
      .mockResolvedValueOnce([]);
    const revokeSessions = makeRevoker(order);
    const sut = new MaintenanceService(prisma as any, attachmentService as any);
    sut.setSessionRevoker(revokeSessions);

    await expect(sweepDeletions(sut)).resolves.toBeUndefined();

    expect(revokeSessions).toHaveBeenCalledTimes(1);
    expect(revokeSessions).toHaveBeenCalledWith('user-b');
  });

  it("échec de la révocation ⇒ la transaction est faite, le lot continue, l'échec est journalisé", async () => {
    const order: string[] = [];
    const prisma = makePrisma();
    prisma.accountDeletionRequest.findMany.mockResolvedValueOnce([expiredRequest('req-a', 'user-a'), expiredRequest('req-b', 'user-b')]);
    const revokeSessions = makeRevoker(order, 'user-a');
    const sut = new MaintenanceService(prisma as any, attachmentService as any);
    sut.setSessionRevoker(revokeSessions);

    await expect(sweepDeletions(sut)).resolves.toBeUndefined();

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(revokeSessions).toHaveBeenCalledTimes(2);
    expect(order).toEqual(['revoked:user-b']);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('user-a'), expect.any(Error));
  });

  it('sans révocateur injecté, le lot expire les demandes sans lever', async () => {
    const prisma = makePrisma();
    prisma.accountDeletionRequest.findMany.mockResolvedValueOnce([expiredRequest('req-a', 'user-a')]);
    const sut = new MaintenanceService(prisma as any, attachmentService as any);

    await expect(sweepDeletions(sut)).resolves.toBeUndefined();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
