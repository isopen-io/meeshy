import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { RELATION_LEVELS } from '@meeshy/shared/types/relation';
import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { sendBadRequest, sendInternalError, sendSuccess, sendUnauthorized } from '../../utils/response.js';
import { createCustomRateLimiter } from '../../utils/rate-limiter.js';
import { callerRateKey } from '../../utils/client-rate-key';
import { loadRelationLinkDetail } from '../../services/relations/relationLinks';
import { AUTH_ERROR_CODES } from '../../utils/auth-error-codes';
import { logError } from '../../utils/logger.js';
import { appVersionFloorPreHandler } from '../../middleware/app-version-floor';
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
        grantedByMe: { type: 'string', enum: [...RELATION_LEVELS] },
        since: { type: 'string', nullable: true },
        progress: {
          type: 'object',
          properties: {
            activeWeeks: { type: 'number' },
            needed: { type: 'number', nullable: true },
            missing: { type: 'array', items: { type: 'string' } },
          },
        },
        eligibleFor: { type: 'string', nullable: true },
        canRaise: { type: 'boolean' },
        raiseBlockedUntil: { type: 'string', nullable: true },
        accessLevel: { type: 'string', enum: [...RELATION_LEVELS] },
      },
    },
  },
} as const;

/**
 * `GET /relations/:userId` — mon lien avec une personne (#13998, élargi par #14910) :
 * le niveau EFFECTIF, la vue de `GET /relations` (`grantedByMe`, `since`,
 * `progress`, `eligibleFor`), `canRaise` (puis-je demander le cran suivant) et
 * `raiseBlockedUntil`, toujours `null` : le cool-down naît d'une baisse ou d'un refus
 * silencieux (RG-07), il ne se dit qu'à la demande (`RELATION_COOLDOWN`).
 *
 * ## Une seule loi
 *
 * Le niveau vient de `niveauEffectifUniforme` (`services/friendship.ts`), la
 * loi de `niveauEffectif` lue sans que le lien décide des lectures ; `canRaise`
 * est la loi de l'envoi (`evaluateRelationRequest`) sur les mêmes faits que sa
 * garde (`raiseOutlookOf`, `services/relations/relationRequestGate.ts`). La
 * forme est ADDITIVE : `userId` et `effectiveLevel` restent. `accessLevel` est le
 * verdict de la loi d'accès pour les outils de cercle (#16623) : le client le lit pour
 * proposer le Bring, sans apprendre aucun rôle.
 *
 * ## `PUBLIC` dit « pas de lien », et c'est tout
 *
 * Bloqué dans un sens ou dans l'autre, utilisateur inconnu, aucun lien : la même
 * réponse, par le même chemin de lecture : blocage, ligne de lien, demande
 * acceptée, demande en suspens et série sont lus sans condition l'un de
 * l'autre — un inconnu et un bloqué (même lié de près) ne se distinguent ni
 * par le contenu ni par le nombre de requêtes. Sous Connaissance, la vue est
 * vide et `canRaise` faux. La route n'est pas un oracle d'existence ni de
 * blocage. Soi-même est refusé (400) : il n'y a pas de lien avec soi, et le
 * dire en `PUBLIC` serait faux.
 *
 * ## L'identifiant est CANONIQUE avant toute question
 *
 * Un ObjectId s'écrit en hexadécimal de casse libre, et Mongo lit `ABC…` et
 * `abc…` comme le même document. La clé de paire (`relationPairKey`) ordonne
 * pourtant des CHAÎNES : une casse hostile inverse l'ordre, manque la ligne et
 * retombe sur la demande acceptée — un lien BAISSÉ après l'amitié (RG-07) se
 * relisait `FRIEND`, et son propre identifiant en majuscules échappait au 400.
 * L'identifiant est donc ramené en minuscules, et c'est lui qui est servi.
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
    preHandler: [appVersionFloorPreHandler, parAppelant.middleware()],
    schema: {
      description:
        'My link with a person: effective level (minimum of both grants), what I grant, progress, eligibility, whether I can request the next circle (canRaise; a cool-down is only told when requesting). raiseBlockedUntil is always null. PUBLIC and an empty view when blocked in either direction, unknown, or unlinked.',
      tags: ['relations'],
      summary: 'Read my link with a person',
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

    const userId = request.params.userId.toLowerCase();
    if (!isValidMongoId(userId)) return sendBadRequest(reply, 'Invalid user ID format');
    if (userId === moi) return sendBadRequest(reply, 'A relation level needs another person');

    try {
      return sendSuccess(reply, await loadRelationLinkDetail(fastify.prisma, { viewerId: moi, otherId: userId, now: new Date() }));
    } catch (error) {
      logError(fastify.log, '[RELATIONS] Error reading relation level', error);
      return sendInternalError(reply, 'Failed to read relation level');
    }
  });
}
