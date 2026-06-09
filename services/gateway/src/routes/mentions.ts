import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth.js';
import { MentionService } from '../services/MentionService.js';
import { validateParams, validateQuery } from '../validation/helpers.js';
import { SuggestionsQuerySchema, MessageIdParamSchema, MyMentionsQuerySchema } from '../validation/mentions-schemas.js';
import type {
  MentionSuggestionsResponse,
  GetMessageMentionsResponse,
  GetUserMentionsResponse
} from '@meeshy/shared/types/index';
import type { MentionSuggestion } from '../services/MentionService.js';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendForbidden, sendNotFound, sendInternalError } from '../utils/response.js';

interface MessageParams {
  messageId: string;
}

interface SuggestionsQuery {
  // New unified params
  contextId?: string;
  contextType?: 'conversation' | 'post';
  // Legacy (backwards compat)
  conversationId?: string;
  query?: string;
}

interface UserMentionsQuery {
  limit?: number;
}

export default async function mentionRoutes(fastify: FastifyInstance) {
  // Récupérer prisma décoré par le serveur
  const prisma = fastify.prisma;

  // Instancier le service de mentions
  const mentionService = new MentionService(prisma);

  // Middleware d'authentification requis pour les mentions
  const requiredAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  /**
   * GET /mentions/suggestions
   * Obtenir des suggestions d'utilisateurs pour l'autocomplete de mention
   */
  fastify.get<{
    Querystring: SuggestionsQuery;
  }>('/mentions/suggestions', {
    preValidation: [requiredAuth],
    preHandler: [validateQuery(SuggestionsQuerySchema)]
  }, async (request, reply) => {
    try {
      const { contextId, contextType, conversationId, query } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      if (!userId) {
        return sendUnauthorized(reply, 'Authentification requise');
      }

      // Resolve unified params: prefer contextId+contextType, fallback to legacy conversationId
      const resolvedContextType = contextType ?? 'conversation';
      const resolvedContextId = contextId ?? conversationId;

      if (!resolvedContextId) {
        return sendBadRequest(reply, 'Either (contextId + contextType) or conversationId is required');
      }

      let suggestions: MentionSuggestion[];

      if (resolvedContextType === 'post') {
        suggestions = await mentionService.getUserSuggestionsForPost(
          resolvedContextId,
          userId,
          query || ''
        );
      } else {
        suggestions = await mentionService.getUserSuggestionsForConversation(
          resolvedContextId,
          userId,
          query || ''
        );
      }

      return sendSuccess(reply, suggestions);
    } catch (error) {
      // Post/conversation not found or access denied
      if (error instanceof Error && error.message.includes('non trouvé ou accès refusé')) {
        return sendForbidden(reply, error.message);
      }

      // Log détaillé de l'erreur pour debug
      fastify.log.error({
        err: error,
        contextId: request.query.contextId,
        contextType: request.query.contextType,
        conversationId: request.query.conversationId,
        query: request.query.query,
        userId: (request as UnifiedAuthRequest).authContext.userId,
        stack: error instanceof Error ? error.stack : undefined,
        message: error instanceof Error ? error.message : String(error)
      }, 'Error getting mention suggestions');

      return sendInternalError(reply, 'Erreur lors de la récupération des suggestions');
    }
  });

  /**
   * GET /mentions/messages/:messageId
   * Obtenir la liste des utilisateurs mentionnés dans un message
   */
  fastify.get<{
    Params: MessageParams;
  }>('/mentions/messages/:messageId', {
    preValidation: [requiredAuth],
    preHandler: [validateParams(MessageIdParamSchema)]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      if (!userId) {
        return sendUnauthorized(reply, 'Authentification requise');
      }

      // Vérifier que le message existe et que l'utilisateur y a accès
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          deletedAt: null,
          conversation: {
            participants: {
              some: {
                userId,
                isActive: true
              }
            }
          }
        }
      });

      if (!message) {
        return sendNotFound(reply, 'Message non trouvé ou accès refusé');
      }

      // Récupérer les mentions
      const mentions = await mentionService.getMentionsForMessage(messageId);

      return sendSuccess(reply, mentions.map(user => ({
        id: user.id,
        messageId,
        mentionedUserId: user.id,
        mentionedAt: new Date(),
        mentionedUser: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatar: user.avatar
        }
      })));
    } catch (error) {
      fastify.log.error({ err: error }, 'Error getting message mentions');
      return sendInternalError(reply, 'Erreur lors de la récupération des mentions');
    }
  });

  /**
   * GET /mentions/me
   * Obtenir les mentions récentes de l'utilisateur actuel
   */
  fastify.get<{
    Querystring: UserMentionsQuery;
  }>('/mentions/me', {
    preValidation: [requiredAuth],
    preHandler: [validateQuery(MyMentionsQuerySchema)]
  }, async (request, reply) => {
    try {
      const { limit } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      if (!userId) {
        return sendUnauthorized(reply, 'Authentification requise');
      }

      const mentions = await mentionService.getRecentMentionsForUser(
        userId,
        limit || 50
      );

      return sendSuccess(reply, mentions.map(mention => ({
        id: mention.id,
        messageId: mention.messageId,
        mentionedAt: mention.mentionedAt,
        message: {
          id: mention.message.id,
          content: mention.message.content,
          conversationId: mention.message.conversationId,
          senderId: mention.message.senderId,
          createdAt: mention.message.createdAt,
          sender: mention.message.sender ? {
            id: mention.message.sender.id,
            username: mention.message.sender.user?.username,
            displayName: mention.message.sender.displayName,
            avatar: mention.message.sender.avatar
          } : null,
          conversation: {
            id: mention.message.conversation.id,
            title: mention.message.conversation.title,
            type: mention.message.conversation.type
          }
        }
      })));
    } catch (error) {
      fastify.log.error({ err: error }, 'Error getting user mentions');
      return sendInternalError(reply, 'Erreur lors de la récupération des mentions');
    }
  });
}
