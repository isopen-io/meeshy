import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostFeedService } from '../../services/PostFeedService';
import { FeedQuerySchema, ReelFeedQuerySchema, UserParams, CommunityParams } from './types';
import { sendSuccess, sendUnauthorized, sendInternalError } from '../../utils/response';
import { validatePagination } from '../../utils/pagination';
import { getCacheStore } from '../../services/CacheStore';
import { wireReaderFromRequest } from '../../services/posts/storyEffectsV3';

export function registerFeedRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
  optionalAuth: any
) {
  const feedService = new PostFeedService(prisma, getCacheStore());

  // GET /posts/feed — Main ranked feed
  fastify.get('/posts/feed', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const query = FeedQuerySchema.safeParse(request.query);
      const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 20 };

      const result = await feedService.getFeed(authContext.registeredUser.id, cursor, limit, wireReaderFromRequest(request as UnifiedAuthRequest));

      reply.header('Cache-Control', 'private, no-cache');

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/feed] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/feed/stories — Active stories
  fastify.get('/posts/feed/stories', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      // G1 delta-sync : `?updatedSince=<ISO8601>` (même convention que
      // GET /conversations?updatedSince) — timestamp invalide ignoré (full).
      const rawSince = (request.query as Record<string, unknown> | undefined)?.updatedSince;
      const parsedSince = typeof rawSince === 'string' ? new Date(rawSince) : undefined;
      const updatedSince = parsedSince && !Number.isNaN(parsedSince.getTime())
        ? parsedSince
        : undefined;

      // G1(b) projection légère : `?projection=tray` — whitelist stricte,
      // toute autre valeur retombe sur le plein corps (rétro-compatible).
      const rawProjection = (request.query as Record<string, unknown> | undefined)?.projection;
      const projection = rawProjection === 'tray' ? ('tray' as const) : undefined;

      // G1(c) pagination cursor — mêmes conventions que /posts/feed. Sans
      // paramètres, première page de 50 = plafond historique ; `data` reste
      // le tableau de stories (les clients existants décodent inchangé),
      // hasMore/nextCursor voyagent dans `pagination`.
      const rawCursor = (request.query as Record<string, unknown> | undefined)?.cursor;
      const cursor = typeof rawCursor === 'string' && rawCursor.length > 0 ? rawCursor : undefined;
      // SSOT `validatePagination` (cursor route: limit only) — NaN→default,
      // below-1→floor, over-50→cap. Consolidates the hand-rolled clamp.
      const rawLimit = (request.query as Record<string, unknown> | undefined)?.limit;
      const { limit } = validatePagination(undefined, typeof rawLimit === 'string' ? rawLimit : undefined, { defaultLimit: 50, maxLimit: 50 });

      const result = await feedService.getStories(authContext.registeredUser.id, {
        updatedSince, projection, cursor, limit,
        reader: wireReaderFromRequest(request as UnifiedAuthRequest),
      });

      reply.header('Cache-Control', 'private, no-cache');

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
        // `deletedStoryIds` — tombstones du delta-sync : les stories disparues
        // (supprimées par leur auteur, ou périmées puis balayées) depuis
        // `updatedSince`. Le merge delta côté client étant additif, c'est le
        // SEUL canal qui lui permet de purger son cache quand il a manqué
        // l'event socket `story:deleted` — app fermée ou hors-ligne. Toujours
        // présent (tableau vide sur un fetch complet, qui écrase déjà tout).
        //
        // `deletedStoryIdsTruncated` — la liste ci-dessus est plafonnée et n'a
        // aucun curseur de reprise. Quand elle déborde, le client ne peut pas
        // paginer les disparitions manquantes : son seul recours est un fetch
        // complet, dont le remplacement du tray purge les fantômes. Sans ce
        // drapeau le plafond se lit comme une couverture complète.
        meta: {
          deletedStoryIds: result.deletedIds,
          deletedStoryIdsTruncated: result.deletedIdsTruncated,
        },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/feed/stories] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/stories/mine — Archive COMPLÈTE des stories de l'appelant
  // (« Mes stories » : en cours ET passées), paginée keyset. Les stories ne
  // sont plus jamais détruites (cf. ephemeralPosts.SWEPT_POST_TYPES) : cette
  // route est le chemin d'accès à l'historique illimité, distinct du tray qui
  // borne l'archive auteur à 7 j pour ne pas noyer les stories des amis.
  fastify.get('/posts/stories/mine', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const rawCursor = (request.query as Record<string, unknown> | undefined)?.cursor;
      const cursor = typeof rawCursor === 'string' && rawCursor.length > 0 ? rawCursor : undefined;
      // SSOT `validatePagination` (cursor route: limit only) — NaN→default,
      // below-1→floor, over-50→cap. Consolidates the hand-rolled clamp.
      const rawLimit = (request.query as Record<string, unknown> | undefined)?.limit;
      const { limit } = validatePagination(undefined, typeof rawLimit === 'string' ? rawLimit : undefined, { defaultLimit: 20, maxLimit: 50 });

      const result = await feedService.getStories(authContext.registeredUser.id, {
        cursor, limit, archiveOfAuthor: true,
        reader: wireReaderFromRequest(request as UnifiedAuthRequest),
      });

      reply.header('Cache-Control', 'private, no-cache');
      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/stories/mine] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/feed/reels — Vertical full-screen reel thread.
  // `?seed=<reelId>` (réel touché dans le Feed) → thread d'affinité ; sans seed
  // → onglet « Pour toi » (affinité utilisateur seule).
  fastify.get('/posts/feed/reels', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const query = ReelFeedQuerySchema.safeParse(request.query);
      const { cursor, limit, seed } = query.success
        ? query.data
        : { cursor: undefined, limit: 20, seed: undefined };

      const result = await feedService.getReels(authContext.registeredUser.id, {
        seedReelId: seed,
        cursor,
        limit,
        reader: wireReaderFromRequest(request as UnifiedAuthRequest),
      });

      reply.header('Cache-Control', 'private, no-cache');

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/feed/reels] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/feed/statuses — Active statuses/moods
  fastify.get('/posts/feed/statuses', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const query = FeedQuerySchema.safeParse(request.query);
      const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 20 };

      const result = await feedService.getStatuses(authContext.registeredUser.id, cursor, limit, wireReaderFromRequest(request as UnifiedAuthRequest));

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/feed/statuses] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/feed/statuses/discover — Public statuses (platform-wide)
  fastify.get('/posts/feed/statuses/discover', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const query = FeedQuerySchema.safeParse(request.query);
      const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 20 };

      const result = await feedService.getDiscoverStatuses(authContext.registeredUser.id, cursor, limit, wireReaderFromRequest(request as UnifiedAuthRequest));

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/feed/statuses/discover] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/user/:userId — User profile posts
  fastify.get('/posts/user/:userId', {
    preValidation: [optionalAuth],
  }, async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const viewerUserId = authContext?.registeredUser?.id;
      const { userId } = request.params;

      const query = FeedQuerySchema.safeParse(request.query);
      const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 20 };

      const result = await feedService.getUserPosts(userId, viewerUserId, cursor, limit, wireReaderFromRequest(request as UnifiedAuthRequest));

      reply.header('Cache-Control', 'private, no-cache');

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/user/:userId] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/community/:communityId — Community feed
  fastify.get('/posts/community/:communityId', {
    preValidation: [optionalAuth],
  }, async (request: FastifyRequest<{ Params: CommunityParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const viewerUserId = authContext?.registeredUser?.id;
      const { communityId } = request.params;

      const query = FeedQuerySchema.safeParse(request.query);
      const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 20 };

      const result = await feedService.getCommunityFeed(communityId, viewerUserId, cursor, limit, wireReaderFromRequest(request as UnifiedAuthRequest));

      reply.header('Cache-Control', 'private, no-cache');

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/community/:communityId] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/bookmarks — User's bookmarked posts
  fastify.get('/posts/bookmarks', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const query = FeedQuerySchema.safeParse(request.query);
      const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 20 };

      const result = await feedService.getBookmarks(authContext.registeredUser.id, cursor, limit, wireReaderFromRequest(request as UnifiedAuthRequest));

      reply.header('Cache-Control', 'private, no-cache');

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/bookmarks] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
