import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { EngagementOperationKey } from '@meeshy/shared/types/engagement-operations';
import { EngagementService, type EngagementActivityOptions } from '../engagement/EngagementService';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'postEngagementCredits' });

/**
 * Les crédits du barème (#8959) que les gestes du fil déclenchent, hors du
 * chemin de la réponse. `PostService` dépasse le budget de taille : ce qui
 * décide QUAND un geste du fil crédite vit ici, et le service n'y ajoute qu'un
 * appel par geste.
 */
export type PostEngagementRecorder = Pick<EngagementService, 'recordActivity' | 'reclaimContent'>;

/** Crédit fire-and-forget : il ne fait jamais échouer le geste qui l'a déclenché. */
export function creditPostEngagement(
  prisma: PrismaClient,
  userId: string,
  operationKey: EngagementOperationKey,
  options: EngagementActivityOptions,
  recorder: PostEngagementRecorder = new EngagementService(prisma),
): void {
  recorder.recordActivity(userId, operationKey, options).catch((error: unknown) => {
    log.warn(`engagement ${operationKey} failed`, { error });
  });
}

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
    { targetId: story.id, targetOwnerId: story.authorId },
    recorder,
  );
}

/** L'opération de contenu lourd qu'un type de publication a créditée, si elle en a une. */
export function reclaimableContentOperation(type: string | null | undefined): EngagementOperationKey | null {
  switch (type) {
    case 'POST':
      return 'content.post';
    case 'STORY':
      return 'content.story';
    case 'REEL':
      return 'content.reel';
    default:
      return null;
  }
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
  const operationKey = reclaimableContentOperation(post.type);
  if (!operationKey) return;
  recorder.reclaimContent(post.authorId, operationKey, post.id).catch((error: unknown) => {
    log.warn(`engagement reclaim ${operationKey} failed`, { postId: post.id, error });
  });
}
