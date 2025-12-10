/**
 * Routes for user-specific conversation preferences
 * Handles personal settings: pin, mute, archive, tags, categories, etc.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../utils/logger';

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

interface CategoryBody {
  name: string;
  color?: string;
  icon?: string;
  order?: number;
  isExpanded?: boolean;
}

interface ConversationIdParams {
  conversationId: string;
}

interface CategoryIdParams {
  categoryId: string;
}

export default async function conversationPreferencesRoutes(fastify: FastifyInstance) {

  // ========== CONVERSATION PREFERENCES ==========

  /**
   * GET /api/user-preferences/conversations/:conversationId
   * Get user preferences for a specific conversation
   */
  fastify.get<{ Params: ConversationIdParams }>(
    '/user-preferences/conversations/:conversationId',
    { preValidation: [fastify.authenticate] },
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

        if (!preferences) {
          return reply.status(404).send({
            success: false,
            message: 'Preferences not found'
          });
        }

        reply.send({
          success: true,
          data: preferences
        });
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
    { preValidation: [fastify.authenticate] },
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

        const preferences = await fastify.prisma.userConversationPreferences.findMany({
          where: { userId },
          include: {
            category: true
          },
          orderBy: { updatedAt: 'desc' }
        });

        reply.send({
          success: true,
          data: preferences
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
    { preValidation: [fastify.authenticate] },
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
          data: preferences
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
    { preValidation: [fastify.authenticate] },
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
          message: 'Preferences deleted successfully'
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
    { preValidation: [fastify.authenticate] },
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
          message: 'Conversations reordered successfully'
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

  // ========== CATEGORY MANAGEMENT ==========

  /**
   * GET /api/user-preferences/categories
   * Get all user categories
   */
  fastify.get(
    '/user-preferences/categories',
    { preValidation: [fastify.authenticate] },
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

        const categories = await fastify.prisma.userConversationCategory.findMany({
          where: { userId },
          orderBy: { order: 'asc' }
        });

        reply.send({
          success: true,
          data: categories
        });
      } catch (error) {
        logError(fastify.log, 'Error fetching categories:', error);
        reply.code(500).send({
          success: false,
          message: 'Error fetching categories'
        });
      }
    }
  );

  /**
   * GET /api/user-preferences/categories/:categoryId
   * Get a specific category
   */
  fastify.get<{ Params: CategoryIdParams }>(
    '/user-preferences/categories/:categoryId',
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest<{ Params: CategoryIdParams }>, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const { categoryId } = request.params;

        const category = await fastify.prisma.userConversationCategory.findFirst({
          where: {
            id: categoryId,
            userId
          }
        });

        if (!category) {
          return reply.status(404).send({
            success: false,
            message: 'Category not found'
          });
        }

        reply.send({
          success: true,
          data: category
        });
      } catch (error) {
        logError(fastify.log, 'Error fetching category:', error);
        reply.code(500).send({
          success: false,
          message: 'Error fetching category'
        });
      }
    }
  );

  /**
   * POST /api/user-preferences/categories
   * Create a new category
   */
  fastify.post<{ Body: CategoryBody }>(
    '/user-preferences/categories',
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest<{ Body: CategoryBody }>, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const { name, color, icon, order, isExpanded } = request.body;

        if (!name || name.trim().length === 0) {
          return reply.status(400).send({
            success: false,
            message: 'Category name is required'
          });
        }

        // Get max order if not specified
        let finalOrder = order ?? 0;
        if (order === undefined) {
          const maxOrderCategory = await fastify.prisma.userConversationCategory.findFirst({
            where: { userId },
            orderBy: { order: 'desc' }
          });
          finalOrder = maxOrderCategory ? maxOrderCategory.order + 1 : 0;
        }

        const category = await fastify.prisma.userConversationCategory.create({
          data: {
            userId,
            name: name.trim(),
            color,
            icon,
            order: finalOrder,
            isExpanded: isExpanded ?? true
          }
        });

        reply.send({
          success: true,
          data: category
        });
      } catch (error) {
        logError(fastify.log, 'Error creating category:', error);
        reply.code(500).send({
          success: false,
          message: 'Error creating category'
        });
      }
    }
  );

  /**
   * PATCH /api/user-preferences/categories/:categoryId
   * Update a category
   */
  fastify.patch<{ Params: CategoryIdParams; Body: Partial<CategoryBody> }>(
    '/user-preferences/categories/:categoryId',
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest<{ Params: CategoryIdParams; Body: Partial<CategoryBody> }>, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const { categoryId } = request.params;
        const data = request.body;

        // Verify ownership
        const existing = await fastify.prisma.userConversationCategory.findFirst({
          where: {
            id: categoryId,
            userId
          }
        });

        if (!existing) {
          return reply.status(404).send({
            success: false,
            message: 'Category not found'
          });
        }

        // Prepare update data
        const updateData: any = {};
        if (data.name !== undefined) updateData.name = data.name.trim();
        if (data.color !== undefined) updateData.color = data.color;
        if (data.icon !== undefined) updateData.icon = data.icon;
        if (data.order !== undefined) updateData.order = data.order;
        if (data.isExpanded !== undefined) updateData.isExpanded = data.isExpanded;

        const category = await fastify.prisma.userConversationCategory.update({
          where: { id: categoryId },
          data: updateData
        });

        reply.send({
          success: true,
          data: category
        });
      } catch (error) {
        logError(fastify.log, 'Error updating category:', error);
        reply.code(500).send({
          success: false,
          message: 'Error updating category'
        });
      }
    }
  );

  /**
   * DELETE /api/user-preferences/categories/:categoryId
   * Delete a category (sets categoryId to null for all conversations in this category)
   */
  fastify.delete<{ Params: CategoryIdParams }>(
    '/user-preferences/categories/:categoryId',
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest<{ Params: CategoryIdParams }>, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const { categoryId } = request.params;

        // Verify ownership
        const existing = await fastify.prisma.userConversationCategory.findFirst({
          where: {
            id: categoryId,
            userId
          }
        });

        if (!existing) {
          return reply.status(404).send({
            success: false,
            message: 'Category not found'
          });
        }

        // Delete category (Prisma will set categoryId to null via onDelete: SetNull)
        await fastify.prisma.userConversationCategory.delete({
          where: { id: categoryId }
        });

        reply.send({
          success: true,
          message: 'Category deleted successfully'
        });
      } catch (error) {
        logError(fastify.log, 'Error deleting category:', error);
        reply.code(500).send({
          success: false,
          message: 'Error deleting category'
        });
      }
    }
  );

  /**
   * POST /api/user-preferences/categories/reorder
   * Batch update order for categories
   */
  fastify.post<{ Body: { updates: Array<{ categoryId: string; order: number }> } }>(
    '/user-preferences/categories/reorder',
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest<{ Body: { updates: Array<{ categoryId: string; order: number }> } }>, reply: FastifyReply) => {
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

        // Batch update with ownership check
        await Promise.all(
          updates.map(update =>
            fastify.prisma.userConversationCategory.updateMany({
              where: {
                id: update.categoryId,
                userId
              },
              data: {
                order: update.order
              }
            })
          )
        );

        reply.send({
          success: true,
          message: 'Categories reordered successfully'
        });
      } catch (error) {
        logError(fastify.log, 'Error reordering categories:', error);
        reply.code(500).send({
          success: false,
          message: 'Error reordering categories'
        });
      }
    }
  );
}
