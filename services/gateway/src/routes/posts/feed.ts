import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostFeedService } from '../../services/PostFeedService';
import { FeedQuerySchema, ReelFeedQuerySchema, UserParams, CommunityParams } from './types';
import { sendSuccess, sendUnauthorized, sendInternalError } from '../../utils/response';
import { resolveMentionedUsers } from '../../services/MentionService';
import { getCacheStore } from '../../services/CacheStore';

function collectPostContents(posts: unknown[]): string[] {
  const contents: string[] = [];
  for (const post of posts) {
    const p = post as any;
    if (p.content) contents.push(p.content);
    if (Array.isArray(p.comments)) {
      for (const c of p.comments) {
        if (c.content) contents.push(c.content);
      }
    }
  }
  return contents;
}

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

      const result = await feedService.getFeed(authContext.registeredUser.id, cursor, limit);

      reply.header('Cache-Control', 'private, no-cache');

      const feedContents = collectPostContents(result.items);
      const mentionedUsers = feedContents.length > 0
        ? await resolveMentionedUsers(prisma, feedContents)
        : [];

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
        meta: { mentionedUsers },
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

      const stories = await feedService.getStories(authContext.registeredUser.id, { updatedSince, projection });

      reply.header('Cache-Control', 'private, no-cache');

      const storyContents = collectPostContents(stories);
      const storyMentionedUsers = storyContents.length > 0
        ? await resolveMentionedUsers(prisma, storyContents)
        : [];

      return sendSuccess(reply, stories, { meta: { mentionedUsers: storyMentionedUsers } });
    } catch (error) {
      fastify.log.error(`[GET /posts/feed/stories] Error: ${error}`);
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
      });

      reply.header('Cache-Control', 'private, no-cache');

      const reelContents = collectPostContents(result.items);
      const reelMentionedUsers = reelContents.length > 0
        ? await resolveMentionedUsers(prisma, reelContents)
        : [];

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
        meta: { mentionedUsers: reelMentionedUsers },
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

      const result = await feedService.getStatuses(authContext.registeredUser.id, cursor, limit);

      const statusContents = collectPostContents(result.items);
      const statusMentionedUsers = statusContents.length > 0
        ? await resolveMentionedUsers(prisma, statusContents)
        : [];

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
        meta: { mentionedUsers: statusMentionedUsers },
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

      const result = await feedService.getDiscoverStatuses(authContext.registeredUser.id, cursor, limit);

      const discoverContents = collectPostContents(result.items);
      const discoverMentionedUsers = discoverContents.length > 0
        ? await resolveMentionedUsers(prisma, discoverContents)
        : [];

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
        meta: { mentionedUsers: discoverMentionedUsers },
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

      const result = await feedService.getUserPosts(userId, viewerUserId, cursor, limit);

      reply.header('Cache-Control', 'private, no-cache');

      const userPostContents = collectPostContents(result.items);
      const userPostMentionedUsers = userPostContents.length > 0
        ? await resolveMentionedUsers(prisma, userPostContents)
        : [];

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
        meta: { mentionedUsers: userPostMentionedUsers },
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

      const result = await feedService.getCommunityFeed(communityId, viewerUserId, cursor, limit);

      reply.header('Cache-Control', 'private, no-cache');

      const communityContents = collectPostContents(result.items);
      const communityMentionedUsers = communityContents.length > 0
        ? await resolveMentionedUsers(prisma, communityContents)
        : [];

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
        meta: { mentionedUsers: communityMentionedUsers },
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

      const result = await feedService.getBookmarks(authContext.registeredUser.id, cursor, limit);

      reply.header('Cache-Control', 'private, no-cache');

      const bookmarkContents = collectPostContents(result.items);
      const bookmarkMentionedUsers = bookmarkContents.length > 0
        ? await resolveMentionedUsers(prisma, bookmarkContents)
        : [];

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
        meta: { mentionedUsers: bookmarkMentionedUsers },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/bookmarks] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
