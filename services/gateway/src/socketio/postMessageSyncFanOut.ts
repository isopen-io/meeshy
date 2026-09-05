import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Message } from '@meeshy/shared/types/index';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ServerEmitIO } from './serverEmit';
import { enqueueForOfflineParticipants, type OfflineParticipantQueueDeps } from './offlineParticipantQueue';
import {
  emitUnreadCountsToRecipients,
  type UnreadCountReader,
  type UnreadBridgeBuilder,
} from './emitUnreadCountsToRecipients';
import { participantUserRoomTargets } from './emitToConversationParticipants';
import {
  PREVIEW_PRISM_PARTICIPANT_SELECT,
  resolveLastMessagePreviewPrism,
  toIsoOrNull,
  type PreviewPrismParticipant,
} from './utils/lastMessagePreviewPrism';
import { sharedPlaceFromMetadata } from '../services/location/sharedPlace';
import type { QueuedPayloadFor } from './queuedEventContract';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'postMessageSyncFanOut' });

/**
 * Extracted VERBATIM (pure "extract method") from
 * `MeeshySocketIOManager._broadcastNewMessage` — issue #5263, to bring
 * `MeeshySocketIOManager.ts` back under its size ratchet after #3614 added the
 * eight lines that pushed it over. No logic, ordering, error handling or
 * comment was changed — only moved here and rewired onto an explicit context
 * instead of `this`. This is the THIRD of "the three exit doors" a new
 * message goes through once `message:new` has been emitted: the offline-queue
 * enqueue, the `CONVERSATION_UPDATED` fan-out that bumps every participant's
 * conversation list, and the unread-badge fan-out.
 *
 * The collaborators this fan-out needs, kept structural wherever the callee
 * it forwards to already declares a structural shape
 * (`OfflineParticipantQueueDeps`, `UnreadCountReader`/`UnreadBridgeBuilder`) —
 * so this file stays testable without constructing the whole manager.
 */
export interface PostMessageSyncFanOutContext {
  readonly prisma: PrismaClient;
  readonly io: ServerEmitIO;
  readonly readStatusService: UnreadCountReader;
  readonly bridgeService?: UnreadBridgeBuilder;
  readonly deliveryQueue: OfflineParticipantQueueDeps['deliveryQueue'];
  readonly connectedUsers: OfflineParticipantQueueDeps['connectedUsers'];
}

export interface PostMessageSyncFanOutParams {
  readonly normalizedId: string;
  readonly message: Message;
  readonly broadcastPayload: QueuedPayloadFor<'new'>;
  readonly resolvedSenderId: string | null | undefined;
}

/**
 * 3. Synchronisation temps réel de la liste des conversations. Deux signaux
 *    par destinataire, partageant une SEULE requête participants :
 *    - CONVERSATION_UPDATED (bump lastMessageAt) → liste se re-trie et les
 *      conversations toutes neuves apparaissent même quand MESSAGE_NEW
 *      n'atteint aucun socket hors de ROOMS.conversation(id). Émis à TOUS
 *      les participants (expéditeur inclus — sa propre liste remonte aussi).
 *    - CONVERSATION_UNREAD_UPDATED (badge) → destinataires uniquement
 *      (l'expéditeur n'a pas de non-lu sur son propre message).
 *    Parité avec MessageHandler.broadcastNewMessage (chemin socket).
 *
 * L'appelant (`_broadcastNewMessage`) enveloppe cet appel dans le même
 * `try { ... } catch (syncError) { logger.warn('⚠️ [CONV_SYNC] …') }` qui
 * entourait ce bloc avant l'extraction : un accroc ici reste non-bloquant pour
 * le reste de la diffusion.
 */
