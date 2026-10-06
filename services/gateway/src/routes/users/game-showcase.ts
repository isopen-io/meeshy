/**
 * `GET /users/:userId/game/showcase` (#9387) — la vitrine de trophées d'UN AUTRE
 * membre, selon SON réglage (« tout le monde », « amis » — le défaut —, « moi
 * seul »). Le contrat est dans `@meeshy/shared/types/game-routes` (adresse) et
 * `game-v2` (`userShowcaseResponseSchema`).
 *
 * ## La décision, et ce qui la précède (conformité D-1 à D-5, #5738, leçon 275)
 *
 * UNE porte : `TrophyService.showcaseFor` → `GameProfileService.facetVisibleTo`.
 * Dans l'ordre : le blocage (deux comptes qui se sont bloqués ne se voient jamais,
 * même sur « tout le monde »), puis soi / ADMIN-BIGBOSS / ami accepté (la loi de
 * présence, jamais une co-appartenance), puis le réglage du membre plafonné par
 * « caché de la recherche » et « Jeu masqué ».
 *
 * Un refus rend `visible: false` avec des listes VIDES — jamais un 403 ni un 404,
 * qui diraient que la vitrine existe. Un identifiant inconnu rend la même chose :
 * on ne révèle pas non plus qu'un compte existe. Un visiteur — ADMIN compris —
 * ne reçoit que le MOIS d'obtention (jamais le jour, jamais l'heure), y compris
 * DANS la clé : une coupe de ligue lui arrive au mois (`visitorShowcase`), deux
 * coupes identiques du même mois sur une ligne comptée. Le membre lui-même lit
 * ses clés complètes. Les compteurs, la Flamme,
 * le niveau et le trésor suivent le même réglage — aucun n'est servi ici.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { createUnifiedAuthMiddleware } from '../../middleware/auth';
import { TrophyService } from '../../services/game/TrophyService';
import { logError } from '../../utils/logger';
import { sendInternalError, sendSuccess, sendUnauthorized } from '../../utils/response.js';
import { gameRateLimitConfig } from '../me/game-shared';
import { userShowcaseResponse } from '../me/game-wave2-schemas';
import { viewerFromRequest } from './presence-gate';

export type UserGameShowcaseOptions = {
  /** Le portier d'authentification — remplaçable en test. */
  readonly authenticate?: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
};

export async function userGameShowcaseRoutes(fastify: FastifyInstance, options: UserGameShowcaseOptions = {}) {
  const trophies = new TrophyService(fastify.prisma);
  const requiredAuth =
    options.authenticate ?? createUnifiedAuthMiddleware(fastify.prisma, { requireAuth: true, allowAnonymous: false });

  fastify.get(
    '/:userId/game/showcase',
    {
      preValidation: [requiredAuth as never],
      config: { rateLimit: gameRateLimitConfig('user-showcase', 120, false) },
      schema: {
        description:
          "La vitrine de trophées d'un membre, selon SON réglage (#9387). Un refus (réglage, blocage, compte inconnu) rend `visible: false` " +
          'et des listes vides — jamais une erreur qui dirait que la vitrine existe. Un visiteur ne voit que le mois d\'obtention.',
        tags: ['users', 'game'],
        summary: "Get another member's trophy showcase",
        params: { type: 'object', required: ['userId'], properties: { userId: { type: 'string', minLength: 1, maxLength: 64 } } },
        response: { 200: userShowcaseResponse, 401: errorResponseSchema, 429: errorResponseSchema, 500: errorResponseSchema },
      },
    },
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const viewer = viewerFromRequest(request);
      if (viewer === null) return sendUnauthorized(reply, 'Authentication required');
      try {
        return sendSuccess(reply, await trophies.showcaseFor({ viewer, targetId: request.params.userId }));
      } catch (error) {
        logError('Error serving a user showcase', error, { source: 'users-game-showcase' });
        return sendInternalError(reply, 'SHOWCASE_FAILED');
      }
    },
  );
}
