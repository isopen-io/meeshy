/**
 * `message:capture-detected` (#9617) — le transport socket de la déclaration de
 * capture. Il authentifie, valide la charge (Zod, `contentCaptureReportSchema`),
 * résout la participation de l'appelant dans la conversation déclarée, puis
 * remet tout jugement à `recordContentCapture` — le même que la route REST.
 *
 * L'accusé ne dit jamais pourquoi un message n'a pas été annoncé : il rend les
 * messages annoncés, et un refus d'ENSEMBLE (non authentifié, charge invalide,
 * pas participant, budget épuisé).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { contentCaptureReportSchema, type ContentCaptureAck } from '@meeshy/shared/types/content-capture';
import { CLIENT_EVENTS, RATE_LIMIT_REFUSAL_MESSAGE } from '@meeshy/shared/types/socketio-events';

import { isValidationFailure, validateSocketEvent } from '../../middleware/validation.js';
import { getCacheStore } from '../../services/CacheStore.js';
import type { SystemNoticeDeps } from '../../services/conversations/conversationNotice';
import {
  recordContentCapture,
  type CaptureDedupStore,
  type CaptureRateLimiter,
  type ContentCaptureDeps,
} from '../../services/messaging/contentCaptureNotices';
import { CONVERSATION_CLOSED_EDIT_MESSAGE } from '../../services/messaging/messageEditAdmission.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { getSocketRateLimiter } from '../../utils/socket-rate-limiter.js';
import type { MeeshySocket } from '../typed-socket';
import { resolveParticipant } from '../utils/participant-resolver';
import { normalizeConversationId, type SocketUser } from '../utils/socket-helpers';

const logger = enhancedLogger.child({ module: 'ContentCaptureHandler' });

export type ContentCaptureHandlerDeps = {
  readonly prisma: PrismaClient;
  readonly socketToUser: Map<string, string>;
  readonly connectedUsers: Map<string, SocketUser>;
  readonly broadcast: SystemNoticeDeps['broadcast'];
  readonly dedup?: CaptureDedupStore;
  readonly limiter?: CaptureRateLimiter;
  readonly mayRead?: ContentCaptureDeps['mayRead'];
  readonly now?: () => Date;
};

const refused = (error: string, code?: string): ContentCaptureAck => ({
  success: false,
  error,
  ...(code ? { code } : {}),
});

export async function handleContentCapture(
  socketId: string,
  data: unknown,
  deps: ContentCaptureHandlerDeps,
): Promise<ContentCaptureAck> {
  const userIdOrToken = deps.socketToUser.get(socketId);
  if (!userIdOrToken) return refused('Not authenticated', 'UNAUTHENTICATED');

  const validation = validateSocketEvent(contentCaptureReportSchema, data);
  if (isValidationFailure(validation)) return refused(validation.error, 'VALIDATION_ERROR');

  const conversationId = await normalizeConversationId(validation.data.conversationId, (where) =>
    deps.prisma.conversation.findUnique({ where, select: { id: true, identifier: true } }),
  );
  const participant = await resolveParticipant({
    prisma: deps.prisma,
    userIdOrToken,
    conversationId,
    connectedUsers: deps.connectedUsers,
  });
  if (!participant) return refused('Not a participant', 'NOT_A_PARTICIPANT');

  const { messageIds, kind, captureId } = validation.data;
  const outcome = await recordContentCapture(
    {
      prisma: deps.prisma,
      dedup: deps.dedup ?? getCacheStore(),
      limiter: deps.limiter ?? getSocketRateLimiter(),
      broadcast: deps.broadcast,
      mayRead: deps.mayRead,
      now: deps.now,
    },
    { conversationId, actorParticipantId: participant.participantId, report: { messageIds, kind, captureId } },
  );

  switch (outcome.kind) {
    case 'recorded':
      return { success: true, data: { noticedMessageIds: outcome.noticedMessageIds } };
    case 'rate-limited':
      return refused(RATE_LIMIT_REFUSAL_MESSAGE, 'RATE_LIMITED');
    case 'not-a-participant':
      return refused('Not a participant', 'NOT_A_PARTICIPANT');
    case 'conversation-closed':
      return refused(CONVERSATION_CLOSED_EDIT_MESSAGE, 'CONVERSATION_CLOSED');
  }
}

export function listenContentCapture(socket: MeeshySocket, deps: ContentCaptureHandlerDeps): void {
  socket.on(CLIENT_EVENTS.MESSAGE_CAPTURE_DETECTED, (data, callback) => {
    handleContentCapture(socket.id, data, deps)
      .then((ack) => callback?.(ack))
      .catch((error: unknown) => {
        logger.error('capture listener failed', { error, socketId: socket.id });
        callback?.(refused('Internal server error', 'INTERNAL_ERROR'));
      });
  });
}
