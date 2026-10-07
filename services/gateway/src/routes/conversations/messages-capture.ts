/**
 * Surface CAPTURE (#9617) — `POST /conversations/:id/messages/capture`.
 *
 * Jumeau REST de `message:capture-detected`, sur le patron des autres
 * déclarations d'un lecteur sur des messages (`messages-after-read.ts`,
 * `messages-view-once.ts`) : le client déclare une capture ou un enregistrement
 * d'écran et les messages visibles à cet instant ; `recordContentCapture` juge
 * chacun et écrit l'avis système.
 *
 * Même authentification que le suivi de lecture (`participantAuth`) : un invité
 * de lien partagé lit, donc peut capturer — et la capture s'annonce pareil.
 */
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  contentCaptureBodySchema,
  contentCaptureRequestJsonSchema,
  contentCaptureResponseDataJsonSchema,
} from '@meeshy/shared/types/content-capture';
import { RATE_LIMIT_REFUSAL_MESSAGE } from '@meeshy/shared/types/socketio-events';

import type { UnifiedAuthRequest } from '../../middleware/auth';
import { getCacheStore } from '../../services/CacheStore';
import { noticeBroadcast } from '../../services/conversations/conversationNotice';
import { recordContentCapture, type ContentCaptureDeps } from '../../services/messaging/contentCaptureNotices';
import { CONVERSATION_CLOSED_EDIT_MESSAGE } from '../../services/messaging/messageEditAdmission';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { sendBadRequest, sendError, sendForbidden, sendInternalError, sendNotFound, sendSuccess } from '../../utils/response.js';
import { getSocketRateLimiter } from '../../utils/socket-rate-limiter';
import { resolveCallerParticipant } from './utils/access-control';
import { logger } from './messages-shared';

export type MessageCaptureRouteOptions = Partial<Pick<ContentCaptureDeps, 'dedup' | 'limiter' | 'mayRead' | 'now'>>;

export function registerMessageCaptureRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  participantAuth: unknown,
  options: MessageCaptureRouteOptions = {},
) {
  fastify.post<{
    Params: { id: string };
    Body: unknown;
  }>('/conversations/:id/messages/capture', {
    schema: {
      description: 'Capture (#9617) : une capture ou un enregistrement d’écran d’un contenu qui disparaît s’annonce au fil',
      tags: ['conversations', 'messages'],
      summary: 'Report a screen capture of disappearing messages',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'Conversation ID or identifier' } },
      },
      body: contentCaptureRequestJsonSchema,
      response: {
        200: {
          type: 'object',
          properties: { success: { type: 'boolean' }, data: contentCaptureResponseDataJsonSchema },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        410: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
    preValidation: [participantAuth as never],
  }, async (request, reply) => {
    try {
      const body = contentCaptureBodySchema.safeParse(request.body);
      if (!body.success) {
        return sendBadRequest(reply, 'Invalid capture report');
      }

      const conversationId = await resolveConversationId(prisma, request.params.id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const authContext = (request as UnifiedAuthRequest).authContext;
      const caller = await resolveCallerParticipant(prisma, authContext, conversationId);
      if (!caller) {
        return sendForbidden(reply, 'Not a participant');
      }

      const outcome = await recordContentCapture(
        {
          prisma,
          dedup: options.dedup ?? getCacheStore(),
          limiter: options.limiter ?? getSocketRateLimiter(),
          broadcast: noticeBroadcast(fastify.socketIOHandler),
          mayRead: options.mayRead,
          now: options.now,
        },
        { conversationId, actorParticipantId: caller.id, report: body.data },
      );

      switch (outcome.kind) {
        case 'recorded':
          return sendSuccess(reply, { noticedMessageIds: outcome.noticedMessageIds });
        case 'rate-limited':
          return sendError(reply, 429, RATE_LIMIT_REFUSAL_MESSAGE, { code: 'RATE_LIMITED' });
        case 'not-a-participant':
          return sendForbidden(reply, 'Not a participant');
        case 'conversation-closed':
          return sendError(reply, 410, CONVERSATION_CLOSED_EDIT_MESSAGE, { code: 'CONVERSATION_CLOSED' });
      }
    } catch (error) {
      logger.error('Error recording a content capture', error);
      return sendInternalError(reply, 'Error recording a content capture');
    }
  });
}
