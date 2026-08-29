import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import {
  sendSuccess,
  sendForbidden,
  sendBadRequest,
  sendInternalError
} from '../../utils/response.js';
import {
  createUnifiedAuthMiddleware,
  UnifiedAuthRequest,
  isRegisteredUser
} from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { mintConversationShareLink } from './utils/share-link-mint';
import {
  createLinkSchema,
  createLinkBodySchema
} from './types';

export async function registerCreationRoutes(fastify: FastifyInstance) {
  const authRequired = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  // Créer un lien - Les utilisateurs authentifiés peuvent créer des liens pour leurs conversations
  fastify.post('/links', {
    onRequest: [authRequired],
    schema: {
      description: 'Create a share link for an existing conversation or create a new conversation with a share link. Authenticated users can create links for conversations they are members of. For global conversations, only ADMIN and BIGBOSS roles can create links. Direct conversations cannot have share links. If conversationId is not provided, a new public conversation will be created.',
      tags: ['links'],
      summary: 'Create share link',
      body: createLinkBodySchema,
      response: {
        201: {
          description: 'Share link created successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                linkId: { type: 'string', description: 'Generated link ID (mshy_*)', example: 'mshy_67890abcdef12345_a1b2c3d4' },
                conversationId: { type: 'string', description: 'Associated conversation ID' },
                shareLink: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Share link database ID' },
                    linkId: { type: 'string', description: 'Public link identifier' },
                    name: { type: 'string', nullable: true, description: 'Link display name' },
                    description: { type: 'string', nullable: true, description: 'Link description' },
                    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Expiration timestamp' },
                    isActive: { type: 'boolean', description: 'Link active status' }
                  }
                }
              }
            }
          }
        },
        400: {
          description: 'Bad request - invalid data',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - insufficient permissions or invalid conversation type',
          ...errorResponseSchema
        },
        404: {
          description: 'Conversation not found',
          ...errorResponseSchema
        },
        410: {
          description: 'Conversation is closed — no new share link can be minted for a terminated thread',
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
      const body = createLinkSchema.parse(request.body);

      if (!isRegisteredUser(request.authContext)) {
        return sendForbidden(reply, 'Utilisateur enregistré requis pour créer un lien');
      }

      const user = request.authContext.registeredUser!;

      // #4169 — la politique (garde 410, refus des `direct`, BIGBOSS/ADMIN sur
      // `global`, garde de RANG sur les autres types, génération d'identifiants,
      // écriture, notification aux admins) ne vit plus qu'à UN seul endroit :
      // `mintConversationShareLink`, partagée avec l'adaptateur `new-link`
      // (`routes/conversations/sharing.ts`). Ce handler ne fait plus que
      // traduire sa propre forme de requête/réponse vers cette porte unique —
      // il ne re-décide plus rien.
      const result = await mintConversationShareLink({
        prisma: fastify.prisma,
        reply,
        log: fastify.log,
        notificationService: fastify.notificationService,
        socketIOHandler: fastify.socketIOHandler,
        userId: user.id,
        userRole: user.role,
        input: body
      });
      if (!result) return; // La réponse d'erreur est déjà partie.

      return sendSuccess(reply, {
        linkId: result.linkId,
        conversationId: result.conversationId,
        shareLink: {
          id: result.shareLink.id,
          linkId: result.linkId,
          name: result.shareLink.name,
          description: result.shareLink.description,
          expiresAt: result.shareLink.expiresAt,
          isActive: result.shareLink.isActive
        }
      }, { statusCode: 201 });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, 'Données invalides');
      }
      logError(fastify.log, 'Create link error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
