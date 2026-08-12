import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { NotificationService } from './NotificationService';

/**
 * Crée la notification `message_reaction` pour l'auteur d'un message qui vient
 * de recevoir une réaction.
 *
 * SOURCE UNIQUE partagée par le handler socket (`reaction:add`) ET la route REST
 * (`POST /reactions`). Historiquement seul le chemin socket notifiait ; la route
 * REST (utilisée par l'outbox iOS) avait dérivé sans création de notification,
 * d'où l'absence totale de notifs de réaction côté destinataires. Garder les deux
 * transports sur ce helper élimine la dérive à la racine.
 *
 * No-op si : réacteur anonyme, message/auteur introuvable, ou auto-réaction
 * (auteur === réacteur). L'anti-spam (throttle sender→recipient) est appliqué en
 * aval par `NotificationService.createReactionNotification`.
 *
 * `messageId` et `reactorParticipantId` sont des identifiants Participant ; on les
 * résout en `User.id` pour la notification. Fonction sans effet de bord autre que
 * la notification — testable en isolant prisma + notificationService.
 */
export async function notifyReactionAdded(
  deps: { prisma: PrismaClient; notificationService: NotificationService },
  params: {
    messageId: string;
    /** Participant.id du réacteur (PAS le User.id). */
    reactorParticipantId: string;
    emoji: string;
    isAnonymous: boolean;
  }
): Promise<void> {
  if (params.isAnonymous) return; // Pas de notifications pour les anonymes

  const message = await deps.prisma.message.findUnique({
    where: { id: params.messageId },
    select: { senderId: true, conversationId: true },
  });

  if (!message || !message.senderId) return;

  // Résoudre senderId (Participant.id) → User.id pour l'auteur ET le réacteur.
  const [authorParticipant, reactorParticipant] = await Promise.all([
    deps.prisma.participant.findUnique({
      where: { id: message.senderId },
      select: { userId: true },
    }),
    deps.prisma.participant.findUnique({
      where: { id: params.reactorParticipantId },
      select: { userId: true },
    }),
  ]);

  const authorUserId = authorParticipant?.userId;
  const reactorUserId = reactorParticipant?.userId;

  // Pas de notification pour une auto-réaction.
  if (!authorUserId || !reactorUserId || authorUserId === reactorUserId) return;

  await deps.notificationService.createReactionNotification({
    messageAuthorId: authorUserId,
    reactorUserId,
    messageId: params.messageId,
    conversationId: message.conversationId,
    reactionEmoji: params.emoji,
  });
}
