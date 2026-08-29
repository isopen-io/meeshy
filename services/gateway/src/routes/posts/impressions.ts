import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostParams } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendUnauthorized, sendNotFound, sendInternalError } from '../../utils/response';
import { createPostRouteRateLimitConfig } from '../../middleware/rate-limiter';
import { NOT_DELETED } from '../../services/posts/postIncludes';
import { filterConsumablePostIds, mayConsumePost } from './postConsumptionGate';

/**
 * Surfaces qui peuvent produire une impression. Déclaré UNE fois et partagé par
 * la route unitaire et la route batch : les deux enums avaient divergé du client
 * — iOS envoie `story` à chaque slide de story révélé
 * (`StoryViewModel.recordStoryImpression`), valeur absente des deux listes, donc
 * 400 systématique et `impressionCount` figé à 0 sur toutes les stories malgré
 * des vues réelles. Toute nouvelle surface cliente s'ajoute ICI, pas dans un
 * seul des deux schémas.
 */
const IMPRESSION_SOURCES = [
  'feed',
  'profile',
  'search',
  'shared_link',
  'notification',
  'detail',
  'story',
  'status',
] as const;

/** Plafond d'ids par appel du lot — la borne de la passe de lecture d'audience. */
const IMPRESSION_BATCH_CAP = 50;

/**
 * L'impression — extraite d'`interactions.ts` (issue #4146).
 *
 * Les deux routes comptaient une apparition sur N'IMPORTE QUEL id, sans jamais
 * consulter `Post.visibility` : un compte pouvait gonfler l'`impressionCount`
 * d'une story `FRIENDS` ou d'un post `ONLY` dont il est exclu, donc peser sur
 * les analytiques que son auteur consulte et sur le classement du feed. Le LOT
 * était le meilleur vecteur — `updateMany` ne lève jamais, alors que l'unitaire
 * sortait en 500 (P2025 de `update`) sur un id inconnu, ce qui en faisait au
 * passage un ORACLE D'EXISTENCE : 500 = « ce post existe », 200 = « il
 * n'existe pas ». Les deux répondent désormais 404 dans les trois cas —
 * inconnu, supprimé, hors audience — et n'écrivent rien.
 */
