import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient } from '@/lib/net/socket';

import type { AttachmentReactionAck, AttachmentReactionRequest } from './attachment-reaction-emit';

/**
 * L'ÉMETTEUR RÉEL DES RÉACTIONS À UNE PIÈCE (#6303) — enregistré par
 * `api/realtime.ts` sur `attachment-reaction-emit.ts`, jamais importé par un
 * écran. `attachment:reaction-add|remove` porte `{ attachmentId, messageId,
 * emoji }` (`event-maps.ts`) et rend un accusé `{ success }` : c'est lui qui
 * dit si la pastille optimiste reste posée.
 */
export const ATTACHMENT_REACTION_ACK_MS = 8_000;

const succeeded = (response: unknown): boolean =>
  typeof response === 'object' && response !== null && (response as { readonly success?: unknown }).success === true;

export async function sendAttachmentReaction(
  socket: SocketClient | null,
  request: AttachmentReactionRequest,
): Promise<AttachmentReactionAck> {
  if (socket === null || !socket.connected || socket.emitWithAck === undefined) return 'offline';
  const { action, ...body } = request;
  const event = action === 'add' ? CLIENT_EVENTS.ATTACHMENT_REACTION_ADD : CLIENT_EVENTS.ATTACHMENT_REACTION_REMOVE;
  try {
    return succeeded(await socket.emitWithAck(event, body, ATTACHMENT_REACTION_ACK_MS)) ? 'ok' : 'refused';
  } catch {
    return 'offline';
  }
}
