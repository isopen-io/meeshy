import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { incrementPostCounters } from './postCounters';
import { NOT_DELETED } from './postIncludes';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'postViewCredit' });

type PostViewCreditPrisma = Pick<PrismaClient, 'postView' | '$runCommandRaw'>;

/**
 * La vue d'UN compte sur UN post (#10483, règle du porteur 2026-10-13) :
 *
 *  - `viewCount` compte CHAQUE vue — un même lecteur peut revoir autant qu'il
 *    le veut, chaque fois compte (`repeat`, vrai par défaut) ;
 *  - la PREMIÈRE vue crée le singleton `PostView` (postId,userId) — la liste
 *    « vu par » — et monte `uniqueViewCount` ;
 *  - une ré-ouverture promeut `duration` au maximum, jamais en dessous.
 *
 * Appliquée IDENTIQUEMENT au post affiché et à la racine d'un repost.
 * `repeat: false` (l'engagement d'un lecteur, #10404) ne crédite que la
 * première vue : réagir n'est pas rouvrir.
 *
 * Retourne `true` UNIQUEMENT à la création du `PostView` (première vue).
 */
export async function creditPostView(
  prisma: PostViewCreditPrisma,
  { postId, userId, durationMs, surface, repeat = true }: {
    readonly postId: string;
    readonly userId: string;
    readonly durationMs?: number;
    readonly surface?: string;
    readonly repeat?: boolean;
  },
): Promise<boolean> {
  const existing = await prisma.postView.findUnique({
    where: { postId_userId: { postId, userId } },
  });

  if (existing) {
    await promoteDuration(prisma, existing, durationMs);
    if (repeat) await incrementPostCounters(prisma, [postId], { viewCount: { increment: 1 } });
    return false;
  }

  try {
    await prisma.postView.create({
      data: { postId, userId, duration: durationMs, ...(surface ? { surface } : {}) },
    });
  } catch (error) {
    if (!isUniqueRace(error)) throw error;
    if (repeat) await incrementPostCounters(prisma, [postId], { viewCount: { increment: 1 } });
    return false;
  }

  await incrementPostCounters(prisma, [postId], { viewCount: { increment: 1 }, uniqueViewCount: { increment: 1 } });

  return true;
}

/**
 * Le `PostView` est un singleton (postId,userId) : `duration` est le signal
 * watch-time du moteur reco/monétisation (cf. PostFeedService). Une
 * ré-ouverture plus courte ne rétrograde JAMAIS la plus longue durée observée.
 */
async function promoteDuration(
  prisma: PostViewCreditPrisma,
  existing: { readonly id: string; readonly duration: number | null },
  durationMs: number | undefined,
): Promise<void> {
  if (durationMs === undefined) return;
  const nextDuration = Math.max(existing.duration ?? 0, durationMs);
  if (nextDuration === existing.duration) return;
  await prisma.postView.update({ where: { id: existing.id }, data: { duration: nextDuration } });
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
    await creditPostView(prisma, { postId, userId, repeat: false });
  } catch (error) {
    if (isUniqueRace(error)) return;
    log.warn('creditEngagedReaderView failed — gesture kept', {
      postId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
