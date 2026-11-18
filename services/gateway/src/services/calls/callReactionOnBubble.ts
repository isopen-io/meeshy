import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { callSummaryClientMessageId } from '@meeshy/shared/utils/call-summary';
import type { ReactionService } from '../ReactionService';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { isEndToEndMode } from '../conversations/encryptionRegime';
import { PARTICIPATION_VIVANTE } from '../../routes/conversations/utils/access-control';
import { logger } from '../../utils/logger';

/**
 * LA RÉACTION D'APPEL SUR LA BULLE DE L'APPEL (#19650, décision par défaut D4).
 *
 * Chaque emoji envoyé pendant l'appel (`call:reaction`) devient, en plus de son
 * relais à la room de l'appel, la réaction de son auteur sur la bulle
 * « Appel … en cours » de la conversation de l'appel : visible dans le fil,
 * persistante, sans pourriel. Ajout seul et idempotent (un emoji déjà posé par
 * l'auteur ne réécrit rien), plafonné comme toute réaction, diffusé par
 * `reaction:added` à la conversation, sans notification. Ignorée dans une
 * conversation chiffrée de bout en bout : la passerelle n'y range aucun emoji
 * en clair (#13142).
 */

export type CallReactionOnBubbleDeps = {
  readonly prisma: Pick<PrismaClient, 'callSession' | 'message' | 'participant'>;
  readonly reactions: Pick<ReactionService, 'addReaction' | 'createUpdateEvent'>;
  readonly io: ServerEmitIO;
};

/** `true` quand une réaction neuve a été posée et diffusée. */
export async function reflectCallReactionOnBubble(
  deps: CallReactionOnBubbleDeps,
  input: { readonly callId: string; readonly userId: string; readonly emoji: string }
): Promise<boolean> {
  const call = await deps.prisma.callSession.findUnique({
    where: { id: input.callId },
    select: { conversationId: true, conversation: { select: { encryptionMode: true } } },
  });
  if (!call || isEndToEndMode(call.conversation?.encryptionMode)) return false;
  const { conversationId } = call;

  const bubble = await deps.prisma.message.findFirst({
    where: { conversationId, clientMessageId: callSummaryClientMessageId(input.callId), deletedAt: null },
    select: { id: true },
  });
  if (!bubble) return false;
  // #19676 — LE SIXIÈME TRANSPORT des réactions de message.
  //
  // Le seul verrou en amont, `resolveActiveCallParticipant`, ne pose que la
  // question de la participation à la SESSION D'APPEL (`!p.leftAt`) : jamais
  // celle de l'appartenance à la CONVERSATION. Un membre banni PENDANT qu'il
  // est dans l'appel — un modérateur qui bannit en cours d'appel — gardait donc
  // sa ligne de session, et son emoji était persisté sur la bulle du fil puis
  // diffusé en `reaction:added` à toute la room de la conversation dont il
  // venait d'être banni. La loi est `PARTICIPATION_VIVANTE`, comme aux cinq
  // portes de #19525 et au point de convergence (#19604).
  const author = await deps.prisma.participant.findFirst({
    where: { conversationId, userId: input.userId, ...PARTICIPATION_VIVANTE },
    select: { id: true },
  });
  if (!author) return false;

  const added = await deps.reactions
    .addReaction({ messageId: bubble.id, participantId: author.id, emoji: input.emoji, allowCallBubble: true })
    .catch((error: unknown) => {
      logger.debug('call-reaction: not placed on the call bubble', { callId: input.callId, error });
      return null;
    });
  if (!added || added.unchanged) return false;

  const event = await deps.reactions.createUpdateEvent(bubble.id, input.emoji, 'add', author.id, conversationId, input.userId);
  deps.io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.REACTION_ADDED, event);
  return true;
}
