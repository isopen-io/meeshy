import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendSuccess, sendUnauthorized, sendInternalError } from '../../utils/response';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { servedUserPermissions, servedPermissionsSchema } from '../../services/admin/served-permissions';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import type { UserRoleEnum } from '@meeshy/shared/types';

/**
 * `GET /admin/me/permissions` — la SEULE route par laquelle un client lit ses
 * permissions (#4152).
 *
 * ## Pourquoi une route, alors que la connexion les porte déjà
 *
 * Parce que la connexion ne les porte QU'À la connexion. Entre-temps, un rôle
 * change — un compte promu, un compte rétrogradé — et le client garde
 * indéfiniment ce qu'il a reçu au premier jour. Les copies manuscrites
 * corrigées par ce lot venaient précisément de là : trois sites RECOMPOSAIENT
 * les permissions au fil du parcours pour les rafraîchir, et chacun le faisait
 * différemment.
 *
 * En **S2**, pas S5 : lire SES PROPRES permissions n'est pas un geste
 * d'administration. Un USER a le droit de savoir qu'il n'a aucun droit — c'est
 * même la réponse la plus fréquente que cette route rendra, et la refuser
 * obligerait le client à déduire par l'échec.
 *
 * La charge est la PROJECTION de la matrice, jamais une composition : il n'y a
 * rien ici qui puisse diverger d'elle.
 */
export async function adminMePermissionsRoutes(fastify: FastifyInstance) {
  fastify.get('/me/permissions', {
    onRequest: [fastify.authenticate],
    schema: {
      description: "The authenticated user's own permissions, projected from the single matrix.",
      tags: ['admin'],
      summary: 'Read my permissions',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                role: { type: 'string' },
                permissions: servedPermissionsSchema,
              },
            },
          },
        },
        401: errorResponseSchema,
        500: errorResponseSchema,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const acteur = (request as unknown as UnifiedAuthRequest).authContext;
      if (!acteur?.isAuthenticated || !acteur.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      // Le RÔLE est servi à côté des permissions : sans lui, un client qui
      // constate un changement ne peut pas dire ce qui a changé, et l'écran
      // « votre rôle » aurait à le redemander ailleurs.
      const role = (acteur.registeredUser.role ?? 'USER') as UserRoleEnum;

      return sendSuccess(reply, { role, permissions: servedUserPermissions(role) });
    } catch (error) {
      fastify.log.error({ err: error }, '[ADMIN] Failed to serve own permissions');
      return sendInternalError(reply, 'Failed to read permissions');
    }
  });
}
