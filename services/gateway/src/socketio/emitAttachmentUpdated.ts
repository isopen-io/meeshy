import { PARTICIPATION_VIVANTE } from '../routes/conversations/utils/access-control';
import { PLAN_UNAVAILABLE } from './planOutcome';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { blockedReaderKeys, messageReadership } from './editedAudience';
import {
  emitToConversationParticipants,
  type ConversationRoomEmitter,
  type ParticipantRoomTarget,
} from './emitToConversationParticipants';
import { enqueueForOfflineParticipants, type OfflineParticipantQueueDeps } from './offlineParticipantQueue';
import { readerSignedPlanForMessageIdBestEffort } from './readerSignedDelivery';
import { safeBroadcast } from './serverEmit';
import { serializeAttachmentForSocket, type SocketAttachmentRow } from './serializeAttachmentForSocket';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { queuedEventSealsAtRest } from '../services/messaging/serverAtRest';

const logger = enhancedLogger.child({ module: 'emitAttachmentUpdated' });

export interface AttachmentUpdatedParams {
  io: ConversationRoomEmitter | null | undefined;
  prisma: Pick<PrismaClient, 'participant' | 'conversationShareLink' | 'message'>;
  deliveryQueue: OfflineParticipantQueueDeps['deliveryQueue'];
  connectedUsers: OfflineParticipantQueueDeps['connectedUsers'];
  conversationId: string;
  messageId: string;
  /**
   * The freshly-read attachment row (or a record of the same shape) —
   * `attachmentSocketSelect`-shaped, protection columns included (#7028):
   * `serializeAttachmentForSocket` is fail-closed on their absence.
   */
  attachment: SocketAttachmentRow;
}

/**
 * Broadcast a `message:attachment-updated` delta after an async worker
 * (Whisper transcription finalized, NLLB+Chatterbox TTS finalized for one
 * language, …) enriched an attachment in the DB, so clients reflect the new
 * payload without re-fetching the whole message.
 *
 * The enrichment owes the SAME three audiences every other conversation event
 * owes, and it used to serve exactly one of them (`io.to(conversation:<id>)`):
 *
 *  1. participants sitting in the conversation → the room emit;
 *  2. participants who have not opened this thread since launch → their
 *     personal room. iOS joins a `conversation:<id>` room only when the thread
 *     is opened (`roomsToRejoinOnConnect`), so a reader on the conversation
 *     list is in NO conversation room at all: the transcription and the
 *     translated audio never reached their cache, and only an unrelated
 *     refetch could repair it. Their SDK applies the delta conversation-
 *     agnostically (`ConversationSyncEngine.handleAttachmentUpdated` patches
 *     the cached message of any conversation, no-op when absent), so the
 *     personal room is not a broader audience for its own sake — it is where
 *     the write actually lands;
 *  3. participants who are OFFLINE right now → the delivery queue, replayed by
 *     `_drainPendingMessages`. The `message:new` queued at SEND time carries
 *     the attachment as it was then — no transcription, no translated audio —
 *     so without this the replayed message is permanently the un-enriched one.
 *
 * This is the same defect class as the list-row preview that never re-served
 * its translation: the Prisme ("le prisme s'applique à TOUT le contenu,
 * transcriptions audio comprises") became a function of the reader's ROUTE —
 * having the thread open when Whisper happened to finish — rather than of
 * their language preferences.
 *
 * Chaining (`emitToConversationParticipants`) rather than looping matters: a
 * socket sitting in the conversation room AND in its own user room must receive
 * ONE copy, not two.
 *
 * The payload is NOT trimmed per recipient language, unlike `message:new`
 * (`filterMessagePayloadForLanguages`). Deliberate: clients REPLACE the
 * attachment's translation map with what this event carries (iOS
 * `handleAttachmentUpdated`, web `use-socket-cache-sync`), so a per-reader
 * subset would delete the other languages a previous REST fetch had cached.
 *
 * Best-effort side channel — never throws. The enrichment is already committed
 * by the time this runs. A participant lookup that fails degrades to the
 * conversation room alone (the previous behaviour) rather than emitting
 * nothing: the readers watching the media right now are the ones in it.
 */
