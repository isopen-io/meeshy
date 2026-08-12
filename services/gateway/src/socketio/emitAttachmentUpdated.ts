import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  emitToConversationParticipants,
  type ConversationRoomEmitter,
  type ParticipantRoomTarget,
} from './emitToConversationParticipants';
import { enqueueForOfflineParticipants, type OfflineParticipantQueueDeps } from './offlineParticipantQueue';
import { serializeAttachmentForSocket } from './serializeAttachmentForSocket';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'emitAttachmentUpdated' });

export interface AttachmentUpdatedParams {
  io: ConversationRoomEmitter | null | undefined;
  prisma: Pick<PrismaClient, 'participant'>;
  deliveryQueue: OfflineParticipantQueueDeps['deliveryQueue'];
  connectedUsers: { has(key: string): boolean };
  conversationId: string;
  messageId: string;
  /** The freshly-read attachment row (or a record of the same shape). */
  attachment: Record<string, unknown>;
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

  const payload = {
    conversationId,
    messageId,
    attachment: serializeAttachmentForSocket(attachment),
  };

  const participants = await loadActiveParticipants(prisma, conversationId);

  emitToConversationParticipants({
    io,
    conversationId,
    participants,
    events: [SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED],
    payload,
  });

  const attachmentId = typeof attachment.id === 'string' ? attachment.id : undefined;

  await enqueueForOfflineParticipants(
    { deliveryQueue, prisma, connectedUsers },
    {
      conversationId,
      // No actor to exclude: Whisper and NLLB are not people, and the author of
      // the voice note is precisely one of the participants whose own copy
      // carries no transcription at send time.
      eventType: 'attachment-updated',
      messageId,
      payload,
      // The default (messageId, eventType) identity would let a second
      // attachment's enrichment supersede the first's on a two-audio message.
      ...(attachmentId ? { dedupKey: attachmentId } : {}),
      ...(participants.length > 0 ? { participants: [...participants] } : {}),
    },
  );
}

async function loadActiveParticipants(
  prisma: Pick<PrismaClient, 'participant'>,
  conversationId: string,
): Promise<ParticipantRoomTarget[]> {
  try {
    // `id` is not decoration: it NAMES the personal room of a participant with
    // no `User` row (see `participantUserRoomTargets`).
    return await prisma.participant.findMany({
      where: { conversationId, isActive: true },
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
