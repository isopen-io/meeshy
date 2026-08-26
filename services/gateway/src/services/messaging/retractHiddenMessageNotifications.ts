import type { Prisma } from '@meeshy/shared/prisma/client';
import { logger } from '../../utils/logger';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import {
  retractedNotificationOf,
  type RetractedNotificationAnnouncer,
} from '../notifications/retractedNotifications';
import type { NotificationRetractionPrisma } from './retractMessageNotifications';

/**
 * Ce qu'un masquage PERSONNEL doit encore retirer : la copie du message que la
 * notification détient.
 *
 * `retractMessageNotifications` porte déjà l'argument, pour le rappel :
 * « `Notification.content` et `metadata.messagePreview` sont un EXTRAIT du
 * message, dénormalisé à la création. Aucun filtre à la lecture ne peut donc les
 * rattraper : la ligne ne relit jamais le message, elle en détient une copie. »
 * La conséquence pour « supprimer pour moi » et « effacer l'historique » est la
 * même et n'avait pas été tirée : la conversation cesse de montrer le message —
 * les sept surfaces de lecture l'appliquent, et depuis peu les trois compteurs
 * de non-lus aussi — pendant que la cloche continue d'en afficher l'extrait, avec
 * un `action: view_message` qui ouvre une conversation sur un message que ce
 * lecteur ne verra pas.
 *
 * Retrait plutôt que neutralisation, pour la raison déjà écrite deux fois dans
 * ce dépôt : une notification dont le contenu n'a plus le droit d'être montré
 * n'a rien à afficher ET rien où mener, et `notification:deleted` est le seul
 * geste que les clients savent recevoir.
 *
 * **Ce que ce module ne fait PAS, et pourquoi.** `restore-for-me` ne ressuscite
 * pas la notification : la copie a été détruite, et la reconstruire depuis le
 * message reviendrait à fabriquer une notification qui n'a jamais été émise —
 * avec un `createdAt` qui mentirait sur l'instant de l'évènement. Le message
 * redevient visible dans la conversation ; sa notification, elle, appartient au
 * passé.
 *
 * **Posture d'échec** : ces fonctions ne lèvent jamais. Elles sont appelées
 * APRÈS une écriture qui a déjà réussi ; faire échouer « supprimer pour moi »
 * parce qu'un nettoyage de cloche a échoué dirait au lecteur que la suppression
 * n'a pas eu lieu alors qu'elle a eu lieu. L'échec est journalisé, et la copie
 * survit jusqu'au prochain masquage — un état dégradé, pas un mensonge.
 */

/**
 * Le geste, une seule fois : lire les lignes visées, les détruire, les annoncer.
 *
 * Le filtre de destruction est celui de la LECTURE, pas la liste d'ids relus :
 * une notification créée entre les deux part avec les autres. Elle n'est alors
 * pas annoncée — un écran en retard — là où la garder aurait laissé la copie du
 * contenu en base. Même arbitrage que `retractMessageNotifications`.
 */
async function retract(
  prisma: NotificationRetractionPrisma,
  where: Prisma.NotificationWhereInput,
  announcer: RetractedNotificationAnnouncer | undefined,
  context: Record<string, unknown>
): Promise<number> {
  try {
    const rows = await prisma.notification.findMany({
      where,
      // `context` (sa `conversationId`), `type` et `delivery` pour la
      // révocation push : cf. `retractedNotificationOf`.
      select: { id: true, userId: true, type: true, context: true, delivery: true },
    });
    if (rows.length === 0) return 0;
    const retracted = rows.map(retractedNotificationOf);

    await prisma.notification.deleteMany({ where });

    // L'annonce APRÈS l'écriture durable, et jamais l'inverse : les compteurs
    // qu'elle recalcule doivent voir la base d'après le retrait. Son échec est
    // gardé SÉPARÉMENT du retrait : un écran qui n'a pas reçu l'avis n'annule
    // pas une destruction qui a bien eu lieu, et le compte rendu doit dire ce
    // qui a été détruit, pas ce qui a été annoncé.
    try {
      await announcer?.announceNotificationsRetracted(retracted);
    } catch (error) {
      logger.warn('[retractHiddenMessageNotifications] retrait fait, annonce impossible', {
        ...context,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return retracted.length;
  } catch (error) {
    logger.warn('[retractHiddenMessageNotifications] retrait impossible, copie conservée', {
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

export interface RetractHiddenMessagesParams {
  readonly userId: string;
  readonly messageIds: readonly string[];
}

/**
 * « Supprimer pour moi », unitaire ou en lot : les notifications de CE lecteur
 * pour CES messages. Les autres participants gardent les leurs — c'est la
 * différence exacte avec le rappel, qui filtre sur `messageId` seul.
 */
export async function retractNotificationsForHiddenMessages(
  prisma: NotificationRetractionPrisma,
  { userId, messageIds }: RetractHiddenMessagesParams,
  announcer: RetractedNotificationAnnouncer | undefined = getSharedNotificationService()
): Promise<number> {
  if (messageIds.length === 0) return 0;

  return retract(
    prisma,
    { userId, messageId: { in: [...messageIds] } },
    announcer,
    { userId, messageCount: messageIds.length }
  );
}

export interface RetractClearedHistoryParams {
  readonly userId: string;
  readonly conversationId: string;
  readonly before: Date;
}

/**
 * « Effacer l'historique » : les notifications de CE lecteur pour les messages
 * de CETTE conversation antérieurs à la coupure.
 *
 * Le filtre passe par la relation `Notification.message` plutôt que par
 * `context.conversationId` (un chemin JSON) : la colonne `messageId` est une vraie
 * clé étrangère indexée, et une notification qui ne pointe aucun message — une
 * demande d'amitié, un rappel d'appel — ne matche pas une relation absente, ce
 * qui est précisément le comportement voulu. La borne est STRICTEMENT
 * antérieure, miroir exact de `clearHistoryBefore` côté lecture, où un message
 * écrit à la coupure reste visible (`createdAt: { gte: cutoff }`).
 */
export async function retractNotificationsForClearedHistory(
  prisma: NotificationRetractionPrisma,
  { userId, conversationId, before }: RetractClearedHistoryParams,
  announcer: RetractedNotificationAnnouncer | undefined = getSharedNotificationService()
): Promise<number> {
  return retract(
    prisma,
    { userId, message: { is: { conversationId, createdAt: { lt: before } } } },
    announcer,
    { userId, conversationId }
  );
}
