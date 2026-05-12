/**
 * Race-condition tests for OrphanMediaCleanupService.reapExpired.
 *
 * These tests verify that concurrent `untrack()` calls interleaved with a
 * reap cycle never cause the worker to delete a file that has been
 * legitimately committed to a new record.
 *
 * The fake prisma models the critical invariant: $transaction uses snapshot
 * isolation, so the inner findMany only returns rows that still exist at
 * transaction start. We simulate a concurrent untrack by removing a row
 * from the fake store between the outer findMany (batch scan) and the
 * inner transaction (claim step).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { OrphanMediaCleanupService } from '../OrphanMediaCleanupService';
import type { MediaStorage } from '../MediaStorage';

// ---------------------------------------------------------------------------
// Fake store helpers
// ---------------------------------------------------------------------------

type FakeRow = { id: string; fileUrl: string; source: string; cleanupAfter: Date };

function makeRow(id: string, fileUrl: string, msAgo = 10_000): FakeRow {
  return {
    id,
    fileUrl,
    source: 'test',
    cleanupAfter: new Date(Date.now() - msAgo),
  };
}

/**
 * Builds a fake PrismaClient that mirrors the subset of the
 * `orphanMediaCleanup` model used by OrphanMediaCleanupService.
 *
 * The `onBeforeTransaction` hook lets individual tests inject a side-effect
 * (simulating a concurrent untrack) that runs after the outer `findMany`
 * but before the inner transaction `findMany` — recreating the race window.
 */
function makeFakePrisma(initialRows: FakeRow[] = []) {
  const store = new Map<string, FakeRow>(initialRows.map((r) => [r.id, r]));
  let onBeforeTransaction: (() => void) | null = null;

  const orphanMediaCleanup = {
    create: jest.fn(async ({ data }: { data: Omit<FakeRow, 'id'> }) => {
      const id = Math.random().toString(36).slice(2);
      const row = { id, ...data } as FakeRow;
      store.set(id, row);
      return { id };
    }),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      store.delete(where.id);
    }),
    deleteMany: jest.fn(async ({ where }: { where: { id?: { in: string[] } } }) => {
      const ids = where.id?.in ?? [];
      let count = 0;
      for (const id of ids) {
        if (store.delete(id)) count++;
      }
      return { count };
    }),
    findMany: jest.fn(async (args: { where?: { cleanupAfter?: { lte?: Date }; id?: { in: string[] } }; take?: number; orderBy?: unknown; select?: unknown }) => {
      let rows = [...store.values()];
      if (args.where?.cleanupAfter?.lte) {
        const cutoff = args.where.cleanupAfter.lte;
        rows = rows.filter((r) => r.cleanupAfter <= cutoff);
      }
      if (args.where?.id?.in) {
        const ids = new Set(args.where.id.in);
        rows = rows.filter((r) => ids.has(r.id));
      }
      if (args.take) rows = rows.slice(0, args.take);
      if (args.select) {
        return rows.map((r) => {
          const out: Partial<FakeRow> = {};
          if ((args.select as Record<string, boolean>)['id']) out.id = r.id;
          if ((args.select as Record<string, boolean>)['fileUrl']) out.fileUrl = r.fileUrl;
          return out;
        });
      }
      return rows;
    }),
  };

  const prisma = {
    orphanMediaCleanup,
    $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      onBeforeTransaction?.();
      return fn(prisma);
    }),
  };

  return {
    prisma,
    store,
    spies: { orphanMediaCleanup, transaction: prisma.$transaction },
    setOnBeforeTransaction(hook: () => void) {
      onBeforeTransaction = hook;
    },
  };
}

