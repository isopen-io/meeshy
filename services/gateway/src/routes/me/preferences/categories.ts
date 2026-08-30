/**
 * Categories Preferences Routes
 * Routes pour la gestion des catégories de conversations utilisateur
 *
 * Routes:
 * - GET /me/preferences/categories - Liste toutes les catégories
 * - GET /me/preferences/categories/:categoryId - Récupère une catégorie spécifique
 * - POST /me/preferences/categories - Crée une nouvelle catégorie
 * - PATCH /me/preferences/categories/:categoryId - Met à jour une catégorie
 * - DELETE /me/preferences/categories/:categoryId - Supprime une catégorie
 * - POST /me/preferences/categories/reorder - Réorganise les catégories
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../../utils/logger';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { enhancedLogger } from '../../../utils/logger-enhanced.js';
import { sendSuccess, sendUnauthorized, sendNotFound, sendBadRequest, sendConflict, sendGone, sendInternalError, sendPaginatedSuccess } from '../../../utils/response.js';

const logger = enhancedLogger.child({ module: 'PreferenceCategoriesRoutes' });
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  CategoriesReorderedEventData,
  CategoryCreatedEventData,
  CategoryDeletedEventData,
  CategoryUpdatedEventData,
  UserConversationCategoryPayload,
} from '@meeshy/shared/types/socketio-events';
import { broadcastToUser } from '../../../utils/socket-broadcast';
import { detachConversationsFromCategory } from '../../../services/conversationPreferencesSync';
import { withMutationOutcome } from '../../../utils/withMutationLog';
import { MutationInFlight } from '../../../services/MutationLogService';

interface CategoryRow {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  icon: string | null;
  order: number;
  isExpanded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const toCategoryPayload = (row: CategoryRow): UserConversationCategoryPayload => ({
  id: row.id,
  userId: row.userId,
  name: row.name,
  color: row.color,
  icon: row.icon,
  order: row.order,
  isExpanded: row.isExpanded,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

interface CategoryBody {
  name: string;
  color?: string;
  icon?: string;
  order?: number;
  isExpanded?: boolean;
}

interface CategoryIdParams {
  categoryId: string;
}

interface PaginationQuery {
  limit?: number;
  offset?: number;
}

// ========== SCHEMAS FOR OPENAPI DOCUMENTATION ==========

const conversationCategorySchema = {
  type: 'object',
  description: 'Catégorie de conversation définie par l\'utilisateur',
  properties: {
    id: { type: 'string', description: 'ID unique de la catégorie' },
    userId: { type: 'string', description: 'ID de l\'utilisateur' },
    name: { type: 'string', description: 'Nom de la catégorie' },
    color: { type: 'string', nullable: true, description: 'Couleur d\'affichage (code hex)' },
    icon: { type: 'string', nullable: true, description: 'Identifiant d\'icône' },
    order: { type: 'number', description: 'Ordre d\'affichage parmi les catégories' },
    isExpanded: { type: 'boolean', description: 'Si la catégorie est étendue dans l\'UI' },
    createdAt: { type: 'string', format: 'date-time', description: 'Date de création' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Date de dernière mise à jour' }
  }
} as const;

const createCategoryRequestSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', description: 'Nom de la catégorie', minLength: 1 },
    color: { type: 'string', nullable: true, description: 'Couleur (hex code, ex: #3B82F6)' },
    icon: { type: 'string', nullable: true, description: 'Identifiant d\'icône' },
    order: { type: 'number', nullable: true, description: 'Ordre d\'affichage' },
    isExpanded: { type: 'boolean', nullable: true, description: 'État étendu par défaut' }
  }
} as const;

const updateCategoryRequestSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', nullable: true, description: 'Nom de la catégorie' },
    color: { type: 'string', nullable: true, description: 'Couleur (hex code)' },
    icon: { type: 'string', nullable: true, description: 'Identifiant d\'icône' },
    order: { type: 'number', nullable: true, description: 'Ordre d\'affichage' },
    isExpanded: { type: 'boolean', nullable: true, description: 'État étendu' }
  }
} as const;

const reorderCategoriesRequestSchema = {
  type: 'object',
  required: ['updates'],
  properties: {
    updates: {
      type: 'array',
      description: 'Liste des mises à jour d\'ordre (200 maximum par lot — #4182 critère 2 : 100 000 entrées ouvraient 100 000 requêtes Prisma concurrentes)',
      maxItems: 200,
      items: {
        type: 'object',
        required: ['categoryId', 'order'],
        properties: {
          categoryId: { type: 'string', description: 'ID de la catégorie' },
          order: { type: 'number', description: 'Nouvel ordre' }
        }
      }
    }
  }
} as const;

const paginationQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
    offset: { type: 'number', minimum: 0, default: 0 }
  }
} as const;

const paginatedResponseMeta = {
  type: 'object',
  properties: {
    total: { type: 'number', description: 'Nombre total d\'éléments' },
    limit: { type: 'number', description: 'Limite par page' },
    offset: { type: 'number', description: 'Décalage actuel' }
  }
} as const;

const successMessageResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string' }
  }
} as const;

/**
 * Débit par COMPTE, jamais par IP (#4182 critère 7) — une clé IP laisserait un
 * seul compte, réparti sur plusieurs sessions/adresses, contourner la limite,
 * et pénaliserait tout le monde derrière une même sortie NAT. Repli sur l'IP
 * uniquement pour l'appel sans `request.auth` (ne devrait jamais arriver ici,
 * la garde d'authentification étant posée par le plugin parent).
 *
 * `hook: 'preHandler'` n'est PAS un détail : le hook par défaut
 * d'@fastify/rate-limit est `onRequest`, la toute première phase — AVANT
 * même le `preHandler` du plugin parent qui pose `request.auth`. Sans cette
 * option, `keyGenerator` tourne à chaque fois avec `request.auth` encore
 * `undefined` et retombe systématiquement sur l'IP, silencieusement : le
 * plafond a l'air posé par compte et se comporte comme un plafond par IP,
 * exactement ce que ce critère interdit. Mesuré au vrai plugin (`global:
 * false`), pas seulement lu dans sa documentation.
 */
