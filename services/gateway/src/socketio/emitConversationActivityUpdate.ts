import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';
import type { ConversationActiveCall } from '@meeshy/shared/types/conversation-preview';
import { listRankFromColumns } from '@meeshy/shared/utils/conversation-list-rank';
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

export type ActivityPrisma = Pick<PrismaClient, 'conversation' | 'message' | 'reaction' | 'callSession' | 'participant' | 'conversationShareLink'>;

export interface ConversationActivityUpdate {
  readonly conversationId: string;
  /** `User.id` de qui a déclenché la mise à jour (réagi, appelé). */
  readonly updatedByUserId: string;
  /**
   * Rediffuser la dernière réaction, relue depuis `Conversation.lastReactionId`.
   * Porte aussi le rang (`listRankAt`) à chaque participant (#9026).
   */
  readonly reaction?: boolean;
  /** Rediffuser l'appel en cours, relu depuis `Conversation.activeCallId`. */
  readonly call?: boolean;
  /**
   * Rediffuser le rang de la ligne (`listRankAt`), relu depuis
   * `Conversation.lastMessageAt` / `lastActivityAt`, à chaque participant —
   * une activité hors message vient d'être enregistrée (#9026 : appel, épingle).
   */
  readonly rank?: boolean;
  readonly onError?: (error: unknown) => void;
}

/**
 * Ce qui s'est passé DEPUIS le dernier message (#7545), poussé sur la liste de
 * conversations : `conversation:updated` porteur de `lastReaction` et/ou
 * `activeCall`, et de RIEN du groupe d'aperçu — ni `lastMessageId` ni
 * `lastMessageAt`.
 *
 * **La remontée d'une conversation par une activité est une règle SERVEUR**
 * (#9026, directive porteur du 2026-10-01, qui remplace la règle PAR LECTEUR de
 * #7592) : rang = max(`lastMessageAt`, `lastActivityAt`), le MÊME pour tous,
 * écrit une fois (`utils/conversation-list-rank.ts`). `GET /conversations` trie
 * dessus et le sert ; ici, CHAQUE participant reçoit `listRankAt` quand
 * l'événement parle d'une réaction (`reaction`) ou d'une activité (`rank`) —
 * sa ligne remonte en tête. Une mise à jour d'appel seule (`call`) ne porte
 * aucun rang : l'activité de l'appel arrive avec son message (début, fin).
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
  const sendsRank = update.reaction === true || update.rank === true;
  if (!io || (!sendsRank && !update.call)) return;
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { lastReactionId: true, activeCallId: true, lastMessageAt: true, lastActivityAt: true },
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
    // Le rang ne dépend pas du lecteur : un plancher d'historique illisible
    // retient l'extrait de la réaction, jamais la remontée de la ligne.
    const listRankAt = sendsRank ? listRankFromColumns(conversation)?.toISOString() ?? null : undefined;

    const { floors, unreadable } = update.reaction
      ? await loadHistoryFloorsForOrFail(prisma, participants)
      : { floors: [], unreadable: new Set<number>() };
    const readerIndex = new Map(participants.map((p, index) => [p.id, index]));
    const activeCall: ConversationActiveCall | null = resolveActiveCall(callRow as ActiveCallRow | null);
    const updatedAt = new Date().toISOString();

    for (const { room, participant } of participantUserRoomTargets(participants)) {
      const index = readerIndex.get(participant.id) ?? -1;
      const mayReadReaction = update.reaction === true && !unreadable.has(index);
      if (!mayReadReaction && !update.call && listRankAt === undefined) continue;
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
        ...(listRankAt !== undefined ? { listRankAt } : {}),
        ...(update.call ? { activeCall } : {}),
      });
    }
  } catch (error) {
    onError?.(error);
  }
}
