import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  retractedNotificationOf,
  type RetractedNotificationAnnouncer,
} from '../notifications/retractedNotifications';

/**
 * Retirer les notifications qu'un message a produites — le geste, isolé de ses
 * DEUX moments.
 *
 * Il vivait sous `private` dans `messageRemovalEffects`, appelé au seul instant
 * du rappel. Mais un rappel et l'éventail de notification du même message
 * COURENT L'UN CONTRE L'AUTRE, et fermer la course demande le même geste aux
 * deux bouts : au rappel, pour les lignes déjà écrites ; à la fin de l'éventail,
 * pour celles que le rappel n'a pas pu voir parce qu'elles n'existaient pas
 * encore. Deux copies auraient divergé comme les listes d'effets de suppression
 * avaient divergé avant `applyMessageRemovalEffects`.
 */

/**
 * Le port d'annonce et sa ligne vivent sous `notifications/`, à côté de leur
 * unique implémenteur : le retrait d'un POST en a le même besoin, et deux
 * déclarations rivales pour une seule règle valent moins que l'une ou l'autre.
 * Ré-exportés ici pour les importateurs historiques.
 */
export type {
  RetractedNotification,
  RetractedNotificationAnnouncer,
} from '../notifications/retractedNotifications';

/**
 * La seule surface Prisma que le retrait touche, énumérée pour qu'un appelant
 * sache exactement ce qu'il autorise.
 */
export type NotificationRetractionPrisma = Pick<PrismaClient, 'notification'>;

/**
 * Les notifications que le message a produites — et le contenu qu'elles en
 * gardent.
 *
 * `Notification.content` et `metadata.messagePreview` sont un EXTRAIT du
 * message, dénormalisé à la création (`createNotification`). Aucun filtre à la
 * lecture ne peut donc les rattraper : la ligne ne relit jamais le message, elle
 * en détient une copie. C'est ce qui distingue ce cas de l'inbox de mentions,
 * où la ligne `Mention` ne portait qu'une clé étrangère et où une garde
 * d'admission suffisait.
 *
 * La cascade `Notification.message` ne se déclenche pas : elle demande une
 * suppression PHYSIQUE, et le retrait doux ne bascule que `deletedAt`. La ligne
 * `Message` reste, donc les `Notification` aussi — même mécanisme que les
 * `TrackingLink` et les `Mention` survivants des cycles précédents.
 *
 * Retrait plutôt que neutralisation du contenu : une notification dont le
 * message n'existe plus n'a rien à afficher ET rien où mener — son
 * `action: view_message` ouvrirait une conversation sur un message absent.
 * C'est aussi le seul geste que les clients savent déjà recevoir
 * (`notification:deleted`, écouté par le web et par le SDK iOS).
 *
 * Le filtre porte sur `messageId`, PAS sur la conversation : les autres messages
 * gardent les leurs.
 */
export async function retractMessageNotifications(
  prisma: NotificationRetractionPrisma,
  messageId: string,
  announcer: RetractedNotificationAnnouncer | undefined
): Promise<void> {
  // `context` relu pour sa seule `conversationId` : la révocation push en a
  // besoin, le web et Android indexant leurs bannières par conversation. Et
  // `type` avec lui : seul un ARRIVAGE de message indexe sa bannière par
  // conversation, et sans le type le client ne peut pas le savoir. `delivery`
  // dit si un push est PARTI — sans lui il n'y a aucune bannière à retirer.
  const rows = await prisma.notification.findMany({
    where: { messageId },
    select: { id: true, userId: true, type: true, context: true, delivery: true },
  });
  if (rows.length === 0) return;
  const retracted = rows.map(retractedNotificationOf);

  // Filtré sur `messageId` et non sur les ids relus : une notification créée
  // entre la lecture et l'écriture part avec les autres. Elle n'est alors pas
  // annoncée — un écran en retard — là où la garder aurait laissé la copie du
  // contenu en base. Celles qui naissent APRÈS cette écriture sont fermées par
  // l'autre bout : la relecture d'après-éventail de `notifyMessageRecipients`.
  await prisma.notification.deleteMany({ where: { messageId } });

  // L'annonce APRÈS l'écriture durable, et jamais l'inverse : les compteurs
  // qu'elle recalcule doivent voir la base d'après le retrait.
  await announcer?.announceNotificationsRetracted(retracted);
}
