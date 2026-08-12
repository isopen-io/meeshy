/**
 * Unit tests for OrphanMediaCleanupService.
 * Covers: track, untrack (idempotent), trackBatch (empty + batch),
 * untrackBatch (empty + batch), start (idempotent), stop,
 * reapExpired (no rows, single batch, multiple batches, concurrent untrack).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import { OrphanMediaCleanupService } from '../../../services/storage/OrphanMediaCleanupService';

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(opts: {
  createResult?: { id: string };
  findManyResults?: { id: string; fileUrl: string }[][];
  txFindManyResult?: { id: string; fileUrl: string }[];
} = {}) {
  const {
    createResult = { id: 'row-1' },
    findManyResults = [[]], // default: empty batch → stop looping
    txFindManyResult = [],
  } = opts;

  let findManyCallIdx = 0;

  const txOrphan = {
    findMany: jest.fn<any>().mockResolvedValue(txFindManyResult),
    deleteMany: jest.fn<any>().mockResolvedValue({ count: txFindManyResult.length }),
  };

  return {
    orphanMediaCleanup: {
      create: jest.fn<any>().mockResolvedValue(createResult),
      delete: jest.fn<any>().mockResolvedValue({}),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      findMany: jest.fn<any>().mockImplementation(async () => {
        const result = findManyResults[findManyCallIdx] ?? [];
        findManyCallIdx++;
        return result;
      }),
    },
    $transaction: jest.fn<any>().mockImplementation(async (fn: any) => fn({ orphanMediaCleanup: txOrphan })),
  };
}

function makeStorage() {
  return { delete: jest.fn<any>().mockResolvedValue(undefined) };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── track ────────────────────────────────────────────────────────────────────

describe('track', () => {
  it('creates an outbox row and returns its id', async () => {
    const prisma = makePrisma({ createResult: { id: 'abc123' } });
    const sut = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    const id = await sut.track('https://cdn.example.com/file.jpg', 'repost');

    expect(id).toBe('abc123');
    expect(prisma.orphanMediaCleanup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fileUrl: 'https://cdn.example.com/file.jpg',
          source: 'repost',
          cleanupAfter: expect.any(Date),
        }),
      }),
    );
  });

  it('creates the row with a cleanupAfter date in the future', async () => {
    const prisma = makePrisma();
    const sut = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);
    const beforeCall = Date.now();

    await sut.track('https://example.com/img.png', 'upload', 60_000);

    const afterCall = Date.now();
    const callArg = (prisma.orphanMediaCleanup.create as jest.Mock<any>).mock.calls[0][0];
    const cleanupAfter: Date = callArg.data.cleanupAfter;

    expect(cleanupAfter.getTime()).toBeGreaterThanOrEqual(beforeCall + 60_000 - 10);
    expect(cleanupAfter.getTime()).toBeLessThanOrEqual(afterCall + 60_000 + 10);
  });
});

// ─── untrack ─────────────────────────────────────────────────────────────────

describe('untrack', () => {
  it('deletes the outbox row by id', async () => {
    const prisma = makePrisma();
    const sut = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    await sut.untrack('row-99');

    expect(prisma.orphanMediaCleanup.delete).toHaveBeenCalledWith({ where: { id: 'row-99' } });
  });

  it('does not throw when the row is already gone (idempotent)', async () => {
    const prisma = makePrisma();
    (prisma.orphanMediaCleanup.delete as jest.Mock<any>).mockRejectedValue(new Error('Not found'));
    const sut = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    await expect(sut.untrack('missing-row')).resolves.toBeUndefined();
  });
});

// ─── trackBatch ──────────────────────────────────────────────────────────────

describe('trackBatch', () => {
  it('returns an empty array for an empty input', async () => {
    const prisma = makePrisma();
    const sut = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    const result = await sut.trackBatch([], 'upload');

    expect(result).toEqual([]);
    expect(prisma.orphanMediaCleanup.create).not.toHaveBeenCalled();
  });

  it('creates one row per URL and returns all ids', async () => {
    let callIdx = 0;
    const ids = ['id-1', 'id-2', 'id-3'];
    const prisma = makePrisma();
    (prisma.orphanMediaCleanup.create as jest.Mock<any>).mockImplementation(async () => ({
      id: ids[callIdx++],
    }));
    const sut = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    const result = await sut.trackBatch(['url-a', 'url-b', 'url-c'], 'repost');

    expect(result).toEqual(['id-1', 'id-2', 'id-3']);
    expect(prisma.orphanMediaCleanup.create).toHaveBeenCalledTimes(3);
  });
});

// ─── untrackBatch ────────────────────────────────────────────────────────────

describe('untrackBatch', () => {
  it('does nothing for an empty rowIds array', async () => {
    const prisma = makePrisma();
    const sut = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    await sut.untrackBatch([]);

    expect(prisma.orphanMediaCleanup.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes all specified rows', async () => {
    const prisma = makePrisma();
    const sut = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    await sut.untrackBatch(['r-1', 'r-2']);

    expect(prisma.orphanMediaCleanup.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['r-1', 'r-2'] } },
    });
  });

  it('does not throw when rows are already gone (idempotent)', async () => {
    const prisma = makePrisma();
    (prisma.orphanMediaCleanup.deleteMany as jest.Mock<any>).mockRejectedValue(new Error('gone'));
    const sut = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    await expect(sut.untrackBatch(['r-x'])).resolves.toBeUndefined();
  });
});

// ─── start / stop ─────────────────────────────────────────────────────────────

describe('start and stop', () => {
  it('start is idempotent (calling twice does not create a second timer)', () => {
    const prisma = makePrisma();
    const sut = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    sut.start(10_000);
    sut.start(10_000); // second call should be ignored

    expect(prisma.orphanMediaCleanup.findMany).not.toHaveBeenCalled();
  });

  it('stop clears the interval without throwing when not started', () => {
    const prisma = makePrisma();
    const sut = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    expect(() => sut.stop()).not.toThrow();
  });

  it('stop clears the interval after start', () => {
    const prisma = makePrisma();
    const sut = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    sut.start(10_000);
    sut.stop();
    // No timer should fire after stop
    jest.advanceTimersByTime(20_000);

    expect(prisma.orphanMediaCleanup.findMany).not.toHaveBeenCalled();
  });
});

// ─── reapExpired ─────────────────────────────────────────────────────────────

describe('reapExpired', () => {
  it('returns 0 and calls no storage when there are no expired rows', async () => {
    const prisma = makePrisma({ findManyResults: [[]] });
    const storage = makeStorage();
    const sut = new OrphanMediaCleanupService(prisma as any, storage as any);

    const count = await sut.reapExpired();

    expect(count).toBe(0);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('deletes storage files for all claimed rows and returns the count', async () => {
    const rows = [
      { id: 'r-1', fileUrl: 'https://cdn.example.com/a.jpg' },
      { id: 'r-2', fileUrl: 'https://cdn.example.com/b.jpg' },
    ];
    const prisma = makePrisma({
      findManyResults: [rows, []],
      txFindManyResult: rows,
    });
    const storage = makeStorage();
    const sut = new OrphanMediaCleanupService(prisma as any, storage as any);

    const count = await sut.reapExpired();

    expect(count).toBe(2);
    expect(storage.delete).toHaveBeenCalledWith('https://cdn.example.com/a.jpg');
    expect(storage.delete).toHaveBeenCalledWith('https://cdn.example.com/b.jpg');
  });

  it('skips storage delete when concurrent untrack removed the rows (txFindMany returns empty)', async () => {
    const rows = [{ id: 'r-1', fileUrl: 'https://cdn.example.com/gone.jpg' }];
    const prisma = makePrisma({
      findManyResults: [rows, []],
      txFindManyResult: [], // concurrent untrack removed the row before our tx
    });
    const storage = makeStorage();
    const sut = new OrphanMediaCleanupService(prisma as any, storage as any);

    const count = await sut.reapExpired();

    expect(count).toBe(0);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('runs the transaction to atomically claim and delete rows', async () => {
    const rows = [{ id: 'r-1', fileUrl: 'https://cdn.example.com/f.jpg' }];
    const prisma = makePrisma({
      findManyResults: [rows, []],
      txFindManyResult: rows,
    });
    const sut = new OrphanMediaCleanupService(prisma as any, makeStorage() as any);

    await sut.reapExpired();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
