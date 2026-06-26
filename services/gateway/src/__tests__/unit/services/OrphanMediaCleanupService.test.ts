/**
 * OrphanMediaCleanupService — unit tests
 *
 * Covers track(), trackBatch(), untrackBatch(), start(), stop()
 * (the reapExpired() path is tested via its own suite).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import { OrphanMediaCleanupService } from '../../../services/storage/OrphanMediaCleanupService';

// ─── Mocks ────────────────────────────────────────────────────────────────────

type RowId = { id: string };

function makePrisma() {
  return {
    orphanMediaCleanup: {
      create: jest.fn<any>(),
      delete: jest.fn<any>().mockResolvedValue({}),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    $transaction: jest.fn<any>(),
  };
}

function makeStorage() {
  return { delete: jest.fn<any>().mockResolvedValue(undefined) };
}

// ─── track() ──────────────────────────────────────────────────────────────────

describe('OrphanMediaCleanupService.track', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let storage: ReturnType<typeof makeStorage>;
  let svc: OrphanMediaCleanupService;

  beforeEach(() => {
    prisma = makePrisma();
    storage = makeStorage();
    svc = new OrphanMediaCleanupService(prisma as any, storage as any);
  });

  it('creates an outbox row and returns its id', async () => {
    prisma.orphanMediaCleanup.create.mockResolvedValue({ id: 'row-1' });

    const id = await svc.track('https://cdn/img.jpg', 'test-source');

    expect(prisma.orphanMediaCleanup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fileUrl: 'https://cdn/img.jpg', source: 'test-source' }),
        select: { id: true },
      })
    );
    expect(id).toBe('row-1');
  });

  it('sets cleanupAfter in the future', async () => {
    prisma.orphanMediaCleanup.create.mockResolvedValue({ id: 'row-2' });
    const before = Date.now();

    await svc.track('file.png', 'src', 60_000);

    const callArgs = (prisma.orphanMediaCleanup.create.mock.calls[0] as any[])[0] as {
      data: { cleanupAfter: Date };
    };
    expect(callArgs.data.cleanupAfter.getTime()).toBeGreaterThanOrEqual(before + 60_000 - 50);
    expect(callArgs.data.cleanupAfter.getTime()).toBeLessThanOrEqual(before + 60_000 + 500);
  });
});

// ─── untrack() ────────────────────────────────────────────────────────────────

describe('OrphanMediaCleanupService.untrack', () => {
  it('deletes the row by id', async () => {
    const prisma = makePrisma();
    const svc = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    await svc.untrack('row-abc');

    expect(prisma.orphanMediaCleanup.delete).toHaveBeenCalledWith({ where: { id: 'row-abc' } });
  });

  it('silently ignores if row is already gone', async () => {
    const prisma = makePrisma();
    prisma.orphanMediaCleanup.delete.mockRejectedValue(new Error('not found'));
    const svc = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    await expect(svc.untrack('gone')).resolves.toBeUndefined();
  });
});

// ─── trackBatch() ─────────────────────────────────────────────────────────────

describe('OrphanMediaCleanupService.trackBatch', () => {
  it('returns an empty array for an empty input without calling prisma', async () => {
    const prisma = makePrisma();
    const svc = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    const ids = await svc.trackBatch([], 'src');

    expect(ids).toEqual([]);
    expect(prisma.orphanMediaCleanup.create).not.toHaveBeenCalled();
  });

  it('creates one row per URL in parallel and returns their ids', async () => {
    const prisma = makePrisma();
    prisma.orphanMediaCleanup.create
      .mockResolvedValueOnce({ id: 'id-1' })
      .mockResolvedValueOnce({ id: 'id-2' })
      .mockResolvedValueOnce({ id: 'id-3' });
    const svc = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    const ids = await svc.trackBatch(['a.jpg', 'b.jpg', 'c.jpg'], 'batch-src');

    expect(prisma.orphanMediaCleanup.create).toHaveBeenCalledTimes(3);
    expect(ids).toEqual(['id-1', 'id-2', 'id-3']);
  });
});

// ─── untrackBatch() ───────────────────────────────────────────────────────────

describe('OrphanMediaCleanupService.untrackBatch', () => {
  it('is a no-op for an empty array', async () => {
    const prisma = makePrisma();
    const svc = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    await svc.untrackBatch([]);

    expect(prisma.orphanMediaCleanup.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes all rows by ids', async () => {
    const prisma = makePrisma();
    const svc = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    await svc.untrackBatch(['id-1', 'id-2']);

    expect(prisma.orphanMediaCleanup.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['id-1', 'id-2'] } },
    });
  });

  it('silently ignores errors from deleteMany', async () => {
    const prisma = makePrisma();
    prisma.orphanMediaCleanup.deleteMany.mockRejectedValue(new Error('gone'));
    const svc = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    await expect(svc.untrackBatch(['x'])).resolves.toBeUndefined();
  });
});

// ─── start() / stop() ─────────────────────────────────────────────────────────

describe('OrphanMediaCleanupService.start / stop', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: OrphanMediaCleanupService;

  beforeEach(() => {
    prisma = makePrisma();
    prisma.orphanMediaCleanup.findMany.mockResolvedValue([]);
    svc = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);
    jest.useFakeTimers();
  });

  afterEach(() => {
    svc.stop();
    jest.useRealTimers();
  });

  it('starts the periodic interval', () => {
    svc.start(1000);
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });

  it('is idempotent — second start() does not create another timer', () => {
    svc.start(1000);
    const timerCount = jest.getTimerCount();
    svc.start(1000);
    expect(jest.getTimerCount()).toBe(timerCount);
  });

  it('stop() clears the timer', () => {
    svc.start(1000);
    svc.stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stop() is a no-op if not started', () => {
    expect(() => svc.stop()).not.toThrow();
  });
});
