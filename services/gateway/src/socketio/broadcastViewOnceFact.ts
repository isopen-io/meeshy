import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { MessageMutationManager } from './broadcastMessageMutation';
import type { QueuedPayloadFor } from './queuedEventContract';
import type { ServerEmitTarget } from './serverEmit';
import { conversationAudienceRooms, loadLiveParticipantTargets } from './conversationAudienceRooms';

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

function queuedFact(fact: ViewOnceFact, messageId: string): ViewOnceFact & { dedupKey?: string } {
  switch (fact.eventType) {
    case 'consumed':
      return {
        eventType: 'consumed',
        payload: fact.payload,
        dedupKey: `consumed:${messageId}:${fact.payload.participantId ?? fact.payload.userId}`,
      };
    case 'view-once-purged':
      return { eventType: 'view-once-purged', payload: fact.payload };
  }
}

/**
 * Un fait de vue unique (#18556) — une ouverture, ou la purge du contenu — part
 * vers la room de conversation ET les rooms personnelles des participants
 * vivants, en une diffusion, puis vers la file hors ligne de chaque absent,
 * l'ouvreur compris : ses autres appareils doivent apprendre qu'il a ouvert.
 * Ne lève jamais.
 */
export async function broadcastViewOnceFact(params: ViewOnceFactParams): Promise<void> {
  const { prisma, manager, conversationId, messageId, onError } = params;
  if (!manager) return;
  const fact: ViewOnceFact =
    params.eventType === 'consumed'
      ? { eventType: 'consumed', payload: params.payload }
      : { eventType: 'view-once-purged', payload: params.payload };

  const audience = await loadLiveParticipantTargets(prisma, conversationId, onError);
  try {
    emitFact(manager.getIO()?.to(conversationAudienceRooms(conversationId, audience)), fact);
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
