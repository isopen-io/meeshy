import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { RELATION_LEVELS } from '@meeshy/shared/types/relation';
import type { RelationLevelResponse } from '@meeshy/shared/types/relation-level-response';
import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { sendBadRequest, sendInternalError, sendSuccess, sendUnauthorized } from '../../utils/response.js';
import { createCustomRateLimiter } from '../../utils/rate-limiter.js';
import { callerRateKey } from '../../utils/client-rate-key';
import { isBlockedBetween } from '../../utils/blocking';
import { niveauEffectif } from '../../services/friendship';
import { AUTH_ERROR_CODES } from '../../utils/auth-error-codes';
import { logError } from '../../utils/logger.js';
import type { AuthenticatedRequest } from '../users/types';

/** Le lecteur INSCRIT, ou `null` : un invité de lien n'a pas de compte, donc pas de lien. */
const lecteurInscrit = (request: FastifyRequest): string | null => {
  const ctx = (request as AuthenticatedRequest).authContext;
  return ctx?.isAuthenticated && ctx.registeredUser ? (ctx.userId ?? null) : null;
};

/**
 * La forme servie par `GET /relations/:userId`, DÉCLARÉE : un champ produit et
 * non déclaré est supprimé en silence par fast-json-stringify. Le contrat Zod
 * est `relationLevelResponseSchema` (`@meeshy/shared/types/relation-level-response`).
 */
export const relationLevelJsonSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        effectiveLevel: { type: 'string', enum: [...RELATION_LEVELS] },
      },
    },
  },
} as const;

/**
 * `GET /relations/:userId` — le niveau EFFECTIF du lien du lecteur avec une
 * personne, et rien de plus (#13998, spec cercles § 4).
 *
 * ## Une seule loi
 *
 * Le niveau vient de `niveauEffectif` (`services/friendship.ts`), site unique ;
 * cette route ne compare aucun niveau. La forme est MINIMALE et ADDITIVE :
 * `grantedByMe`, `since`, `progress`, `eligibleFor` viendront avec #13938.
 *
 * ## `PUBLIC` dit « pas de lien », et c'est tout
 *
 * Bloqué dans un sens ou dans l'autre, utilisateur inconnu, aucun lien : la même
 * réponse, par le même chemin de lecture. Les deux questions (blocage, niveau)
 * sont posées SANS condition l'une de l'autre, pour qu'un inconnu et un bloqué
 * ne se distinguent ni par le contenu ni par le nombre de requêtes — la route
 * n'est pas un oracle d'existence ni de blocage. Soi-même est refusé (400) :
 * il n'y a pas de lien avec soi, et le dire en `PUBLIC` serait faux.
 */
export async function relationsLevelRoutes(fastify: FastifyInstance) {
  const parAppelant = createCustomRateLimiter(
    {
      max: 120,
      windowMs: 60 * 1000,
      keyPrefix: 'rel:level:u',
      message: 'Trop de lectures de lien. Veuillez patienter une minute.',
      keyGenerator: callerRateKey,
    },
    fastify.redis ?? undefined
  );

  fastify.get<{ Params: { userId: string } }>('/:userId', {
    onRequest: [fastify.authenticate],
    preHandler: [parAppelant.middleware()],
    schema: {
      description:
        'Effective relation level between the caller and a person (minimum of both grants). PUBLIC when blocked in either direction, unknown, or unlinked.',
      tags: ['relations'],
      summary: 'Read the effective relation level',
      params: {
        type: 'object',
        required: ['userId'],
        properties: { userId: { type: 'string', description: 'ID of the person (MongoDB ObjectId)' } },
      },
      response: {
        200: relationLevelJsonSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    const moi = lecteurInscrit(request);
    if (!moi) return sendUnauthorized(reply, 'Authentication required', { code: AUTH_ERROR_CODES.UNAUTHORIZED });

    const { userId } = request.params;
    if (!isValidMongoId(userId)) return sendBadRequest(reply, 'Invalid user ID format');
    if (userId === moi) return sendBadRequest(reply, 'A relation level needs another person');

    try {
      const [bloque, niveau] = await Promise.all([
        isBlockedBetween(fastify.prisma, moi, userId),
        niveauEffectif(fastify.prisma, moi, userId),
      ]);

      const servi: RelationLevelResponse = { userId, effectiveLevel: bloque ? 'PUBLIC' : niveau };
      return sendSuccess(reply, servi);
    } catch (error) {
      logError(fastify.log, '[RELATIONS] Error reading relation level', error);
      return sendInternalError(reply, 'Failed to read relation level');
    }
  });
}
