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
import { createUnifiedAuthMiddleware } from '../../../middleware/auth';

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
      description: 'Liste des mises à jour d\'ordre',
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

export async function categoriesRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;

  if (!prisma) {
    console.error('[Categories] Missing required service: prisma');
    return;
  }

  // Auth middleware pour toutes les routes de catégories
  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /me/preferences/categories
   * Récupère toutes les catégories de l'utilisateur
   */
  fastify.get<{ Querystring: PaginationQuery }>(
    '/',
    {
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
        const userId = (request as any).auth?.userId;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
          });
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

        return reply.send({
          success: true,
          data: categories,
          pagination: {
            total,
            limit,
            offset
          }
        });
      } catch (error: any) {
        logError('Error fetching categories', error, { source: 'categories-routes' });
        return reply.status(500).send({
          success: false,
          error: 'FETCH_ERROR',
          message: error.message || 'Failed to fetch categories'
        });
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
        const userId = (request as any).auth?.userId;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
          });
        }

        const { categoryId } = request.params;

        const category = await prisma.userConversationCategory.findFirst({
          where: {
            id: categoryId,
            userId
          }
        });

        if (!category) {
          return reply.status(404).send({
            success: false,
            error: 'NOT_FOUND',
            message: 'Category not found'
          });
        }

        return reply.send({
          success: true,
          data: category
        });
      } catch (error: any) {
        logError('Error fetching category', error, { source: 'categories-routes' });
        return reply.status(500).send({
          success: false,
          error: 'FETCH_ERROR',
          message: error.message || 'Failed to fetch category'
        });
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
      schema: {
        description: 'Crée une nouvelle catégorie de conversation. Si l\'ordre n\'est pas spécifié, la catégorie sera ajoutée à la fin. Les catégories peuvent être utilisées pour organiser les conversations.',
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
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: CategoryBody }>, reply: FastifyReply) => {
      try {
        const userId = (request as any).auth?.userId;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
          });
        }

        const { name, color, icon, order, isExpanded } = request.body;

        if (!name || name.trim().length === 0) {
          return reply.status(400).send({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Category name is required'
          });
        }

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

        const category = await prisma.userConversationCategory.create({
          data: {
            userId,
            name: name.trim(),
            color: color || null,
            icon: icon || null,
            order: finalOrder,
            isExpanded: isExpanded ?? true
          }
        });

        return reply.send({
          success: true,
          data: category
        });
      } catch (error: any) {
        logError('Error creating category', error, { source: 'categories-routes' });
        return reply.status(500).send({
          success: false,
          error: 'CREATE_ERROR',
          message: error.message || 'Failed to create category'
        });
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
        const userId = (request as any).auth?.userId;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
          });
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
          return reply.status(404).send({
            success: false,
            error: 'NOT_FOUND',
            message: 'Category not found'
          });
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

        return reply.send({
          success: true,
          data: updated
        });
      } catch (error: any) {
        logError('Error updating category', error, { source: 'categories-routes' });
        return reply.status(500).send({
          success: false,
          error: 'UPDATE_ERROR',
          message: error.message || 'Failed to update category'
        });
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
        const userId = (request as any).auth?.userId;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
          });
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
          return reply.status(404).send({
            success: false,
            error: 'NOT_FOUND',
            message: 'Category not found'
          });
        }

        // Transaction: détacher les conversations puis supprimer la catégorie
        await prisma.$transaction([
          // Mettre categoryId à null pour toutes les conversations de cette catégorie
          prisma.conversationPreference.updateMany({
            where: {
              userId,
              categoryId
            },
            data: {
              categoryId: null
            }
          }),
          // Supprimer la catégorie
          prisma.userConversationCategory.delete({
            where: { id: categoryId }
          })
        ]);

        return reply.send({
          success: true,
          message: 'Category deleted successfully'
        });
      } catch (error: any) {
        logError('Error deleting category', error, { source: 'categories-routes' });
        return reply.status(500).send({
          success: false,
          error: 'DELETE_ERROR',
          message: error.message || 'Failed to delete category'
        });
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
      schema: {
        description: 'Met à jour l\'ordre d\'affichage de plusieurs catégories en batch. Utile pour le glisser-déposer dans l\'UI.',
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
        const userId = (request as any).auth?.userId;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
          });
        }

        const { updates } = request.body;

        // Batch update avec vérification de propriété
        await Promise.all(
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

        return reply.send({
          success: true,
          message: 'Categories reordered successfully'
        });
      } catch (error: any) {
        logError('Error reordering categories', error, { source: 'categories-routes' });
        return reply.status(500).send({
          success: false,
          error: 'REORDER_ERROR',
          message: error.message || 'Failed to reorder categories'
        });
      }
    }
  );
}
