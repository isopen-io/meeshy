/**
 * Routes for user-specific community preferences
 * Handles personal settings: pin, mute, archive, notifications, etc.
 *
 * Routes:
 * - GET /user-preferences/communities/:communityId - Get preferences (with defaults)
 * - GET /user-preferences/communities - List all (paginated)
 * - PUT /user-preferences/communities/:communityId - Upsert preferences
 * - DELETE /user-preferences/communities/:communityId - Delete preferences
 * - POST /user-preferences/communities/reorder - Batch reorder
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../utils/logger';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { COMMUNITY_PREFERENCES_DEFAULTS } from '../config/user-preferences-defaults';

interface CommunityPreferencesBody {
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  isHidden?: boolean;
  notificationLevel?: 'all' | 'mentions' | 'none';
  customName?: string | null;
  categoryId?: string | null;
  orderInCategory?: number | null;
}

interface CommunityIdParams {
  communityId: string;
}

// ========== SCHEMAS FOR OPENAPI DOCUMENTATION ==========

const communityPreferencesSchema = {
  type: 'object',
  description: 'User preferences for a specific community',
  properties: {
    id: { type: 'string', nullable: true, description: 'Unique preference ID (null if default)' },
    userId: { type: 'string', description: 'User ID' },
    communityId: { type: 'string', description: 'Community ID' },
    isPinned: { type: 'boolean', description: 'Whether community is pinned' },
    isMuted: { type: 'boolean', description: 'Whether community is muted' },
    isArchived: { type: 'boolean', description: 'Whether community is archived' },
    isHidden: { type: 'boolean', description: 'Whether community is hidden' },
    notificationLevel: {
      type: 'string',
      enum: ['all', 'mentions', 'none'],
      description: 'Notification level for this community'
    },
    customName: { type: 'string', nullable: true, description: 'User-defined custom community name' },
    categoryId: { type: 'string', nullable: true, description: 'Category ID if community is categorized' },
    orderInCategory: { type: 'number', nullable: true, description: 'Display order within category' },
    isDefault: { type: 'boolean', description: 'Whether this is using default values' },
    createdAt: { type: 'string', format: 'date-time', nullable: true, description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last update timestamp' }
  }
} as const;

const updateCommunityPreferencesRequestSchema = {
  type: 'object',
  properties: {
    isPinned: { type: 'boolean', description: 'Pin/unpin community' },
    isMuted: { type: 'boolean', description: 'Mute/unmute community' },
    isArchived: { type: 'boolean', description: 'Archive/unarchive community' },
    isHidden: { type: 'boolean', description: 'Hide/show community' },
    notificationLevel: {
      type: 'string',
      enum: ['all', 'mentions', 'none'],
      description: 'Notification level'
    },
    customName: { type: 'string', nullable: true, description: 'Custom community name' },
    categoryId: { type: 'string', nullable: true, description: 'Category ID or null to uncategorize' },
    orderInCategory: { type: 'number', nullable: true, description: 'Order within category' }
  }
} as const;

const reorderCommunitiesRequestSchema = {
  type: 'object',
  required: ['updates'],
  properties: {
    updates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['communityId', 'orderInCategory'],
        properties: {
          communityId: { type: 'string', description: 'Community ID' },
          orderInCategory: { type: 'number', minimum: 0, description: 'New order value' }
        }
      },
      description: 'Array of community reorder updates'
    }
  }
} as const;

const paginationQuerySchema = {
  type: 'object',
  properties: {
    offset: { type: 'string', pattern: '^[0-9]+$', description: 'Number of items to skip (default: 0)' },
    limit: { type: 'string', pattern: '^[0-9]+$', description: 'Maximum items to return (default: 50, max: 100)' }
  }
} as const;

const paginatedResponseMeta = {
  type: 'object',
  properties: {
    total: { type: 'number', description: 'Total count of items' },
    limit: { type: 'number', description: 'Items per page' },
    offset: { type: 'number', description: 'Number of items skipped' },
    hasMore: { type: 'boolean', description: 'Whether more items are available' }
  }
} as const;

const successMessageResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Success message' }
      }
    }
  }
} as const;

/**
 * Validate and sanitize pagination parameters
 */
