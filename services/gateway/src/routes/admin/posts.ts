import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendPaginatedSuccess, sendUnauthorized, sendForbidden, sendNotFound, sendBadRequest, sendInternalError } from '../../utils/response.js';
import { permissionsService } from './services/PermissionsService';
import { type UserRole } from './types';
import { validatePagination } from '../../utils/pagination';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { authorSelect, mediaSelect, NOT_DELETED } from '../../services/posts/postIncludes';

// Middleware d'autorisation admin
const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as UnifiedAuthRequest).authContext;
  if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
    return sendUnauthorized(reply, 'Authentification requise');
  }

  const permissions = permissionsService.getUserPermissions(authContext.registeredUser.role as UserRole);
  if (!permissions.canAccessAdmin) {
    return sendForbidden(reply, 'Acces administrateur requis');
  }
};

// Query type for listing posts
interface PostListQuery {
  offset?: string;
  limit?: string;
  search?: string;
  type?: string;
  visibility?: string;
  authorId?: string;
  period?: 'today' | 'week' | 'month';
  isDeleted?: string;
  isPinned?: string;
}

// authorSelect / mediaSelect are shared from services/posts/postIncludes.
// Adding `language`, `variantOf`, `transcription`, `translations` here (via the
// shared select) closes the Prisme Linguistique drift that previously affected
// the admin views.

function buildPeriodFilter(period: string): Date {
  const startDate = new Date();

  switch (period) {
    case 'today':
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'week':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      startDate.setDate(startDate.getDate() - 30);
      break;
  }

  return startDate;
}

