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
import { sendSuccess, sendPaginatedSuccess, sendUnauthorized, sendForbidden, sendNotFound, sendInternalError, createPaginationMeta } from '../utils/response.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { OBJECT_ID_PATTERN } from '@meeshy/shared/utils/object-id';
import { CONVERSATION_PREFERENCES_DEFAULTS } from '../config/user-preferences-defaults';
import { UnifiedAuthRequest } from '../middleware/auth';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { UserPreferencesConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import { broadcastToUser } from '../utils/socket-broadcast';
import { validatePagination } from '../utils/pagination';
import {
  writeConversationPreferences,
  reorderConversationPreferences,
  ConversationPreferencesScopeError,
  type ConversationPreferencesWrite,
} from '../services/conversationPreferencesSync';
import { ReadingModePreferenceSchema, type ReadingModePreference } from '@meeshy/shared/types/reading-modes';

interface ConversationPreferencesBody {
  isPinned?: boolean;
  isMuted?: boolean;
  mentionsOnly?: boolean;
  isArchived?: boolean;
  tags?: string[];
  categoryId?: string | null;
  orderInCategory?: number | null;
  customName?: string | null;
  reaction?: string | null;
  readingMode?: ReadingModePreference;
}

interface ConversationIdParams {
  conversationId: string;
}

// ========== SCHEMAS FOR OPENAPI DOCUMENTATION ==========

// `ReadingModePreferenceSchema.options` est la SEULE source de l'énumération —
// jamais une copie littérale : c'est le contrat gelé §3.1
// (`packages/shared/types/reading-modes.ts`), déjà partagé avec les miroirs
// client. Dupliquer la liste ici créerait deux vérités divergentes.
const READING_MODE_PREFERENCE_VALUES = ReadingModePreferenceSchema.options;

const conversationPreferencesSchema = {
  type: 'object',
  description: 'User preferences for a specific conversation',
  properties: {
    id: { type: 'string', nullable: true, description: 'Unique preference ID (null if default)' },
    userId: { type: 'string', description: 'User ID' },
    conversationId: { type: 'string', description: 'Conversation ID' },
    isPinned: { type: 'boolean', description: 'Whether conversation is pinned' },
    isMuted: { type: 'boolean', description: 'Whether conversation is muted' },
    mentionsOnly: { type: 'boolean', description: 'Whether to only receive notifications for mentions' },
    isArchived: { type: 'boolean', description: 'Whether conversation is archived' },
    tags: { type: 'array', items: { type: 'string' }, description: 'User-defined tags' },
    categoryId: { type: 'string', nullable: true, description: 'Category ID if conversation is categorized' },
    orderInCategory: { type: 'number', nullable: true, description: 'Display order within category' },
    customName: { type: 'string', nullable: true, description: 'User-defined custom conversation name' },
    reaction: { type: 'string', nullable: true, description: 'User reaction/emoji for conversation' },
    // `ReadingModePreference` (packages/shared/types/reading-modes.ts) — ce que
    // l'utilisateur a choisi. `auto` rend la main à l'orchestrateur (LWS-3).
    readingMode: { type: 'string', enum: READING_MODE_PREFERENCE_VALUES, description: 'Reading-mode preference (auto hands control back to the orchestrator)' },
    isDefault: { type: 'boolean', description: 'Whether this is using default values' },
    // Le compteur monotone sur lequel TOUS les clients arbitrent le temps réel
    // (`incoming.version <= local -> drop`). Fastify retire toute propriété
    // absente de ce schéma : l'omettre n'affaiblissait pas le contrat, il le
    // supprimait — les clients recevaient les préférences sans jamais recevoir
    // la séquence qui dit laquelle de deux versions est la plus récente. iOS
    // refait un GET juste après son PUT dans le seul but de lire ce champ.
    version: { type: 'number', description: 'Monotonic version for optimistic-concurrency resolution' },
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
    mentionsOnly: { type: 'boolean', description: 'Only notify for mentions and @everyone' },
    isArchived: { type: 'boolean', description: 'Archive/unarchive conversation' },
    tags: { type: 'array', items: { type: 'string' }, description: 'User tags for conversation' },
    // `categoryId` names a `UserConversationCategory` row, so it is always an
    // ObjectId. Unvalidated, a malformed one reaches Prisma and raises
    // `Malformed ObjectID` (P2023), which the handler's catch-all reports as a
    // 500 — a caller mistake filed as a server fault. `null` uncategorizes and
    // is untouched by `pattern`, which only constrains strings.
    categoryId: { type: 'string', nullable: true, pattern: OBJECT_ID_PATTERN, description: 'Category ID (ObjectId) or null to uncategorize' },
    orderInCategory: { type: 'number', nullable: true, description: 'Order within category' },
    customName: { type: 'string', nullable: true, description: 'Custom conversation name' },
    reaction: { type: 'string', nullable: true, description: 'Emoji reaction' },
    // Hors énumération ⇒ 400 avant toute écriture (même garde que `categoryId`
    // ci-dessus) : `readingMode` est une préférence versionnée, jamais un
    // magasin clé/valeur libre (E9).
    readingMode: { type: 'string', enum: READING_MODE_PREFERENCE_VALUES, description: 'Reading-mode preference (auto|focal|script|resume|riviere)' }
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
      // One drag-and-drop reorders a category the user can see. The membership
      // filter already bounds the writes to conversations the caller is in, but
      // it does so only after the batch has been parsed and de-duplicated, so an
      // unbounded array is still work a caller can ask for for free. The bound
      // is well past any real category.
      maxItems: 200,
      items: {
        type: 'object',
        required: ['conversationId', 'orderInCategory'],
        properties: {
          conversationId: { type: 'string', description: 'Conversation ID' },
          orderInCategory: { type: 'number', minimum: 0, description: 'New order value' }
        }
      },
      description: 'Array of conversation reorder updates (max 200)'
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


export default async function conversationPreferencesRoutes(fastify: FastifyInstance) {

  // ========== CONVERSATION PREFERENCES ==========

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
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return sendUnauthorized(reply, 'Authentication required');
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
          return sendSuccess(reply, {
            ...preferences,
            isDefault: false
          });
        } else {
          // Return default preferences for new conversations
          return sendSuccess(reply, {
            id: null,
            userId,
            conversationId,
            ...CONVERSATION_PREFERENCES_DEFAULTS,
            // `CONVERSATION_PREFERENCES_DEFAULTS` exclut `version` à dessein
            // (c'est de l'état de protocole, pas une préférence, et un reset
            // ne doit jamais le rembobiner). La branche « aucune ligne » doit
            // donc le poser elle-même : une ligne absente n'a jamais été
            // diffusée, elle est sous TOUTE version que le serveur peut
            // émettre. Répondre `undefined` laisserait le client deviner.
            version: 0,
            isDefault: true,
            createdAt: null,
            updatedAt: null,
            category: null
          });
        }
      } catch (error) {
        logError(fastify.log, 'Error fetching conversation preferences:', error);
        return sendInternalError(reply, 'Error fetching preferences');
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
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const userId = authContext.userId;
        const { offset = '0', limit = '50' } = request.query as { offset?: string; limit?: string };

        const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 50 });

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

        return sendPaginatedSuccess(reply, preferencesWithDefault, createPaginationMeta(totalCount, offsetNum, limitNum, preferences.length));
      } catch (error) {
        logError(fastify.log, 'Error fetching all conversation preferences:', error);
        return sendInternalError(reply, 'Error fetching preferences');
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
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Params: ConversationIdParams; Body: ConversationPreferencesBody }>, reply: FastifyReply) => {
      try {
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const userId = authContext.userId;
        const { conversationId } = request.params;
        const data = request.body;

        // Prepare update data (filter undefined values)
        const updateData: ConversationPreferencesWrite = {
          ...(data.isPinned !== undefined && { isPinned: data.isPinned }),
          ...(data.isMuted !== undefined && { isMuted: data.isMuted }),
          ...(data.mentionsOnly !== undefined && { mentionsOnly: data.mentionsOnly }),
          ...(data.isArchived !== undefined && { isArchived: data.isArchived }),
          ...(data.tags !== undefined && { tags: data.tags }),
          ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
          ...(data.orderInCategory !== undefined && { orderInCategory: data.orderInCategory }),
          ...(data.customName !== undefined && { customName: data.customName }),
          ...(data.reaction !== undefined && { reaction: data.reaction }),
          ...(data.readingMode !== undefined && { readingMode: data.readingMode }),
        };

        const preferences = await writeConversationPreferences(fastify, {
          userId,
          conversationId,
          data: updateData,
        });

        return sendSuccess(reply, {
          ...preferences,
          isDefault: false
        });
      } catch (error) {
        // Both ids in this request name rows the caller may not be entitled to.
        // Non-membership is stated plainly — the caller already knows whether
        // they are in a conversation, and the sibling `user-deletions.ts` routes
        // answer the same way. A category that is not theirs is reported as
        // simply absent, matching every route in `me/preferences/categories.ts`,
        // so the response cannot be used to probe another user's categories.
        if (error instanceof ConversationPreferencesScopeError) {
          return error.reason === 'not-a-participant'
            ? sendForbidden(reply, 'Not a member of this conversation')
            : sendNotFound(reply, 'Category not found');
        }
        logError(fastify.log, 'Error upserting conversation preferences:', error);
        return sendInternalError(reply, 'Error updating preferences');
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
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const userId = authContext.userId;
        const { conversationId } = request.params;

        // A reset restores the preference columns to their defaults; it does
        // NOT drop the row. `version` is the monotonic sequence every client
        // gates on (`incoming.version <= local -> drop`), and it lives on the
        // row: deleting the row restarts the sequence at 1 on the next upsert,
        // so the first pin/mute made after a reset carried a version BELOW the
        // reset the other devices had just stored — they dropped it, and every
        // later change with it, until an unrelated full refetch. Resetting in
        // place keeps the counter strictly increasing across the reset, which
        // is what the schema promises ("Monotonic version for
        // optimistic-concurrency resolution"). The single `update` also makes
        // the version advance atomic, where the previous read-then-write could
        // interleave with a concurrent upsert. Absent row still yields P2025 →
        // 404, unchanged.
        const resetRow = await fastify.prisma.userConversationPreferences.update({
          where: {
            userId_conversationId: {
              userId,
              conversationId
            }
          },
          data: {
            ...CONVERSATION_PREFERENCES_DEFAULTS,
            version: { increment: 1 },
          },
          select: { version: true },
        });

        const resetPayload: UserPreferencesConversationUpdatedEventData = {
          userId,
          conversationId,
          version: resetRow.version,
          reset: true,
          preferences: null,
        };
        broadcastToUser(fastify, userId, SERVER_EVENTS.USER_PREFERENCES_UPDATED, resetPayload);

        return sendSuccess(reply, { message: 'Preferences deleted successfully' });
      } catch (error: any) {
        if (error.code === 'P2025') {
          return sendNotFound(reply, 'Preferences not found');
        }
        logError(fastify.log, 'Error deleting conversation preferences:', error);
        return sendInternalError(reply, 'Error deleting preferences');
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
          400: errorResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: { updates: Array<{ conversationId: string; orderInCategory: number }> } }>, reply: FastifyReply) => {
      try {
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const userId = authContext.userId;
        const { updates } = request.body;

        // Persist first, broadcast what was persisted. The previous `updateMany`
        // matched nothing whenever the user had never customized the
        // conversation, yet the route still answered 200 and told every device
        // to move the row — an order no refetch could ever confirm.
        await reorderConversationPreferences(fastify, { userId, updates });

        return sendSuccess(reply, { message: 'Conversations reordered successfully' });
      } catch (error) {
        logError(fastify.log, 'Error reordering conversations:', error);
        sendInternalError(reply, 'Error reordering conversations');
      }
    }
  );


  // Note: Category management routes have been moved to /me/preferences/categories
}
