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
import { dataExportRoutes } from './export';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendNotFound } from '../../utils/response.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

export default async function meRoutes(fastify: FastifyInstance) {
  // Register preferences routes under /me/preferences
  await fastify.register(userPreferencesRoutes, { prefix: '/preferences' });
  await fastify.register(deleteAccountRoutes);
  await fastify.register(dataExportRoutes);

  // Future routes can be added here:
  // await fastify.register(profileRoutes);
  // await fastify.register(settingsRoutes);
  // await fastify.register(devicesRoutes);

  // La racine du module, PAS '/me' : `route-registration.ts` monte déjà ce
  // plugin sous `${API_PREFIX}/me`, si bien que le chemin réel était
  // `/api/v1/me/me` — une adresse qu'aucun client du dépôt n'appelle (vérifié
  // sur web, iOS, SDK et Android : toutes les occurrences de `/me` y sont des
  // routes de PAGE ou des liens profonds). La route était donc inatteignable,
  // et le commentaire d'origine — « a root /me endpoint » — disait bien
  // l'intention. Même défaut que #4141, trouvé par la garde de segment doublé
  // posée dans le même lot ; l'unification du compte sous une seule adresse
  // reste portée par #4178.
  fastify.get(
    '/',
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
          401: errorResponseSchema,
          404: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const authContext = (request as unknown as UnifiedAuthRequest).authContext;

      if (!authContext?.isAuthenticated || !authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
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
        return sendNotFound(reply, 'User not found');
      }

      return sendSuccess(reply, user);
    }
  );
}
