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
