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
 * Comme ses deux aînées (`retractPostNotifications`, `retractCommentNotifications`),
 * la suppression porte sur les ids RELUS et non sur le prédicat : l'ensemble
 * supprimé et l'ensemble annoncé sont alors identiques par construction, et
 * aucune ligne ne peut disparaître sans son `notification:deleted`. Sans cette
 * annonce, l'appareil du référencé garde la ligne et son badge non-lu — le
 * retrait ne se voyait qu'au prochain démarrage à froid, et le tap entre-temps
 * ouvrait un 404.
 *
 * Ce qu'elle ne reprend PAS de ses aînées : le drainage par lots. Leur cible
 * est une AUDIENCE que rien ne borne (les amis prévenus d'une publication, un
 * fil de commentaires entier) ; ici l'ensemble est borné par les partants d'une
 * seule édition, chacun porteur d'au plus une notification de mention sur ce
 * post. Une lecture unique le couvre, et la boucle n'aurait rien à drainer.
 *
 * Best-effort — ne lève jamais. Une notification survivante ne doit pas
 * transformer une édition réussie en 500.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import {
  retractedNotificationOf,
  type RetractedNotificationAnnouncer,
} from '../notifications/retractedNotifications';

export type RetractMentionPrisma = Pick<PrismaClient, 'notification'>;

/** Les deux types que le dépôt utilise pour une mention (`mention` est l'alias historique). */
const MENTION_TYPES = ['user_mentioned', 'mention'] as const;

export async function retractMentionNotifications(params: {
  prisma: RetractMentionPrisma;
  postId: string;
  departedUserIds: readonly string[];
  /**
   * Défaut = le service partagé du processus, le seul câblé avec `io`. Même
   * résolution que `applyPostRemovalEffects` : l'appelant n'a rien à câbler, et
   * un appelant hors serveur (worker, script, test) retire quand même les
   * lignes, sans annonce.
   */
  announcer?: RetractedNotificationAnnouncer;
  onError?: (error: unknown) => void;
}): Promise<void> {
  if (params.departedUserIds.length === 0) return;

  const announcer = params.announcer ?? getSharedNotificationService();

  try {
    const rows = await params.prisma.notification.findMany({
      where: {
        userId: { in: [...params.departedUserIds] },
        type: { in: [...MENTION_TYPES] },
        OR: [
          { context: { path: ['postId'], equals: params.postId } },
          { metadata: { path: ['postId'], equals: params.postId } },
        ],
      },
      // `delivery` : la révocation push ne réveille un appareil que là où un
      // push est parti (cf. `retractedNotificationOf`).
      select: { id: true, userId: true, delivery: true },
    });
    if (rows.length === 0) return;

    await params.prisma.notification.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });

    // L'annonce APRÈS l'écriture durable, et jamais l'inverse : les compteurs
    // qu'elle recalcule doivent voir la base d'après le retrait.
    await announcer?.announceNotificationsRetracted(rows.map(retractedNotificationOf));
  } catch (error) {
    params.onError?.(error);
  }
}
