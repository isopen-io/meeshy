import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MediaStorage } from './MediaStorage';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'OrphanMediaCleanupService' });

/**
 * Producer + consumer for the `OrphanMediaCleanup` outbox.
 *
 * Producer side : `track()` is called BEFORE writing a file to storage as
 * part of a multi-step operation that might fail. `untrack()` is called on
 * successful commit so the row is removed.
 *
 * Consumer side : `reapExpired()` runs periodically (kicked off by
 * `start()`). It pages through rows whose `cleanupAfter` is in the past,
 * deletes the underlying file via the injected MediaStorage, and removes
 * the outbox row. Idempotent : a missing file is silently absorbed by
 * MediaStorage.delete(), so re-running the worker does not throw.
 *
 * Reference: SOTA audit Pilier 4.
 */
export class OrphanMediaCleanupService {
  /** Default scan interval (5 minutes). Override at boot for tests. */
  private static readonly DEFAULT_SCAN_INTERVAL_MS = 5 * 60 * 1000;
  /** Default expiry for new rows (1 hour). Producers may override per-call. */
  private static readonly DEFAULT_EXPIRY_MS = 60 * 60 * 1000;
  /** Page size for the worker so we never load the full table in memory. */
  private static readonly REAP_BATCH_SIZE = 100;

  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: MediaStorage,
  ) {}

  /**
   * Records a fileUrl in the outbox so the worker will eventually reap it
   * if the surrounding transaction does not commit. The producer MUST
   * pair this with an `untrack()` on successful commit.
   *
   * `expiryMs` controls how long the worker waits before considering the
   * file orphaned. Default 1 hour is well above any realistic publish
   * flow but small enough that genuinely-orphaned files don't pile up
   * for days.
   */
  async track(
    fileUrl: string,
    source: string,
    expiryMs: number = OrphanMediaCleanupService.DEFAULT_EXPIRY_MS,
  ): Promise<string> {
    const cleanupAfter = new Date(Date.now() + expiryMs);
    const row = await this.prisma.orphanMediaCleanup.create({
      data: { fileUrl, source, cleanupAfter },
      select: { id: true },
    });
    return row.id;
  }

  /** Removes an outbox row by id. Used after the surrounding transaction commits. */
  async untrack(rowId: string): Promise<void> {
    await this.prisma.orphanMediaCleanup.delete({ where: { id: rowId } }).catch(() => {
      // Already gone — idempotent.
    });
  }

  /** Convenience : track a batch of fileUrls and return their row ids. */
  async trackBatch(
    fileUrls: string[],
    source: string,
    expiryMs: number = OrphanMediaCleanupService.DEFAULT_EXPIRY_MS,
  ): Promise<string[]> {
    if (fileUrls.length === 0) return [];
    const cleanupAfter = new Date(Date.now() + expiryMs);
    const created = await Promise.all(
      fileUrls.map((fileUrl) =>
        this.prisma.orphanMediaCleanup.create({
          data: { fileUrl, source, cleanupAfter },
          select: { id: true },
        }),
      ),
    );
    return created.map((r) => r.id);
  }

  /** Convenience : remove a batch of outbox rows on transaction commit. */
  async untrackBatch(rowIds: string[]): Promise<void> {
    if (rowIds.length === 0) return;
    await this.prisma.orphanMediaCleanup
      .deleteMany({ where: { id: { in: rowIds } } })
      .catch(() => {
        // Already gone — idempotent.
      });
  }

  // MARK: - Worker loop

  /** Starts the periodic reap loop. Idempotent. */
  start(intervalMs: number = OrphanMediaCleanupService.DEFAULT_SCAN_INTERVAL_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.reapExpired().catch((err: unknown) => {
        log.error('Reap cycle failed', { error: (err as Error).message });
      });
    }, intervalMs);
    log.info('OrphanMediaCleanup worker started', { intervalMs });
  }

  /** Stops the periodic reap loop. Safe to call multiple times. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      log.info('OrphanMediaCleanup worker stopped');
    }
  }

  /**
   * Single sweep through expired rows. Caller is responsible for scheduling.
   * Returns the number of files actually deleted (excluding rows that
   * pointed at a non-existent file, which still count as a successful
   * cleanup since the outbox row is removed).
   */
  async reapExpired(): Promise<number> {
    const now = new Date();
    let totalReaped = 0;

    for (;;) {
      const batch = await this.prisma.orphanMediaCleanup.findMany({
        where: { cleanupAfter: { lte: now } },
        take: OrphanMediaCleanupService.REAP_BATCH_SIZE,
        orderBy: { cleanupAfter: 'asc' },
      });
      if (batch.length === 0) break;

      // Delete the storage objects in parallel — `MediaStorage.delete` is
      // idempotent so a no-op for already-purged files is harmless.
      await Promise.all(batch.map((row) => this.storage.delete(row.fileUrl)));

      // Remove the outbox rows in one query.
      await this.prisma.orphanMediaCleanup.deleteMany({
        where: { id: { in: batch.map((r) => r.id) } },
      });

      totalReaped += batch.length;

      // If the batch was full, there may be more — keep looping.
      if (batch.length < OrphanMediaCleanupService.REAP_BATCH_SIZE) break;
    }

    if (totalReaped > 0) {
      log.info('OrphanMediaCleanup reaped expired rows', { count: totalReaped });
    }
    return totalReaped;
  }
}
