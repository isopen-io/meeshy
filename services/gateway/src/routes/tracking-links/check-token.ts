import { FastifyInstance, FastifyReply, onRequestHookHandler } from 'fastify';
import { TrackingLinkService } from '../../services/TrackingLinkService';
import { logError } from '../../utils/logger';
import { UnifiedAuthRequest, isRegisteredUser } from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { sendSuccess, sendInternalError, sendForbidden, sendBadRequest } from '../../utils/response';

export type CheckTokenRouteContext = {
  readonly fastify: FastifyInstance;
  readonly trackingLinkService: TrackingLinkService;
  readonly authRequired: onRequestHookHandler;
};

export function registerCheckTokenRoute(ctx: CheckTokenRouteContext): void {
  /**
   * 11. Vérifier la disponibilité d'un token
   * GET /api/tracking-links/check-token/:token
   */
  ctx.fastify.get('/tracking-links/check-token/:token', {
    onRequest: [ctx.authRequired],
    schema: {
      description: 'Check if a tracking token is available for use. Useful when creating custom tokens to verify uniqueness before creation. Returns availability status for the requested token.',
      tags: ['tracking-links'],
      summary: 'Check token availability',
      params: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_-]{2,50}$',
            description: 'Token to check (2-50 alphanumeric characters, dashes, underscores)'
          }
        }
      },
      response: {
        200: {
          description: 'Token availability checked successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                token: { type: 'string', description: 'The checked token' },
                available: { type: 'boolean', description: 'Whether the token is available' }
              }
            }
          }
        },
        400: {
          description: 'Invalid token format',
          ...errorResponseSchema
        },
        403: {
          description: 'Access denied - registered user required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      const { token } = request.params as { token: string };

      if (!isRegisteredUser(request.authContext)) {
        return sendForbidden(reply, 'Utilisateur enregistré requis');
      }

      if (!/^[a-zA-Z0-9_-]{2,50}$/.test(token)) {
        return sendBadRequest(reply, 'Le token doit contenir entre 2 et 50 caractères alphanumériques, tirets ou underscores');
      }

      const isAvailable = await ctx.trackingLinkService.isTokenAvailable(token);

      return sendSuccess(reply, {
        token,
        available: isAvailable
      });

    } catch (error) {
      logError(ctx.fastify.log, 'Check token availability error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
