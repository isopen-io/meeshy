import type { FastifyInstance } from 'fastify';
import {
  createUnifiedAuthMiddleware
} from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

export async function registerValidationRoutes(fastify: FastifyInstance) {
  const authRequired = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  // Route pour vérifier la disponibilité d'un identifiant de lien de partage
  fastify.get('/links/check-identifier/:identifier', {
    onRequest: [authRequired],
    schema: {
      description: 'Check if a share link identifier (linkId) is available for use. This endpoint verifies that no existing share link is using the requested identifier. Case-insensitive matching is performed.',
      tags: ['links'],
      summary: 'Check link identifier availability',
      params: {
        type: 'object',
        required: ['identifier'],
        properties: {
          identifier: {
            type: 'string',
            description: 'Link identifier to check (case-insensitive)',
            example: 'my-awesome-link'
          }
        }
      },
      response: {
        200: {
          description: 'Identifier availability check successful',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                available: { type: 'boolean', description: 'Whether identifier is available' },
                identifier: { type: 'string', description: 'Checked identifier' }
              }
            }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { identifier } = request.params as { identifier: string };

      const existingLink = await fastify.prisma.conversationShareLink.findFirst({
        where: {
          linkId: {
            equals: identifier,
            mode: 'insensitive'
          }
        }
      });

      return reply.send({
        success: true,
        data: {
          available: !existingLink,
          identifier
        }
      });
    } catch (error) {
      console.error('[LINKS] Error checking identifier availability:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to check identifier availability'
      });
    }
  });
}
