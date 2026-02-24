import { FastifyInstance } from 'fastify';

export async function deleteAccountRoutes(fastify: FastifyInstance) {
  fastify.delete(
    '/delete-account',
    {
      preValidation: [(fastify as any).authenticate],
      schema: {
        description: 'Soft-delete the authenticated user account',
        tags: ['me', 'account'],
        summary: 'Delete current user account',
        body: {
          type: 'object',
          required: ['confirmationPhrase'],
          properties: {
            confirmationPhrase: { type: 'string' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  message: { type: 'string' }
                }
              }
            }
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const authContext = (request as any).authContext;

      if (!authContext?.isAuthenticated || !authContext?.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { confirmationPhrase } = request.body as { confirmationPhrase: string };

      if (confirmationPhrase !== 'SUPPRIMER MON COMPTE') {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_CONFIRMATION', message: 'Phrase de confirmation incorrecte' }
        });
      }

      try {
        await fastify.prisma.user.update({
          where: { id: authContext.userId },
          data: {
            deletedAt: new Date(),
            isActive: false
          }
        });

        return reply.send({
          success: true,
          data: { message: 'Compte supprime avec succes' }
        });
      } catch (error) {
        fastify.log.error(error, 'Failed to delete account');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Erreur lors de la suppression du compte' }
        });
      }
    }
  );
}
