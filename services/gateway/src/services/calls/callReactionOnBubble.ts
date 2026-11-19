import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { callSummaryClientMessageId } from '@meeshy/shared/utils/call-summary';
import type { ReactionService } from '../ReactionService';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { isEndToEndMode } from '../conversations/encryptionRegime';
import { PARTICIPATION_VIVANTE } from '../../routes/conversations/utils/access-control';
import { participantKeyWhere } from '../../socketio/departed-member-participant-where';
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
  // #19676 — LE SIXIÈME TRANSPORT des réactions de message, et ce `where`
  // répondait FAUX à deux questions distinctes.
  //
  // **L'APPARTENANCE.** Le seul verrou en amont,
  // `resolveActiveCallParticipant`, ne pose que la question de la participation
  // à la SESSION D'APPEL (`!p.leftAt`) : jamais celle de l'appartenance à la
  // CONVERSATION. La loi est `PARTICIPATION_VIVANTE`, comme aux cinq portes de
  // #19525 et au point de convergence (#19604).
  //
  // L'état qu'elle refuse — `isActive: true, bannedAt ≠ null` — est produit par
  // du code VIVANT, et pas par celui qu'on croit : bannir un membre ACTIF écrit
  // `isActive: false` (`conversationBanState.ts`, seul écrivain de la colonne),
  // donc le filtre nu refusait déjà ce cas. Le producteur est une COURSE entre
  // une rentrée et un bannissement — `REJOIN_PARTICIPANT_STATE` rallume
  // `isActive` sans effacer `bannedAt`, délibérément, sur la foi que « les trois
  // portes refusent un banni en amont », ce qui ne tient pas dans la fenêtre
  // entre la décision `rejoin` et son écriture (#19688, qui tarit la source).
  //
  // **L'IDENTITÉ**, et c'est l'autre moitié : `input.userId` vient de
  // `resolveActiveCallParticipant`, dont le doc-comment dit que ce champ
  // retombe sur le `Participant.id` pour un INVITÉ DE LIEN (pas de ligne
  // `User` à viser). `where: { userId: <Participant.id> }` n'apparie donc rien,
  // et le symptôme est un `return false` SILENCIEUX : l'emoji d'un invité de
  // lien partait en direct à la room de l'appel et n'atterrissait jamais sur la
  // bulle du fil, quand celui de tout inscrit y atterrissait. La colonne se
  // choisit par `participantKeyWhere` (#10473), que ce module emploie déjà
  // vingt lignes plus haut (`socketio/call-participants.ts`).
  //
  // Les deux prédicats se composent par `AND` et JAMAIS par double spread :
  // chacun rend une clé `OR`, et le second écraserait le premier en silence
  // (`utils/prisma-unset.ts` le dit de `unsetOrNull`).
  const author = await deps.prisma.participant.findFirst({
    where: { conversationId, AND: [participantKeyWhere(input.userId), PARTICIPATION_VIVANTE] },
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
