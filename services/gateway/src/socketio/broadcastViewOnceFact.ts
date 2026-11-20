import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { MessageMutationManager } from './broadcastMessageMutation';
import type { QueuedPayloadFor } from './queuedEventContract';
import type { ServerEmitTarget } from './serverEmit';
import { conversationAudienceRoomBatches, filterLiveAudience, loadLiveAudience } from './conversationAudienceRooms';

type ViewOnceFact =
  | { eventType: 'consumed'; payload: QueuedPayloadFor<'consumed'> }
  | { eventType: 'view-once-purged'; payload: QueuedPayloadFor<'view-once-purged'> };

export type ViewOnceFactParams = ViewOnceFact & {
  prisma: Pick<PrismaClient, 'participant'>;
  manager: Pick<MessageMutationManager, 'getIO' | 'enqueueOfflineMessageMutation'> | null | undefined;
  conversationId: string;
  messageId: string;
  onError?: (error: unknown) => void;
};

function emitFact(target: ServerEmitTarget | undefined, fact: ViewOnceFact): void {
  if (!target) return;
  switch (fact.eventType) {
    case 'consumed':
      target.emit(SERVER_EVENTS.MESSAGE_CONSUMED, fact.payload);
      return;
    case 'view-once-purged':
      target.emit(SERVER_EVENTS.MESSAGE_VIEW_ONCE_PURGED, fact.payload);
      return;
  }
}

/**
 * L'ouverture telle que la reçoit quiconque n'est PAS l'ouvreur : l'état du
 * compteur, sans personne. `userId` reste une chaîne — les décodeurs des trois
 * clients l'exigent — mais vide : aucun ne s'y reconnaît, aucun n'y lit un nom.
 */
function withoutOpener(payload: QueuedPayloadFor<'consumed'>): QueuedPayloadFor<'consumed'> {
  const { participantId: _participantId, ...counts } = payload;
  return { ...counts, userId: '' };
}

function queuedFact(fact: ViewOnceFact, messageId: string): ViewOnceFact & { dedupKey?: string } {
  switch (fact.eventType) {
    case 'consumed':
      return {
        eventType: 'consumed',
        payload: withoutOpener(fact.payload),
        dedupKey: `consumed:${messageId}:${fact.payload.viewOnceCount}`,
      };
    case 'view-once-purged':
      return { eventType: 'view-once-purged', payload: fact.payload };
  }
}

/**
 * Un fait de vue unique (#18556) — une ouverture, ou la purge du contenu — part
 * vers la room de conversation ET les rooms personnelles des participants
 * vivants, puis vers la file hors ligne de chaque absent. Ne lève jamais.
 *
 * QUI a ouvert ne part que chez l'ouvreur : ses autres appareils doivent
 * apprendre qu'il a ouvert, et c'est le seul usage que les trois clients font
 * de cette identité. Tous les autres — room de conversation, rooms
 * personnelles, file différée qui persiste 48 h — reçoivent le compteur seul :
 * une ouverture nominative est un accusé de lecture, et elle partait sans la
 * garde `showReadReceipts` ni l'exclusion des comptes bloqués. Ce qui n'est pas
 * émis n'a pas de garde à tenir.
 */
export async function broadcastViewOnceFact(params: ViewOnceFactParams): Promise<void> {
  const { prisma, manager, conversationId, messageId, onError } = params;
  if (!manager) return;
  const fact: ViewOnceFact =
    params.eventType === 'consumed'
      ? { eventType: 'consumed', payload: params.payload }
      : { eventType: 'view-once-purged', payload: params.payload };

  // #20007 — audience PAGINÉE, émission par LOTS : au-delà d'une page, un fait
  // de vue unique n'est plus perdu pour qui est resté sur la liste.
  const audience = await loadLiveAudience(prisma, conversationId, { onError });
  try {
    const io = manager.getIO();
    if (fact.eventType === 'consumed') {
      const openerKey = fact.payload.userId;
      const others = filterLiveAudience(audience, (participant) => (participant.userId ?? participant.id) !== openerKey);
      for (const rooms of conversationAudienceRoomBatches(conversationId, others)) {
        emitFact(io?.to(rooms), {
          eventType: 'consumed',
          payload: withoutOpener(fact.payload),
        });
      }
      emitFact(io?.to(ROOMS.user(openerKey)), fact);
    } else {
      for (const rooms of conversationAudienceRoomBatches(conversationId, audience)) {
        emitFact(io?.to(rooms), fact);
      }
    }
  } catch (error) {
    onError?.(error);
  }

  try {
    void Promise.resolve(
      manager.enqueueOfflineMessageMutation({
        conversationId,
        actorUserId: null,
        messageId,
        ...queuedFact(fact, messageId),
      }),
    ).catch((error: unknown) => onError?.(error));
  } catch (error) {
    onError?.(error);
  }
}
