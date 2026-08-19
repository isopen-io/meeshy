/**
 * Retirer les notifications qu'une référence retirée avait produites — huitième
 * occurrence de la famille ouverte aux cycles 46 à 51.
 *
 * Même cause que ses aînées : le retrait est DOUX (la ligne `PostMention` est
 * supprimée, mais la notification vit dans une autre collection), le lien vers
 * le post vit dans un blob JSON — donc aucune relation déclarée ne pourrait
 * s'en charger — et la ligne garde une copie DÉNORMALISÉE de l'extrait, si
 * bien qu'aucun filtre à la lecture ne peut rattraper.
 *
 * RETRAIT, pas neutralisation : l'accès que la référence ouvrait vient d'être
 * révoqué, donc le `action: view_post` de la ligne mènerait à un contenu fermé.
 *
 * DEUX chemins JSON, comme pour les commentaires : `createPostMentionNotificationsBatch`
 * écrit `postId` dans `context` ET dans `metadata`. Ne filtrer que l'un des
 * deux laisserait la moitié des lignes en base.
 *
 * Best-effort — ne lève jamais. Une notification survivante ne doit pas
 * transformer une édition réussie en 500.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type RetractMentionPrisma = Pick<PrismaClient, 'notification'>;

/** Les deux types que le dépôt utilise pour une mention (`mention` est l'alias historique). */
const MENTION_TYPES = ['user_mentioned', 'mention'] as const;

export async function retractMentionNotifications(params: {
  prisma: RetractMentionPrisma;
  postId: string;
  departedUserIds: readonly string[];
  onError?: (error: unknown) => void;
}): Promise<void> {
  if (params.departedUserIds.length === 0) return;

  try {
    await params.prisma.notification.deleteMany({
      where: {
        userId: { in: [...params.departedUserIds] },
        type: { in: [...MENTION_TYPES] },
        OR: [
          { context: { path: ['postId'], equals: params.postId } },
          { metadata: { path: ['postId'], equals: params.postId } },
        ],
      },
    });
  } catch (error) {
    params.onError?.(error);
  }
}