function validatePagination(
  offset: string = '0',
  limit: string = '50',
  defaultLimit: number = 50,
  maxLimit: number = 100
): { offsetNum: number; limitNum: number } {
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || defaultLimit), maxLimit);
  return { offsetNum, limitNum };
}

export default async function communityPreferencesRoutes(fastify: FastifyInstance) {

  /**
   * GET /user-preferences/communities/:communityId
   * Get user preferences for a specific community
   */
  fastify.get<{ Params: CommunityIdParams }>(
    '/user-preferences/communities/:communityId',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Get user preferences for a specific community. Returns stored values or defaults if not set.',
        tags: ['communities', 'preferences'],
        summary: 'Get community preferences',
        params: {
          type: 'object',
          required: ['communityId'],
          properties: {
            communityId: { type: 'string', description: 'Community ID' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: communityPreferencesSchema
            }
          },
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Params: CommunityIdParams }>, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const { communityId } = request.params;

        const preferences = await fastify.prisma.userCommunityPreferences.findUnique({
          where: {
            userId_communityId: {
              userId,
              communityId
            }
          }
        });

        // Return stored preferences or defaults
        if (preferences) {
          reply.send({
            success: true,
            data: {
              ...preferences,
              isDefault: false
            }
          });
        } else {
          // Return default preferences for new communities
          reply.send({
            success: true,
            data: {
              id: null,
              userId,
              communityId,
              ...COMMUNITY_PREFERENCES_DEFAULTS,
              isDefault: true,
              createdAt: null,
              updatedAt: null
            }
          });
        }
      } catch (error) {
        logError(fastify.log, 'Error fetching community preferences:', error);
        reply.code(500).send({
          success: false,
          message: 'Error fetching preferences'
        });
      }
    }
  );

  /**
   * GET /user-preferences/communities
   * Get all user community preferences
   */
  fastify.get(
    '/user-preferences/communities',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Get all community preferences for the authenticated user with pagination support.',
        tags: ['communities', 'preferences'],
        summary: 'List all community preferences',
        querystring: paginationQuerySchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'array',
                items: communityPreferencesSchema
              },
              pagination: paginatedResponseMeta
            }
          },
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const { offset = '0', limit = '50' } = request.query as { offset?: string; limit?: string };

        const { offsetNum, limitNum } = validatePagination(offset, limit);

        const whereClause = { userId };

        const [preferences, totalCount] = await Promise.all([
          fastify.prisma.userCommunityPreferences.findMany({
            where: whereClause,
            orderBy: { updatedAt: 'desc' },
            skip: offsetNum,
            take: limitNum
          }),
          fastify.prisma.userCommunityPreferences.count({ where: whereClause })
        ]);

        // Add isDefault: false to all stored preferences
        const preferencesWithDefault = preferences.map(p => ({
          ...p,
          isDefault: false
        }));

        reply.send({
          success: true,
          data: preferencesWithDefault,
          pagination: {
            total: totalCount,
            limit: limitNum,
            offset: offsetNum,
            hasMore: offsetNum + preferences.length < totalCount
          }
        });
      } catch (error) {
        logError(fastify.log, 'Error fetching all community preferences:', error);
        reply.code(500).send({
          success: false,
          message: 'Error fetching preferences'
        });
      }
    }
  );

  /**
   * PUT /user-preferences/communities/:communityId
   * Upsert (create or update) preferences for a community
   */
  fastify.put<{ Params: CommunityIdParams; Body: CommunityPreferencesBody }>(
    '/user-preferences/communities/:communityId',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Create or update preferences for a specific community. Supports partial updates.',
        tags: ['communities', 'preferences'],
        summary: 'Update community preferences',
        params: {
          type: 'object',
          required: ['communityId'],
          properties: {
            communityId: { type: 'string', description: 'Community ID' }
          }
        },
        body: updateCommunityPreferencesRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: communityPreferencesSchema
            }
          },
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Params: CommunityIdParams; Body: CommunityPreferencesBody }>, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const { communityId } = request.params;
        const data = request.body;

        // Prepare update data (filter undefined values)
        const updateData: any = {};
        if (data.isPinned !== undefined) updateData.isPinned = data.isPinned;
        if (data.isMuted !== undefined) updateData.isMuted = data.isMuted;
        if (data.isArchived !== undefined) updateData.isArchived = data.isArchived;
        if (data.isHidden !== undefined) updateData.isHidden = data.isHidden;
        if (data.notificationLevel !== undefined) updateData.notificationLevel = data.notificationLevel;
        if (data.customName !== undefined) updateData.customName = data.customName;
        if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
        if (data.orderInCategory !== undefined) updateData.orderInCategory = data.orderInCategory;

        const preferences = await fastify.prisma.userCommunityPreferences.upsert({
          where: {
            userId_communityId: {
              userId,
              communityId
            }
          },
          create: {
            userId,
            communityId,
            ...updateData
          },
          update: updateData
        });

        reply.send({
          success: true,
          data: {
            ...preferences,
            isDefault: false
          }
        });
      } catch (error) {
        logError(fastify.log, 'Error upserting community preferences:', error);
        reply.code(500).send({
          success: false,
          message: 'Error updating preferences'
        });
      }
    }
  );

  /**
   * DELETE /user-preferences/communities/:communityId
   * Delete preferences for a community (reverts to defaults)
   */
  fastify.delete<{ Params: CommunityIdParams }>(
    '/user-preferences/communities/:communityId',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Delete all preferences for a specific community, resetting it to default state.',
        tags: ['communities', 'preferences'],
        summary: 'Delete community preferences',
        params: {
          type: 'object',
          required: ['communityId'],
          properties: {
            communityId: { type: 'string', description: 'Community ID' }
          }
        },
        response: {
          200: successMessageResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Params: CommunityIdParams }>, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const { communityId } = request.params;

        await fastify.prisma.userCommunityPreferences.delete({
          where: {
            userId_communityId: {
              userId,
              communityId
            }
          }
        });

        reply.send({
          success: true,
          data: { message: 'Preferences deleted successfully' }
        });
      } catch (error: any) {
        if (error.code === 'P2025') {
          return reply.status(404).send({
            success: false,
            message: 'Preferences not found'
          });
        }
        logError(fastify.log, 'Error deleting community preferences:', error);
        reply.code(500).send({
          success: false,
          message: 'Error deleting preferences'
        });
      }
    }
  );

  /**
   * POST /user-preferences/communities/reorder
   * Batch update order for communities
   */
  fastify.post<{ Body: { updates: Array<{ communityId: string; orderInCategory: number }> } }>(
    '/user-preferences/communities/reorder',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Batch update display order for multiple communities. Useful for drag-and-drop reordering.',
        tags: ['communities', 'preferences'],
        summary: 'Reorder communities',
        body: reorderCommunitiesRequestSchema,
        response: {
          200: successMessageResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: { updates: Array<{ communityId: string; orderInCategory: number }> } }>, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const { updates } = request.body;

        // Batch update
        await Promise.all(
          updates.map(update =>
            fastify.prisma.userCommunityPreferences.updateMany({
              where: {
                userId,
                communityId: update.communityId
              },
              data: {
                orderInCategory: update.orderInCategory
              }
            })
          )
        );

        reply.send({
          success: true,
          data: { message: 'Communities reordered successfully' }
        });
      } catch (error) {
        logError(fastify.log, 'Error reordering communities:', error);
        reply.code(500).send({
          success: false,
          message: 'Error reordering communities'
        });
      }
    }
  );
}
