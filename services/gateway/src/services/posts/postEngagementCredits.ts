import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { EngagementOperationKey } from '@meeshy/shared/types/engagement-operations';
import { EngagementService, type EngagementActivityOptions } from '../engagement/EngagementService';
import { PUBLICATION_OPERATION_BY_TYPE } from '../engagement/viewerPostPoints';
import type { RepostPassage } from './postVisibility';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'postEngagementCredits' });

/**
 * Les crédits du barème (#8959) que les gestes du fil déclenchent, hors du
 * chemin de la réponse. `PostService` dépasse le budget de taille : ce qui
 * décide QUAND un geste du fil crédite vit ici, et le service n'y ajoute qu'un
 * appel par geste.
 */
export type PostEngagementRecorder = Pick<EngagementService, 'recordActivity' | 'reclaimContent' | 'reclaimSource'>;

/**
 * Ce qu'un geste du fil déclare à son crédit : le POST où il a eu lieu est
 * REQUIS (#9569) — c'est lui qui reçoit les points dans ce que ce post a
 * rapporté au crédité. Il se nomme à part de `targetId`, qui porte les
 * plafonds : aimer un commentaire a pour cible le commentaire et pour post
 * celui qui le porte.
 */
export type PostEngagementActivity = EngagementActivityOptions & { readonly postId: string };

/** Crédit fire-and-forget : il ne fait jamais échouer le geste qui l'a déclenché. */
export function creditPostEngagement(
  prisma: PrismaClient,
  userId: string,
  operationKey: EngagementOperationKey,
  options: PostEngagementActivity,
  recorder: PostEngagementRecorder = new EngagementService(prisma),
): void {
  recorder.recordActivity(userId, operationKey, options).catch((error: unknown) => {
    log.warn(`engagement ${operationKey} failed`, { error });
  });
}

/**
 * Les posts qu'une RÉACTION crédite (#9584, décision porteur 2026-10-07) :
 * celui où elle atterrit et, si elle est passée par une REPUBLICATION SIMPLE
 * redirigée vers son original, cette republication aussi — chacun pour un
 * crédit RÉEL, avec son barème, ses quotas par cible et son auteur (« jamais
 * sur son propre post » s'y lit séparément). La somme des marques affichées est
 * donc toujours ce que le score a réellement reçu. Un commentaire, lui, ne
 * crédite que le post où il est rangé (`commentHome`).
 */
export const postsCreditedBy = (
  landed: RepostPassage,
  through: RepostPassage | null | undefined,
): readonly RepostPassage[] => [landed, ...(through && through.id !== landed.id ? [through] : [])];

/**
 * Un crédit par post crédité : la cible et son auteur portent les plafonds et
 * le refus de soi ; `source` — la ligne du contenu — rend chaque crédit unique
 * par post et repris quand le contenu est retiré.
 */
export function creditPostGesture(
  prisma: PrismaClient,
  userId: string,
  operationKey: EngagementOperationKey,
  gesture: { readonly posts: readonly RepostPassage[]; readonly source: string },
  recorder?: PostEngagementRecorder,
): void {
  gesture.posts.forEach((post) =>
    creditPostEngagement(
      prisma,
      userId,
      operationKey,
      { postId: post.id, targetId: post.id, targetOwnerId: post.authorId, receipt: gesture.source },
      recorder,
    ),
  );
}

/**
 * Un CONTENU retiré reprend ce qu'il a rapporté (#9584, décision porteur
 * 2026-10-07) — fire-and-forget : une reprise ratée ne fait jamais échouer le
 * retrait, et une reprise rejouée ne reprend rien (`EngagementReceipts`).
 */
export function reclaimContentCredits(
  prisma: PrismaClient,
  userId: string,
  source: string,
  options: { readonly withinClawback?: boolean } = {},
  recorder: PostEngagementRecorder = new EngagementService(prisma),
): void {
  recorder.reclaimSource(userId, source, options).catch((error: unknown) => {
    log.warn('engagement reclaim failed', { source, error });
  });
}

/** Les sources de crédit des contenus de post — une ligne, un préfixe. */
export const creditSource = {
  postReaction: (reactionId: string) => `post-reaction:${reactionId}`,
  comment: (commentId: string) => `comment:${commentId}`,
  commentReaction: (reactionId: string) => `comment-reaction:${reactionId}`,
  post: (postId: string) => `post:${postId}`,
} as const;

/**
 * Durée d'exposition au-delà de laquelle une vue de story compte comme
 * « vue jusqu'au bout » pour `tool.story_viewed`. Aucun client ne déclare
 * l'achèvement d'une story : la durée déclarée (bornée à cinq minutes par
 * `recordView`) en est le seul indice. Cinq secondes sont la durée par défaut
 * d'une slide statique — en dessous, la story a été passée, pas regardée.
 */
export const STORY_VIEWED_MIN_DURATION_MS = 5_000;

/**
 * `tool.story_viewed` — une NOUVELLE vue (la ligne `PostView` est unique par
 * lecteur et par story, donc chaque couple ne crédite qu'une fois) d'une
 * STORY par quelqu'un d'autre que son auteur, restée au moins
 * `STORY_VIEWED_MIN_DURATION_MS` à l'écran.
 */
export function creditStoryViewed(
  prisma: PrismaClient,
  params: {
    readonly viewerId: string;
    readonly story: { readonly id: string; readonly authorId: string; readonly type: string | null };
    readonly isNewView: boolean;
    readonly durationMs: number | undefined;
  },
  recorder?: PostEngagementRecorder,
): void {
  const { viewerId, story, isNewView, durationMs } = params;
  if (!isNewView || story.type !== 'STORY') return;
  if (durationMs === undefined || durationMs < STORY_VIEWED_MIN_DURATION_MS) return;
  creditPostEngagement(
    prisma,
    viewerId,
    'tool.story_viewed',
    { postId: story.id, targetId: story.id, targetOwnerId: story.authorId },
    recorder,
  );
}

/** L'opération de contenu lourd qu'un type de publication a créditée, si elle en a une. */
export function reclaimableContentOperation(type: string | null | undefined): EngagementOperationKey | null {
  return (type && PUBLICATION_OPERATION_BY_TYPE.get(type)) || null;
}

/**
 * Reprise anti-abus : un contenu lourd retiré dans la fenêtre du barème rend
 * ses points à son AUTEUR, quel que soit celui qui le retire — publier puis
 * supprimer en boucle ne doit rien rapporter, et un contenu retiré pour
 * modération non plus.
 */
export function reclaimRemovedContent(
  prisma: PrismaClient,
  post: { readonly id: string; readonly authorId: string; readonly type?: string | null },
  recorder: PostEngagementRecorder = new EngagementService(prisma),
): void {
  // Tout ce que la publication a rapporté à son auteur, hors mémoire par
  // contenu — une publication légère, l'axe outil, une republication — dans la
  // MÊME fenêtre que la mémoire (#9584) : la règle d'âge reste celle du barème.
  reclaimContentCredits(prisma, post.authorId, creditSource.post(post.id), { withinClawback: true }, recorder);
  const operationKey = reclaimableContentOperation(post.type);
  if (!operationKey) return;
  recorder.reclaimContent(post.authorId, operationKey, post.id).catch((error: unknown) => {
    log.warn(`engagement reclaim ${operationKey} failed`, { postId: post.id, error });
  });
}
