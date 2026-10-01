import { enhancedLogger } from '../utils/logger-enhanced';
import { announceConversationActivity } from '../services/conversations/conversationActivity';
import type { ActivityPrisma } from './emitConversationActivityUpdate';
import type { ServerEmitIO } from './serverEmit';

const logger = enhancedLogger.child({ module: 'CallMessageBroadcasters' });

type MessageBroadcaster = (message: unknown, conversationId: string) => Promise<void>;

export interface CallMessageBroadcastTarget {
  setMessageBroadcaster(broadcaster: MessageBroadcaster): void;
  setMessageUpdateBroadcaster(broadcaster: MessageBroadcaster): void;
}

/** `User.id` de l'initiateur (l'auteur du message d'appel), sinon son `Participant.id`. */
function callActorKey(message: unknown): string | null {
  if (typeof message !== 'object' || message === null) return null;
  const sender = 'sender' in message ? message.sender : null;
  const senderUserId = typeof sender === 'object' && sender !== null && 'userId' in sender ? sender.userId : null;
  if (typeof senderUserId === 'string') return senderUserId;
  const senderId = 'senderId' in message ? message.senderId : null;
  return typeof senderId === 'string' ? senderId : null;
}

/**
 * **LES DEUX DIFFUSEURS DES MESSAGES D'APPEL — et l'activité qui les suit.**
 *
 * P3 — le résumé d'appel part par le chemin canonique de diffusion d'un message
 * (`message:new`) ; le message « en cours » s'édite en place à la fin de l'appel
 * (`message:edited`, aperçu, file hors ligne). Ce sont les SEULS chemins par
 * lesquels un message d'appel atteint les clients (`postLiveCallMessage`,
 * `postCallSummary` de `CallEventsHandler`).
 *
 * #9026 — un appel est une ACTIVITÉ : son début (message « en cours ») et son
 * issue (terminé, manqué, refusé — résumé créé OU édité) remontent la
 * conversation en tête pour TOUS ses participants. `announceConversationActivity`
 * écrit `lastActivityAt` (rechargement) et sert `listRankAt` à chacun (direct).
 * Ni le message « en cours » ni le résumé n'avancent `lastMessageAt`.
 *
 * L'annonce part même si la diffusion lève : le réessai de l'appelant relit un
 * appel déjà terminal et ne rediffuse rien, la remontée serait perdue. Elle
 * reste hors du chemin de l'erreur — la diffusion rend la sienne, intacte.
 */
export function wireCallMessageBroadcasters(params: {
  readonly handler: CallMessageBroadcastTarget;
  readonly prisma: ActivityPrisma;
  readonly getIO: () => ServerEmitIO | null | undefined;
  readonly broadcastMessage: MessageBroadcaster;
  readonly broadcastMessageEdited: MessageBroadcaster;
}): void {
  const { handler, prisma, getIO } = params;

  const announceCallActivity = (message: unknown, conversationId: string): void => {
    const actor = callActorKey(message);
    if (!actor) return;
    void announceConversationActivity({ prisma, io: getIO(), conversationId, at: new Date(), updatedByUserId: actor })
      .catch((error: unknown) => logger.warn('call activity not announced', { conversationId, error }));
  };

  const withActivity = (broadcast: MessageBroadcaster): MessageBroadcaster =>
    async (message, conversationId) => {
      try {
        await broadcast(message, conversationId);
      } finally {
        announceCallActivity(message, conversationId);
      }
    };

  handler.setMessageBroadcaster(withActivity(params.broadcastMessage));
  handler.setMessageUpdateBroadcaster(withActivity(params.broadcastMessageEdited));
}
