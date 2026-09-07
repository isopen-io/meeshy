import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError, logger } from '../utils/logger';
import { sendSuccess, sendError, sendBadRequest, sendNotFound, sendInternalError, sendForbidden } from '../utils/response.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { resolveConversationId } from '../utils/conversation-id-cache';
import type { UnifiedAuthRequest } from '../middleware/auth';

// ===== SCHEMAS DE VALIDATION =====
const TranslateRequestSchema = z.object({
  text: z.string().min(1).max(1000).optional(),
  // Borne alignée sur la SSOT `CommonSchemas.language` (`packages/shared/utils/validation.ts`,
  // `.max(6)`) : un code ISO 639-3 régionalisé (`bas-CM`, `ewo-CM`) fait 6 caractères.
  source_language: z.string().min(2).max(6).optional(),
  target_language: z.string().min(2).max(6),
  model_type: z.enum(['basic', 'medium', 'premium']).optional(),
  message_id: z.string().optional(),
  conversation_id: z.string().optional()
}).refine((data) => {
  return (data.text !== undefined && data.text.length > 0) || (data.message_id !== undefined);
}, {
  message: "Either 'text' or 'message_id' must be provided"
});

// ===== TYPES =====
interface TranslateRequest {
  text?: string;
  source_language?: string;
  target_language: string;
  model_type?: 'basic' | 'medium' | 'premium';
  message_id?: string;
  conversation_id?: string;
}

// =============================================================================
// OpenAPI Schemas
// =============================================================================

/**
 * OpenAPI schema for non-blocking translation request body
 */
const translateRequestSchema = {
  type: 'object',
  properties: {
    text: {
      type: 'string',
      minLength: 1,
      maxLength: 1000,
      description: 'Text to translate. Required if message_id is not provided.',
      example: 'Hello, how are you?'
    },
    source_language: {
      type: 'string',
      minLength: 2,
      maxLength: 6,
      description: 'Source language code (ISO 639-1/639-3, optional BCP-47 region subtag e.g. bas-CM). Optional, can be auto-detected.',
      example: 'en'
    },
    target_language: {
      type: 'string',
      minLength: 2,
      maxLength: 6,
      description: 'Target language code (ISO 639-1/639-3, optional BCP-47 region subtag e.g. bas-CM). Required.',
      example: 'fr'
    },
    model_type: {
      type: 'string',
      enum: ['basic', 'medium', 'premium'],
      description: 'Translation model type. Optional, defaults to "basic".',
      example: 'medium'
    },
    message_id: {
      type: 'string',
      description: 'ID of an existing message to retranslate. Either text or message_id must be provided.',
      example: 'msg_123abc'
    },
    conversation_id: {
      type: 'string',
      description: 'ID of the conversation or identifier. Required when message_id is not provided.',
      example: 'conv_456def'
    }
  },
  required: ['target_language']
} as const;

/**
 * OpenAPI schema for non-blocking translation success response
 */
const translationNonBlockingResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Status message',
          example: 'Translation request submitted successfully'
        },
        messageId: {
          type: 'string',
          description: 'ID of the message being translated',
          example: 'msg_123abc'
        },
        conversationId: {
          type: 'string',
          description: 'ID of the conversation',
          example: 'conv_456def'
        },
        targetLanguage: {
          type: 'string',
          description: 'Target language code',
          example: 'fr'
        },
        status: {
          type: 'string',
          description: 'Processing status',
          example: 'processing',
          enum: ['processing']
        }
      }
    }
  }
} as const;

// ===== ROUTE NON-BLOQUANTE =====
/**
 * L'appelant participe-t-il à cette conversation ?
 *
 * La traduction porte le CONTENU des messages : sans cette garde, connaître un
 * identifiant suffisait à lire le texte traduit — donc déchiffré — de n'importe
 * quelle conversation privée. Le contrôle vit ici, partagé par toutes les
 * routes du module, plutôt que recopié dans chacune : c'est la recopie qui a
 * produit les trous (une route l'avait, sa voisine non).
 *
 * Couvre les deux formes d'identité : utilisateur enregistré et participant
 * anonyme arrivé par un lien de partage.
 */
async function callerParticipatesIn(
  fastify: FastifyInstance,
  authContext: UnifiedAuthRequest['authContext'] | undefined,
  conversationId: string
): Promise<boolean> {
  if (!authContext?.isAuthenticated && !authContext?.participantId) return false;

  if (authContext?.participantId) {
    const anonymous = await fastify.prisma.participant.findFirst({
      where: { id: authContext.participantId, conversationId, isActive: true },
      select: { id: true }
    });
    return anonymous !== null;
  }

  if (!authContext?.userId) return false;

  const member = await fastify.prisma.participant.findFirst({
    where: { userId: authContext.userId, conversationId, isActive: true },
    select: { id: true }
  });
  return member !== null;
}

