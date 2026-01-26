/**
 * Routes for user-specific conversation preferences
 * Handles personal settings: pin, mute, archive, tags, categories assignment, etc.
 *
 * Routes:
 * - GET /user-preferences/conversations/:conversationId - Get preferences (with defaults)
 * - GET /user-preferences/conversations - List all (paginated)
 * - PUT /user-preferences/conversations/:conversationId - Upsert preferences
 * - DELETE /user-preferences/conversations/:conversationId - Delete preferences
 * - POST /user-preferences/conversations/reorder - Batch reorder
 *
 * Note: Category CRUD has been moved to /me/preferences/categories
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../utils/logger';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { CONVERSATION_PREFERENCES_DEFAULTS } from '../config/user-preferences-defaults';

interface ConversationPreferencesBody {
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  tags?: string[];
  categoryId?: string | null;
  orderInCategory?: number | null;
  customName?: string | null;
  reaction?: string | null;
}

interface ConversationIdParams {
  conversationId: string;
}

// ========== SCHEMAS FOR OPENAPI DOCUMENTATION ==========

const conversationPreferencesSchema = {
  type: 'object',
  description: 'User preferences for a specific conversation',
  properties: {
    id: { type: 'string', nullable: true, description: 'Unique preference ID (null if default)' },
    userId: { type: 'string', description: 'User ID' },
    conversationId: { type: 'string', description: 'Conversation ID' },
    isPinned: { type: 'boolean', description: 'Whether conversation is pinned' },
    isMuted: { type: 'boolean', description: 'Whether conversation is muted' },
    isArchived: { type: 'boolean', description: 'Whether conversation is archived' },
    tags: { type: 'array', items: { type: 'string' }, description: 'User-defined tags' },
    categoryId: { type: 'string', nullable: true, description: 'Category ID if conversation is categorized' },
    orderInCategory: { type: 'number', nullable: true, description: 'Display order within category' },
    customName: { type: 'string', nullable: true, description: 'User-defined custom conversation name' },
    reaction: { type: 'string', nullable: true, description: 'User reaction/emoji for conversation' },
    isDefault: { type: 'boolean', description: 'Whether this is using default values' },
    createdAt: { type: 'string', format: 'date-time', nullable: true, description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last update timestamp' },
    category: {
      type: 'object',
      nullable: true,
      description: 'Category details if categorized',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        color: { type: 'string', nullable: true },
        icon: { type: 'string', nullable: true }
      }
    }
  }
} as const;

const conversationCategorySchema = {
  type: 'object',
  description: 'User-defined conversation category',
  properties: {
    id: { type: 'string', description: 'Unique category ID' },
    userId: { type: 'string', description: 'User ID' },
    name: { type: 'string', description: 'Category name' },
    color: { type: 'string', nullable: true, description: 'Display color (hex code)' },
    icon: { type: 'string', nullable: true, description: 'Icon identifier' },
    order: { type: 'number', description: 'Display order among categories' },
    isExpanded: { type: 'boolean', description: 'Whether category is expanded in UI' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' }
  }
} as const;

const updateConversationPreferencesRequestSchema = {
  type: 'object',
  properties: {
    isPinned: { type: 'boolean', description: 'Pin/unpin conversation' },
    isMuted: { type: 'boolean', description: 'Mute/unmute conversation' },
    isArchived: { type: 'boolean', description: 'Archive/unarchive conversation' },
    tags: { type: 'array', items: { type: 'string' }, description: 'User tags for conversation' },
    categoryId: { type: 'string', nullable: true, description: 'Category ID or null to uncategorize' },
    orderInCategory: { type: 'number', nullable: true, description: 'Order within category' },
    customName: { type: 'string', nullable: true, description: 'Custom conversation name' },
    reaction: { type: 'string', nullable: true, description: 'Emoji reaction' }
  }
} as const;

const createCategoryRequestSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100, description: 'Category name' },
    color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', description: 'Hex color code' },
    icon: { type: 'string', maxLength: 50, description: 'Icon identifier' },
    order: { type: 'number', minimum: 0, description: 'Display order' },
    isExpanded: { type: 'boolean', description: 'Whether expanded by default' }
  }
} as const;

const updateCategoryRequestSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100, description: 'Category name' },
    color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', description: 'Hex color code' },
    icon: { type: 'string', maxLength: 50, description: 'Icon identifier' },
    order: { type: 'number', minimum: 0, description: 'Display order' },
    isExpanded: { type: 'boolean', description: 'Whether expanded' }
  }
} as const;

const reorderConversationsRequestSchema = {
  type: 'object',
  required: ['updates'],
  properties: {
    updates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['conversationId', 'orderInCategory'],
        properties: {
          conversationId: { type: 'string', description: 'Conversation ID' },
          orderInCategory: { type: 'number', minimum: 0, description: 'New order value' }
        }
      },
      description: 'Array of conversation reorder updates'
    }
  }
} as const;

const reorderCategoriesRequestSchema = {
  type: 'object',
  required: ['updates'],
  properties: {
    updates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['categoryId', 'order'],
        properties: {
          categoryId: { type: 'string', description: 'Category ID' },
          order: { type: 'number', minimum: 0, description: 'New order value' }
        }
      },
      description: 'Array of category reorder updates'
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
 * - Ensures offset is never negative
 * - Ensures limit is between 1 and maxLimit (default 100)
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

export default async function conversationPreferencesRoutes(fastify: FastifyInstance) {

  // ========== CONVERSATION PREFERENCES ==========
  // NOTE: Pas besoin de WebSocket ici car chaque utilisateur modifie SES PROPRES préférences
  // Le client met à jour son state local directement après l'appel API

  /**
   * GET /api/user-preferences/conversations/:conversationId
   * Get user preferences for a specific conversation
   */
  fastify.get<{ Params: ConversationIdParams }>(
    '/user-preferences/conversations/:conversationId',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Get user preferences for a specific conversation including pin/mute/archive status, tags, category, and custom settings',
        tags: ['conversations', 'preferences'],
        summary: 'Get conversation preferences',
        params: {
          type: 'object',
          required: ['conversationId'],
          properties: {
            conversationId: { type: 'string', description: 'Conversation ID' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: conversationPreferencesSchema
            }
          },
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Params: ConversationIdParams }>, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const { conversationId } = request.params;

        const preferences = await fastify.prisma.userConversationPreferences.findUnique({
          where: {
            userId_conversationId: {
              userId,
              conversationId
            }
          },
          include: {
            category: true
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
          // Return default preferences for new conversations
          reply.send({
            success: true,
            data: {
              id: null,
              userId,
              conversationId,
              ...CONVERSATION_PREFERENCES_DEFAULTS,
              isDefault: true,
              createdAt: null,
              updatedAt: null,
              category: null
            }
          });
        }
      } catch (error) {
        logError(fastify.log, 'Error fetching conversation preferences:', error);
        reply.code(500).send({
          success: false,
          message: 'Error fetching preferences'
        });
      }
    }
  );

  /**
   * GET /api/user-preferences/conversations
   * Get all user conversation preferences
   */
  fastify.get(
    '/user-preferences/conversations',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Get all conversation preferences for the authenticated user with pagination support. Returns preferences including pin/mute/archive status, tags, categories, and custom settings for each conversation.',
        tags: ['conversations', 'preferences'],
        summary: 'List all conversation preferences',
        querystring: paginationQuerySchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'array',
                items: conversationPreferencesSchema
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
          fastify.prisma.userConversationPreferences.findMany({
            where: whereClause,
            include: {
              category: true
            },
            orderBy: { updatedAt: 'desc' },
            skip: offsetNum,
            take: limitNum
          }),
          fastify.prisma.userConversationPreferences.count({ where: whereClause })
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
        logError(fastify.log, 'Error fetching all conversation preferences:', error);
        reply.code(500).send({
          success: false,
          message: 'Error fetching preferences'
        });
      }
    }
  );

  /**
   * PUT /api/user-preferences/conversations/:conversationId
   * Upsert (create or update) preferences for a conversation
   */
  fastify.put<{ Params: ConversationIdParams; Body: ConversationPreferencesBody }>(
    '/user-preferences/conversations/:conversationId',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Create or update preferences for a specific conversation. Supports partial updates - only provided fields will be modified. Use this to pin/unpin, mute/unmute, archive/unarchive, add tags, assign to category, or set custom name.',
        tags: ['conversations', 'preferences'],
        summary: 'Update conversation preferences',
        params: {
          type: 'object',
          required: ['conversationId'],
          properties: {
            conversationId: { type: 'string', description: 'Conversation ID' }
          }
        },
        body: updateConversationPreferencesRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: conversationPreferencesSchema
            }
          },
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Params: ConversationIdParams; Body: ConversationPreferencesBody }>, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const { conversationId } = request.params;
        const data = request.body;

        // Prepare update data (filter undefined values)
        const updateData: any = {};
        if (data.isPinned !== undefined) updateData.isPinned = data.isPinned;
        if (data.isMuted !== undefined) updateData.isMuted = data.isMuted;
        if (data.isArchived !== undefined) updateData.isArchived = data.isArchived;
        if (data.tags !== undefined) updateData.tags = data.tags;
        if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
        if (data.orderInCategory !== undefined) updateData.orderInCategory = data.orderInCategory;
        if (data.customName !== undefined) updateData.customName = data.customName;
        if (data.reaction !== undefined) updateData.reaction = data.reaction;

        const preferences = await fastify.prisma.userConversationPreferences.upsert({
          where: {
            userId_conversationId: {
              userId,
              conversationId
            }
          },
          create: {
            userId,
            conversationId,
            ...updateData
          },
          update: updateData,
          include: {
            category: true
          }
        });

        reply.send({
          success: true,
          data: {
            ...preferences,
            isDefault: false
          }
        });
      } catch (error) {
        logError(fastify.log, 'Error upserting conversation preferences:', error);
        reply.code(500).send({
          success: false,
          message: 'Error updating preferences'
        });
      }
    }
  );

  /**
   * DELETE /api/user-preferences/conversations/:conversationId
   * Delete preferences for a conversation
   */
  fastify.delete<{ Params: ConversationIdParams }>(
    '/user-preferences/conversations/:conversationId',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Delete all preferences for a specific conversation, resetting it to default state. This removes pin/mute/archive status, tags, category assignment, and custom settings.',
        tags: ['conversations', 'preferences'],
        summary: 'Delete conversation preferences',
        params: {
          type: 'object',
          required: ['conversationId'],
          properties: {
            conversationId: { type: 'string', description: 'Conversation ID' }
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
    async (request: FastifyRequest<{ Params: ConversationIdParams }>, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const { conversationId } = request.params;

        await fastify.prisma.userConversationPreferences.delete({
          where: {
            userId_conversationId: {
              userId,
              conversationId
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
        logError(fastify.log, 'Error deleting conversation preferences:', error);
        reply.code(500).send({
          success: false,
          message: 'Error deleting preferences'
        });
      }
    }
  );

  /**
   * POST /api/user-preferences/reorder
   * Batch update order for conversations within a category
   */
  fastify.post<{ Body: { updates: Array<{ conversationId: string; orderInCategory: number }> } }>(
    '/user-preferences/reorder',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Batch update display order for multiple conversations within their categories. Useful for drag-and-drop reordering in the UI.',
        tags: ['conversations', 'preferences'],
        summary: 'Reorder conversations in category',
        body: reorderConversationsRequestSchema,
        response: {
          200: successMessageResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: { updates: Array<{ conversationId: string; orderInCategory: number }> } }>, reply: FastifyReply) => {
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
            fastify.prisma.userConversationPreferences.updateMany({
              where: {
                userId,
                conversationId: update.conversationId
              },
              data: {
                orderInCategory: update.orderInCategory
              }
            })
          )
        );

        reply.send({
          success: true,
          data: { message: 'Conversations reordered successfully' }
        });
      } catch (error) {
        logError(fastify.log, 'Error reordering conversations:', error);
        reply.code(500).send({
          success: false,
          message: 'Error reordering conversations'
        });
      }
    }
  );


  // Note: Category management routes have been moved to /me/preferences/categories
}
