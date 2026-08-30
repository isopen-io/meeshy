import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendPaginatedSuccess, sendUnauthorized, sendForbidden, sendNotFound, sendBadRequest, sendInternalError } from '../../utils/response.js';
import { permissionsService } from './services/PermissionsService';
import { type UserRole } from './types';
import { validatePagination } from '../../utils/pagination';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { authorSelect, mediaSelect, NOT_DELETED } from '../../services/posts/postIncludes';
import { applyPostRemovalEffects } from '../../services/posts/postRemovalEffects';
import { broadcastPostRemoval } from '../../socketio/broadcastPostRemoval';
import { requirePermission } from '../../middleware/authorize';

/**
 * Ligne de la liste d'administration des posts.
 *
 * Elle était déclarée `data: { type: 'array', items: { type: 'object' } }` :
 * sans `properties`, fast-json-stringify (`additionalProperties: false` par
 * défaut) sérialisait CHAQUE post en `{}`. La liste sortait de la bonne
 * longueur, avec sa pagination juste, et toutes ses lignes vides — la forme la
 * plus trompeuse de ce défaut, parce qu'elle ressemble à une réponse valide.
 * `UserPostsSection.tsx` la lit.
 *
 * Source de vérité de la forme : le `select` du handler, dont la valeur part
 * telle quelle dans `sendPaginatedSuccess`. `author` suit `authorSelect` et
 * `media` suit `mediaSelect` (`services/posts/postIncludes`).
 */
const adminPostRowSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string', nullable: true },
    visibility: { type: 'string', nullable: true },
    content: { type: 'string', nullable: true },
    originalLanguage: { type: 'string', nullable: true },
    communityId: { type: 'string', nullable: true },
    moodEmoji: { type: 'string', nullable: true },
    isPinned: { type: 'boolean', nullable: true },
    isEdited: { type: 'boolean', nullable: true },
    deletedAt: { type: 'string', format: 'date-time', nullable: true },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    likeCount: { type: 'number', nullable: true },
    commentCount: { type: 'number', nullable: true },
    repostCount: { type: 'number', nullable: true },
    viewCount: { type: 'number', nullable: true },
    bookmarkCount: { type: 'number', nullable: true },
    shareCount: { type: 'number', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true },
    author: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        username: { type: 'string', nullable: true },
        displayName: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true }
      }
    },
    media: {
      type: 'array',
      // `mediaSelect` porte dix-neuf champs et suit le pipeline média. Un média
      // est ici une donnée d'inspection, pas un contrat client : le laisser
      // passer entier vaut mieux que d'en figer une copie qui dériverait.
      items: { type: 'object', additionalProperties: true }
    },
    _count: {
      type: 'object',
      properties: {
        comments: { type: 'number' },
        views: { type: 'number' },
        bookmarks: { type: 'number' }
      }
    }
  }
} as const;

// Middleware d'autorisation admin
// `requireAdmin` était une garde LOCALE : elle rejouait une liste de rôles en dur
// (#4153). Elle nomme désormais la permission qu'elle exige, et la matrice
// décide — un seul endroit où lire la loi, un seul où la changer.
const requireAdmin = requirePermission('canAccessAdmin');

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

/**
 * Projection RACINE de `GET /admin/posts/:postId` (#4166, critère 1 —
 * famille « include sans select à la racine »).
 *
 * L'ancien `include: {...}` sans `select` de tête laissait « toute colonne
 * ajoutée au modèle `Post` part[ir] automatiquement » (texte de l'issue) —
 * et le schéma de réponse de cette route est `additionalProperties: true`
 * (une vue d'inspection admin, pas un contrat client fermé, cf.
 * `mediaSelect` ci-dessus), donc RIEN ne filtrait ce qui sort. Les 42 champs
 * scalaires ci-dessous sont la totalité de ceux que `schema.prisma` déclare
 * aujourd'hui sur `Post` : ce n'est PAS une réduction (le champ le plus
 * lourd, `Post.metadata`, reste servi — décision de détail, pas de liste) —
 * c'est le même contenu, rendu EXPLICITE. Un champ futur du modèle
 * n'apparaîtra plus ici tout seul ; il faudra l'y ajouter, comme pour tout
 * `select` nommé du dépôt.
 */
const adminPostDetailSelect = {
  id: true,
  authorId: true,
  type: true,
  visibility: true,
  visibilityUserIds: true,
  content: true,
  originalLanguage: true,
  translations: true,
  metadata: true,
  geoPoint: true,
  geoPrecision: true,
  communityId: true,
  repostOfId: true,
  originalRepostOfId: true,
  isQuote: true,
  storyEffects: true,
  allowSoundExtraction: true,
  moodEmoji: true,
  audioUrl: true,
  audioDuration: true,
  expiresAt: true,
  reactionSummary: true,
  reactionCount: true,
  reactions: true,
  storyViews: true,
  likeCount: true,
  commentCount: true,
  repostCount: true,
  viewCount: true,
  impressionCount: true,
  bookmarkCount: true,
  shareCount: true,
  postOpenCount: true,
  qualifiedViewCount: true,
  playCount: true,
  downloadCount: true,
  isPinned: true,
  isEdited: true,
  contentEditedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: authorSelect },
  media: {
    select: mediaSelect,
    orderBy: { order: 'asc' as const }
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
    orderBy: { createdAt: 'desc' as const },
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
    orderBy: { viewedAt: 'desc' as const },
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
};

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
            data: { type: 'array', items: adminPostRowSchema },
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
        select: adminPostDetailSelect
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

      // `type` / `visibility` / `visibilityUserIds` ne servent pas au retrait
      // lui-même mais à l'annoncer : ils choisissent l'événement et refiltrent
      // l'audience (`broadcastPostRemoval`). Prisma `select` : ce qui n'est pas
      // demandé ici n'existe pas plus bas.
      const post = await fastify.prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, deletedAt: true, authorId: true, type: true, visibility: true, visibilityUserIds: true }
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

      // Deuxième dette du même raccourci : écrire `deletedAt` sans passer par
      // `PostService.deletePost`, c'est aussi n'annoncer le retrait à personne.
      // Rien ne rejoue ces événements et aucun client ne refetch spontanément —
      // sans ceci, un post retiré depuis la console restait affiché dans le fil
      // de tous ses lecteurs, auteur compris.
      //
      // Émis AVANT les effets durables : `deletedAt` est déjà committé, donc le
      // retrait est vrai, et cette diffusion ne s'attend pas (elle rend `void`).
      // Derrière deux écritures best-effort, elle partait après leurs
      // aller-retours base — de la latence pure sur le seul effet que quelqu'un
      // regarde en temps réel.
      broadcastPostRemoval(
        fastify.socialEvents,
        post,
        (err) => fastify.log.warn({ err }, '[DELETE /admin/posts/:postId]: broadcast deletion failed')
      );

      // Cette route écrit `deletedAt` SANS passer par `PostService.deletePost`.
      // Tout ce qu'un retrait doit écrire en base — ligne d'audit, coupure des
      // liens de partage, libération des usages de sons — vit désormais dans
      // `applyPostRemovalEffects`, partagé avec le service. Les trois effets
      // ont été rattrapés ici un par un, à des cycles d'intervalle, parce que
      // rien ne nommait la liste : il n'y a plus qu'un endroit à tenir.
      await applyPostRemovalEffects(fastify.prisma, post, { id: user.id, reason });

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
