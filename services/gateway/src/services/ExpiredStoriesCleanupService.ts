import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'ExpiredStoriesCleanupService' });

/**
 * Permanently removes story Posts whose `expiresAt` has lapsed.
 *
 * Without this, the read path filters expired stories at query time but the
 * docs accumulate forever in MongoDB — embedded `storyViews` and `reactions`
 * arrays keep growing on viral stories long after the story itself is hidden,
 * eating disk + complicating analytics. Plus expired stories surfaced through
 * back-paths that didn't include the `expiresAt > now` filter (e.g. bookmarks
 * for an expired story still resolved to its content).
 *
 * Soft-delete (set `isDeleted: true`) is used so any in-flight references
 * (cached `StoryItem` on a viewer's device, prefetched media URLs) keep working
 * for their TTL window. Hard-delete happens in a separate sweep below for
 * stories that have been soft-deleted past the retention window.
 */
export class ExpiredStoriesCleanupService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private softDeleteRetentionMs: number;
  private hardDeleteAgeMs: number;

  constructor(
    private prisma: PrismaClient,
    options: { softDeleteRetentionMs?: number; hardDeleteAgeMs?: number } = {},
  ) {
    // 6h soft-delete window: clients holding stale `StoryItem` refs from cache
    // can still resolve them while their own TTL is valid; new fetchers will
    // see the post as deleted.
    this.softDeleteRetentionMs = options.softDeleteRetentionMs ?? 6 * 60 * 60 * 1000;
    // 7d hard-delete grace: well past any reasonable client cache TTL.
    this.hardDeleteAgeMs = options.hardDeleteAgeMs ?? 7 * 24 * 60 * 60 * 1000;
  }

  start(intervalMs: number = 60 * 60 * 1000): void {
    // Run once immediately on boot to clear any backlog accumulated while the
    // service was offline, then on the regular interval.
    this.cleanup().catch((err) => log.warn('initial cleanup failed', { err }));
    this.interval = setInterval(() => {
      this.cleanup().catch((err) => log.warn('scheduled cleanup failed', { err }));
    }, intervalMs);
    log.info('expired-stories cleanup started', {
      intervalHours: intervalMs / (60 * 60 * 1000),
      softDeleteRetentionHours: this.softDeleteRetentionMs / (60 * 60 * 1000),
      hardDeleteAgeDays: this.hardDeleteAgeMs / (24 * 60 * 60 * 1000),
    });
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /// Two-stage cleanup:
  /// 1. Soft-delete `STORY` posts where `expiresAt < now()` and not already deleted.
  /// 2. Hard-delete soft-deleted stories whose `expiresAt` is older than
  ///    `hardDeleteAgeMs` (well past any client cache TTL).
  async cleanup(): Promise<{ softDeleted: number; hardDeleted: number }> {
    const now = new Date();
    const hardDeleteCutoff = new Date(now.getTime() - this.hardDeleteAgeMs);

    let softDeleted = 0;
    let hardDeleted = 0;

    try {
      const softResult = await this.prisma.post.updateMany({
        where: {
          type: 'STORY',
          expiresAt: { lt: now },
          isDeleted: false,
        },
        data: {
          isDeleted: true,
          deletedAt: now,
        },
      });
      softDeleted = softResult.count;
    } catch (err) {
      log.warn('soft-delete pass failed', { err });
    }

    try {
      // Find IDs to hard-delete first so we can dissolve FK relations.
      // The `PostReposts` relation uses onDelete: NoAction, so Prisma / MongoDB
      // will reject deleteMany if any other Post still references these via
      // `repostOfId`. We null out those references before deleting.
      const toDelete = await this.prisma.post.findMany({
        where: {
          type: 'STORY',
          isDeleted: true,
          expiresAt: { lt: hardDeleteCutoff },
        },
        select: { id: true },
      });

      if (toDelete.length > 0) {
        const ids = toDelete.map((p) => p.id);

        // Nullify repostOfId on any Post that reposts one of the to-be-deleted stories.
        await this.prisma.post.updateMany({
          where: { repostOfId: { in: ids } },
          data: { repostOfId: null },
        });

        // Now safe to delete.
        const hardResult = await this.prisma.post.deleteMany({
          where: { id: { in: ids } },
        });
        hardDeleted = hardResult.count;
      }
    } catch (err) {
      log.warn('hard-delete pass failed', { err });
    }

    if (softDeleted > 0 || hardDeleted > 0) {
      log.info('cleanup pass complete', { softDeleted, hardDeleted });
    }

    return { softDeleted, hardDeleted };
  }
}
