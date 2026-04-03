import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostFeedService } from '../../services/PostFeedService';
import { FeedQuerySchema, UserParams, CommunityParams } from './types';
import { sendSuccess } from '../../utils/response';
import { resolveMentionedUsers } from '../../services/MentionService';

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
  const feedService = new PostFeedService(prisma);

  // GET /posts/feed — Main ranked feed
  fastify.get('/posts/feed', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const query = FeedQuerySchema.safeParse(request.query);
      const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 20 };

      const result = await feedService.getFeed(authContext.registeredUser.id, cursor, limit);

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
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /posts/feed/stories — Active stories
  fastify.get('/posts/feed/stories', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const stories = await feedService.getStories(authContext.registeredUser.id);

      const storyContents = collectPostContents(stories);
      const storyMentionedUsers = storyContents.length > 0
        ? await resolveMentionedUsers(prisma, storyContents)
        : [];

      return sendSuccess(reply, stories, { meta: { mentionedUsers: storyMentionedUsers } });
    } catch (error) {
      fastify.log.error(`[GET /posts/feed/stories] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /posts/feed/statuses — Active statuses/moods
  fastify.get('/posts/feed/statuses', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
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
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /posts/feed/statuses/discover — Public statuses (platform-wide)
  fastify.get('/posts/feed/statuses/discover', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
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
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
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
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
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
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /posts/bookmarks — User's bookmarked posts
  fastify.get('/posts/bookmarks', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const query = FeedQuerySchema.safeParse(request.query);
      const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 20 };

      const result = await feedService.getBookmarks(authContext.registeredUser.id, cursor, limit);

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
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