export async function translationRoutes(fastify: FastifyInstance, _options: Record<string, unknown>) {
  // Recuperer les services depuis l'instance fastify (comme dans translation.ts)
  const translationService = fastify.translationService;
  const messagingService = fastify.messagingService;

  if (!translationService) {
    throw new Error('MessageTranslationService not provided to translation routes');
  }

  if (!messagingService) {
    throw new Error('MessagingService not provided to translation routes');
  }


  // ===== ROUTE PRINCIPALE NON-BLOQUANTE =====
  fastify.post<{ Body: TranslateRequest }>('/translate', {
    preHandler: [(req: FastifyRequest, rep: FastifyReply) => fastify.authenticate(req, rep)],
    schema: {
      description: 'Translate text asynchronously with non-blocking behavior. This endpoint submits a translation request and returns immediately with a "processing" status. The actual translation happens asynchronously in the background — the result is delivered via the real-time Socket.IO pipeline (translation:completed), not by polling. Supports both new message translation and retranslation of existing messages.',
      tags: ['translation'],
      summary: 'Translate text (non-blocking)',
      body: translateRequestSchema,
      response: {
        200: translationNonBlockingResponseSchema,
        400: {
          description: 'Bad request - validation error or missing required fields',
          ...errorResponseSchema
        },
        404: {
          description: 'Not found - message or conversation does not exist',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error - translation service failure',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: TranslateRequest }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const validatedData = TranslateRequestSchema.parse(request.body);


      // ===== CAS 1: RETRADUCTION D'UN MESSAGE EXISTANT =====
      if (validatedData.message_id) {

        // Recuperer le message depuis la base de donnees
        const existingMessage = await fastify.prisma.message.findUnique({
          where: { id: validatedData.message_id },
          include: {
            conversation: { include: { participants: true } }
          }
        });

        if (!existingMessage) {
          logger.warn(`[Translation] Message ${validatedData.message_id} not found`);
          return sendNotFound(reply, 'Message not found');
        }

        // Les participants étaient chargés ci-dessus mais jamais consultés :
        // tout compte valide pouvait déclencher la retraduction d'un message
        // arbitraire, puis en lire le texte via /status. La garde ferme la
        // chaîne des deux côtés.
        if (!(await callerParticipatesIn(fastify, authContext, existingMessage.conversationId))) {
          logger.warn('[Translation] Retraduction refusée : appelant hors de la conversation', {
            messageId: validatedData.message_id
          });
          return sendForbidden(reply, 'Access denied to this message');
        }


        // Preparer les donnees de traduction
        const messageData = {
          id: validatedData.message_id,
          conversationId: existingMessage.conversationId,
          content: validatedData.text || existingMessage.content,
          originalLanguage: validatedData.source_language || existingMessage.originalLanguage,
          targetLanguage: validatedData.target_language,
          modelType: validatedData.model_type || 'basic'
        };


        // DECLENCHEMENT NON-BLOQUANT - pas d'await !
        translationService.handleNewMessage(messageData).catch((error: any) => {
          logger.error(`[Translation] Async retranslation error: ${error.message}`);
        });

        // REPONSE IMMEDIATE - pas d'attente
        return sendSuccess(reply, {
          message: 'Translation request submitted successfully',
          messageId: validatedData.message_id,
          targetLanguage: validatedData.target_language,
          status: 'processing'
        });
      }

      // ===== CAS 2: NOUVEAU MESSAGE =====
      else {

        if (!validatedData.conversation_id) {
          return sendBadRequest(reply, 'conversation_id is required when message_id is not provided');
        }

        // Resoudre l'ID de conversation reel
        const resolved = await resolveConversationId(fastify.prisma, validatedData.conversation_id);
        if (!resolved) {
          return sendNotFound(reply, `Conversation with identifier '${validatedData.conversation_id}' not found`);
        }
        const resolvedConversationId = resolved;

        // Utiliser le MessagingService pour sauvegarder le message (meme pipeline que WebSocket)
        const messageRequest = {
          conversationId: resolvedConversationId,
          content: validatedData.text,
          originalLanguage: validatedData.source_language || 'auto',
          messageType: 'text',
          isAnonymous: authContext.isAnonymous ?? false,
          anonymousDisplayName: authContext.isAnonymous ? authContext.displayName : undefined
        };

        // Résout le Participant.id du sender AVANT d'appeler handleMessage.
        // MessagingService attend un Participant.id ; lui passer le userId brut
        // ne fonctionnait que via son fallback DEPRECATED (query supplémentaire
        // + log d'erreur à chaque requête de traduction non-bloquante).
        (async () => {
          const senderParticipantId = authContext.isAnonymous
            ? authContext.participantId
            : (await fastify.prisma.participant.findFirst({
                where: { userId: authContext.userId, conversationId: resolvedConversationId, isActive: true },
                select: { id: true }
              }))?.id;

          if (!senderParticipantId) {
            logger.warn(`[Translation] No active participant for user in conversation ${resolvedConversationId}`);
            return;
          }

          return messagingService.handleMessage(messageRequest, senderParticipantId);
        })().catch((error: any) => {
          logger.error(`[Translation] Async message processing error: ${error.message}`);
        });

        // REPONSE IMMEDIATE - pas d'attente
        return sendSuccess(reply, {
          message: 'New message submitted for processing',
          conversationId: validatedData.conversation_id,
          targetLanguage: validatedData.target_language,
          status: 'processing'
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logError(logger, '[Translation] Request validation error:', error);

      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'Invalid request data', { message: 'VALIDATION_ERROR' });
      }

      return sendInternalError(reply, errorMessage);
    }
  });

}
