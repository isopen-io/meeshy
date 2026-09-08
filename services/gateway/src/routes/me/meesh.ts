/**
 * `POST /me/meesh/mint` — la FRAPPE d'une Meesh (#5743).
 *
 * Le seul point d'écriture du registre est `MeeshService` ; cette route ne fait
 * que l'appeler pour l'utilisateur AUTHENTIFIÉ. Elle ne prend jamais d'`userId`
 * en corps : frapper pour le compte d'autrui n'a aucun sens et serait la
 * première faille d'une monnaie.
 *
 * `requestId` porte l'IDEMPOTENCE. Une seconde requête portant le même
 * identifiant rend `already-minted` avec le solde courant — un SUCCÈS, pas une
 * erreur : du point de vue de l'appelant la frappe a bien eu lieu, ce qui est
 * vrai. Renvoyer une erreur pousserait le client à réessayer, donc à frapper
 * deux fois le jour où l'index unique céderait.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { sendSuccess, sendUnauthorized, sendError, sendInternalError } from '../../utils/response.js';
import { logError } from '../../utils/logger';
import { MeeshService } from '../../services/meesh/MeeshService';

/**
 * Débit par COMPTE, strict — la frappe ÉCRIT, et elle est irréversible. Un
 * plafond bas est ici une protection, pas une gêne : personne ne frappe
 * légitimement plus de quelques Meeshes par minute (il en coûte 1221 points).
 */
function mintRateLimitConfig() {
  return {
    max: 10,
    timeWindow: '1 minute',
    hook: 'preHandler' as const,
    keyGenerator: (request: FastifyRequest) => {
      const userId = request.auth?.userId;
      return userId ? `me:meesh:mint:${userId}` : `me:meesh:mint:ip:${request.ip}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: 'Trop de frappes demandées. Veuillez patienter.',
      statusCode: 429,
    }),
  };
}

const mintBodySchema = {
  type: 'object',
  required: ['requestId'],
  properties: {
    // Borné : un identifiant d'idempotence est un UUID, pas un champ libre.
    requestId: { type: 'string', minLength: 8, maxLength: 64 },
  },
  additionalProperties: false,
} as const;

const mintResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['minted', 'already-minted', 'insufficient'] },
        balance: { type: 'number' },
        mintedLifetime: { type: 'number' },
        missingPoints: { type: 'number' },
      },
    },
  },
} as const;

export async function meMeeshRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/meesh/mint',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: mintRateLimitConfig() },
      schema: {
        description:
          'Frappe une Meesh contre 1221 points débitables (#5743). Action MANUELLE ' +
          'et idempotente par `requestId`. Les axes de conversation ne sont jamais ' +
          'débités — ils forment le plancher inaliénable du niveau.',
        tags: ['me', 'meesh'],
        summary: 'Mint a Meesh',
        body: mintBodySchema,
        response: {
          200: mintResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
          429: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest<{ Body: { requestId: string } }>, reply: FastifyReply) => {
      const userId = request.auth?.userId;
      if (!userId) return sendUnauthorized(reply, 'Authentication required');

      try {
        const outcome = await new MeeshService(fastify.prisma).mint(userId, request.body.requestId);

        if (outcome.status === 'insufficient') {
          // 409 et non 400 : la requête est bien formée, c'est l'ÉTAT du compte
          // qui ne permet pas encore la frappe. Le manque est servi pour que
          // l'écran puisse le dire sans relire toute la progression.
          return sendError(reply, 409, 'INSUFFICIENT_POINTS', {
            code: 'INSUFFICIENT_POINTS',
            details: { missingPoints: outcome.plan.missingPoints },
          });
        }

        return sendSuccess(reply, {
          status: outcome.status,
          balance: outcome.balance,
          mintedLifetime: outcome.mintedLifetime,
        });
      } catch (error) {
        logError(fastify.log, 'Error minting a Meesh', error);
        return sendInternalError(reply, 'Failed to mint');
      }
    }
  );
}
