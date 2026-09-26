/**
 * LES DEUX PORTES DE LA CARTE DE CONVERSATION (#8099).
 *
 * - `GET /links/:identifier/card` — un lien de PARTAGE dit ce qu'il autorise
 *   déjà (l'aperçu public `GET /anonymous/link/:identifier` sert le même
 *   titre, les mêmes décomptes, le même créateur). Lien inconnu ⇒ 404 ; lien
 *   clos ⇒ 200 `link.isActive = false`, sans statistiques ni description.
 * - `GET /conversations/:id/card` — un lien DIRECT ne sert que le MEMBRE.
 *   Directive porteur 2026-09-26 : « l'accès à une conversation par le lien de
 *   la conversation, sans lien de partage, ne peut pas être accessible aux
 *   non-membres ». Non-membre ⇒ le même 404 qu'un id inexistant
 *   (`ouvrirConversationLisible`).
 *
 * La composition — ce qui part, champ par champ — vit dans
 * `services/conversationCard.ts`.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { conversationCardSchema, errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendNotFound, sendInternalError } from '../../utils/response';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { composeDirectCard, composeShareLinkCard, loadShareLinkCardSource } from '../../services/conversationCard';
import { verdictAccesConversation, type MessagesDeRefusDAcces } from './utils/access-control';
import { ouvrirConversationLisible } from './utils/conversation-read-gate';

const logger = enhancedLogger.child({ module: 'ConversationCardRoutes' });

type PreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

const cardSuccessSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: conversationCardSchema
  }
} as const;

const REFUS_DE_CARTE: MessagesDeRefusDAcces = {
  sansSession: 'Authentication required to read this conversation'
};

export function registerShareLinkCardRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: PreHandler
): void {
  fastify.get<{ Params: { identifier: string } }>('/links/:identifier/card', {
    schema: {
      description: 'Carte de conversation d’un lien de partage (#8099) : titre, description courte, bannière, avatar, statistiques, inviteur et ce que le lecteur peut faire. Aucune liste de participants, aucun id d’utilisateur.',
      tags: ['links'],
      summary: 'Carte d’un lien de partage',
      params: {
        type: 'object',
        required: ['identifier'],
        properties: { identifier: { type: 'string' } }
      },
      response: {
        200: cardSuccessSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    try {
      const link = await loadShareLinkCardSource(prisma, request.params.identifier);
      if (!link) {
        return sendNotFound(reply, 'Share link not found');
      }

      const authContext = (request as UnifiedAuthRequest).authContext;
      const isMember = authContext?.isAuthenticated === true
        && (await verdictAccesConversation(prisma, authContext, link.conversation.id, link.conversation.id)).genre === 'ok';

      const card = await composeShareLinkCard({ prisma, link, isMember, now: new Date() });
      return sendSuccess(reply, card);
    } catch (error) {
      logger.error('Share link card error', error);
      return sendInternalError(reply, 'Error loading share link card');
    }
  });
}

export function registerDirectConversationCardRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: PreHandler
): void {
  fastify.get<{ Params: { id: string } }>('/conversations/:id/card', {
    schema: {
      description: 'Carte de conversation d’un lien direct (#8099) — servie au seul membre ; un non-membre reçoit le même 404 qu’un identifiant inexistant.',
      tags: ['conversations'],
      summary: 'Carte d’une conversation (membre)',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } }
      },
      response: {
        200: cardSuccessSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const conversationId = await ouvrirConversationLisible({
        prisma,
        reply,
        authContext,
        identifiant: request.params.id,
        messages: REFUS_DE_CARTE
      });
      if (!conversationId) {
        return;
      }

      const viewerUserId = authContext.isAnonymous ? undefined : authContext.userId;
      const card = await composeDirectCard({ prisma, conversationId, viewerUserId });
      if (!card) {
        return sendNotFound(reply, 'Conversation not found');
      }
      return sendSuccess(reply, card);
    } catch (error) {
      logger.error('Direct conversation card error', error);
      return sendInternalError(reply, 'Error loading conversation card');
    }
  });
}
