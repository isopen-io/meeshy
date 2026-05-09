/**
 * Conversation Tags Aggregation Route
 *
 * Routes:
 * - GET /me/preferences/conversation-tags - Liste agrégée des tags utilisés par l'utilisateur
 *
 * Used by iOS autocomplete suggestions in the conversation options sheet.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../../utils/logger';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { createUnifiedAuthMiddleware } from '../../../middleware/auth';

// ========== SCHEMAS FOR OPENAPI DOCUMENTATION ==========

const conversationTagsResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'All distinct tags used by the authenticated user across their conversation preferences, sorted alphabetically'
        }
      }
    }
  }
} as const;

export async function conversationTagsRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;

  if (!prisma) {
    console.error('[ConversationTags] Missing required service: prisma');
    return;
  }

  // Auth middleware pour toutes les routes
  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /me/preferences/conversation-tags
   * Retourne la liste dédupliquée et triée des tags utilisés par l'utilisateur
   * à travers toutes ses préférences de conversation. Utilisé pour l'autocomplétion.
   */
  fastify.get(
    '/',
    {
      schema: {
        description: 'Returns the deduplicated, sorted list of tags the user has assigned across their conversation preferences. Used for client-side autocomplete suggestions.',
        tags: ['preferences'],
        summary: 'List user conversation tags',
        response: {
          200: conversationTagsResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).auth?.userId;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
          });
        }

        const rows = await prisma.userConversationPreferences.findMany({
          where: { userId, tags: { isEmpty: false } },
          select: { tags: true }
        });

        const set = new Set<string>();
        for (const row of rows) {
          for (const t of row.tags || []) {
            const trimmed = t.trim();
            if (trimmed.length > 0) set.add(trimmed);
          }
        }

        const tags = Array.from(set).sort((a, b) => a.localeCompare(b));

        return reply.send({
          success: true,
          data: { tags }
        });
      } catch (error: any) {
        logError(fastify.log, 'Error fetching conversation tags', error);
        return reply.status(500).send({
          success: false,
          error: 'FETCH_ERROR',
          message: error.message || 'Failed to fetch tags'
        });
      }
    }
  );
}
