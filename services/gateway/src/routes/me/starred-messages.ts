/**
 * Le favori de message — `/me/starred-messages` (#7377).
 *
 *   - `GET    /me/starred-messages` rend la liste, la plus récente d'abord ;
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
import type { CursorPaginationMeta } from '@meeshy/shared/types/api-responses';
import {
  MESSAGE_STAR_ERROR_CODES,
  starMessageParamsSchema,
  starredMessagesQuerySchema,
  type MessageStarPlacedResult,
  type MessageStarRemovedResult,
} from '@meeshy/shared/types/message-star';

import { isRegisteredUser, type UnifiedAuthRequest } from '../../middleware/auth';
import { MessageStarWriter } from '../../services/messaging/messageStars/MessageStarWriter';
import { StarredMessagesReader } from '../../services/messaging/messageStars/StarredMessagesReader';
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
  starredMessagesListResponseSchema,
  starredMessagesQueryJsonSchema,
} from './starred-messages-schemas';

type StarParamsRequest = FastifyRequest<{ Params: { messageId: string } }>;

/**
 * L'HORLOGE est injectable, et c'est une nécessité de contrat, pas une
 * commodité : trois verdicts du favori se jugent contre « maintenant » — un
 * éphémère expiré sort, un éphémère vivant est un placeholder, un lien de
 * partage échu ferme la porte. Un témoin qui fige une date future ABSOLUE
 * contre l'horloge murale devient faux le jour où cette date passe. La table
 * des routes monte ce module sans option : la production lit l'horloge réelle.
 */
export type MeStarredMessagesRoutesOptions = {
  readonly now?: () => Date;
};

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

export async function meStarredMessagesRoutes(
  fastify: FastifyInstance,
  options: MeStarredMessagesRoutesOptions = {},
) {
  const now = options.now ?? (() => new Date());
  const writer = new MessageStarWriter(fastify.prisma, now);
  const reader = new StarredMessagesReader(fastify.prisma, now);

  fastify.get(
    '/starred-messages',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description:
          'Liste des messages mis en favori par le lecteur (#7377), la plus récente étoile d’abord, paginée par ' +
          'keyset opaque. Chaque ligne sert le message VIVANT (texte original, langue, traductions, aperçu des ' +
          'pièces jointes), son auteur et sa conversation. Ne sert que les conversations dont le lecteur est ' +
          'participant actif ; un message supprimé, expiré ou à vue unique sort de la liste ; un message flouté, ' +
          'chiffré ou éphémère vivant est servi en placeholder (isProtected). Une page peut compter moins de ' +
          '`limit` lignes : continuer tant que `hasMore` est vrai.',
        tags: ['me', 'messages'],
        summary: 'List starred messages',
        querystring: starredMessagesQueryJsonSchema,
        response: {
          200: starredMessagesListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = registeredReaderId(request);
      if (!userId) {
        return sendForbidden(reply, 'Registered user required', { code: 'REGISTERED_USER_REQUIRED' });
      }
      const query = starredMessagesQuerySchema.safeParse(request.query);
      if (!query.success) {
        return sendBadRequest(reply, 'Invalid query', { code: 'VALIDATION_ERROR' });
      }

      try {
        const outcome = await reader.list(userId, query.data);
        if (outcome.kind === 'invalid-cursor') {
          return sendBadRequest(reply, 'Invalid cursor', { code: 'INVALID_CURSOR' });
        }
        const pagination: CursorPaginationMeta = {
          limit: query.data.limit,
          hasMore: outcome.hasMore,
          nextCursor: outcome.nextCursor,
          form: 'keyset',
        };
        reply.header('Cache-Control', 'private, no-cache');
        return sendSuccess(reply, outcome.items, { pagination });
      } catch (error) {
        logError(fastify.log, '[GET /me/starred-messages]', error);
        return sendInternalError(reply, 'Error listing starred messages');
      }
    },
  );

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
