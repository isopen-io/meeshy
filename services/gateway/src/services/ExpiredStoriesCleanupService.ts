import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced';
import { getSharedNotificationService } from './notifications/notification-service-registry';
import type { RetractedNotificationAnnouncer } from './notifications/retractedNotifications';
import { retractPostNotifications } from './posts/retractPostNotifications';
import { SoundCaptureService } from './posts/SoundCaptureService';

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
 * Soft-delete (set `deletedAt`) is used so any in-flight references
 * (cached `StoryItem` on a viewer's device, prefetched media URLs) keep working
 * for their TTL window. Hard-delete happens in a separate sweep below for
 * stories that have been soft-deleted past the retention window.
 */
export class ExpiredStoriesCleanupService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private softDeleteRetentionMs: number;
  private hardDeleteAgeMs: number;
  /** Seul propriétaire de la logique d'usages : la purge ne la réimplémente pas. */
  private soundCaptureService: SoundCaptureService;

  constructor(
    private prisma: PrismaClient,
    options: { softDeleteRetentionMs?: number; hardDeleteAgeMs?: number } = {},
  ) {
    this.soundCaptureService = new SoundCaptureService(prisma);
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
    this.interval.unref?.();
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
  ///
  /// `announcer` — même résolution que `applyPostRemovalEffects` et
  /// `applyMessageRemovalEffects` : défaut de paramètre sur le service partagé
  /// du processus, le seul câblé avec `io`. Évalué à CHAQUE appel, ce qui est
  /// ici nécessaire et pas seulement commode — ce service est construit au
  /// démarrage, avant l'enregistrement du service partagé, donc une injection
  /// par constructeur capturerait `undefined` pour toujours.
  async cleanup(
    announcer: RetractedNotificationAnnouncer | undefined = getSharedNotificationService(),
  ): Promise<{ softDeleted: number; hardDeleted: number }> {
    const now = new Date();
    const hardDeleteCutoff = new Date(now.getTime() - this.hardDeleteAgeMs);

    let softDeleted = 0;
    let hardDeleted = 0;

    try {
      const softResult = await this.prisma.post.updateMany({
        where: {
          type: 'STORY',
          expiresAt: { lt: now },
          deletedAt: null,
        },
        data: {
          deletedAt: now,
        },
      });
      softDeleted = softResult.count;
    } catch (err) {
      log.warn('soft-delete pass failed', { err });
    }

    try {
      // Find IDs of expired stories eligible for hard-delete.
      const toDelete = await this.prisma.post.findMany({
        where: {
          type: 'STORY',
          deletedAt: { not: null },
          expiresAt: { lt: hardDeleteCutoff },
        },
        select: { id: true },
      });

      if (toDelete.length > 0) {
        const ids = toDelete.map((p) => p.id);

        // Reposts that reference these expired stories are deleted too — a
        // repost of a story dead for 7+ days has no value (stories are
        // ephemeral). Their comments share the same self-relation hazard,
        // so clear them in the same pass.
        const repostRows = await this.prisma.post.findMany({
          where: { repostOfId: { in: ids } },
          select: { id: true },
        });
        const repostIds = repostRows.map((p) => p.id);
        const allPostIds = [...ids, ...repostIds];

        // Les notifications que ces posts ont produites. Ancrées sur la
        // DESTRUCTION, pas sur l'expiration : tant que la story n'est que
        // périmée, sa notification reste une trace légitime — les deux clients
        // l'affichent marquée « expirée » depuis `context.postExpiresAt`, et
        // `getPostById` ne filtre pas l'expiration, donc la cible répond
        // encore. Ici les deux appuis tombent ensemble : la ligne garde une
        // copie dénormalisée d'un contenu qui n'existe plus, son `view_post`
        // n'ouvre qu'un 404, et son badge non lu ne peut plus être décrémenté.
        //
        // Placé AVANT toute suppression, et il REJETTE volontairement — même
        // raison que `releasePosts` juste en dessous : `context.postId` n'a ni
        // relation ni cascade, donc détruire les posts après un retrait en
        // échec laisserait des lignes que plus aucun chemin n'atteindrait, la
        // passe suivante ne voyant plus les posts. Le `catch` de cette passe
        // rattrape, la passe horaire suivante rejoue tout.
        await retractPostNotifications(this.prisma, allPostIds, announcer);

        // G7 — collect comment ids BEFORE deleting them: their media rows
        // (PostMedia.commentId, `onDelete: SetNull`) must be purged too.
        const commentRows = await this.prisma.postComment.findMany({
          where: { postId: { in: allPostIds } },
          select: { id: true },
        });
        const commentIds = commentRows.map((c) => c.id);

        // Clear PostComments BEFORE deleting the posts. The cascade from
        // Post→PostComment would otherwise hit the `CommentReplies`
        // self-relation (onDelete: NoAction): Prisma's MongoDB referential
        // emulation refuses to delete a parent comment still referenced by a
        // reply (P2014). Nulling parentId first breaks the relation at any
        // depth, then deleteMany is unconstrained.
        await this.prisma.postComment.updateMany({
          where: { postId: { in: allPostIds }, parentId: { not: null } },
          data: { parentId: null },
        });
        await this.prisma.postComment.deleteMany({
          where: { postId: { in: allPostIds } },
        });

        // Les usages meurent avec le post ; le Sound, lui, SURVIT.
        // `allPostIds` = stories expirées + leurs reposts. Ne PAS utiliser `ids`
        // (stories seules), qui laisserait les usages des reposts orphelins.
        // Délégué : `releasePosts` RECOMPTE `usageCount` depuis `SoundUsage` au
        // lieu de décrémenter à l'aveugle.
        //
        // Placé AVANT les suppressions de posts, et il REJETTE volontairement :
        // `SoundUsage.postId` n'a ni relation ni cascade, donc supprimer les
        // posts après un échec de libération laisserait des usages que plus
        // aucun chemin n'atteindrait. Le `catch` de cette passe rattrape, la
        // passe horaire suivante rejoue tout.
        await this.soundCaptureService.releasePosts(allPostIds);

        // G7 — PostMedia.post/.comment are `onDelete: SetNull`: without this
        // explicit purge every hard-deleted story left its media rows
        // orphaned (postId = null) FOREVER — stories are the most
        // media-heavy content and all of them expire. Disk-file reclamation
        // is a separate follow-up (fileUrl→path resolution, prod caution);
        // this closes the unbounded DB-row leak.
        const mediaResult = await this.prisma.postMedia.deleteMany({
          where: {
            OR: [
              { postId: { in: allPostIds } },
              { commentId: { in: commentIds } },
            ],
          },
        });
        if (mediaResult.count > 0) {
          log.info('purged media rows of hard-deleted stories', { count: mediaResult.count });
        }

        if (repostIds.length > 0) {
          const repostResult = await this.prisma.post.deleteMany({
            where: { id: { in: repostIds } },
          });
          if (repostResult.count > 0) {
            log.info('cascade-deleted reposts of expired stories', { count: repostResult.count });
          }
        }

        // Now safe to delete the parent stories.
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