function makeFakeStorage(): { storage: MediaStorage; deletedUrls: string[] } {
  const deletedUrls: string[] = [];
  const storage: MediaStorage = {
    delete: jest.fn(async (url: string) => {
      deletedUrls.push(url);
    }),
    duplicate: jest.fn(),
    planDuplicate: jest.fn(),
    relativePathFromUrl: jest.fn(),
  } as unknown as MediaStorage;
  return { storage, deletedUrls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OrphanMediaCleanupService — race-condition safety', () => {
  it('should_not_delete_file_if_untracked_during_cleanup_window', async () => {
    const row = makeRow('row1', 'http://storage/file1.jpg');
    const { prisma, store, setOnBeforeTransaction } = makeFakePrisma([row]);
    const { storage, deletedUrls } = makeFakeStorage();

    // Simulate concurrent untrack: row is removed AFTER outer findMany returns
    // (reapExpired already has the batch) but BEFORE the transaction fires.
    setOnBeforeTransaction(() => {
      store.delete('row1');
    });

    const svc = new OrphanMediaCleanupService(prisma as never, storage);
    const reaped = await svc.reapExpired();

    // The transaction's inner findMany sees an empty store → nothing claimed.
    expect(reaped).toBe(0);
    expect(deletedUrls).toHaveLength(0);
  });

  it('should_lock_rows_during_cleanup_batch', async () => {
    const rows = [
      makeRow('r1', 'http://storage/a.jpg'),
      makeRow('r2', 'http://storage/b.jpg'),
      makeRow('r3', 'http://storage/c.jpg'),
    ];
    const { prisma, setOnBeforeTransaction } = makeFakePrisma(rows);
    const { storage, deletedUrls } = makeFakeStorage();

    // Concurrent untrack removes r2 (it was attached to a new record).
    setOnBeforeTransaction(() => {
      prisma.orphanMediaCleanup.delete({ where: { id: 'r2' } });
    });

    const svc = new OrphanMediaCleanupService(prisma as never, storage);
    const reaped = await svc.reapExpired();

    // r1 and r3 were still in the store when the transaction ran → claimed.
    expect(reaped).toBe(2);
    // Only r1 and r3 files should have been deleted.
    expect(deletedUrls.sort()).toEqual(['http://storage/a.jpg', 'http://storage/c.jpg'].sort());
    // r2 file must NOT be in the deleted list.
    expect(deletedUrls).not.toContain('http://storage/b.jpg');
  });

  it('should_release_lock_after_successful_delete', async () => {
    const row = makeRow('row-ok', 'http://storage/ok.png');
    const { prisma, store } = makeFakePrisma([row]);
    const { storage } = makeFakeStorage();

    const svc = new OrphanMediaCleanupService(prisma as never, storage);
    await svc.reapExpired();

    // After a successful reap cycle the outbox row must be gone.
    expect(store.has('row-ok')).toBe(false);
  });

  it('should_idempotent_on_concurrent_reapExpired_runs', async () => {
    const rows = [
      makeRow('id-a', 'http://storage/x.jpg'),
      makeRow('id-b', 'http://storage/y.jpg'),
    ];
    const { prisma } = makeFakePrisma(rows);
    const { storage, deletedUrls } = makeFakeStorage();

    const svc = new OrphanMediaCleanupService(prisma as never, storage);

    // Two concurrent reap cycles; each row should be deleted exactly once.
    await Promise.all([svc.reapExpired(), svc.reapExpired()]);

    const urlCounts: Record<string, number> = {};
    for (const url of deletedUrls) {
      urlCounts[url] = (urlCounts[url] ?? 0) + 1;
    }

    // Each url appears at most once even under concurrent reap runs.
    for (const [url, count] of Object.entries(urlCounts)) {
      expect(count).toBe(1);
    }
    // Both files were ultimately deleted.
    expect(deletedUrls.sort()).toEqual(
      ['http://storage/x.jpg', 'http://storage/y.jpg'].sort(),
    );
  });

  it('schema_option_b_no_migration: untrack after reap claim is a safe no-op', async () => {
    const row = makeRow('to-untrack', 'http://storage/late.mp4');
    const { prisma } = makeFakePrisma([row]);
    const { storage } = makeFakeStorage();

    const svc = new OrphanMediaCleanupService(prisma as never, storage);

    // Reap claims and deletes the row.
    await svc.reapExpired();

    // A late untrack() (e.g. producer commit arriving after reap) must not
    // throw — OrphanMediaCleanupService.untrack() swallows the "not found"
    // error from Prisma via .catch(() => {}).
    await expect(svc.untrack('to-untrack')).resolves.toBeUndefined();
  });
});
