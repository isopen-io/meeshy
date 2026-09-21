/**
 * Le favori de message — `/me/starred-messages` (#7377).
 *
 *   - `PUT    /me/starred-messages/:messageId` pose l'étoile (idempotent) ;
 *   - `DELETE /me/starred-messages/:messageId` la retire (idempotent).
 *
 * Une étoile PERSONNELLE par (lecteur, message) — `MessageStar` — jamais
 * l'épingle, qui est commune à la conversation. Le contrat et ses quatre règles
 * de sécurité fail-closed sont écrits dans `services/gateway/decisions.md`,
 * § « Le favori de message » ; les verdicts vivent dans
 * `services/messaging/messageStars/`, cette route n'en fait que la traduction
 * HTTP et la diffusion.
 *
 * Montage AUTONOME au préfixe `/me` (`onRequest: [fastify.authenticate]`),
 * même patron que `me/engagement.ts` : `authenticate` refuse déjà un invité
 * sans compte, et le handler le vérifie une seconde fois — le favori est une
 * ligne par `User.id`, un invité n'en a pas.
 *
 * Chaque écriture réussie est dite aux AUTRES appareils du lecteur par
 * `message:starred`, sur sa seule room personnelle, sans aucun contenu du
 * message. `broadcastToUser` ne lève jamais : une panne du canal latéral ne
 * transforme pas une écriture réussie en 500.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  MESSAGE_STAR_ERROR_CODES,
  starMessageParamsSchema,
  type MessageStarPlacedResult,
  type MessageStarRemovedResult,
} from '@meeshy/shared/types/message-star';

import { isRegisteredUser, type UnifiedAuthRequest } from '../../middleware/auth';
import { MessageStarWriter } from '../../services/messaging/messageStars/MessageStarWriter';
import { broadcastToUser } from '../../utils/socket-broadcast';
import { logError } from '../../utils/logger';
import {
  sendBadRequest,
  sendConflict,
  sendForbidden,
  sendInternalError,
  sendNotFound,
  sendSuccess,
} from '../../utils/response.js';
import {
  messageStarPlacedResponseSchema,
  messageStarRemovedResponseSchema,
  starMessageParamsJsonSchema,
} from './starred-messages-schemas';

type StarParamsRequest = FastifyRequest<{ Params: { messageId: string } }>;

/**
 * Le lecteur INSCRIT, ou `null`. `authenticate` refuse déjà les invités ; ce
 * second contrôle rend la route sûre même montée derrière une garde plus
 * permissive.
 */
function registeredReaderId(request: FastifyRequest): string | null {
  const authContext = (request as UnifiedAuthRequest).authContext;
  if (!authContext || !isRegisteredUser(authContext)) return null;
  return authContext.registeredUser?.id ?? null;
}

export async function meStarredMessagesRoutes(fastify: FastifyInstance) {
  const writer = new MessageStarWriter(fastify.prisma);

  fastify.put(
    '/starred-messages/:messageId',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description:
          "Pose l'étoile PERSONNELLE du lecteur sur un message (#7377). Idempotent : reposer ne change pas " +
          "la date. Réservé au participant actif de la conversation du message ; un message absent, " +
          'supprimé, expiré, hors de la conversation du lecteur ou retiré de sa vue rend le MÊME 404. ' +
          'Un message à vue unique rend 409 MESSAGE_NOT_STARRABLE.',
        tags: ['me', 'messages'],
        summary: 'Star a message',
        params: starMessageParamsJsonSchema,
        response: {
          200: messageStarPlacedResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: StarParamsRequest, reply: FastifyReply) => {
      const userId = registeredReaderId(request);
      if (!userId) {
        return sendForbidden(reply, 'Registered user required', { code: 'REGISTERED_USER_REQUIRED' });
      }
      const params = starMessageParamsSchema.safeParse(request.params);
      if (!params.success) {
        return sendBadRequest(reply, 'Invalid message id', { code: 'VALIDATION_ERROR' });
      }

      try {
        const outcome = await writer.star(userId, params.data.messageId);
        if (outcome.kind === 'not-found') {
          return sendNotFound(reply, 'Message not found', { code: MESSAGE_STAR_ERROR_CODES.NOT_FOUND });
        }
        if (outcome.kind === 'not-starrable') {
          return sendConflict(reply, 'This message cannot be starred', {
            code: MESSAGE_STAR_ERROR_CODES.NOT_STARRABLE,
          });
        }

        const result: MessageStarPlacedResult = {
          messageId: outcome.messageId,
          conversationId: outcome.conversationId,
          starred: true,
          starredAt: outcome.starredAt.toISOString(),
        };
        broadcastToUser(fastify, userId, SERVER_EVENTS.MESSAGE_STARRED, result);
        return sendSuccess(reply, result);
      } catch (error) {
        logError(fastify.log, '[PUT /me/starred-messages/:messageId]', error);
        return sendInternalError(reply, 'Error starring message');
      }
    },
  );

  fastify.delete(
    '/starred-messages/:messageId',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description:
          "Retire l'étoile PERSONNELLE du lecteur (#7377). Idempotent, et sans condition sur le message ni sur " +
          'la participation : on peut toujours défaire ce qu’on a fait.',
        tags: ['me', 'messages'],
        summary: 'Unstar a message',
        params: starMessageParamsJsonSchema,
        response: {
          200: messageStarRemovedResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: StarParamsRequest, reply: FastifyReply) => {
      const userId = registeredReaderId(request);
      if (!userId) {
        return sendForbidden(reply, 'Registered user required', { code: 'REGISTERED_USER_REQUIRED' });
      }
      const params = starMessageParamsSchema.safeParse(request.params);
      if (!params.success) {
        return sendBadRequest(reply, 'Invalid message id', { code: 'VALIDATION_ERROR' });
      }

      try {
        const { messageId } = params.data;
        const { removed } = await writer.unstar(userId, messageId);
        if (removed) {
          broadcastToUser(fastify, userId, SERVER_EVENTS.MESSAGE_STARRED, {
            messageId,
            conversationId: removed.conversationId,
            starred: false,
            starredAt: null,
          });
        }
        const result: MessageStarRemovedResult = { messageId, starred: false };
        return sendSuccess(reply, result);
      } catch (error) {
        logError(fastify.log, '[DELETE /me/starred-messages/:messageId]', error);
        return sendInternalError(reply, 'Error unstarring message');
      }
    },
  );
}
