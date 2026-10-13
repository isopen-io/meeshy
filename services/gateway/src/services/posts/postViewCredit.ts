import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { incrementPostCounters } from './postCounters';
import { NOT_DELETED } from './postIncludes';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'postViewCredit' });

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

const isUniqueRace = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

/**
 * #10404 — un lecteur qui RÉAGIT à un post ou le COMMENTE l'a vu : sa vue est
 * créditée, avec la dédup de `creditPostView` (une vue par lecteur et par
 * post). `viewCount` ne comptait que l'événement `view` explicite, que la carte
 * du fil n'émet pas en likant ni en commentant : « N likes, 0 vue ». Posé côté
 * passerelle, le crédit vaut pour tous les clients, anciens compris.
 *
 * L'auteur n'est jamais compté — la règle de `recordView`. `authorId` évite la
 * relecture quand l'appelant l'a déjà. Un crédit qui échoue ne fait jamais
 * échouer le geste qui l'a porté.
 */
export async function creditEngagedReaderView(
  prisma: PostViewCreditPrisma & Pick<PrismaClient, 'post'>,
  { postId, userId, authorId }: { readonly postId: string; readonly userId: string; readonly authorId?: string },
): Promise<void> {
  try {
    const author = authorId ?? (await prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
      select: { authorId: true },
    }))?.authorId;
    if (!author || author === userId) return;
    await creditPostView(prisma, { postId, userId });
  } catch (error) {
    if (isUniqueRace(error)) return;
    log.warn('creditEngagedReaderView failed — gesture kept', {
      postId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
