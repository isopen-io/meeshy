import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendConflict, sendInternalError } from '../../utils/response.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  bloquer, debloquer, listerBloques, repondreBlocage, LIMITE_MAX_BLOCAGES, BLOCKS_SUCCESSOR_PATH,
} from '../directory/blocks';
import { applyDeprecationHeaders } from '../../utils/deprecation';

/**
 * Les trois ALIAS des routes de blocage (#4164).
 *
 * L'ensemble vit dans `routes/directory/blocks.ts` ; ces adresses restent
 * servies parce que la file d'attente HORS LIGNE des clients rejoue des
 * mutations enregistrées AVANT une mise à jour. Un alias retiré trop tôt fait
 * échouer un blocage que l'utilisateur croit posé — le cas le plus coûteux
 * qu'une route de blocage puisse produire.
 */

const paramsCible = {
  type: 'object',
  required: ['userId'],
  properties: { userId: { type: 'string', description: 'ID of the user (MongoDB ObjectId)' } },
} as const;

const messageSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: { type: 'object', properties: { message: { type: 'string' } } },
  },
} as const;

export async function blockUser(fastify: FastifyInstance) {
  fastify.post<{ Params: { userId: string } }>('/users/:userId/block', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Block a user. Alias of PUT /directory/blocks/:userId.',
      tags: ['users'],
      summary: 'Block a user',
      params: paramsCible,
      response: {
        200: messageSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        409: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      applyDeprecationHeaders(reply, { successorPath: BLOCKS_SUCCESSOR_PATH.item(request.params.userId) });
      const resultat = await bloquer(fastify, request, request.params.userId);
      if ('refus' in resultat) return repondreBlocage(reply, resultat);

      // Le 409 « déjà bloqué » est CONSERVÉ sur l'alias, et retiré de la route
      // canonique. Ce n'est pas une hésitation : un client déjà déployé peut en
      // dépendre pour afficher « vous avez déjà bloqué cette personne », et le
      // lot qui corrige la SÉMANTIQUE d'un verbe ne doit pas changer en même
      // temps ce que répond l'ancienne adresse.
      //
      // Il se lit sur le verdict de `bloquer`, jamais sur une relecture : un
      // pré-contrôle ajouterait une troisième lecture avant les deux
      // existantes. Rien n'a été écrit dans ce cas — l'état visé était déjà là.
      if (resultat.valeur.dejaBloque) return sendConflict(reply, 'User is already blocked');

      // La forme HISTORIQUE : `{ message }` seul. `blocked` appartient à la
      // route canonique, et l'ajouter ici changerait le contrat d'un alias.
      return sendSuccess(reply, { message: resultat.valeur.message });
    } catch (error) {
      logError(fastify.log, '[BLOCKING] Error blocking user', error);
      return sendInternalError(reply, 'Failed to block user');
    }
  });
}

export async function unblockUser(fastify: FastifyInstance) {
  fastify.delete<{ Params: { userId: string } }>('/users/:userId/block', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Unblock a user. Alias of DELETE /directory/blocks/:userId.',
      tags: ['users'],
      summary: 'Unblock a user',
      params: paramsCible,
      response: {
        200: messageSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      applyDeprecationHeaders(reply, { successorPath: BLOCKS_SUCCESSOR_PATH.item(request.params.userId) });
      return repondreBlocage(reply, await debloquer(fastify, request, request.params.userId));
    } catch (error) {
      logError(fastify.log, '[BLOCKING] Error unblocking user', error);
      return sendInternalError(reply, 'Failed to unblock user');
    }
  });
}

export async function getBlockedUsers(fastify: FastifyInstance) {
  fastify.get('/users/me/blocked-users', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get the list of blocked users. Alias of GET /directory/blocks.',
      tags: ['users'],
      summary: 'Get blocked users list',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  username: { type: 'string' },
                  displayName: { type: 'string', nullable: true },
                  avatar: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        401: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      applyDeprecationHeaders(reply, { successorPath: BLOCKS_SUCCESSOR_PATH.list });
      // L'alias sert la PREMIÈRE page au plafond, et un tableau NU — sa forme
      // historique, que les clients installés décodent. Il ne rendait aucune
      // pagination : en ajouter une ici ne changerait rien pour eux, et
      // borner la liste est le correctif qui compte. Ce qui dépasse s'obtient
      // à l'adresse canonique, seule à porter un curseur.
      const resultat = await listerBloques(fastify, request, { limit: String(LIMITE_MAX_BLOCAGES) });
      if ('refus' in resultat) return repondreBlocage(reply, resultat);

      return sendSuccess(reply, resultat.valeur.items);
    } catch (error) {
      logError(fastify.log, '[BLOCKING] Error fetching blocked users', error);
      return sendInternalError(reply, 'Failed to fetch blocked users');
    }
  });
}