export async function syncConversationListOnNewMessage(
  ctx: PostMessageSyncFanOutContext,
  params: PostMessageSyncFanOutParams,
): Promise<void> {
  const { normalizedId, message, broadcastPayload, resolvedSenderId } = params;

  // #3614 — NE PLUS gater ce bloc sur `if (senderId)`. Un message sans
  // expéditeur (agent, système — `Message.senderId` absent de l'objet JS
  // reçu par ce transport) sautait l'ENFILAGE hors ligne ci-dessous, la
  // SEULE voie par laquelle un destinataire déconnecté apprend jamais
  // l'existence de ce message. `senderId` reste lu pour l'exclusion
  // d'acteur (`actorParticipantId`/`actorUserId`, `emitUnreadCountsToRecipients`
  // — les deux acceptent déjà `null`) : sa présence ne conditionne plus
  // rien, elle ne fait plus que se PROPAGER. Parité avec le chemin WS
  // (`MessageHandler.broadcastNewMessage`), qui n'a jamais posé cette
  // garde — cf. `message-new-producer-parity.test.ts`.
  const senderId = message.senderId;
  // Une seule requête : superset (id + userId + joinedAt) pour les deux signaux
  //
  // Dans son PROPRE `try`, et rendue `undefined` — jamais `[]` — quand
  // elle tombe. Les deux formes se lisent pareil au site d'appel et ne
  // disent pas la même chose : `[]` affirme « la conversation n'a aucun
  // participant », `undefined` avoue « je ne sais pas ». La file hors
  // ligne ci-dessous traite les deux différemment, et c'est la seule des
  // trois consommatrices dont l'abandon soit DESTRUCTIF (cf. son bloc).
  let allParticipants: Array<PreviewPrismParticipant & { joinedAt: Date }> | undefined;
  try {
    allParticipants = await ctx.prisma.participant.findMany({
      where: {
        conversationId: normalizedId,
        isActive: true
      },
      // `user` (préférences de langue) : le Prisme de la ligne de liste,
      // résolu par destinataire ci-dessous. `joinedAt` reste requis par
      // `emitUnreadCountsToRecipients`, qui partage cette requête.
      select: { ...PREVIEW_PRISM_PARTICIPANT_SELECT, joinedAt: true }
    });
  } catch (err) {
    logger.warn('participant fetch failed — la file hors ligne fera sa propre requête', { error: err });
  }

  // File hors ligne — la TROISIÈME porte de sortie de ce message, et la
  // seule DURABLE. `message:new` ci-dessus ne sert que les sockets du
  // salon ; un destinataire déconnecté n'apprend jamais l'existence de
  // ce message autrement que par le rejeu de `_drainPendingMessages`.
  //
  // Elle passe AVANT les deux signaux cosmétiques qui suivent, et c'est
  // tout l'objet de sa place : elle en était l'AVAL, dans le même `try`,
  // sous un `catch` qui journalise « non-bloquant ». Un `emit` qui lève
  // (adaptateur ou encodeur en défaut) annulait alors le rejeu pour TOUS
  // les absents, en annonçant une perte cosmétique. Même règle qu'à
  // l'instantané de reconnexion, où le drain est placé HORS du `try`
  // pour qu'un accroc Mongo cosmétique n'échoue jamais le rejeu.
  //
  // `participants` reçoit `undefined` quand le superset est tombé :
  // l'unité partagée refait alors SA requête, qui ne demande que
  // `{id, userId}`. Lui passer `[]` la ferait enfiler pour personne —
  // perdre le message parce qu'une préférence de langue est illisible.
  //
  // Délègue à l'unité partagée (comme les trois autres transports) : la
  // copie inline qui vivait ici était le dernier appelant direct de
  // `deliveryQueue.enqueue` du dépôt, et son `payload as Record<string,
  // unknown>` le dernier endroit où une charge pouvait être ENFILÉE sous
  // une forme que le fil ne diffuse pas.
  await enqueueForOfflineParticipants(
    { deliveryQueue: ctx.deliveryQueue, prisma: ctx.prisma, connectedUsers: ctx.connectedUsers },
    {
      conversationId: normalizedId,
      // Les DEUX identités, comme le chemin WS : `message.senderId` porte
      // un `Participant.id` ici, un `User.id` ailleurs, et les deux
      // espaces d'ids ne se croisent jamais. `null`/`undefined` quand le
      // message n'a pas d'expéditeur — aucune exclusion d'acteur à faire.
      actorParticipantId: senderId,
      actorUserId: senderId,
      eventType: 'new',
      messageId: message.id,
      // Le corps DESTINATAIRE (cid-strippé), identique à l'émission live :
      // un rejeu portant le `clientMessageId` de l'auteur ferait fuiter son
      // espace d'ids optimistes dans celui d'un autre utilisateur.
      payload: broadcastPayload,
      participants: allParticipants,
    }
  );

  if (allParticipants) {
    // CONVERSATION_UPDATED → room user de CHAQUE participant (re-tri liste).
    // `updatedBy` est requis par ConversationUpdatedEventData (this.io est typé,
    // contrairement à MessageHandler) : c'est l'auteur du message qui déclenche
    // le bump (resolvedSenderId = User.id du sender, fallback participant id).
    const updatePayload = {
      conversationId: normalizedId,
      updatedBy: { id: resolvedSenderId ?? message.senderId ?? '' },
      // Chaîne ISO — voir `toIsoOrNull`. `|| new Date()` conservé : ce
      // chemin sert aussi des messages fabriqués (agent, traducteur) dont
      // le `createdAt` peut manquer, et la ligne de liste a besoin d'un
      // rang pour se trier.
      lastMessageAt: toIsoOrNull(message.createdAt || new Date()),
      lastMessageId: message.id,
      // `lastMessagePreview` sort de `resolveLastMessagePreviewPrism`
      // avec le reste de la paire, sous le même plafond qu'elle.
      // Un message position-seule a un `content` vide, donc un aperçu
      // vide : `location` est alors la SEULE chose dont la ligne de liste
      // dispose pour composer son libellé. Hissée ici comme les deux
      // autres émetteurs de ce payload le font déjà (`MessageHandler.ts`,
      // `emitConversationPreviewUpdate.ts`) — sans elle, ce chemin-ci
      // (REST/ZMQ, celui par lequel passe justement l'envoi d'un lieu)
      // laissait la ligne littéralement blanche.
      //
      // Clé ABSENTE quand le message n'a pas de position, jamais présente
      // à `null` : les clients écrivent `location` AVEC l'identité du
      // message, donc une clé nulle sur le chemin le plus fréquenté du
      // service effacerait une épingle correcte à chaque message texte.
      ...((): Record<string, unknown> => {
        const place = sharedPlaceFromMetadata((message as { metadata?: unknown }).metadata);
        return place ? { location: place } : {};
      })(),
      senderId: message.senderId,
      updatedAt: new Date().toISOString()
    };
    // `userId ?? id` (participantUserRoomTargets) : parité avec le chemin
    // socket de MessageHandler. Un participant sans compte a une room
    // personnelle nommée d'après son `Participant.id` — la sauter privait un
    // invité de lien partagé de tout re-tri de sa liste de conversations.
    //
    // Le Prisme est résolu PAR destinataire, depuis le MÊME `message` qui
    // alimente `message:new` ci-dessus : les deux événements portent donc
    // toujours la même carte, et le `conversation:updated` jumeau ne peut pas
    // arriver derrière pour effacer ce que `message:new` vient d'installer.
    for (const { room, participant } of participantUserRoomTargets(allParticipants)) {
      ctx.io.to(room).emit(SERVER_EVENTS.CONVERSATION_UPDATED, {
        ...updatePayload,
        ...resolveLastMessagePreviewPrism(participant, message)
      });
    }

    // Badge non-lu → destinataires uniquement (exclure l'expéditeur in-process).
    // Délégué à l'unité partagée par les trois transports d'envoi : la copie
    // inline qui vivait ici n'excluait l'expéditeur que par `Participant.id`,
    // correct sur CE chemin mais faux pour tout appelant portant un `User.id`.
    // La liste déjà chargée lui est passée — pas de seconde requête. Un
    // `senderId` absent fait no-op (`emitUnreadCountsToRecipients` retourne
    // tôt sans lui) — pas d'exclusion à faire, jamais une raison de sauter
    // l'enfilage ci-dessus.
    await emitUnreadCountsToRecipients({
      io: ctx.io,
      prisma: ctx.prisma,
      readStatusService: ctx.readStatusService,
      bridgeService: ctx.bridgeService,
      conversationId: normalizedId,
      senderId,
      participants: allParticipants,
      onError: (error) => logger.warn('unread count update failed', { error }),
    });
  }
}
