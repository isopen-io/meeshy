import type { FastifyInstance, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response.js';
import { validatePagination } from '../../utils/pagination';
import {
  createUnifiedAuthMiddleware,
  UnifiedAuthRequest
} from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { createLegacyHybridRequest } from './utils/link-helpers';
import { getConversationMessagesWithDetails, countConversationMessages } from './utils/prisma-queries';
import { formatLinkMessageWithDetails } from './utils/message-formatters';
import {
  HISTORY_FLOOR_PARTICIPANT_SELECT,
  historyReaderFromAuthContext,
  loadHistoryFloor,
  loadReaderHistoryFloor,
  type HistoryFloorJoin
} from '../../services/historyFloor';
import {
  conversationSummarySchema,
  messageSchema
} from './types';

export async function registerMessagesRetrievalRoutes(fastify: FastifyInstance) {
  const authOptional = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: false,
    allowAnonymous: true
  });

  // Récupérer les messages d'un lien
  fastify.get('/links/:identifier/messages', {
    onRequest: [authOptional],
    schema: {
      description: 'Get messages from a conversation via share link with pagination. Every message carries its author in `sender` — registered and anonymous alike, discriminated by `sender.isMeeshyer` — along with attachments, reactions, the quoted message and translations. Supports both authenticated and anonymous users with appropriate access control.',
      tags: ['links', 'messages'],
      summary: 'Get link messages',
      params: {
        type: 'object',
        required: ['identifier'],
        properties: {
          identifier: {
            type: 'string',
            description: 'Link identifier (linkId starting with mshy_ or database ID)',
            example: 'mshy_67890abcdef12345_a1b2c3d4'
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string', default: '50', description: 'Maximum number of messages', example: '50' },
          offset: { type: 'string', default: '0', description: 'Number of messages to skip', example: '0' }
        }
      },
      response: {
        200: {
          description: 'Messages retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                messages: { type: 'array', items: messageSchema },
                conversation: conversationSummarySchema,
                hasMore: { type: 'boolean', description: 'Whether more messages are available' },
                total: { type: 'number', description: 'Total number of messages' }
              }
            }
          }
        },
        403: {
          description: 'Access denied to this conversation',
          ...errorResponseSchema
        },
        404: {
          description: 'Share link not found',
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
      const { identifier } = request.params as { identifier: string };
      const { limit = '50', offset = '0' } = request.query as { limit?: string; offset?: string };
      const hybridRequest = createLegacyHybridRequest(request);

      const isLinkId = identifier.startsWith('mshy_');

      // #4166, critère 1 — `include` sans `select` à la racine chargeait la
      // ligne `ConversationShareLink` ENTIÈRE (compteurs de session,
      // `allowedCountries`/`allowedLanguages`/`allowedIpRanges`, `createdAt`/
      // `updatedAt`…) pour n'en lire que `id` (garde anonyme, `link.id` passé
      // à `loadHistoryFloor`), `conversationId` et `allowViewHistory` (le
      // plancher d'historique, `loadHistoryFloor`/`loadReaderHistoryFloor`).
      const shareLinkSelect = {
        id: true,
        conversationId: true,
        allowViewHistory: true,
        conversation: {
          select: { id: true, title: true, type: true }
        }
      };

      let shareLink;
      if (isLinkId) {
        shareLink = await fastify.prisma.conversationShareLink.findUnique({
          where: { linkId: identifier },
          select: shareLinkSelect
        });
      } else {
        shareLink = await fastify.prisma.conversationShareLink.findUnique({
          where: { id: identifier },
          select: shareLinkSelect
        });
      }

      if (!shareLink) {
        return sendNotFound(reply, 'Lien de partage non trouvé');
      }

      let hasAccess = false;
      // Annotation alignée sur le `select` RÉEL (`{ id: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT }`
      // ci-dessous) — #3893 point 2. L'ancienne annotation, plus étroite,
      // fonctionnait au runtime (typage structurel) mais affirmait faussement
      // que `role`/`historyVisibleFrom`/`permissions`/`anonymousSession` ne
      // sont pas servis ici, alors que `loadHistoryFloor` en dépend.
      let member: ({ id: string } & HistoryFloorJoin) | null = null;

      if (hybridRequest.isAuthenticated && hybridRequest.user) {
        member = await fastify.prisma.participant.findFirst({
          where: {
            conversationId: shareLink.conversationId,
            userId: hybridRequest.user.id,
            isActive: true
          },
          select: { id: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT }
        });
        hasAccess = !!member;
      }

      if (hybridRequest.isAnonymous && hybridRequest.anonymousParticipant) {
        hasAccess = hybridRequest.anonymousParticipant.shareLinkId === shareLink.id;
      }

      if (!hasAccess) {
        return sendForbidden(reply, 'Accès non autorisé à cette conversation');
      }

      // Le plancher du LECTEUR — la même loi que `GET /conversations/:id/messages`,
      // rendue par le même module. Cette route est la porte de lecture d'un
      // visiteur entré par lien : sans borne, un lien `allowViewHistory: false`
      // n'interdisait l'avant-jointure qu'aux lecteurs qui n'empruntaient pas
      // cette URL. Le lien déjà chargé est réutilisé quand c'est le sien.
      const historyFloor = member
        ? await loadHistoryFloor(fastify.prisma, member, { link: shareLink })
        : await loadReaderHistoryFloor(fastify.prisma, {
            conversationId: shareLink.conversationId,
            reader: historyReaderFromAuthContext(request.authContext),
            link: shareLink
          });

      // SSOT guard: string-schema pagination (AJV useDefaults fills '50'/'0'
      // but does not coerce or bound). Raw parseInt yielded `NaN`/negative
      // skip/take on malformed input, with no upper cap.
      const { limit: pageLimit, offset: pageOffset } = validatePagination(offset, limit, { defaultLimit: 50, maxLimit: 100 });

      const messages = await getConversationMessagesWithDetails(
        fastify.prisma,
        shareLink.conversationId,
        pageLimit,
        pageOffset,
        { historyFloor }
      );

      const totalMessages = await countConversationMessages(fastify.prisma, shareLink.conversationId, { historyFloor });

      const formattedMessages = messages.map(formatLinkMessageWithDetails);

      return sendSuccess(reply, {
          messages: formattedMessages.reverse(),
          conversation: shareLink.conversation,
          hasMore: totalMessages > pageOffset + messages.length,
          total: totalMessages
        });

    } catch (error) {
      logError(fastify.log, 'Get link messages error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