export async function adminPostRoutes(fastify: FastifyInstance): Promise<void> {

  // ──────────────────────────────────────────────────────────────────────
  // GET /posts/stats — Post statistics
  // Registered BEFORE /posts/:postId to avoid route conflict
  // ──────────────────────────────────────────────────────────────────────
  fastify.get('/posts/stats', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get post statistics: totals by type, top authors, trending posts. Requires canViewAnalytics or canModerateContent permission.',
      tags: ['admin'],
      summary: 'Post statistics',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['today', 'week', 'month'], description: 'Time period for statistics' }
        }
      },
      response: {
        200: {
          description: 'Post statistics retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object', additionalProperties: true }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role as UserRole);

      /* istanbul ignore next -- all admin roles passing canAccessAdmin have canViewAnalytics or canModerateContent; guard unreachable */
      if (!permissions.canViewAnalytics && !permissions.canModerateContent) {
        return sendForbidden(reply, 'Permission insuffisante pour voir les statistiques des posts');
      }

      const { period } = request.query as { period?: string };

      const dateFilter: any = {};
      if (period) {
        dateFilter.createdAt = { gte: buildPeriodFilter(period) };
      }

      // Gather statistics in parallel
      const [
        totalPosts,
        totalByType,
        totalDeleted,
        topAuthors,
        trending
      ] = await Promise.all([
        // Total posts (non-deleted)
        fastify.prisma.post.count({
          where: { deletedAt: NOT_DELETED, ...dateFilter }
        }),

        // Count by type
        fastify.prisma.post.groupBy({
          by: ['type'],
          where: { deletedAt: NOT_DELETED, ...dateFilter },
          _count: { id: true }
        }),

        // Deleted posts
        fastify.prisma.post.count({
          where: { deletedAt: { not: null }, ...dateFilter }
        }),

        // Top 10 authors by post count
        fastify.prisma.post.groupBy({
          by: ['authorId'],
          where: { deletedAt: NOT_DELETED, ...dateFilter },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10
        }),

        // Top 10 trending posts by engagement (likes + comments + reposts)
        fastify.prisma.post.findMany({
          where: { deletedAt: NOT_DELETED, ...dateFilter },
          select: {
            id: true,
            type: true,
            content: true,
            likeCount: true,
            commentCount: true,
            repostCount: true,
            viewCount: true,
            shareCount: true,
            bookmarkCount: true,
            createdAt: true,
            author: { select: authorSelect },
          },
          orderBy: [
            { likeCount: 'desc' },
            { commentCount: 'desc' },
          ],
          take: 10
        })
      ]);

      // Resolve author info for top authors
      const authorIds = topAuthors.map((a) => a.authorId);
      const authors = authorIds.length > 0
        ? await fastify.prisma.user.findMany({
            where: { id: { in: authorIds } },
            select: authorSelect,
          })
        : [];

      const authorMap = new Map(authors.map((a) => [a.id, a]));

      const byType: Record<string, number> = {};
      for (const group of totalByType) {
        byType[group.type] = group._count.id;
      }

      return sendSuccess(reply, {
        total: totalPosts,
        deleted: totalDeleted,
        byType,
        topAuthors: topAuthors.map((a) => ({
          author: authorMap.get(a.authorId) ?? { id: a.authorId },
          postCount: a._count.id
        })),
        trending
      });

    } catch (error) {
      logError(fastify.log, 'Get admin post stats error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // GET /posts — List posts with filters and pagination
  // ──────────────────────────────────────────────────────────────────────
  fastify.get('/posts', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get paginated list of posts with filtering by type, visibility, author, date range, and deletion status. Requires canModerateContent permission.',
      tags: ['admin'],
      summary: 'List posts with pagination',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Pagination offset', default: '0' },
          limit: { type: 'string', description: 'Pagination limit (max 100)', default: '20' },
          search: { type: 'string', description: 'Search in post content' },
          type: { type: 'string', enum: ['POST', 'REEL', 'STORY', 'STATUS'], description: 'Filter by post type' },
          visibility: { type: 'string', enum: ['PUBLIC', 'FRIENDS', 'COMMUNITY', 'PRIVATE', 'EXCEPT', 'ONLY'], description: 'Filter by visibility' },
          authorId: { type: 'string', description: 'Filter by author user ID' },
          period: { type: 'string', enum: ['today', 'week', 'month'], description: 'Filter by time period' },
          isDeleted: { type: 'string', enum: ['true', 'false'], description: 'Filter by deletion status (default: non-deleted only)' },
          isPinned: { type: 'string', enum: ['true', 'false'], description: 'Filter by pinned status' }
        }
      },
      response: {
        200: {
          description: 'Posts list successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: { type: 'object' } },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role as UserRole);

      if (!permissions.canModerateContent) {
        return sendForbidden(reply, 'Permission insuffisante pour gerer les posts');
      }

      const {
        offset = '0',
        limit = '20',
        search,
        type,
        visibility,
        authorId,
        period,
        isDeleted,
        isPinned
      } = request.query as PostListQuery;

      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

      // Build filters
      const where: any = {};

      // Default to non-deleted posts unless explicitly requested
      if (isDeleted === 'true') {
        where.deletedAt = { not: null };
      } else if (isDeleted === 'false' || isDeleted === undefined) {
        where.deletedAt = null;
      }

      if (search) {
        where.content = { contains: search, mode: 'insensitive' };
      }

      if (type) {
        where.type = type;
      }

      if (visibility) {
        where.visibility = visibility;
      }

      if (authorId) {
        where.authorId = authorId;
      }

      if (isPinned !== undefined) {
        where.isPinned = isPinned === 'true';
      }

      if (period) {
        where.createdAt = { gte: buildPeriodFilter(period) };
      }

      const [posts, totalCount] = await Promise.all([
        fastify.prisma.post.findMany({
          where,
          select: {
            id: true,
            type: true,
            visibility: true,
            content: true,
            originalLanguage: true,
            communityId: true,
            moodEmoji: true,
            isPinned: true,
            isEdited: true,
            deletedAt: true,
            expiresAt: true,
            likeCount: true,
            commentCount: true,
            repostCount: true,
            viewCount: true,
            bookmarkCount: true,
            shareCount: true,
            createdAt: true,
            updatedAt: true,
            author: { select: authorSelect },
            media: {
              select: mediaSelect,
              orderBy: { order: 'asc' }
            },
            _count: {
              select: {
                comments: true,
                views: true,
                bookmarks: true,
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.post.count({ where })
      ]);

      return sendPaginatedSuccess(reply, posts, {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + posts.length < totalCount
      });

    } catch (error) {
      logError(fastify.log, 'Get admin posts error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // GET /posts/:postId — Get single post with all details
  // ──────────────────────────────────────────────────────────────────────
  fastify.get('/posts/:postId', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get a single post with full details including comments, reactions, views, and media. Requires canModerateContent permission.',
      tags: ['admin'],
      summary: 'Get post details',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          postId: { type: 'string', description: 'Post ID' }
        },
        required: ['postId']
      },
      response: {
        200: {
          description: 'Post details retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object', additionalProperties: true }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: { postId: string } }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role as UserRole);

      if (!permissions.canModerateContent) {
        return sendForbidden(reply, 'Permission insuffisante pour voir les details du post');
      }

      const { postId } = request.params;

      const post = await fastify.prisma.post.findUnique({
        where: { id: postId },
        include: {
          author: { select: authorSelect },
          media: {
            select: mediaSelect,
            orderBy: { order: 'asc' }
          },
          comments: {
            where: { deletedAt: NOT_DELETED },
            select: {
              id: true,
              content: true,
              originalLanguage: true,
              likeCount: true,
              replyCount: true,
              isEdited: true,
              deletedAt: true,
              createdAt: true,
              author: { select: authorSelect },
            },
            orderBy: { createdAt: 'desc' },
            take: 50
          },
          views: {
            select: {
              id: true,
              userId: true,
              viewedAt: true,
              duration: true,
              user: { select: authorSelect },
            },
            orderBy: { viewedAt: 'desc' },
            take: 50
          },
          repostOf: {
            select: {
              id: true,
              content: true,
              type: true,
              createdAt: true,
              author: { select: authorSelect },
            }
          },
          community: {
            select: {
              id: true,
              identifier: true,
              name: true,
              avatar: true,
            }
          },
          _count: {
            select: {
              comments: true,
              views: true,
              bookmarks: true,
              reposts: true,
            }
          }
        }
      });

      if (!post) {
        return sendNotFound(reply, 'Post non trouve');
      }

      return sendSuccess(reply, post);

    } catch (error) {
      logError(fastify.log, 'Get admin post detail error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // DELETE /posts/:postId — Admin force-delete a post
  // ──────────────────────────────────────────────────────────────────────
  fastify.delete('/posts/:postId', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Admin force-delete a post (soft delete). Requires canModerateContent permission. Only BIGBOSS, ADMIN, and MODERATOR roles can delete posts.',
      tags: ['admin'],
      summary: 'Force-delete a post',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          postId: { type: 'string', description: 'Post ID' }
        },
        required: ['postId']
      },
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Reason for deletion (for audit trail)' }
        }
      },
      response: {
        200: {
          description: 'Post deleted successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: { postId: string }; Body: { reason?: string } }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role as UserRole);

      if (!permissions.canModerateContent) {
        return sendForbidden(reply, 'Permission insuffisante pour supprimer les posts');
      }

      const { postId } = request.params;
      const { reason } = request.body ?? {};

      const post = await fastify.prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, deletedAt: true, authorId: true }
      });

      if (!post) {
        return sendNotFound(reply, 'Post non trouve');
      }

      if (post.deletedAt) {
        return sendBadRequest(reply, 'Le post est deja supprime');
      }

      await fastify.prisma.post.update({
        where: { id: postId },
        data: {
          deletedAt: new Date()
        }
      });

      fastify.log.info({
        action: 'admin_post_delete',
        postId,
        deletedBy: user.id,
        reason: reason ?? 'No reason provided'
      });

      return sendSuccess(reply, undefined, { message: 'Post supprime avec succes' });

    } catch (error) {
      logError(fastify.log, 'Admin delete post error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
