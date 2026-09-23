import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';
import type { ConversationActiveCall } from '@meeshy/shared/types/conversation-preview';
import { participantUserRoomTargets } from './emitToConversationParticipants';
import { PREVIEW_PARTICIPANT_SELECT } from './emitConversationPreviewUpdate';
import { loadHistoryFloorsForOrFail } from '../services/historyFloor';
import {
  LAST_REACTION_SELECT,
  resolveConversationLastReaction,
  type LastReactionRow,
} from '../routes/conversations/utils/last-reaction';
import { ACTIVE_CALL_SELECT, resolveActiveCall, type ActiveCallRow } from '../routes/conversations/utils/list-activity';
import type { ServerEmitIO } from './serverEmit';

export type ActivityPrisma = Pick<PrismaClient, 'conversation' | 'reaction' | 'callSession' | 'participant' | 'conversationShareLink'>;

export interface ConversationActivityUpdate {
  readonly conversationId: string;
  /** `User.id` de qui a déclenché la mise à jour (réagi, appelé). */
  readonly updatedByUserId: string;
  /** Rediffuser la dernière réaction, relue depuis `Conversation.lastReactionId`. */
  readonly reaction?: boolean;
  /** Rediffuser l'appel en cours, relu depuis `Conversation.activeCallId`. */
  readonly call?: boolean;
  readonly onError?: (error: unknown) => void;
}

/**
 * Ce qui s'est passé DEPUIS le dernier message (#7545), poussé sur la liste de
 * conversations : `conversation:updated` porteur de `lastReaction` et/ou
 * `activeCall`, et de RIEN du groupe d'aperçu — ni `lastMessageId` ni
 * `lastMessageAt`, donc aucun client ne réécrit sa ligne ni ne la réordonne sur
 * la foi de cet événement.
 *
 * **La remontée d'une conversation par une réaction est une règle de CLIENT,
 * dérivée des données** : rang = max(`lastMessageAt`, `lastReaction.createdAt`
 * quand `lastReaction.targetSenderUserId` est le lecteur). Elle vaut donc
 * identiquement pour cet événement et pour `GET /conversations`, qui porte le
 * même `lastReaction` — une réaction à MON message remonte ma ligne, une
 * réaction entre tiers s'affiche sans la réordonner (décision porteur, #7546).
 *
 * **Relu, jamais reçu** : l'état vient de la base (`lastReactionId`,
 * `activeCallId`) et non de l'appelant. Un retrait de réaction, un ajout
 * concurrent ou un appel qui se termine entre deux lectures convergent sur la
 * même dernière valeur, quel que soit l'ordre d'arrivée des appels.
 *
 * Par destinataire : l'extrait de la réaction est résolu par le Prisme de CHAQUE
 * lecteur et borné par SON plancher d'historique — un lecteur dont le plancher
 * est illisible ne reçoit pas la réaction (fail-closed), il reçoit l'appel.
 *
 * Best-effort : ne lève jamais, la mutation est déjà écrite.
 */
export async function emitConversationActivityUpdate(
  prisma: ActivityPrisma,
  io: ServerEmitIO | null | undefined,
  update: ConversationActivityUpdate,
): Promise<void> {
  const { conversationId, updatedByUserId, onError } = update;
  if (!io || (!update.reaction && !update.call)) return;
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { lastReactionId: true, activeCallId: true },
    });
    if (!conversation) return;

    const [reactionRow, callRow, participants] = await Promise.all([
      update.reaction && conversation.lastReactionId
        ? prisma.reaction.findUnique({ where: { id: conversation.lastReactionId }, select: LAST_REACTION_SELECT })
        : null,
      update.call && conversation.activeCallId
        ? prisma.callSession.findUnique({ where: { id: conversation.activeCallId }, select: ACTIVE_CALL_SELECT })
        : null,
      prisma.participant.findMany({ where: { conversationId, isActive: true }, select: PREVIEW_PARTICIPANT_SELECT }),
    ]);

    const { floors, unreadable } = update.reaction
      ? await loadHistoryFloorsForOrFail(prisma, participants)
      : { floors: [], unreadable: new Set<number>() };
    const readerIndex = new Map(participants.map((p, index) => [p.id, index]));
    const activeCall: ConversationActiveCall | null = resolveActiveCall(callRow as ActiveCallRow | null);
    const updatedAt = new Date().toISOString();

    for (const { room, participant } of participantUserRoomTargets(participants)) {
      const index = readerIndex.get(participant.id) ?? -1;
      const mayReadReaction = update.reaction === true && !unreadable.has(index);
      if (!mayReadReaction && !update.call) continue;
      const prefs = participant.user;
      const lastReaction = mayReadReaction
        ? resolveConversationLastReaction(reactionRow as LastReactionRow | null, {
            viewerLanguages: prefs
              ? resolveUserLanguagesOrdered(prefs, { deviceLocale: prefs.deviceLocale ?? undefined })
              : [],
            historyFloor: floors[index] ?? null,
          })
        : undefined;
      io.to(room).emit(SERVER_EVENTS.CONVERSATION_UPDATED, {
        conversationId,
        updatedBy: { id: updatedByUserId },
        updatedAt,
        ...(lastReaction !== undefined ? { lastReaction } : {}),
        ...(update.call ? { activeCall } : {}),
      });
    }
  } catch (error) {
    onError?.(error);
  }
}