export async function emitAttachmentUpdated(params: AttachmentUpdatedParams): Promise<void> {
  const { io, prisma, deliveryQueue, connectedUsers, conversationId, messageId, attachment } = params;

  const attachmentId = typeof attachment.id === 'string' ? attachment.id : undefined;
  const payload = {
    conversationId,
    messageId,
    ...(attachmentId ? { attachmentId } : {}),
    attachment: serializeAttachmentForSocket(attachment),
  };

  const participants = await loadActiveParticipants(prisma, conversationId);

  // #18613 — QUI a le droit de LIRE le message porteur. Le dépôt DÉCLARE cet
  // événement porteur de texte, deux fois dans le même fichier
  // (`TEXT_BEARING_TABLE` et sa table en prose, `queuedEventContract.ts`), rangé
  // avec `new`, `edited`, `translation` et `link-message` — et c'était le SEUL
  // des cinq à ne jamais interroger la loi (#9709). Aucune des trois audiences
  // ci-dessous ne lisait `joinedAt` ni `historyVisibleFrom` : ni l'admission de
  // lecture de FICHIER dont s'autorise le plan signé (`editedAudience.ts` écrit
  // qu'elle « ne dispense pas du plancher »), ni `PARTICIPATION_VIVANTE` de la
  // diffusion chaînée, ni la file. Un invité entré par un lien qui refuse
  // l'historique recevait donc la transcription Whisper entière, ses traductions
  // et l'adresse du fichier d'un message que `GET …/messages`, `/sync`,
  // `conversation:updated` et `GET /attachments/:id` lui refusent tous.
  //
  // Le balayage des médias en attente n'ayant AUCUNE borne temporelle basse,
  // l'enrichissement tire sur un message d'âge arbitraire : il n'y a pas de
  // course à gagner, seulement une pièce bloquée et un invité entre-temps.
  //
  // `'unknown'` se tait sur les DEUX canaux — direct et file — comme sur le
  // chemin d'édition : on ne sait NI qui est bloqué, NI qui est autorisé, et la
  // relecture du fil sert la pièce enrichie que la base garde.
  const readership = await messageReadership(prisma, conversationId, messageId, (error) =>
    logger.error('attachment-updated readership unresolvable — nothing live, nothing queued', { conversationId, messageId, error }),
  );
  if (readership.kind === 'unknown') return;
  const blocked = blockedReaderKeys(readership);

  // #9646 — la pièce d'un message protégé (le vocal d'une flamme, dont la
  // transcription et les pistes TTS arrivent après l'envoi) part par
  // destinataire, ses adresses signées pour chacun ; la diffusion chaînée
  // ci-dessous reste celle de toute autre pièce.
  const plan = await readerSignedPlanForMessageIdBestEffort(
    prisma,
    { conversationId, messageId, attachments: [payload.attachment] },
    (error) => logger.error('reader-signed plan failed (attachment enrichment) — no live per-reader delivery', { conversationId, messageId, error }),
  );

  // #17026 — « Best-effort side channel — never throws » était FAUX de cette
  // unité : les deux branches d'émission ci-dessous le font, `emit` levant dès
  // que l'adaptateur ou l'encodeur est en défaut (`emitWithSeq` le dit), et
  // `emitToConversationParticipants` n'a aucun `try`. L'exception remontait à
  // l'appelant — contre la promesse du doc-comment — et emportait au passage
  // l'enfilage hors ligne ci-dessous, c'est-à-dire la pièce ENRICHIE : la
  // raison d'être du module. Un commentaire qui ÉNONCE une contrainte est une
  // AFFIRMATION, et se vérifie comme telle (cycle 94).
  try {
    if (plan === PLAN_UNAVAILABLE) {
      // Rien en direct : voir `readerSignedPlanForMessageIdBestEffort`.
    } else if (plan) {
      for (const target of plan.targets) {
        // Le plan s'autorise sur l'admission de lecture de FICHIER, qui ne
        // regarde ni `joinedAt` ni `historyVisibleFrom` : le plancher se pose
        // ICI, jamais sur la foi de cette admission (#18613).
        if (blocked.has(target.key)) continue;
        // Par CIBLE (audit adversarial de #17026) : une cible qui lève
        // priverait toutes les suivantes de la pièce enrichie, et la file ne
        // compense pas les comptes connectés.
        safeBroadcast(
          `attachment-updated (per reader ${target.room})`,
          () => io.to(target.room).emit(SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED, {
            ...payload,
            attachment: plan.signAttachment(payload.attachment, target.participantId),
          }),
        );
      }
    } else {
      emitToConversationParticipants({
        io,
        conversationId,
        participants,
        event: SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED,
        payload,
        // Retirer leur room PERSONNELLE ne suffit pas : la room de conversation
        // est chaînée elle aussi, et le handshake y met la socket d'un invité
        // sous `PARTICIPATION_VIVANTE` seul. `.except()` les sort de TOUTE la
        // chaîne (#18613).
        exceptRooms: [...blocked].map((key) => ROOMS.user(key)),
      });
    }
  } catch (error) {
    logger.warn('attachment-updated live emission failed — offline replay unaffected', { conversationId, messageId, error });
  }

  // #12822 — la transcription et ses traductions sont du texte du message :
  // une conversation chiffrée au repos les range scellés dans la file. Un
  // régime illisible n'enfile RIEN plutôt que de risquer le clair dans Redis ;
  // la relecture de la conversation sert la pièce enrichie.
  const atRest = await attachmentEventSealsAtRest(prisma, messageId);
  if (atRest === 'unknown') return;

  await enqueueForOfflineParticipants(
    { deliveryQueue, prisma, connectedUsers },
    {
      conversationId,
      atRest,
      // No actor to exclude: Whisper and NLLB are not people, and the author of
      // the voice note is precisely one of the participants whose own copy
      // carries no transcription at send time.
      eventType: 'attachment-updated',
      messageId,
      payload,
      // Sans cette exclusion, la transcription d'un message hors du plancher
      // d'un invité l'attendait 48 h dans Redis sous sa clé, et le drain la
      // rejouait à sa reconnexion : la fuite survivait à la déconnexion qui
      // l'avait empêchée en direct (#18613).
      excludedQueueKeys: blocked,
      // The default (messageId, eventType) identity would let a second
      // attachment's enrichment supersede the first's on a two-audio message.
      ...(attachmentId ? { dedupKey: attachmentId } : {}),
      ...(participants.length > 0 ? { participants: [...participants] } : {}),
    },
  );
}

async function attachmentEventSealsAtRest(
  prisma: Pick<PrismaClient, 'message'>,
  messageId: string,
): Promise<boolean | 'unknown'> {
  try {
    const row = await prisma.message.findUnique({
      where: { id: messageId },
      select: { encryptionMode: true, conversation: { select: { encryptionMode: true } } },
    });
    return row ? queuedEventSealsAtRest(row) : 'unknown';
  } catch (error) {
    logger.warn('attachment-updated regime lookup failed — not queued for offline participants', { messageId, error });
    return 'unknown';
  }
}

async function loadActiveParticipants(
  prisma: Pick<PrismaClient, 'participant'>,
  conversationId: string,
): Promise<ParticipantRoomTarget[]> {
  try {
    // `id` is not decoration: it NAMES the personal room of a participant with
    // no `User` row (see `participantUserRoomTargets`).
    return await prisma.participant.findMany({
      where: { conversationId, ...PARTICIPATION_VIVANTE },
      select: { id: true, userId: true },
    });
  } catch (error) {
    logger.warn('attachment-updated participant lookup failed — conversation room only', {
      conversationId,
      error,
    });
    return [];
  }
}
