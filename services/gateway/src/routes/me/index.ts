/**
 * /me Routes Entry Point
 *
 * Aggregates all user-scoped "me" routes:
 * - /me/preferences/* - User preference management
 * - Future: /me/profile, /me/settings, etc.
 *
 * All routes under /me require authentication and operate on the
 * authenticated user's own data (self-service).
 */

import { FastifyInstance } from 'fastify';
import { userPreferencesRoutes } from './preferences';
import { deleteAccountRoutes } from './delete-account';

export default async function meRoutes(fastify: FastifyInstance) {
  // Register preferences routes under /me/preferences
  await fastify.register(userPreferencesRoutes, { prefix: '/preferences' });
  await fastify.register(deleteAccountRoutes);

  // Future routes can be added here:
  // await fastify.register(profileRoutes);
  // await fastify.register(settingsRoutes);
  // await fastify.register(devicesRoutes);

  // Optional: Add a root /me endpoint for user info
  fastify.get(
    '/me',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Get current authenticated user information',
        tags: ['me', 'user'],
        summary: 'Get current user',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  username: { type: 'string' },
                  email: { type: 'string' },
                  displayName: { type: 'string' },
                  avatar: { type: 'string', nullable: true },
                  role: { type: 'string' }
                }
              }
            }
          },
          401: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              message: { type: 'string' }
            }
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              message: { type: 'string' }
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
          message: 'Authentication required'
        });
      }

      const user = await fastify.prisma.user.findUnique({
        where: { id: authContext.userId },
        select: {
          id: true,
          username: true,
          email: true,
          displayName: true,
          avatar: true,
          role: true
        }
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          message: 'User not found'
        });
      }

      return reply.send({
        success: true,
        data: user
      });
    }
  );
}
