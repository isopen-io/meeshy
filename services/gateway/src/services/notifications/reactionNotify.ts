import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { NotificationService } from './NotificationService';
import {
  retractReactionNotifications,
  type ReactionNotificationRetractionPrisma,
  type RemovedReaction,
} from './retractReactionNotifications';

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

/**
 * Injecté pour que la suite observe le retrait sans monter Mongo. Défaut : la
 * vraie fonction — un appelant qui ne l'override pas obtient le comportement
 * de production, et il n'existe donc pas de câblage à oublier.
 */
export type ReactionNotificationRetracting = (
  prisma: ReactionNotificationRetractionPrisma,
  removed: RemovedReaction,
  announcer: { announceNotificationsRetracted(retracted: readonly { readonly id: string; readonly userId: string }[]): Promise<void> } | undefined
) => Promise<number>;

/**
 * RETIRE la notification `message_reaction` qu'un ajout de réaction avait
 * produite, quand cette réaction est défaite.
 *
 * SOURCE UNIQUE partagée par les trois transports du dé-réagir — le handler
 * socket (`reaction:remove`), la route REST (`DELETE /reactions/…`) et la route
 * avancée des messages — exactement comme `notifyReactionAdded` l'est pour
 * l'ajout. Le motif de dérive que ce fichier existe pour fermer est déjà arrivé
 * une fois dans un sens (la route REST notifiait sans jamais créer) ; le poser
 * ici empêche qu'il arrive dans l'autre.
 *
 * **La résolution `Participant.id` → `User.id` est la raison d'être de cette
 * fonction.** Les transports manipulent des `Participant.id` ; la notification,
 * elle, a été écrite avec `actor.id = User.id`. Un retrait branché directement
 * sur `retractReactionNotifications` avec l'id reçu du transport ne matcherait
 * JAMAIS — et le dirait d'autant moins que l'ensemble vide est le cas nominal :
 * le throttle par paire (`shouldCreateReactionNotification`) fait que la
 * plupart des réactions ne produisent aucune ligne.
 *
 * Ce que le retrait ne fait PAS, et que l'ajout fait : relire le message. La
 * conjonction (type × `context.messageId` × acteur × emoji) désigne la ligne à
 * elle seule ; lire l'auteur ne servirait qu'à re-dériver un `userId` que la
 * projection rend déjà. Sur un chemin qui s'exécute après l'ACK et dont le cas
 * nominal ne retire rien, c'est un aller-retour de moins par dé-réaction.
 *
 * No-op si le réacteur est anonyme (il n'a pas de `User.id`, donc son ajout
 * n'avait rien notifié) ou si son `Participant` n'a pas de compte.
 */
export async function notifyReactionRemoved(
  deps: {
    prisma: PrismaClient;
    notificationService: NotificationService;
    /** Point d'injection de test ; la production laisse le défaut. */
    retract?: ReactionNotificationRetracting;
  },
  params: {
    messageId: string;
    /** Participant.id du réacteur (PAS le User.id). */
    reactorParticipantId: string;
    emoji: string;
    isAnonymous: boolean;
  }
): Promise<void> {
  if (params.isAnonymous) return;

  const reactorParticipant = await deps.prisma.participant.findUnique({
    where: { id: params.reactorParticipantId },
    select: { userId: true },
  });

  const reactorUserId = reactorParticipant?.userId;
  if (!reactorUserId) return;

  const retract = deps.retract ?? retractReactionNotifications;
  await retract(
    deps.prisma as unknown as ReactionNotificationRetractionPrisma,
    {
      subject: { kind: 'message', id: params.messageId },
      actorId: reactorUserId,
      emoji: params.emoji,
    },
    deps.notificationService
  );
}
