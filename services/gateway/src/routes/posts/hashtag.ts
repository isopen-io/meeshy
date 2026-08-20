import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendBadRequest } from '../../utils/response';
import { postInclude, NOT_DELETED } from '../../services/posts/postIncludes';
import { withMentions } from '../../services/posts/postReferences';
import { wireReaderFromRequest } from '../../services/posts/storyEffectsV3';
import { hoistLocationDeep } from '../../services/location/sharedPlace';
import { getCommunityCoMemberIds } from '../../services/posts/communityVisibility';

/**
 * GET /posts/hashtag/:tag + GET /hashtags/trending — recherche et tendances
 * de hashtags (Hashtag/PostHashtag, écrits par HashtagService).
 *
 * Design : docs/superpowers/specs/2026-08-03-post-hashtags-and-rich-content-design.md §3
 *
 * Visibilité volontairement PLUS ÉTROITE que le feed personnalisé complet
 * (`buildPostVisibilityOrFilter`, qui inclut FRIENDS/EXCEPT/ONLY) : la
 * découverte par hashtag est une surface de DÉCOUVERTE (comme
 * `getDiscoverStatuses`/`GET /posts/nearby`), pas le feed personnalisé —
 * PUBLIC + COMMUNITY (co-membre) uniquement, jamais FRIENDS-only même si le
 * viewer fait partie de l'audience. Décision assumée (spec §Décisions).
 */

const HashtagPostsQuerySchema = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const TrendingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#/, '');
}

export function registerHashtagRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
) {
  fastify.get('/posts/hashtag/:tag', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = (request as UnifiedAuthRequest).authContext;
    if (!authContext?.registeredUser) {
      return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    }

    const parsedQuery = HashtagPostsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
    }
    const { cursor, limit } = parsedQuery.data;
    const tag = normalizeTag((request.params as { tag: string }).tag);

    const hashtag = await prisma.hashtag.findUnique({ where: { tag } });
    if (!hashtag) {
      return sendSuccess(reply, [], { pagination: { limit, hasMore: false, nextCursor: null } });
    }

    const links = await prisma.postHashtag.findMany({
      where: { hashtagId: hashtag.id },
      orderBy: { createdAt: 'desc' },
      skip: cursor,
      take: limit + 1,
      select: { postId: true },
    });
    const hasMore = links.length > limit;
    const pageLinks = hasMore ? links.slice(0, limit) : links;
    const orderedIds = pageLinks.map((l) => l.postId);
    const nextCursor = hasMore ? String(cursor + limit) : null;

    if (orderedIds.length === 0) {
      return sendSuccess(reply, [], { pagination: { limit, hasMore: false, nextCursor: null } });
    }

    const communityCoMemberIds = await getCommunityCoMemberIds(prisma, authContext.registeredUser.id);
    const posts = await prisma.post.findMany({
      where: {
        id: { in: orderedIds },
        type: { in: ['POST', 'REEL'] },
        deletedAt: NOT_DELETED,
        OR: [
          { authorId: authContext.registeredUser.id },
          { visibility: 'PUBLIC' },
          { visibility: 'COMMUNITY', authorId: { in: communityCoMemberIds } },
        ],
      },
      include: postInclude,
    });
    const postsById = new Map(posts.map((post) => [post.id, post]));

    const data = orderedIds
      .map((id) => postsById.get(id))
      .filter((post): post is NonNullable<typeof post> => post !== undefined)
      .map((post) => withMentions(hoistLocationDeep(post), wireReaderFromRequest(request as UnifiedAuthRequest)));

    return sendSuccess(reply, data, { pagination: { limit, hasMore, nextCursor } });
  });

  fastify.get('/hashtags/trending', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = (request as UnifiedAuthRequest).authContext;
    if (!authContext?.registeredUser) {
      return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    }

    const parsed = TrendingQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
    }

    const hashtags = await prisma.hashtag.findMany({
      where: { usageCount: { gt: 0 } },
      orderBy: { usageCount: 'desc' },
      take: parsed.data.limit,
      select: { tag: true, usageCount: true },
    });

    return sendSuccess(reply, hashtags);
  });
}