const categoryRateLimitConfig = (label: string, max: number) => ({
  max,
  timeWindow: '1 minute',
  hook: 'preHandler' as const,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.auth?.userId;
    return userId ? `categories:${label}:${userId}` : `categories:${label}:ip:${request.ip}`;
  },
  errorResponseBuilder: () => ({
    success: false,
    error: `Trop de requêtes (categories/${label}). Veuillez patienter.`,
    statusCode: 429,
  }),
});

export async function categoriesRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  if (!prisma) {
    logger.error('Missing required service: prisma');
    return;
  }

  // Pas de hook d'auth ICI (#4182 critère 4) : `userPreferencesRoutes`
  // (routes/me/preferences/index.ts) en pose déjà un sur tout le sous-arbre
  // AVANT d'enregistrer ce plugin, et Fastify propage les hooks du parent à
  // l'enfant par encapsulation — les ré-ajouter ici les faisait tourner DEUX
  // FOIS par requête (deux vérifications JWT, deux lectures Prisma de
  // l'utilisateur) sur chacune des six routes de ce fichier. `request.auth`
  // est déjà posé quand un handler s'exécute.

  /**
   * GET /me/preferences/categories
   * Récupère toutes les catégories de l'utilisateur
   */
  fastify.get<{ Querystring: PaginationQuery }>(
    '/',
    {
      config: { rateLimit: categoryRateLimitConfig('read', 300) },
      schema: {
        description: 'Récupère toutes les catégories de conversations pour l\'utilisateur authentifié avec support de pagination. Les catégories sont retournées dans l\'ordre d\'affichage.',
        tags: ['preferences', 'categories'],
        summary: 'Lister toutes les catégories',
        querystring: paginationQuerySchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'array',
                items: conversationCategorySchema
              },
              pagination: paginatedResponseMeta
            }
          },
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Querystring: PaginationQuery }>, reply: FastifyReply) => {
      try {
        const userId = request.auth?.userId;

        if (!userId) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const { limit = 50, offset = 0 } = request.query;

        const [categories, total] = await Promise.all([
          prisma.userConversationCategory.findMany({
            where: { userId },
            orderBy: { order: 'asc' },
            take: limit,
            skip: offset
          }),
          prisma.userConversationCategory.count({
            where: { userId }
          })
        ]);

        return sendPaginatedSuccess(reply, categories, { total, limit, offset } as any);
      } catch (error: any) {
        logError('Error fetching categories', error, { source: 'categories-routes' });
        return sendInternalError(reply, 'FETCH_ERROR', { message: error.message || 'Failed to fetch categories' });
      }
    }
  );

  /**
   * GET /me/preferences/categories/:categoryId
   * Récupère une catégorie spécifique
   */
  fastify.get<{ Params: CategoryIdParams }>(
    '/:categoryId',
    {
      config: { rateLimit: categoryRateLimitConfig('read', 300) },
      schema: {
        description: 'Récupère les détails d\'une catégorie spécifique par ID',
        tags: ['preferences', 'categories'],
        summary: 'Récupérer les détails d\'une catégorie',
        params: {
          type: 'object',
          required: ['categoryId'],
          properties: {
            categoryId: { type: 'string', description: 'ID de la catégorie' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: conversationCategorySchema
            }
          },
          401: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Params: CategoryIdParams }>, reply: FastifyReply) => {
      try {
        const userId = request.auth?.userId;

        if (!userId) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const { categoryId } = request.params;

        const category = await prisma.userConversationCategory.findFirst({
          where: {
            id: categoryId,
            userId
          }
        });

        if (!category) {
          return sendNotFound(reply, 'NOT_FOUND', { message: 'Category not found' });
        }

        return sendSuccess(reply, category);
      } catch (error: any) {
        logError('Error fetching category', error, { source: 'categories-routes' });
        return sendInternalError(reply, 'FETCH_ERROR', { message: error.message || 'Failed to fetch category' });
      }
    }
  );

  /**
   * POST /me/preferences/categories
   * Crée une nouvelle catégorie
   */
  fastify.post<{ Body: CategoryBody }>(
    '/',
    {
      config: { rateLimit: categoryRateLimitConfig('create', 30) },
      schema: {
        description: 'Crée une nouvelle catégorie de conversation. Si l\'ordre n\'est pas spécifié, la catégorie sera ajoutée à la fin. Les catégories peuvent être utilisées pour organiser les conversations. Idempotent via l\'en-tête X-Client-Mutation-Id (cmid_<uuid>) : un rejeu du même identifiant rend la catégorie déjà créée au lieu d\'en fabriquer une seconde (#4182 critère 3).',
        tags: ['preferences', 'categories'],
        summary: 'Créer une nouvelle catégorie',
        body: createCategoryRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: conversationCategorySchema
            }
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
          410: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: CategoryBody }>, reply: FastifyReply) => {
      try {
        const userId = request.auth?.userId;

        if (!userId) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const { name, color, icon, order, isExpanded } = request.body;

        if (!name || name.trim().length === 0) {
          return sendBadRequest(reply, 'Category name is required');
        }

        // Idempotent via X-Client-Mutation-Id (#4182 critère 3). `create`
        // DIVERGE — le rejouer fabriquerait une seconde catégorie, contrairement
        // à un `like`/toggle qui converge — donc un rejeu du même cmid RESERT la
        // ligne déjà créée au lieu d'en refaire une (même patron que
        // `POST /posts/:postId/repost`, `withMutationLog.ts`). Sans en-tête, le
        // comportement legacy est inchangé : `withMutationOutcome` exécute `op()`
        // une fois et rend `applied`.
        const outcome = await withMutationOutcome<CategoryRow>({
          request,
          fastify,
          userId,
          kind: 'createCategory',
          replayCost: 'diverges',
          op: async () => {
            // Si order n'est pas spécifié, prendre le max + 1
            let finalOrder = order;
            if (finalOrder === undefined || finalOrder === null) {
              const maxOrder = await prisma.userConversationCategory.findFirst({
                where: { userId },
                orderBy: { order: 'desc' },
                select: { order: true }
              });
              finalOrder = maxOrder ? maxOrder.order + 1 : 0;
            }

            const created = await prisma.userConversationCategory.create({
              data: {
                userId,
                name: name.trim(),
                color: color || null,
                icon: icon || null,
                order: finalOrder,
                isExpanded: isExpanded ?? true
              }
            });
            return created as CategoryRow & { id: string };
          },
          onDuplicate: async (resultId) => {
            const existing = await prisma.userConversationCategory.findFirst({
              where: { id: resultId, userId }
            });
            return existing as (CategoryRow & { id: string }) | null;
          },
        });

        if (outcome.status === 'gone') {
          return sendGone(reply, 'Category already created, its result is gone', { code: 'MUTATION_RESULT_GONE' });
        }

        const category = outcome.result;

        // La diffusion ne part que sur une création FRAÎCHE : un rejeu resert
        // la même catégorie aux autres appareils, il ne doit pas leur annoncer
        // une seconde fois une création qu'ils ont déjà vue (même garde que
        // `POST /posts/:postId/repost`, cf. withMutationLog.ts).
        if (outcome.status === 'applied') {
          const createdPayload: CategoryCreatedEventData = {
            userId,
            category: toCategoryPayload(category),
          };
          broadcastToUser(fastify, userId, SERVER_EVENTS.CATEGORY_CREATED, createdPayload);
        }

        return sendSuccess(reply, category);
      } catch (error: any) {
        if (error instanceof MutationInFlight) {
          return sendConflict(reply, 'Category creation already in flight', { code: 'MUTATION_IN_FLIGHT' });
        }
        logError('Error creating category', error, { source: 'categories-routes' });
        return sendInternalError(reply, 'CREATE_ERROR', { message: error.message || 'Failed to create category' });
      }
    }
  );

  /**
   * PATCH /me/preferences/categories/:categoryId
   * Met à jour une catégorie
   */
  fastify.patch<{ Params: CategoryIdParams; Body: Partial<CategoryBody> }>(
    '/:categoryId',
    {
      config: { rateLimit: categoryRateLimitConfig('update', 60) },
      schema: {
        description: 'Met à jour une catégorie existante. Supporte les mises à jour partielles - seuls les champs fournis seront modifiés.',
        tags: ['preferences', 'categories'],
        summary: 'Mettre à jour une catégorie',
        params: {
          type: 'object',
          required: ['categoryId'],
          properties: {
            categoryId: { type: 'string', description: 'ID de la catégorie' }
          }
        },
        body: updateCategoryRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: conversationCategorySchema
            }
          },
          401: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Params: CategoryIdParams; Body: Partial<CategoryBody> }>, reply: FastifyReply) => {
      try {
        const userId = request.auth?.userId;

        if (!userId) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const { categoryId } = request.params;

        // Vérifier que la catégorie existe et appartient à l'utilisateur
        const existing = await prisma.userConversationCategory.findFirst({
          where: {
            id: categoryId,
            userId
          }
        });

        if (!existing) {
          return sendNotFound(reply, 'NOT_FOUND', { message: 'Category not found' });
        }

        const updateData: any = {};
        if (request.body.name !== undefined) updateData.name = request.body.name.trim();
        if (request.body.color !== undefined) updateData.color = request.body.color;
        if (request.body.icon !== undefined) updateData.icon = request.body.icon;
        if (request.body.order !== undefined) updateData.order = request.body.order;
        if (request.body.isExpanded !== undefined) updateData.isExpanded = request.body.isExpanded;

        const updated = await prisma.userConversationCategory.update({
          where: { id: categoryId },
          data: updateData
        });

        const updatedPayload: CategoryUpdatedEventData = {
          userId,
          category: toCategoryPayload(updated as CategoryRow),
        };
        broadcastToUser(fastify, userId, SERVER_EVENTS.CATEGORY_UPDATED, updatedPayload);

        return sendSuccess(reply, updated);
      } catch (error: any) {
        logError('Error updating category', error, { source: 'categories-routes' });
        return sendInternalError(reply, 'UPDATE_ERROR', { message: error.message || 'Failed to update category' });
      }
    }
  );

  /**
   * DELETE /me/preferences/categories/:categoryId
   * Supprime une catégorie (met categoryId à null pour toutes les conversations de cette catégorie)
   */
  fastify.delete<{ Params: CategoryIdParams }>(
    '/:categoryId',
    {
      config: { rateLimit: categoryRateLimitConfig('delete', 30) },
      schema: {
        description: 'Supprime une catégorie de conversation. Toutes les conversations dans cette catégorie seront non-catégorisées (categoryId mis à null) mais leurs préférences resteront.',
        tags: ['preferences', 'categories'],
        summary: 'Supprimer une catégorie',
        params: {
          type: 'object',
          required: ['categoryId'],
          properties: {
            categoryId: { type: 'string', description: 'ID de la catégorie' }
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
    async (request: FastifyRequest<{ Params: CategoryIdParams }>, reply: FastifyReply) => {
      try {
        const userId = request.auth?.userId;

        if (!userId) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const { categoryId } = request.params;

        // Vérifier que la catégorie existe et appartient à l'utilisateur
        const existing = await prisma.userConversationCategory.findFirst({
          where: {
            id: categoryId,
            userId
          }
        });

        if (!existing) {
          return sendNotFound(reply, 'NOT_FOUND', { message: 'Category not found' });
        }

        // Détacher AVANT de supprimer : dans l'autre ordre, les lignes de
        // préférences pointeraient un instant vers une catégorie fantôme, et un
        // échec du détachement les y laisserait pour de bon. Ici le pire cas est
        // une catégorie vide encore présente, que l'appelant peut resupprimer.
        //
        // `categoryId` est une colonne de `UserConversationPreferences` : le
        // détachement est une écriture de préférences, donc il passe par
        // l'écrivain unique qui incrémente `version` et diffuse le nouvel
        // instantané aux autres appareils.
        await detachConversationsFromCategory(fastify, { userId, categoryId });

        await prisma.userConversationCategory.delete({
          where: { id: categoryId }
        });

        const deletedPayload: CategoryDeletedEventData = {
          userId,
          categoryId,
        };
        broadcastToUser(fastify, userId, SERVER_EVENTS.CATEGORY_DELETED, deletedPayload);

        return sendSuccess(reply, undefined, { message: 'Category deleted successfully' });
      } catch (error: any) {
        logError('Error deleting category', error, { source: 'categories-routes' });
        return sendInternalError(reply, 'DELETE_ERROR', { message: error.message || 'Failed to delete category' });
      }
    }
  );

  /**
   * POST /me/preferences/categories/reorder
   * Réorganise les catégories en batch
   */
  fastify.post<{ Body: { updates: Array<{ categoryId: string; order: number }> } }>(
    '/reorder',
    {
      config: { rateLimit: categoryRateLimitConfig('reorder', 30) },
      schema: {
        description: 'Met à jour l\'ordre d\'affichage de plusieurs catégories en batch (200 maximum). Utile pour le glisser-déposer dans l\'UI.',
        tags: ['preferences', 'categories'],
        summary: 'Réorganiser les catégories',
        body: reorderCategoriesRequestSchema,
        response: {
          200: successMessageResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: { updates: Array<{ categoryId: string; order: number }> } }>, reply: FastifyReply) => {
      try {
        const userId = request.auth?.userId;

        if (!userId) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const { updates } = request.body;

        // Batch update avec vérification de propriété
        const results = await Promise.all(
          updates.map(update =>
            prisma.userConversationCategory.updateMany({
              where: {
                id: update.categoryId,
                userId // Vérification de propriété
              },
              data: {
                order: update.order
              }
            })
          )
        );

        // La charge nomme ce qui a été ÉCRIT, jamais ce qui a été DEMANDÉ : le
        // filtre d'appartenance ci-dessus écarte silencieusement une catégorie
        // qui n'est pas à l'appelant, et l'annoncer enverrait ses autres
        // appareils appliquer un ordre que la base ne porte pas — en confirmant
        // au passage l'existence d'une catégorie qu'il n'a pas le droit de
        // nommer. Aucune écriture ⇒ aucune diffusion.
        const written = updates.filter((_, index) => (results[index]?.count ?? 0) > 0);

        if (written.length > 0) {
          const reorderedPayload: CategoriesReorderedEventData = {
            userId,
            updates: written.map(u => ({ categoryId: u.categoryId, order: u.order })),
          };
          broadcastToUser(fastify, userId, SERVER_EVENTS.CATEGORIES_REORDERED, reorderedPayload);
        }

        return sendSuccess(reply, undefined, { message: 'Categories reordered successfully' });
      } catch (error: any) {
        logError('Error reordering categories', error, { source: 'categories-routes' });
        return sendInternalError(reply, 'REORDER_ERROR', { message: error.message || 'Failed to reorder categories' });
      }
    }
  );
}
