import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { incrementPostCounters } from './postCounters';

type PostViewCreditPrisma = Pick<PrismaClient, 'postView' | '$runCommandRaw'>;

/**
 * Dédup + incrément d'UN post : singleton `PostView` (postId,userId) + `viewCount`
 * au premier insert, `duration` promue au max sur ré-ouverture. Sorti de
 * `PostService` pour être appliqué IDENTIQUEMENT au post affiché, à la racine
 * d'un repost, et à l'engagement d'un lecteur (#10404) — même mécanique de
 * dédup, aucune règle nouvelle inventée pour l'un des trois.
 *
 * Retourne `true` UNIQUEMENT à la création du `PostView` (première vue).
 */
export async function creditPostView(
  prisma: PostViewCreditPrisma,
  { postId, userId, durationMs }: { readonly postId: string; readonly userId: string; readonly durationMs?: number },
): Promise<boolean> {
  const existing = await prisma.postView.findUnique({
    where: { postId_userId: { postId, userId } },
  });

  if (existing) {
    if (durationMs !== undefined) {
      // Le PostView est un singleton (postId,userId) : `duration` est le
      // signal watch-time du moteur reco/monétisation (cf. PostFeedService).
      // Une ré-ouverture plus courte (retap + swipe immédiat) ne doit JAMAIS
      // rétrograder la plus longue durée déjà observée — on conserve le max.
      const nextDuration = Math.max(existing.duration ?? 0, durationMs);
      if (nextDuration !== existing.duration) {
        await prisma.postView.update({
          where: { id: existing.id },
          data: { duration: nextDuration },
        });
      }
    }
    return false;
  }

  await prisma.postView.create({
    data: { postId, userId, duration: durationMs },
  });

  await incrementPostCounters(prisma, [postId], { viewCount: { increment: 1 } });

  return true;
}
