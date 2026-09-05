import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostParams } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendUnauthorized, sendNotFound, sendInternalError } from '../../utils/response';
import { createPostRouteRateLimitConfig } from '../../middleware/rate-limiter';
import { depreciee } from '../../utils/deprecation';
import { socialEventsDeprecation } from '../social/deprecation';
import {
  ingestSocialEvents,
  IMPRESSION_SOURCES,
  type SocialEventsDeps,
} from '../social/events';

/** Plafond d'ids par appel du lot — la borne de la passe de lecture d'audience. */
const IMPRESSION_BATCH_CAP = 50;

/**
 * L'impression — ses deux adresses passent en sursis vers `POST /social/events` (#4150).
 *
 * ## Ce que ces deux routes ÉTAIENT
 *
 * Elles comptaient une apparition sur N'IMPORTE QUEL id, sans jamais consulter
 * `Post.visibility` (#4146), et la route unitaire était en prime un ORACLE
 * D'EXISTENCE : `updateMany` ne lève jamais, alors qu'`update` sortait en 500
 * (P2025) sur un id inconnu — 500 = « ce post existe », 200 = « il n'existe
 * pas ».
 *
 * ## Ce qu'elles SONT
 *
 * Des adaptateurs. Elles traduisent leur corps historique en événements
 * `impression` et DÉLÈGUENT à {@link ingestSocialEvents} — l'audience, la
 * fermeture de l'oracle, le comptage par occurrence et le crédit des racines de
 * repost vivent là-bas, en un seul exemplaire. **Aucune règle n'est
 * réimplémentée ici** : c'est la condition qui empêche les deux formes de
 * diverger à nouveau, comme leurs énumérations de surfaces l'avaient fait.
 *
 * Elles restent MONTÉES et servent leur forme de réponse historique — le
 * critère 10 interdit de les retirer tant qu'Android n'a pas été relevé — et
 * annoncent leur sursis par les trois en-têtes du site unique
 * (`utils/deprecation.ts`).
 */
export function registerImpressionRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
  postService: SocialEventsDeps['postService'],
) {
  const deps: SocialEventsDeps = { fastify, prisma, postService };

  // ALIAS de `POST /social/events` — POST /posts/:postId/impression
  fastify.post('/posts/:postId/impression', {
    schema: {
      params: { type: 'object', required: ['postId'], properties: { postId: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          source: { type: 'string', enum: [...IMPRESSION_SOURCES] }
        }
      }
    },
    onRequest: depreciee(socialEventsDeprecation()),
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const source = (request.body as { source?: string } | undefined)?.source ?? 'feed';

      const { recorded } = await ingestSocialEvents(
        deps,
        [{ type: 'impression', postId, source: source as never }],
        { kind: 'user', userId: authContext.registeredUser.id, username: authContext.registeredUser.username ?? '' },
      );

      // Le 404 historique est conservé — et il ne distingue toujours rien :
      // inconnu, supprimé, hors audience et malformé y sortent tous ensemble.
      // Le point d'ingestion, lui, répond 200 avec `rejected` ; les deux formes
      // sont indistinguables au sein de leur propre contrat, ce qui est la
      // seule propriété qui compte.
      if (recorded === 0) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      return sendSuccess(reply, { recorded: true });
    } catch (error) {
      enhancedLogger.error('[POST /posts/:postId/impression]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // ALIAS de `POST /social/events` — POST /posts/impressions/batch
  fastify.post('/posts/impressions/batch', {
    schema: {
      body: {
        type: 'object',
        required: ['postIds'],
        properties: {
          // Le lot est PLAFONNÉ, et pas seulement par prudence : chaque id
          // coûte une ligne à la passe d'audience puis un verdict. Sans plafond,
          // un appelant authentifié choisit seul le travail que la passerelle
          // exécute — un lot de cent mille ids devient une lecture de cent mille
          // lignes et autant de verdicts.
          //
          // PAS de `minItems` : un lot VIDE est un succès à zéro enregistrement,
          // et deux témoins l'exigent. Un client qui n'a rien observé ne doit
          // pas avoir à le vérifier avant d'appeler — c'est le serveur qui sait
          // répondre « rien à faire ».
          postIds: { type: 'array', items: { type: 'string' }, maxItems: 100 },
          source: { type: 'string', enum: [...IMPRESSION_SOURCES] }
        }
      }
    },
    onRequest: depreciee(socialEventsDeprecation()),
    preValidation: [requiredAuth],
    config: { rateLimit: createPostRouteRateLimitConfig('impression') },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postIds, source = 'feed' } = request.body as { postIds?: unknown; source?: string };
      if (!Array.isArray(postIds) || postIds.length === 0) {
        return sendSuccess(reply, { recorded: 0 });
      }

      const { recorded } = await ingestSocialEvents(
        deps,
        (postIds as string[]).slice(0, IMPRESSION_BATCH_CAP).map((id) => ({
          type: 'impression' as const, postId: id, source: source as never,
        })),
        { kind: 'user', userId: authContext.registeredUser.id, username: authContext.registeredUser.username ?? '' },
      );

      // `recorded` compte ce qui a RÉELLEMENT été écrit, pas ce qui a été
      // demandé — annoncer les cinquante ids reçus quand la moitié a été
      // refusée serait un mensonge, et il était déjà faux avant l'ACL : Mongo
      // n'impose aucune clé étrangère, donc un id inconnu produisait une ligne
      // `PostImpression` orpheline comptée dans le total.
      return sendSuccess(reply, { recorded });
    } catch (error) {
      enhancedLogger.error('[POST /posts/impressions/batch]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