export function registerImpressionRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
) {
  // POST /posts/:postId/impression — Track a feed impression
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
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const source = (request.body as { source?: string } | undefined)?.source ?? 'feed';

      // La garde AVANT toute écriture : une impression refusée ne doit laisser
      // aucune ligne `PostImpression` derrière elle, sans quoi l'ACL ne
      // garderait que le compteur pendant que l'historique, lui, mémoriserait
      // qui a touché quoi.
      if (!(await mayConsumePost(prisma, postId, authContext.registeredUser.id))) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      await prisma.postImpression.create({
        data: { postId, userId: authContext.registeredUser.id, source }
      });

      // Ouvrir le Détail d'un post (`source: 'detail'`) est à la fois une
      // impression ET une vue (totale, jamais dédupliquée) comptée IMMÉDIATEMENT
      // — chaque ouverture compte, sans seuil ni gating engagement. Les autres
      // sources (apparition feed, etc.) ne comptent qu'une impression.
      // Note : `postOpenCount` n'est PLUS alimenté par l'engagement sur la surface
      // `detail` (cf. engagementAggregateIncrements) pour éviter le double comptage.
      const counters: Record<string, { increment: number }> = { impressionCount: { increment: 1 } };
      if (source === 'detail') {
        counters.postOpenCount = { increment: 1 };
      }

      // Résout repostOfId/originalRepostOfId depuis le RETOUR de `update` —
      // pas une lecture séparée : un repost doit créditer son original du
      // même impressionCount en plus de son propre compteur (chantier
      // reposts cohérents & watermark, tâche 1), sans ajouter de requête sur
      // ce chemin chaud (chaque impression, majoritairement des non-reposts).
      const target = await prisma.post.update({
        where: { id: postId },
        data: counters,
        select: { repostOfId: true, originalRepostOfId: true },
      });

      // Le crédit de la RACINE reste inconditionnel : il n'est atteignable que
      // par un repost, et reposter exige déjà de voir la racine. Aucune réponse
      // n'en dépend, donc rien ne s'y lit en retour.
      const rootId = target?.originalRepostOfId ?? target?.repostOfId;
      if (rootId && rootId !== postId) {
        await prisma.post.updateMany({
          where: { id: rootId, deletedAt: NOT_DELETED },
          data: { impressionCount: { increment: 1 } },
        });
      }

      return sendSuccess(reply, { recorded: true });
    } catch (error) {
      enhancedLogger.error('[POST /posts/:postId/impression]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/impressions/batch — Track multiple feed impressions at once
  fastify.post('/posts/impressions/batch', {
    schema: {
      body: {
        type: 'object',
        required: ['postIds'],
        properties: {
          postIds: { type: 'array', items: { type: 'string' } },
          source: { type: 'string', enum: [...IMPRESSION_SOURCES] }
        }
      }
    },
    preValidation: [requiredAuth],
    config: { rateLimit: createPostRouteRateLimitConfig('impression') },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const userId = authContext.registeredUser.id;
      const { postIds, source = 'feed' } = request.body as { postIds?: unknown; source?: string };

      if (!Array.isArray(postIds) || postIds.length === 0) {
        return sendSuccess(reply, { recorded: 0 });
      }

      const requested = (postIds as string[]).slice(0, IMPRESSION_BATCH_CAP);

      // UNE passe d'audience pour les cinquante ids, avant la moindre écriture.
      // Un id inconnu, un id supprimé et un id hors audience sortent tous par
      // la même porte : ils ne sont simplement pas dans l'ensemble, et rien
      // dans la réponse ne permet de les distinguer les uns des autres.
      const allowedIds = await filterConsumablePostIds(prisma, requested, userId);
      const capped = requested.filter((postId) => allowedIds.has(postId));
      if (capped.length === 0) {
        return sendSuccess(reply, { recorded: 0 });
      }

      await prisma.postImpression.createMany({
        data: capped.map((postId: string) => ({
          postId,
          userId,
          source
        }))
      });

      // Une impression par APPARITION : le même post peut légitimement revenir
      // plusieurs fois dans un lot (aller-retour de scroll). `createMany` insère
      // bien une ligne par occurrence, mais `updateMany({ id: { in: [...] } })`
      // n'incrémente chaque post qu'UNE fois — le `in` est dédupliqué côté base.
      // On regroupe donc par nombre d'occurrences : un `updateMany` par valeur
      // d'incrément distincte (en pratique 1 à 3), et non un par post.
      const occurrences = capped.reduce<Map<string, number>>((acc, postId: string) => {
        acc.set(postId, (acc.get(postId) ?? 0) + 1);
        return acc;
      }, new Map());

      const idsByIncrement = [...occurrences].reduce<Map<number, string[]>>((acc, [postId, count]) => {
        acc.set(count, [...(acc.get(count) ?? []), postId]);
        return acc;
      }, new Map());

      // Reposts du batch : résout repostOfId/originalRepostOfId de tous les
      // posts DISTINCTS en UNE requête — jamais une par post — pour créditer
      // la racine de chaque repost du même impressionCount (chantier reposts
      // cohérents & watermark, tâche 1).
      const repostSources = await prisma.post.findMany({
        where: { id: { in: [...occurrences.keys()] }, repostOfId: { not: null } },
        select: { id: true, repostOfId: true, originalRepostOfId: true },
      });
      const rootByPostId = new Map<string, string>(
        repostSources
          .map((p: { id: string; repostOfId: string | null; originalRepostOfId: string | null }) =>
            [p.id, p.originalRepostOfId ?? p.repostOfId] as [string, string | null])
          .filter((entry: [string, string | null]): entry is [string, string] =>
            Boolean(entry[1]) && entry[1] !== entry[0]),
      );

      // Chaque OCCURRENCE d'un repost dans le batch crédite sa racine — deux
      // reposts distincts (ou 2 occurrences du même repost) du même original
      // doivent créditer l'original de +2, jamais +1. Même piège `in`
      // dédupliqué que ci-dessus, appliqué ici au crédit de la racine.
      const rootOccurrences = capped.reduce<Map<string, number>>((acc, postId: string) => {
        const rootId = rootByPostId.get(postId);
        if (!rootId) return acc;
        acc.set(rootId, (acc.get(rootId) ?? 0) + 1);
        return acc;
      }, new Map());

      const rootIdsByIncrement = [...rootOccurrences].reduce<Map<number, string[]>>((acc, [rootId, count]) => {
        acc.set(count, [...(acc.get(count) ?? []), rootId]);
        return acc;
      }, new Map());

      await Promise.all([
        ...[...idsByIncrement].map(([increment, ids]) =>
          prisma.post.updateMany({
            where: { id: { in: ids } },
            data: { impressionCount: { increment } }
          })
        ),
        ...[...rootIdsByIncrement].map(([increment, ids]) =>
          prisma.post.updateMany({
            where: { id: { in: ids }, deletedAt: NOT_DELETED },
            data: { impressionCount: { increment } }
          })
        ),
      ]);

      // `recorded` compte ce qui a RÉELLEMENT été écrit, pas ce qui a été
      // demandé. Annoncer les cinquante ids reçus quand la moitié a été
      // refusée serait le même mensonge que le `{ bookmarked: true }` du
      // favori — et il était déjà faux avant cette garde : Mongo n'impose
      // aucune clé étrangère, donc un id inconnu produisait une ligne
      // `PostImpression` orpheline comptée dans le total.
      return sendSuccess(reply, { recorded: capped.length });
    } catch (error) {
      enhancedLogger.error('[POST /posts/impressions/batch]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
