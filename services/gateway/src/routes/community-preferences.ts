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
import { sendSuccess, sendPaginatedSuccess, sendUnauthorized, sendNotFound, sendInternalError, createPaginationMeta } from '../utils/response.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { COMMUNITY_PREFERENCES_DEFAULTS } from '../config/user-preferences-defaults';
import { UnifiedAuthRequest } from '../middleware/auth';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  CommunityPreferencesPayload,
  UserPreferencesCommunityReorderedEventData,
  UserPreferencesCommunityUpdatedEventData,
} from '@meeshy/shared/types/socketio-events';
import { broadcastToUser } from '../utils/socket-broadcast';
import { validatePagination } from '../utils/pagination';

interface CommunityPrefRow {
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  isHidden: boolean;
  notificationLevel: string;
  customName: string | null;
  categoryId: string | null;
  orderInCategory: number | null;
}

const toPreferencesPayload = (row: CommunityPrefRow): CommunityPreferencesPayload => ({
  isPinned: row.isPinned,
  isMuted: row.isMuted,
  isArchived: row.isArchived,
  isHidden: row.isHidden,
  notificationLevel: row.notificationLevel as CommunityPreferencesPayload['notificationLevel'],
  customName: row.customName,
  categoryId: row.categoryId,
  orderInCategory: row.orderInCategory,
});

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
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return sendUnauthorized(reply, 'Authentication required');
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
          return sendSuccess(reply, {
            ...preferences,
            isDefault: false
          });
        } else {
          // Return default preferences for new communities
          return sendSuccess(reply, {
            id: null,
            userId,
            communityId,
            ...COMMUNITY_PREFERENCES_DEFAULTS,
            isDefault: true,
            createdAt: null,
            updatedAt: null
          });
        }
      } catch (error) {
        logError(fastify.log, 'Error fetching community preferences:', error);
        return sendInternalError(reply, 'Error fetching preferences');
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
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const userId = authContext.userId;
        const { offset = '0', limit = '50' } = request.query as { offset?: string; limit?: string };

        const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 50 });

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

        return sendPaginatedSuccess(reply, preferencesWithDefault, createPaginationMeta(totalCount, offsetNum, limitNum, preferences.length));
      } catch (error) {
        logError(fastify.log, 'Error fetching all community preferences:', error);
        return sendInternalError(reply, 'Error fetching preferences');
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
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return sendUnauthorized(reply, 'Authentication required');
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

        const eventPayload: UserPreferencesCommunityUpdatedEventData = {
          userId,
          communityId,
          reset: false,
          preferences: toPreferencesPayload(preferences as unknown as CommunityPrefRow),
        };
        broadcastToUser(fastify, userId, SERVER_EVENTS.USER_PREFERENCES_UPDATED, eventPayload);

        return sendSuccess(reply, {
          ...preferences,
          isDefault: false
        });
      } catch (error) {
        logError(fastify.log, 'Error upserting community preferences:', error);
        return sendInternalError(reply, 'Error updating preferences');
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
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return sendUnauthorized(reply, 'Authentication required');
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

        const resetPayload: UserPreferencesCommunityUpdatedEventData = {
          userId,
          communityId,
          reset: true,
          preferences: null,
        };
        broadcastToUser(fastify, userId, SERVER_EVENTS.USER_PREFERENCES_UPDATED, resetPayload);

        return sendSuccess(reply, { message: 'Preferences deleted successfully' });
      } catch (error: any) {
        if (error.code === 'P2025') {
          return sendNotFound(reply, 'Preferences not found');
        }
        logError(fastify.log, 'Error deleting community preferences:', error);
        return sendInternalError(reply, 'Error deleting preferences');
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
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const userId = authContext.userId;
        const { updates } = request.body;

        // `updateMany` ne touche QUE les lignes existantes, et la ligne
        // `UserCommunityPreferences` n'est créée que par le PUT : une
        // communauté jamais épinglée, mise en sourdine ou renommée n'en a pas.
        // Le glisser-déposer d'une liste fraîche rendait donc 200 sans rien
        // persister, et l'ordre revenait au chargement suivant.
        //
        // L'`upsert` corrige cela et EXIGE en retour le filtre d'appartenance —
        // c'est la raison que porte le jumeau conversation
        // (`reorderConversationPreferences`) : un lot non borné laisserait
        // n'importe quel appelant authentifié fabriquer des lignes de
        // préférences contre des ids arbitraires. `updateMany` absorbait ce
        // risque pour la mauvaise raison : il ne matchait rien, pour personne.
        //
        // Déduplication dernier-gagnant, comme le jumeau : deux upserts
        // concurrents sur la même clé unique se courent après.
        const deduped = [...new Map(updates.map((u) => [u.communityId, u])).values()];
        const memberships = deduped.length > 0
          ? await fastify.prisma.communityMember.findMany({
              where: {
                userId,
                communityId: { in: deduped.map((u) => u.communityId) },
                isActive: true,
              },
              select: { communityId: true },
            })
          : [];
        const joined = new Set(memberships.map((m: { communityId: string }) => m.communityId));
        const applicable = deduped.filter((update) => joined.has(update.communityId));

        if (applicable.length > 0) {
          await Promise.all(
            applicable.map((update) =>
              fastify.prisma.userCommunityPreferences.upsert({
                where: {
                  userId_communityId: { userId, communityId: update.communityId }
                },
                create: {
                  userId,
                  communityId: update.communityId,
                  orderInCategory: update.orderInCategory
                },
                update: { orderInCategory: update.orderInCategory }
              })
            )
          );

          // La ligne `UserCommunityPreferences` est par UTILISATEUR, pas par
          // appareil : sans cette diffusion, un glisser-déposer fait sur un
          // appareil n'atteint jamais les onglets ouverts ailleurs, qui tiennent
          // leur liste en `staleTime: Infinity` avec le socket pour source
          // primaire. C'est la moitié du jumeau que ce handler n'avait pas
          // reprise — il lui avait emprunté le filtre d'appartenance ci-dessus,
          // pas la diffusion qui le suit.
          //
          // Un nom d'événement à part, et non un élargissement de
          // `USER_PREFERENCES_REORDERED` : le décodeur iOS de ce dernier déclare
          // `conversationId` NON optionnel, si bien qu'un item de communauté y
          // ferait échouer le décodage de l'événement entier. Raison complète
          // sur `UserPreferencesCommunityReorderedEventData`.
          //
          // La charge nomme ce qui a été ÉCRIT, jamais ce qui a été DEMANDÉ :
          // `applicable` borne les deux ensemble, donc aucun autre appareil ne
          // se voit ordonner d'appliquer un ordre que la base ne porte pas.
          const eventPayload: UserPreferencesCommunityReorderedEventData = {
            userId,
            updates: applicable.map((u) => ({
              communityId: u.communityId,
              orderInCategory: u.orderInCategory,
            })),
          };
          broadcastToUser(
            fastify,
            userId,
            SERVER_EVENTS.USER_PREFERENCES_COMMUNITY_REORDERED,
            eventPayload
          );
        }

        return sendSuccess(reply, { message: 'Communities reordered successfully' });
      } catch (error) {
        logError(fastify.log, 'Error reordering communities:', error);
        return sendInternalError(reply, 'Error reordering communities');
      }
    }
  );
}
