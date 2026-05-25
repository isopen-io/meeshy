import type { Server } from 'socket.io';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { serializeAttachmentForSocket } from './serializeAttachmentForSocket';

/**
 * Broadcast a `message:attachment-updated` event to the conversation room.
 *
 * Use this whenever an async worker (Whisper transcription finalized,
 * NLLB+Chatterbox TTS finalized for one language, …) has updated an
 * attachment in the DB and clients need to reflect the new payload
 * without re-fetching the whole message.
 *
 * `attachment` should be the freshly-read Prisma row (or a record with
 * the same shape — `serializeAttachmentForSocket` picks what it needs
 * and tolerates missing optional fields). Pass `null` transcription /
 * translations explicitly when not yet enriched — the serializer keeps
 * the null.
 */
export function emitAttachmentUpdated(
  io: Server,
  conversationId: string,
  messageId: string,
  attachment: Record<string, unknown>
): void {
  const room = ROOMS.conversation(conversationId);
  io.to(room).emit(SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED, {
    conversationId,
    messageId,
    attachment: serializeAttachmentForSocket(attachment),
  });
}
