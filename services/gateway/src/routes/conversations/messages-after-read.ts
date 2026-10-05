/**
 * Surface FLAMME-ŒIL (#8302) — `POST /conversations/:id/messages/after-read/consume`.
 *
 * Le client appelle cette route quand le lecteur QUITTE une conversation où il
 * a vu des messages flamme-œil. Chacun disparaît chez LUI : `message:expired`
 * vers sa room personnelle (tous ses appareils), ses bannières retirées. Les
 * autres lecteurs, et l'expéditeur, ne voient rien changer — l'expéditeur garde
 * la bulle jusqu'à ce que tous l'aient vue (`consumeAfterReadMessages`).
 *
 * Même authentification que le suivi de lecture (`participantAuth`) : un invité
 * de lien partagé lit, donc consomme — sa ligne `MessageStatusEntry` est
 * indexée sur `Participant.id`, comme celle d'un membre.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  AFTER_READ_CONSUME_MAX_IDS,
  consumeAfterReadRequestSchema,
  consumeAfterReadResponseDataSchema,
  errorResponseSchema,
} from '@meeshy/shared/types/api-schemas';
import { consumeAfterReadMessages } from '../../services/messaging/consumeAfterReadMessages';
import { EphemeralRecipientExpiryService } from '../../services/EphemeralRecipientExpiryService';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { canAccessConversation, resolveCallerParticipant } from './utils/access-control';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response.js';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { logger } from './messages-shared';

const ConsumeAfterReadBodySchema = z.object({
  messageIds: z
    .array(z.string().regex(/^[0-9a-fA-F]{24}$/))
    .min(1)
    .max(AFTER_READ_CONSUME_MAX_IDS),
});

export function registerMessageAfterReadRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  participantAuth: unknown,
) {
  fastify.post<{
    Params: { id: string };
    Body: { messageIds: string[] };
  }>('/conversations/:id/messages/after-read/consume', {
    schema: {
      description: 'Flamme-œil (#8302) : les messages vus puis quittés disparaissent chez l\'appelant seul',
      tags: ['conversations', 'messages'],
      summary: 'Consume after-read ephemeral messages',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'Conversation ID or identifier' } },
      },
      body: consumeAfterReadRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: { success: { type: 'boolean' }, data: consumeAfterReadResponseDataSchema },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
    preValidation: [participantAuth as never],
  }, async (request, reply) => {
    try {
      const body = ConsumeAfterReadBodySchema.safeParse(request.body);
      if (!body.success) {
        return sendBadRequest(reply, 'messageIds must hold 1 to 200 message ids');
      }

      const authRequest = request as UnifiedAuthRequest;
      const { id } = request.params;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const hasAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!hasAccess) {
        return sendForbidden(reply, 'Access denied');
      }

      const caller = await resolveCallerParticipant(prisma, authRequest.authContext, conversationId);
      if (!caller) {
        return sendForbidden(reply, 'Not a participant');
      }

      const now = new Date();
      const { consumed, entries } = await consumeAfterReadMessages(prisma, {
        conversationId,
        participantId: caller.id,
        messageIds: body.data.messageIds,
        now,
      });

      if (entries.length > 0) {
        const expiry = new EphemeralRecipientExpiryService(prisma, {
          now: () => now,
          resolveIO: () => fastify.socketIOHandler?.getManager()?.getIO(),
        });
        await expiry.expireNow(entries);
      }

      return sendSuccess(reply, { consumed });
    } catch (error) {
      logger.error('Error consuming after-read messages', error);
      return sendInternalError(reply, 'Error consuming after-read messages');
    }
  });
}
